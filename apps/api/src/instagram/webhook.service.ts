import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ApiError } from '@crelink/shared';
import * as Sentry from '@sentry/nestjs';
import { apiError, insertWithRandomId } from '../common/http';
import { AppConfig, InstagramSettings } from '../config.service';
import { Database } from '../database';
import { countBusinessMetric } from '../monitoring/metrics';
import { commenterHash } from './crypto';
import { matchesKeyword } from './keyword';
import { LOCK_CONNECTIONS, LOCK_RULES, LOCK_SETTINGS } from './lock-order';
import { constantTimeEquals, parseSignedRequest, verifyWebhookSignature } from './signed-request';
import { parseWebhookPayload, WebhookComment } from './webhook-payload';

const WEBHOOK_METRIC = 'crelink.instagram.webhook';
const CHALLENGE_PATTERN = /^[\w-]{1,128}$/;
const CONFIRMATION_CODE_LENGTH = 16;
const CONFIRMATION_CODE_PATTERN = /^[a-z0-9]{16}$/;

interface RuleRow {
  id: string;
  connection_id: string;
  version: number;
  keyword: string;
  match_all_comments: boolean;
  message: string;
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
  SELECT r.id, r.connection_id, r.version, r.keyword, r.match_all_comments, r.message, r.ig_media_id, r.ig_media_child_ids, c.ig_user_id
  FROM instagram_dm_rules r ${RULE_JOINS}
  WHERE c.ig_user_id = ANY($1::text[]) AND ${RULE_ELIGIBLE}
  ORDER BY r.created_at, r.id`;

/**
 * 규칙을 읽은 뒤 바뀌었으면 저장하지 않습니다. 호출자가 같은 트랜잭션에서 `lock-order.ts`의 순서로 설정 → 연결 → 규칙을 `FOR SHARE`로 잡은 뒤 실행합니다.
 * 그쪽이 먼저면 커밋을 기다렸다가 이 문장의 새 스냅샷이 새 값을 보고, 이쪽이 먼저면 그쪽의 취소가 이 행까지 봅니다.
 * 마커도 delivery와 같은 문장에서 저장합니다. canonical의 가장 이른 유효 댓글만 기회를 소비합니다.
 * ORDER BY는 겹치는 배치가 서로의 유니크 키를 기다리다 교착되지 않게 순서를 맞춥니다.
 */
const INSERT_DELIVERIES = `
  WITH eligible AS MATERIALIZED (
    SELECT r.connection_id, r.id AS rule_id, c.ig_user_id, r.ig_media_id AS scope_key,
           i.rule_version, i.comment_id, i.commenter_hash, i.commented_at, i.message_body
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
      AND NOT EXISTS (
        SELECT 1 FROM instagram_dm_deliveries d
        WHERE d.connection_id = r.connection_id AND d.comment_id = i.comment_id
      )
  ), canonical AS MATERIALIZED (
    SELECT DISTINCT ON (ig_user_id, scope_key, commenter_hash) * FROM eligible
    ORDER BY ig_user_id, scope_key, commenter_hash, commented_at, comment_id, rule_id
  ), recipients AS (
    INSERT INTO instagram_dm_recipients (ig_user_id, scope_key, commenter_hash)
    SELECT ig_user_id, scope_key, commenter_hash FROM canonical
    ORDER BY ig_user_id, scope_key, commenter_hash
    ON CONFLICT DO NOTHING RETURNING ig_user_id, scope_key, commenter_hash
  )
  INSERT INTO instagram_dm_deliveries
    (connection_id, rule_id, rule_version, comment_id, commenter_hash, commented_at, message_body, status)
  SELECT i.connection_id, i.rule_id, i.rule_version, i.comment_id, i.commenter_hash, i.commented_at, i.message_body, 'pending'
  FROM canonical i JOIN recipients USING (ig_user_id, scope_key, commenter_hash)
  ORDER BY i.rule_id, i.commenter_hash, i.comment_id
  ON CONFLICT DO NOTHING`;

function findRule(rules: RuleRow[], comment: WebhookComment): RuleRow | undefined {
  return rules.find(
    (rule) =>
      (rule.ig_media_id === comment.mediaId || rule.ig_media_child_ids.includes(comment.mediaId)) &&
      (rule.match_all_comments || matchesKeyword(comment.text, rule.keyword)),
  );
}

function countResult(result: string, value = 1): void {
  if (value > 0) countBusinessMetric(WEBHOOK_METRIC, { result }, value);
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

  /** 서명 검증 뒤 규칙을 한 번 읽고, 저장 트랜잭션(순서대로 잠금 3회, 다중 행 INSERT 1회)을 커밋합니다. 이 함수가 끝나면 커밋된 상태입니다. */
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

      const inserted = await this.database.transaction(async (client) => {
        await client.query(LOCK_SETTINGS);
        await client.query(LOCK_CONNECTIONS, [[...new Set(rows.connectionIds)]]);
        await client.query(LOCK_RULES, [[...new Set(rows.ruleIds)]]);
        return client.query(INSERT_DELIVERIES, [
          rows.ruleIds,
          rows.ruleVersions,
          rows.commentIds,
          rows.hashes,
          rows.commentedAt,
          rows.bodies,
        ]);
      });
      countResult('stored', inserted.rowCount ?? 0);
      countResult('not_stored', rows.ruleIds.length - (inserted.rowCount ?? 0));
    } catch (error) {
      this.databaseFailure(error);
    }
  }

  /** 키워드가 맞는 댓글만 INSERT 파라미터로 만듭니다. 저장 시점의 규칙 문구를 그대로 최종 본문으로 고정합니다. */
  private buildRows(settings: InstagramSettings, comments: WebhookComment[], rulesByAccount: Map<string, RuleRow[]>) {
    const rows = {
      connectionIds: [] as string[],
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
      rows.connectionIds.push(rule.connection_id);
      rows.ruleIds.push(rule.id);
      rows.ruleVersions.push(rule.version);
      rows.commentIds.push(comment.commentId);
      rows.hashes.push(hash);
      rows.commentedAt.push(comment.commentedAt.toISOString());
      rows.bodies.push(rule.message);
    }
    return rows;
  }

  /**
   * `signed_request` 검증 뒤 연결(규칙·내역은 CASCADE)과 해당 `ig_user_id`의 수신 거부·최초 발송 기회 마커를 한 트랜잭션에서 지웁니다.
   * 일반 해제로 연결 행이 없어도 `instagram_opt_out_owners`로 `ig_user_id`를 찾아 파기하고, 대응표 행도 함께 지웁니다.
   */
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
        const owners = await client.query<{ ig_user_id: string }>(
          `DELETE FROM instagram_opt_out_owners WHERE meta_user_id = $1 OR ig_user_id = ANY($2::text[])
           RETURNING ig_user_id`,
          [parsed.userId, removed.rows.map((row) => row.ig_user_id)],
        );
        const accounts = [...new Set([...removed.rows, ...owners.rows].map((row) => row.ig_user_id))];
        if (accounts.length > 0) {
          await client.query('DELETE FROM instagram_dm_recipients WHERE ig_user_id = ANY($1::text[])', [accounts]);
          await client.query('DELETE FROM instagram_dm_opt_outs WHERE ig_user_id = ANY($1::text[])', [accounts]);
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
