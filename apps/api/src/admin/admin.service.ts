import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AccountKind,
  BlockedDomainView,
  CreatorBannerView,
  CRELINK_LIMITS,
  LinkView,
  OperatorCreatorDetail,
  OperatorCreatorListResponse,
  OperatorCreatorStats,
  OperatorCreatorSummary,
  UserRole,
} from '@crelink/shared';
import type { PoolClient } from 'pg';
import { domainToASCII } from 'node:url';
import { Database, isUniqueViolation } from '../database';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject, optionalText, pageNumber } from '../common/input';
import { AppConfig } from '../config.service';
import { OperatorActor, recordOperatorAction } from '../ai-operator/audit';
import {
  CREATOR_BANNER_COLUMNS,
  CreatorBannerRow,
  CreatorService,
  LINK_COLUMNS,
  LinkRow,
} from '../creator/creator.service';
import { SlotEventService } from '../slot-event/slot-event.service';
import { StatsService } from './stats.service';

/** 운영자 부여 슬롯 상한. 보이는 링크가 전체 상한(50)을 넘을 수 없으므로 50 - 5. */
const MAX_EXTRA_SLOTS = CRELINK_LIMITS.totalLinks - CRELINK_LIMITS.freeVisibleLinks;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const SUMMARY_SELECT = `
  SELECT u.id AS user_id, u.email, l.display_name, s.slug, l.public_id, u.suspended_at IS NOT NULL AS suspended,
         u.created_at, u.extra_link_slots, sl.id AS short_link_id, l.id AS landing_id, u.banner_slot_granted_at,
         u.kind, u.metrics_excluded_at IS NOT NULL AS metrics_excluded,
         (SELECT count(*)::int FROM visits v
          WHERE v.short_link_id = sl.id AND v.occurred_at > now() - interval '30 days') AS visits_30d
  FROM users u
  JOIN landings l ON l.user_id = u.id
  JOIN short_links sl ON sl.user_id = u.id
  JOIN short_slugs s ON s.short_link_id = sl.id AND s.retired_at IS NULL`;

interface SummaryRow {
  user_id: string;
  email: string;
  display_name: string | null;
  slug: string;
  public_id: string;
  suspended: boolean;
  created_at: Date;
  extra_link_slots: number;
  short_link_id: string;
  /** 배너 한도·목록은 랜딩 단위입니다(MVP는 사용자당 랜딩 1개). */
  landing_id: string;
  banner_slot_granted_at: Date | null;
  kind: AccountKind;
  metrics_excluded: boolean;
  visits_30d: number;
}

/** 운영자 쓰기 전에 `FOR UPDATE`로 잠근 계정의 이전 값. */
interface LockedUser {
  role: UserRole;
  kind: AccountKind;
  extra_link_slots: number;
  suspended: boolean;
  banner_slot_granted: boolean;
  metrics_excluded: boolean;
}

function creatorNotFound() {
  return apiError(HttpStatus.NOT_FOUND, 'creator_not_found', '크리에이터를 찾을 수 없습니다.');
}

/** 링크·배너 차단 요청 `SetLinkBlockRequest`. 사유는 차단할 때만 저장합니다. */
function blockInput(body: unknown): { blocked: boolean; reason: string | null } {
  const input = bodyObject(body);
  if (typeof input.blocked !== 'boolean') {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'blocked는 true 또는 false여야 합니다.');
  }
  const reason = optionalText(input.reason, '차단 사유', CRELINK_LIMITS.blockedReasonMax) ?? null;
  return { blocked: input.blocked, reason };
}

/** `{ [field]: boolean }` 요청 본문. 아니면 400 `validation_failed`. */
function booleanField(body: unknown, field: string): boolean {
  const value = bodyObject(body)[field];
  if (typeof value !== 'boolean') {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `${field}는 true 또는 false여야 합니다.`);
  }
  return value;
}

/**
 * 운영자 화면 API(R10, R13, R14, R21, R23 ③⑧). 모든 쓰기는 한 트랜잭션에서 `FOR UPDATE`로 이전 값을 읽고 바꾼 뒤
 * `recordOperatorAction`으로 행위자·행동·대상·전후 값을 남깁니다(설계 `docs/specs/crelink-ai-operator.md` `행동 기록 규칙`).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly stats: StatsService,
    private readonly config: AppConfig,
    private readonly slotEvents: SlotEventService,
  ) {}

  private summary(row: SummaryRow): OperatorCreatorSummary {
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      slug: row.slug,
      shortUrl: `${this.config.shortLinkBaseUrl}/${row.slug}`,
      landingUrl: this.creator.landingUrl(row.public_id),
      visitsLast30Days: row.visits_30d,
      suspended: row.suspended,
      createdAt: row.created_at.toISOString(),
      accountKind: row.kind,
      metricsExcluded: row.metrics_excluded,
    };
  }

  private async summaryRow(userId: string): Promise<SummaryRow> {
    const result = UUID_PATTERN.test(userId)
      ? await this.database.query<SummaryRow>(`${SUMMARY_SELECT} WHERE u.id = $1`, [userId])
      : null;
    if (!result?.rowCount) throw creatorNotFound();
    return result.rows[0];
  }

  /**
   * `creator.*` 쓰기의 대상 계정을 잠그고 이전 값을 읽습니다. 없으면 404 `creator_not_found`.
   * 행위자가 AI이고 대상이 운영자·AI 계정이면 403 `forbidden`(AI가 사람 운영자를 정지해 멈춤·토큰 폐기를 막는 일 방지).
   * 이 잠금이 users 행을 먼저 잡으므로 크리에이터 배너 쓰기(사용자 잠금 → 부여 확인)와 순서가 맞습니다.
   */
  private async lockCreator(client: PoolClient, actor: OperatorActor, userId: string): Promise<LockedUser> {
    const result = UUID_PATTERN.test(userId)
      ? await client.query<LockedUser>(
          `SELECT role, kind, extra_link_slots, suspended_at IS NOT NULL AS suspended,
                  banner_slot_granted_at IS NOT NULL AS banner_slot_granted,
                  metrics_excluded_at IS NOT NULL AS metrics_excluded
           FROM users WHERE id = $1 FOR UPDATE`,
          [userId],
        )
      : null;
    const user = result?.rows[0];
    if (!user) throw creatorNotFound();
    if (actor.kind === 'ai' && (user.role === 'operator' || user.kind === 'ai')) {
      throw apiError(HttpStatus.FORBIDDEN, 'forbidden', 'AI 운영자는 운영자·AI 계정을 바꿀 수 없습니다.');
    }
    return user;
  }

  /** 이메일·표시 이름·현재 단축 주소 부분 일치 검색. 최근 가입 순, page는 1부터. */
  async list(queryInput: unknown, pageInput: unknown): Promise<OperatorCreatorListResponse> {
    const query = typeof queryInput === 'string' ? queryInput.trim().slice(0, 100) : '';
    const page = pageNumber(pageInput);
    const pageSize = CRELINK_LIMITS.operatorPageSize;
    const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const filter = `WHERE ($1 = '' OR u.email ILIKE $2 OR l.display_name ILIKE $2 OR s.slug ILIKE $2)`;
    const [rows, total] = await Promise.all([
      this.database.query<SummaryRow>(
        `${SUMMARY_SELECT} ${filter} ORDER BY u.created_at DESC, u.id LIMIT $3 OFFSET $4`,
        [query, pattern, pageSize, (page - 1) * pageSize],
      ),
      this.database.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM users u
         JOIN landings l ON l.user_id = u.id
         JOIN short_links sl ON sl.user_id = u.id
         JOIN short_slugs s ON s.short_link_id = sl.id AND s.retired_at IS NULL ${filter}`,
        [query, pattern],
      ),
    ]);
    return { items: rows.rows.map((row) => this.summary(row)), page, pageSize, total: total.rows[0].count };
  }

  async detail(userId: string): Promise<OperatorCreatorDetail> {
    const row = await this.summaryRow(userId);
    const db = this.database.pool;
    const [{ extraLinkSlots, ...limits }, links, banners, bannerLimits, slotEvent] = await Promise.all([
      this.creator.limits(db, userId),
      this.creator.links(db, userId),
      this.creator.creatorBanners(db, row.landing_id),
      this.creator.bannerLimits(db, row.landing_id),
      this.slotEvents.entry(db, userId),
    ]);
    return {
      ...this.summary(row),
      extraLinkSlots,
      limits,
      links,
      bannerSlot: { grantedAt: row.banner_slot_granted_at?.toISOString() ?? null },
      banners,
      bannerLimits,
      slotEvent,
    };
  }

  async creatorStats(userId: string, from: unknown, to: unknown): Promise<OperatorCreatorStats> {
    const row = await this.summaryRow(userId);
    return this.stats.stats(row.short_link_id, from, to);
  }

  async setExtraSlots(actor: OperatorActor, userId: string, body: unknown): Promise<OperatorCreatorDetail> {
    const extraSlots = bodyObject(body).extraSlots;
    if (
      typeof extraSlots !== 'number' ||
      !Number.isInteger(extraSlots) ||
      extraSlots < 0 ||
      extraSlots > MAX_EXTRA_SLOTS
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `추가 슬롯은 0~${MAX_EXTRA_SLOTS} 사이의 정수여야 합니다.`,
      );
    }
    await this.database.transaction(async (client) => {
      const before = await this.lockCreator(client, actor, userId);
      await client.query('UPDATE users SET extra_link_slots = $2 WHERE id = $1', [userId, extraSlots]);
      await recordOperatorAction(client, actor, {
        action: 'creator.extra_slots',
        targetType: 'user',
        targetId: userId,
        subjectUserId: userId,
        before: { extraSlots: before.extra_link_slots },
        after: { extraSlots },
      });
    });
    return this.detail(userId);
  }

  /** 정지하면 기존 세션을 모두 지워 바로 로그아웃시키고, 랜딩·단축 URL은 안내 화면으로 바뀝니다. AI 계정은 토큰 인증도 막힙니다. */
  async setSuspension(actor: OperatorActor, userId: string, body: unknown): Promise<OperatorCreatorDetail> {
    const suspended = booleanField(body, 'suspended');
    await this.database.transaction(async (client) => {
      const before = await this.lockCreator(client, actor, userId);
      await client.query(
        `UPDATE users SET suspended_at = CASE WHEN $2 THEN coalesce(suspended_at, now()) END WHERE id = $1`,
        [userId, suspended],
      );
      if (suspended) await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await recordOperatorAction(client, actor, {
        action: 'creator.suspension',
        targetType: 'user',
        targetId: userId,
        subjectUserId: userId,
        before: { suspended: before.suspended },
        after: { suspended },
      });
    });
    return this.detail(userId);
  }

  /** 배너 슬롯 부여·회수(R21 ①⑤). 다시 부여해도 처음 부여 시각을 유지하고, 회수해도 배너 행은 보관합니다. */
  async setBannerSlot(actor: OperatorActor, userId: string, body: unknown): Promise<OperatorCreatorDetail> {
    const granted = booleanField(body, 'granted');
    await this.database.transaction(async (client) => {
      const before = await this.lockCreator(client, actor, userId);
      await client.query(
        `UPDATE users SET banner_slot_granted_at = CASE WHEN $2 THEN coalesce(banner_slot_granted_at, now()) END
         WHERE id = $1`,
        [userId, granted],
      );
      await recordOperatorAction(client, actor, {
        action: 'creator.banner_slot',
        targetType: 'user',
        targetId: userId,
        subjectUserId: userId,
        before: { bannerSlotGranted: before.banner_slot_granted },
        after: { bannerSlotGranted: granted },
      });
    });
    return this.detail(userId);
  }

  /** 시험 계정을 지표에서 빼거나 다시 넣습니다(R23 ⑧, 사람 운영자만은 컨트롤러 `@ActorKinds('human')`). 뺀 시각은 처음 값을 유지합니다. */
  async setMetricsExclusion(actor: OperatorActor, userId: string, body: unknown): Promise<OperatorCreatorDetail> {
    const excluded = booleanField(body, 'excluded');
    await this.database.transaction(async (client) => {
      const before = await this.lockCreator(client, actor, userId);
      await client.query(
        `UPDATE users SET metrics_excluded_at = CASE WHEN $2 THEN coalesce(metrics_excluded_at, now()) END
         WHERE id = $1`,
        [userId, excluded],
      );
      await recordOperatorAction(client, actor, {
        action: 'creator.metrics_exclusion',
        targetType: 'user',
        targetId: userId,
        subjectUserId: userId,
        before: { metricsExcluded: before.metrics_excluded },
        after: { metricsExcluded: excluded },
      });
    });
    return this.detail(userId);
  }

  async setLinkBlock(actor: OperatorActor, linkId: string, body: unknown): Promise<LinkView> {
    const { blocked, reason } = blockInput(body);
    const row = await this.database.transaction(async (client) => {
      const found = UUID_PATTERN.test(linkId)
        ? await client.query<{ user_id: string; blocked: boolean; blocked_reason: string | null }>(
            'SELECT user_id, blocked_at IS NOT NULL AS blocked, blocked_reason FROM links WHERE id = $1 FOR UPDATE',
            [linkId],
          )
        : null;
      const before = found?.rows[0];
      if (!before) throw apiError(HttpStatus.NOT_FOUND, 'link_not_found', '링크를 찾을 수 없습니다.');
      const updated = await client.query<LinkRow>(
        `UPDATE links SET blocked_at = CASE WHEN $2 THEN coalesce(blocked_at, now()) END,
                          blocked_reason = CASE WHEN $2 THEN $3 END, updated_at = now()
         WHERE id = $1 RETURNING ${LINK_COLUMNS}`,
        [linkId, blocked, reason],
      );
      const after = updated.rows[0];
      await recordOperatorAction(client, actor, {
        action: 'link.block',
        targetType: 'link',
        targetId: linkId,
        subjectUserId: before.user_id,
        before: { blocked: before.blocked, reason: before.blocked_reason },
        after: { blocked: after.blocked, reason: after.blocked_reason },
      });
      return after;
    });
    return this.creator.linkView(row);
  }

  /** 크리에이터 배너 차단·풀기(R21 ④). 차단해도 배너 행과 숨김 상태는 그대로이고, 크리에이터가 주소를 바꿔도 유지됩니다. */
  async setBannerBlock(actor: OperatorActor, bannerId: string, body: unknown): Promise<CreatorBannerView> {
    const { blocked, reason } = blockInput(body);
    const row = await this.database.transaction(async (client) => {
      const found = UUID_PATTERN.test(bannerId)
        ? await client.query<{ user_id: string; blocked: boolean; blocked_reason: string | null }>(
            `SELECT user_id, blocked_at IS NOT NULL AS blocked, blocked_reason FROM creator_banners
             WHERE id = $1 FOR UPDATE`,
            [bannerId],
          )
        : null;
      const before = found?.rows[0];
      if (!before) throw apiError(HttpStatus.NOT_FOUND, 'banner_not_found', '배너를 찾을 수 없습니다.');
      const updated = await client.query<CreatorBannerRow>(
        `UPDATE creator_banners SET blocked_at = CASE WHEN $2 THEN coalesce(blocked_at, now()) END,
                                    blocked_reason = CASE WHEN $2 THEN $3 END, updated_at = now()
         WHERE id = $1 RETURNING ${CREATOR_BANNER_COLUMNS}`,
        [bannerId, blocked, reason],
      );
      const after = updated.rows[0];
      await recordOperatorAction(client, actor, {
        action: 'banner.block',
        targetType: 'creator_banner',
        targetId: bannerId,
        subjectUserId: before.user_id,
        before: { blocked: before.blocked, reason: before.blocked_reason },
        after: { blocked: after.blocked, reason: after.blocked_reason },
      });
      return after;
    });
    return this.creator.creatorBannerView(row);
  }

  async blockedDomains(): Promise<BlockedDomainView[]> {
    const result = await this.database.query<{ domain: string; reason: string | null; created_at: Date }>(
      'SELECT domain, reason, created_at FROM blocked_domains ORDER BY domain',
    );
    return result.rows.map((row) => ({
      domain: row.domain,
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * 도메인을 막고, 같은 트랜잭션에서 그 도메인과 하위 도메인의 기존 링크·크리에이터 배너를 차단합니다(R14 ③, R21 ④).
   * 걸리는 게시 중·예약 크리링 배너는 내립니다(게시 끝 = 지금, 예약이면 시작도 지금. 설계 미정 3 A).
   * 행동 기록의 after에 함께 차단·종료된 링크·배너·크리링 배너 수를 남깁니다.
   */
  async addBlockedDomain(actor: OperatorActor, body: unknown): Promise<BlockedDomainView[]> {
    const input = bodyObject(body);
    const domain =
      typeof input.domain === 'string' ? domainToASCII(input.domain.trim().toLowerCase().replace(/\.$/, '')) : '';
    if (!DOMAIN_PATTERN.test(domain)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'domain_invalid', '예: example.com 처럼 도메인만 입력해 주세요.');
    }
    const reason = optionalText(input.reason, '차단 사유', CRELINK_LIMITS.blockedReasonMax) ?? null;
    try {
      await this.database.transaction(async (client) => {
        await client.query('INSERT INTO blocked_domains (domain, reason, created_by) VALUES ($1, $2, $3)', [
          domain,
          reason,
          actor.userId,
        ]);
        const links = await client.query(
          `UPDATE links SET blocked_at = now(), blocked_reason = $2, updated_at = now()
           WHERE blocked_at IS NULL AND (host = $1 OR right(host, length($1) + 1) = '.' || $1)`,
          [domain, reason ?? `차단 도메인: ${domain}`],
        );
        const banners = await client.query(
          `UPDATE creator_banners SET blocked_at = now(), blocked_reason = $2, updated_at = now()
           WHERE blocked_at IS NULL AND (host = $1 OR right(host, length($1) + 1) = '.' || $1)`,
          [domain, reason ?? `차단 도메인: ${domain}`],
        );
        const adBanners = await client.query(
          `UPDATE ad_banners SET ends_at = least(coalesce(ends_at, now()), now()), starts_at = least(starts_at, now()),
                                 updated_at = now()
           WHERE (ends_at IS NULL OR ends_at > now()) AND (host = $1 OR right(host, length($1) + 1) = '.' || $1)`,
          [domain],
        );
        await recordOperatorAction(client, actor, {
          action: 'blocked_domain.add',
          targetType: 'blocked_domain',
          targetId: domain,
          after: {
            domain,
            reason,
            blockedLinks: links.rowCount ?? 0,
            blockedBanners: banners.rowCount ?? 0,
            endedAdBanners: adBanners.rowCount ?? 0,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw apiError(HttpStatus.CONFLICT, 'domain_exists', '이미 차단 목록에 있는 도메인입니다.');
      }
      throw error;
    }
    return this.blockedDomains();
  }

  /** 목록에서만 뺍니다. 이미 차단된 링크·배너는 운영자가 하나씩 풉니다. 내린 크리링 배너도 그대로 끝남입니다. */
  async removeBlockedDomain(actor: OperatorActor, domainValue: string): Promise<void> {
    const domain = domainValue.trim().toLowerCase();
    await this.database.transaction(async (client) => {
      const deleted = await client.query<{ domain: string; reason: string | null }>(
        'DELETE FROM blocked_domains WHERE domain = $1 RETURNING domain, reason',
        [domain],
      );
      const before = deleted.rows[0];
      if (!before) throw apiError(HttpStatus.NOT_FOUND, 'domain_not_found', '차단 목록에 없는 도메인입니다.');
      await recordOperatorAction(client, actor, {
        action: 'blocked_domain.remove',
        targetType: 'blocked_domain',
        targetId: before.domain,
        before: { domain: before.domain, reason: before.reason },
      });
    });
  }
}
