import { HttpStatus, Injectable } from '@nestjs/common';
import {
  INSTAGRAM_DM_LIMITS,
  isInstagramDmKeyword,
  InstagramDmMediaView,
  InstagramDmRuleView,
  normalizeChannelCampaign,
} from '@crelink/shared';
import type { PoolClient } from 'pg';
import { apiError, randomId } from '../common/http';
import { bodyObject, optionalBoolean } from '../common/input';
import { AppConfig } from '../config.service';
import { ChannelLinksService } from '../creator/channel-links.service';
import { Database, Queryable } from '../database';
import { decryptToken } from './crypto';
import { GraphMedia, GraphMediaPage, InstagramGraph } from './graph';

interface ConnectionRow {
  id: string;
  ig_user_id: string;
  status: string;
  token_ciphertext: Buffer | null;
  token_key_version: number | null;
}
interface RuleRow {
  id: string;
  public_id: string;
  ig_media_id: string;
  media_permalink: string;
  media_caption_preview: string;
  keyword: string;
  match_all_comments: boolean;
  message: string;
  reply_message: string | null;
  channel_link_code: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
const notFound = () => apiError(HttpStatus.NOT_FOUND, 'instagram_rule_not_found', '규칙을 찾을 수 없습니다.');
const reauth = () => apiError(HttpStatus.CONFLICT, 'instagram_reauth_required', '인스타그램을 다시 연결해 주세요.');
const mediaTaken = () => apiError(HttpStatus.CONFLICT, 'instagram_rule_media_taken', '이미 규칙이 있는 게시물입니다.');
/** 게시물 소유 확인의 페이지 순회 상한(최악 건당 10초). 이 범위 밖의 게시물은 고를 수 없는 것으로 처리합니다. */
const MEDIA_OWNERSHIP_MAX_PAGES = 10;

/** DB의 char_length와 같은 유니코드 코드 포인트 단위로 검사하며 문구 내용은 제한하지 않습니다. NUL은 PostgreSQL text에 넣을 수 없어 막습니다. */
function ruleText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\u0000') || Array.from(value).length > max) {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `1~${max}자로 입력해 주세요.`);
  }
  return value;
}
function keywordText(value: unknown, matchAllComments: boolean): string {
  if (!isInstagramDmKeyword(value, matchAllComments)) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      matchAllComments ? '키워드는 0~30자로 입력해 주세요.' : '키워드는 1~30자로 입력해 주세요.',
    );
  }
  return value;
}
function optionalReplyText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '문자열이어야 합니다.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.includes('\u0000') || Array.from(trimmed).length > max) {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `공개 답글은 최대 ${max}자까지 입력해 주세요.`);
  }
  return trimmed;
}

function view(row: RuleRow): InstagramDmRuleView {
  return {
    publicId: row.public_id,
    mediaId: row.ig_media_id,
    mediaPermalink: row.media_permalink,
    mediaCaptionPreview: row.media_caption_preview,
    keyword: row.keyword,
    matchAllComments: row.match_all_comments,
    message: row.message,
    replyMessage: row.reply_message ?? null,
    channelLinkCode: row.channel_link_code,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class InstagramRulesService {
  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly graph: InstagramGraph,
    private readonly channelLinks: ChannelLinksService,
  ) {}

  private settings() {
    const settings = this.config.instagram;
    if (!settings)
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'instagram_not_configured', '인스타그램 연동 설정이 필요합니다.');
    return settings;
  }

  private async connection(db: Queryable, userId: string, lock = false): Promise<ConnectionRow> {
    const result = await db.query<ConnectionRow>(
      `SELECT id, ig_user_id, status, token_ciphertext, token_key_version
       FROM instagram_connections WHERE user_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [userId],
    );
    if (!result.rows[0]) throw reauth();
    return result.rows[0];
  }

  async list(userId: string): Promise<{ rules: InstagramDmRuleView[] }> {
    this.settings();
    const result = await this.database.query<RuleRow>(
      `SELECT r.* FROM instagram_dm_rules r JOIN instagram_connections c ON c.id = r.connection_id
       WHERE c.user_id = $1 AND r.archived_at IS NULL ORDER BY r.created_at DESC, r.public_id LIMIT $2`,
      [userId, INSTAGRAM_DM_LIMITS.totalRules],
    );
    return { rules: result.rows.map(view) };
  }

  private async mediaPage(connection: ConnectionRow, after: string | null): Promise<GraphMediaPage> {
    if (
      connection.status === 'reauth_required' ||
      !connection.token_ciphertext ||
      connection.token_key_version === null
    )
      throw reauth();
    const token = decryptToken(
      this.settings().tokenKeyring,
      connection.id,
      connection.token_ciphertext,
      connection.token_key_version,
    );
    try {
      return await this.graph.listMedia(token, connection.ig_user_id, after);
    } catch {
      throw apiError(HttpStatus.BAD_GATEWAY, 'instagram_upstream_failed', '인스타그램 게시물을 불러오지 못했습니다.');
    }
  }

  async media(userId: string, after?: unknown): Promise<{ items: InstagramDmMediaView[]; nextCursor: string | null }> {
    this.settings();
    if (after !== undefined && (typeof after !== 'string' || after.length > 2048)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '게시물 커서 형식이 올바르지 않습니다.');
    }
    const page = await this.mediaPage(
      await this.connection(this.database.pool, userId),
      (after as string | undefined) || null,
    );
    return {
      items: page.items.slice(0, INSTAGRAM_DM_LIMITS.mediaPageSize).map((item) => ({
        id: item.id,
        caption: item.caption,
        permalink: item.permalink,
        thumbnailUrl: item.thumbnailUrl ?? '',
        timestamp: item.timestamp,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** 연결 계정의 게시물에 있는지 페이지를 따라가며 확인합니다. 상한을 넘으면 없는 것으로 봅니다. */
  private async ownedMedia(connection: ConnectionRow, mediaId: string): Promise<GraphMedia> {
    let page = await this.mediaPage(connection, null);
    const seen = new Set<string>();
    let media = page.items.find((item) => item.id === mediaId);
    while (!media && page.nextCursor && !seen.has(page.nextCursor) && seen.size + 1 < MEDIA_OWNERSHIP_MAX_PAGES) {
      seen.add(page.nextCursor);
      page = await this.mediaPage(connection, page.nextCursor);
      media = page.items.find((item) => item.id === mediaId);
    }
    if (!media) throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '연결한 계정의 게시물을 골라 주세요.');
    return media;
  }

  private async checkLimits(db: Queryable, userId: string, mediaId?: string): Promise<void> {
    const result = await db.query<{ active: number; total: number; taken: boolean }>(
      `SELECT count(*) FILTER (WHERE r.archived_at IS NULL AND r.enabled)::int AS active,
       count(*)::int AS total,
       coalesce(bool_or(r.ig_media_id = $2 AND r.archived_at IS NULL), false) AS taken
       FROM instagram_dm_rules r JOIN instagram_connections c ON c.id = r.connection_id WHERE c.user_id = $1`,
      [userId, mediaId ?? null],
    );
    const { active, total, taken } = result.rows[0];
    if (taken) throw mediaTaken();
    if (
      active >= INSTAGRAM_DM_LIMITS.activeRules ||
      (mediaId !== undefined && total >= INSTAGRAM_DM_LIMITS.totalRules)
    ) {
      throw apiError(HttpStatus.CONFLICT, 'instagram_rule_limit_reached', '규칙 생성 한도에 도달했습니다.');
    }
  }

  async create(userId: string, body: unknown): Promise<InstagramDmRuleView> {
    this.settings();
    const input = bodyObject(body);
    const mediaId = ruleText(input.mediaId, 255);
    const matchAllComments = optionalBoolean(input.matchAllComments, 'matchAllComments') ?? false;
    const keyword = keywordText(input.keyword, matchAllComments);
    const message = ruleText(input.message, INSTAGRAM_DM_LIMITS.messageMaxLength);
    const replyMessage = optionalReplyText(input.replyMessage, INSTAGRAM_DM_LIMITS.replyMessageMaxLength);
    // 외부 호출 전에 막을 수 있는 실패를 먼저 거릅니다. Graph 호출 중에는 연결 행을 잠그지 않습니다(웹훅·worker를 막지 않게).
    const connection = await this.connection(this.database.pool, userId);
    await this.checkLimits(this.database.pool, userId, mediaId);
    const media = await this.ownedMedia(connection, mediaId);
    const publicId = randomId(10);
    // 규칙 생성·변경은 연결 행 잠금으로 한도와 게시물 중복 검사를 줄 세웁니다. 호출 사이 바뀌었을 수 있어 잠근 뒤 다시 봅니다.
    // 채널 주소도 같은 트랜잭션이라 규칙 저장이 실패하면 주소를 소비하지 않습니다. 잠금은 연결 → 사용자 순서입니다(`lock-order.ts`).
    return this.database.transaction(async (client) => {
      const locked = await this.connection(client, userId, true);
      if (locked.status === 'reauth_required' || locked.ig_user_id !== connection.ig_user_id) throw reauth();
      await this.checkLimits(client, userId, mediaId);
      // 기존 서비스의 코드 영구 기록·프리셋·50/200 한도와 오류를 그대로 씁니다.
      const { view: link } = await this.channelLinks.create(
        userId,
        {
          channel: 'instagram',
          placement: 'dm',
          campaign: normalizeChannelCampaign(`dm-${keyword.trim() ? keyword : 'all'}-${publicId.slice(0, 6)}`),
        },
        client,
      );
      const result = await client.query<RuleRow>(
        `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, ig_media_child_ids,
         media_permalink, media_caption_preview, keyword, message, reply_message, channel_link_code, match_all_comments)
         SELECT $1, c.id, $3, '{}'::text[], $4, $5, $6, $7, $8, $9, $11 FROM instagram_connections c
         WHERE c.id = $2 AND c.user_id = $10 RETURNING *`,
        [
          publicId,
          connection.id,
          mediaId,
          media.permalink,
          Array.from(media.caption).slice(0, 200).join(''),
          keyword,
          message,
          replyMessage,
          link.code,
          userId,
          matchAllComments,
        ],
      );
      return view(result.rows[0]);
    });
  }

  private async ownedRule(client: PoolClient, userId: string, publicId: string): Promise<RuleRow> {
    const result = await client.query<RuleRow>(
      `SELECT r.* FROM instagram_dm_rules r JOIN instagram_connections c ON c.id = r.connection_id
       WHERE c.user_id = $1 AND r.public_id = $2 AND r.archived_at IS NULL FOR UPDATE OF r`,
      [userId, publicId],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  private async cancelPending(client: PoolClient, userId: string, ruleId: string): Promise<void> {
    await client.query(
      `UPDATE instagram_dm_deliveries d SET status = 'cancelled'
       FROM instagram_connections c WHERE c.id = d.connection_id AND c.user_id = $1 AND d.rule_id = $2 AND d.status = 'pending'`,
      [userId, ruleId],
    );
  }

  async update(userId: string, publicId: string, body: unknown): Promise<InstagramDmRuleView> {
    this.settings();
    const input = bodyObject(body);
    const matchAllComments = optionalBoolean(input.matchAllComments, 'matchAllComments');
    const message =
      input.message === undefined ? undefined : ruleText(input.message, INSTAGRAM_DM_LIMITS.messageMaxLength);
    const replyMessage =
      input.replyMessage === undefined
        ? undefined
        : optionalReplyText(input.replyMessage, INSTAGRAM_DM_LIMITS.replyMessageMaxLength);
    const enabled = optionalBoolean(input.enabled, 'enabled');
    return this.database.transaction(async (client) => {
      // 잠금 순서: 연결 → 규칙 → 발송 행(`lock-order.ts`). 없는 연결도 남의 publicId와 똑같이 404입니다.
      await client.query('SELECT id FROM instagram_connections WHERE user_id = $1 FOR UPDATE', [userId]);
      const rule = await this.ownedRule(client, userId, publicId);
      const finalMode = matchAllComments ?? rule.match_all_comments;
      const keyword = keywordText(input.keyword === undefined ? rule.keyword : input.keyword, finalMode);
      if (enabled === true && !rule.enabled) await this.checkLimits(client, userId);
      const invalidate =
        keyword !== rule.keyword ||
        finalMode !== rule.match_all_comments ||
        (message !== undefined && message !== rule.message) ||
        (replyMessage !== undefined && replyMessage !== rule.reply_message) ||
        (enabled === false && rule.enabled);
      const result = await client.query<RuleRow>(
        `UPDATE instagram_dm_rules r SET keyword = $3, message = $4, reply_message = $5, enabled = $6,
         version = version + $7, match_all_comments = $8, updated_at = now() FROM instagram_connections c
         WHERE c.id = r.connection_id AND c.user_id = $1 AND r.public_id = $2 AND r.archived_at IS NULL RETURNING r.*`,
        [
          userId,
          publicId,
          keyword,
          message ?? rule.message,
          replyMessage !== undefined ? replyMessage : rule.reply_message,
          enabled ?? rule.enabled,
          invalidate ? 1 : 0,
          finalMode,
        ],
      );
      if (invalidate) await this.cancelPending(client, userId, rule.id);
      return view(result.rows[0]);
    });
  }

  async archive(userId: string, publicId: string): Promise<void> {
    this.settings();
    await this.database.transaction(async (client) => {
      await client.query('SELECT id FROM instagram_connections WHERE user_id = $1 FOR UPDATE', [userId]);
      const rule = await this.ownedRule(client, userId, publicId);
      await client.query(
        `UPDATE instagram_dm_rules r SET archived_at = now(), version = version + 1, updated_at = now()
         FROM instagram_connections c WHERE c.id = r.connection_id AND c.user_id = $1 AND r.public_id = $2 AND r.archived_at IS NULL`,
        [userId, publicId],
      );
      await this.cancelPending(client, userId, rule.id);
    });
  }
}
