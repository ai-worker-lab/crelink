import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ApiError } from '@crelink/shared';
import * as Sentry from '@sentry/nestjs';
import { apiError, insertWithRandomId } from '../common/http';
import { AppConfig, InstagramSettings } from '../config.service';
import { Database } from '../database';
import { commenterHash, signOptOutToken } from './crypto';
import { matchesKeyword } from './keyword';
import { constantTimeEquals, parseSignedRequest, verifyWebhookSignature } from './signed-request';
import { parseWebhookPayload, WebhookComment } from './webhook-payload';

const WEBHOOK_METRIC = 'crelink.instagram.webhook';
const CHALLENGE_PATTERN = /^[\w-]{1,128}$/;
const CONFIRMATION_CODE_LENGTH = 16;
const CONFIRMATION_CODE_PATTERN = /^[a-z0-9]{16}$/;

interface RuleRow {
  id: string;
  version: number;
  keyword: string;
  message: string;
  channel_link_code: string;
  ig_media_id: string;
  ig_media_child_ids: string[];
  ig_user_id: string;
}

// 규칙 조회와 INSERT가 같은 조건을 쓰도록 한곳에 둡니다. `audience=operators`는 운영자 역할 계정만 시범 대상입니다.
const RULE_JOINS = `
  JOIN instagram_connections c ON c.id = r.connection_id
  JOIN users u ON u.id = c.user_id
  JOIN platform_settings s ON s.id`;
const RULE_ELIGIBLE = `
  r.enabled AND r.archived_at IS NULL
  AND c.status = 'active' AND c.dm_paused_at IS NULL AND c.operator_paused_at IS NULL
  AND u.suspended_at IS NULL
  AND (s.instagram_dm_audience = 'everyone' OR (s.instagram_dm_audience = 'operators' AND u.role = 'operator'))`;

const SELECT_RULES = `
  SELECT r.id, r.version, r.keyword, r.message, r.channel_link_code, r.ig_media_id, r.ig_media_child_ids, c.ig_user_id
  FROM instagram_dm_rules r ${RULE_JOINS}
  WHERE c.ig_user_id = ANY($1::text[]) AND ${RULE_ELIGIBLE}
  ORDER BY r.created_at, r.id`;

/**
 * 규칙을 읽은 뒤 바뀌었으면 저장하지 않습니다. `FOR SHARE`는 규칙·연결·스위치를 바꾸며 `pending`을 취소하는 트랜잭션과 순서를 정합니다.
 * 그쪽이 먼저면 커밋을 기다렸다가 새 값으로 조건을 다시 평가하고, 이쪽이 먼저면 그쪽의 취소가 이 행까지 봅니다.
 * ORDER BY는 겹치는 배치가 서로의 유니크 키를 기다리다 교착되지 않게 순서를 맞춥니다.
 */
const INSERT_DELIVERIES = `
  INSERT INTO instagram_dm_deliveries
    (connection_id, rule_id, comment_id, commenter_hash, commented_at, message_body, status)
  SELECT r.connection_id, r.id, i.comment_id, i.commenter_hash, i.commented_at, i.message_body, 'pending'
  FROM unnest($1::uuid[], $2::int[], $3::text[], $4::bytea[], $5::timestamptz[], $6::text[])
    AS i(rule_id, rule_version, comment_id, commenter_hash, commented_at, message_body)
  JOIN instagram_dm_rules r ON r.id = i.rule_id AND r.version = i.rule_version ${RULE_JOINS}
  WHERE ${RULE_ELIGIBLE}
    AND i.commented_at >= r.created_at
    AND i.commented_at > now() - interval '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM instagram_dm_opt_outs o
      WHERE o.ig_user_id = c.ig_user_id AND o.commenter_hash = i.commenter_hash
    )
  ORDER BY r.id, i.commenter_hash, i.comment_id
  FOR SHARE OF r, c, s
  ON CONFLICT DO NOTHING`;

function findRule(rules: RuleRow[], comment: WebhookComment): RuleRow | undefined {
  return rules.find(
    (rule) =>
      (rule.ig_media_id === comment.mediaId || rule.ig_media_child_ids.includes(comment.mediaId)) &&
      matchesKeyword(comment.text, rule.keyword),
  );
}

function countResult(result: string, value = 1): void {
  if (value > 0) Sentry.metrics.count(WEBHOOK_METRIC, value, { attributes: { result } });
}

/** 웹훅 필터링과 발송 행 저장, 데이터 삭제 콜백. comment_id·작성자 ID·댓글 본문은 로그와 지표에 남기지 않습니다. */
@Injectable()
export class InstagramWebhookService {
  private readonly logger = new Logger(InstagramWebhookService.name);

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
  ) {}

  private requireSettings(): InstagramSettings {
    const settings = this.config.instagram;
    if (!settings) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'instagram_not_configured',
        'Instagram 연동이 설정되지 않았습니다.',
      );
    }
    return settings;
  }

  /** DB 오류를 503으로 바꿉니다. PG 오류 문구에 값이 들어갈 수 있어 SQLSTATE만 남깁니다. */
  private databaseFailure(error: unknown): never {
    countResult('db_error');
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    this.logger.error(`Instagram 웹훅 DB 처리 실패(SQLSTATE ${typeof code === 'string' ? code : '없음'})`);
    const body: ApiError = { code: 'database_unavailable', message: '데이터베이스에 연결할 수 없습니다.' };
    throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  /** Meta의 구독 확인. 맞으면 돌려줄 challenge, 틀리면 403입니다. */
  verifySubscription(mode: unknown, token: unknown, challenge: unknown): string {
    const settings = this.requireSettings();
    if (
      mode !== 'subscribe' ||
      typeof token !== 'string' ||
      !constantTimeEquals(settings.webhookVerifyToken, token) ||
      typeof challenge !== 'string' ||
      !CHALLENGE_PATTERN.test(challenge)
    ) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  /** 서명 검증 뒤 쿼리 2회(규칙 조회, 다중 행 INSERT)로 저장합니다. 이 함수가 끝나면 커밋된 상태입니다. */
  async receive(rawBody: Buffer | undefined, signature: unknown): Promise<void> {
    const settings = this.requireSettings();
    if (!rawBody || !verifyWebhookSignature(settings.appSecret, rawBody, signature)) {
      countResult('forbidden');
      throw new ForbiddenException();
    }
    Sentry.metrics.distribution(`${WEBHOOK_METRIC}.body_bytes`, rawBody.length);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      // 서명이 맞는 본문은 재전송해도 같으므로 200으로 끝냅니다.
      countResult('malformed');
      return;
    }
    const { comments, skipped } = parseWebhookPayload(payload, new Date());
    for (const [reason, count] of Object.entries(skipped)) countResult(reason, count);
    if (comments.length === 0) return;

    try {
      const rules = await this.database.query<RuleRow>(SELECT_RULES, [
        [...new Set(comments.map((comment) => comment.igUserId))],
      ]);
      const rulesByAccount = new Map<string, RuleRow[]>();
      for (const rule of rules.rows) {
        const list = rulesByAccount.get(rule.ig_user_id);
        if (list) list.push(rule);
        else rulesByAccount.set(rule.ig_user_id, [rule]);
      }

      const rows = this.buildRows(settings, comments, rulesByAccount);
      countResult('unmatched', comments.length - rows.ruleIds.length);
      if (rows.ruleIds.length === 0) return;

      const inserted = await this.database.query(INSERT_DELIVERIES, [
        rows.ruleIds,
        rows.ruleVersions,
        rows.commentIds,
        rows.hashes,
        rows.commentedAt,
        rows.bodies,
      ]);
      countResult('stored', inserted.rowCount ?? 0);
      countResult('not_stored', rows.ruleIds.length - (inserted.rowCount ?? 0));
    } catch (error) {
      this.databaseFailure(error);
    }
  }

  /** 키워드가 맞는 댓글만 INSERT 파라미터로 만듭니다. 최종 본문과 수신 거부 토큰은 저장 시점에 고정합니다. */
  private buildRows(settings: InstagramSettings, comments: WebhookComment[], rulesByAccount: Map<string, RuleRow[]>) {
    const rows = {
      ruleIds: [] as string[],
      ruleVersions: [] as number[],
      commentIds: [] as string[],
      hashes: [] as Buffer[],
      commentedAt: [] as string[],
      bodies: [] as string[],
    };
    for (const comment of comments) {
      const rule = findRule(rulesByAccount.get(comment.igUserId) ?? [], comment);
      if (!rule) continue;
      const hash = commenterHash(settings.commenterHashKey, comment.igUserId, comment.fromId);
      const token = signOptOutToken(settings.optOutKey, comment.igUserId, hash);
      rows.ruleIds.push(rule.id);
      rows.ruleVersions.push(rule.version);
      rows.commentIds.push(comment.commentId);
      rows.hashes.push(hash);
      rows.commentedAt.push(comment.commentedAt.toISOString());
      rows.bodies.push(
        `${rule.message}\n\n${this.config.shortLinkBaseUrl}/s/${rule.channel_link_code}\n\n` +
          `자동 발송 메시지 · 수신 거부: ${this.config.webUrl}/dm-opt-out#t=${token}`,
      );
    }
    return rows;
  }

  /** `signed_request` 검증 뒤 연결(규칙·내역은 CASCADE)과 해당 `ig_user_id`의 수신 거부 기록을 한 트랜잭션에서 지웁니다. */
  async handleDataDeletion(signedRequest: unknown): Promise<{ url: string; confirmation_code: string }> {
    const settings = this.requireSettings();
    const parsed = typeof signedRequest === 'string' ? parseSignedRequest(settings.appSecret, signedRequest) : null;
    if (!parsed) {
      countResult('deletion_forbidden');
      throw new ForbiddenException();
    }
    try {
      const code = await this.database.transaction(async (client) => {
        const removed = await client.query<{ ig_user_id: string }>(
          'DELETE FROM instagram_connections WHERE meta_user_id = $1 RETURNING ig_user_id',
          [parsed.userId],
        );
        if (removed.rows.length > 0) {
          await client.query('DELETE FROM instagram_dm_opt_outs WHERE ig_user_id = ANY($1::text[])', [
            removed.rows.map((row) => row.ig_user_id),
          ]);
        }
        return insertWithRandomId(CONFIRMATION_CODE_LENGTH, async (candidate) => {
          const inserted = await client.query(
            `INSERT INTO instagram_deletion_requests (confirmation_code) VALUES ($1)
             ON CONFLICT DO NOTHING RETURNING confirmation_code`,
            [candidate],
          );
          return inserted.rowCount ? candidate : undefined;
        });
      });
      countResult('deletion_processed');
      // 확인 화면은 티켓 0267이 이 주소로 만듭니다.
      return { url: `${this.config.webUrl}/privacy/instagram-deletion/${code}`, confirmation_code: code };
    } catch (error) {
      this.databaseFailure(error);
    }
  }

  /** 삭제 확인 페이지용. 코드 존재 여부와 처리 시각만 돌려줍니다. */
  async deletionStatus(code: string): Promise<{ processedAt: string }> {
    if (!CONFIRMATION_CODE_PATTERN.test(code)) throw new NotFoundException();
    const result = await this.database.query<{ created_at: Date }>(
      'SELECT created_at FROM instagram_deletion_requests WHERE confirmation_code = $1',
      [code],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException();
    return { processedAt: row.created_at.toISOString() };
  }
}
