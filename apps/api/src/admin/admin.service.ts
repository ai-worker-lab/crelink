import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BlockedDomainView,
  CRELINK_LIMITS,
  LinkView,
  OperatorCreatorDetail,
  OperatorCreatorListResponse,
  OperatorCreatorStats,
  OperatorCreatorSummary,
} from '@crelink/shared';
import { domainToASCII } from 'node:url';
import { Database, isUniqueViolation } from '../database';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject, optionalText } from '../common/input';
import { AppConfig } from '../config.service';
import { CreatorService, LINK_COLUMNS, LinkRow } from '../creator/creator.service';
import { StatsService } from './stats.service';

/** 운영자 부여 슬롯 상한. 보이는 링크가 전체 상한(50)을 넘을 수 없으므로 50 - 5. */
const MAX_EXTRA_SLOTS = CRELINK_LIMITS.totalLinks - CRELINK_LIMITS.freeVisibleLinks;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const SUMMARY_SELECT = `
  SELECT u.id AS user_id, u.email, l.display_name, s.slug, l.public_id, u.suspended_at IS NOT NULL AS suspended,
         u.created_at, u.extra_link_slots, sl.id AS short_link_id,
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
  visits_30d: number;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly stats: StatsService,
    private readonly config: AppConfig,
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
    };
  }

  private async summaryRow(userId: string): Promise<SummaryRow> {
    const result = UUID_PATTERN.test(userId)
      ? await this.database.query<SummaryRow>(`${SUMMARY_SELECT} WHERE u.id = $1`, [userId])
      : null;
    if (!result?.rowCount) {
      throw apiError(HttpStatus.NOT_FOUND, 'creator_not_found', '크리에이터를 찾을 수 없습니다.');
    }
    return result.rows[0];
  }

  /** 이메일·표시 이름·현재 단축 주소 부분 일치 검색. 최근 가입 순, page는 1부터. */
  async list(queryInput: unknown, pageInput: unknown): Promise<OperatorCreatorListResponse> {
    const query = typeof queryInput === 'string' ? queryInput.trim().slice(0, 100) : '';
    const page = pageInput === undefined ? 1 : Number(pageInput);
    if (!Number.isInteger(page) || page < 1) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'page는 1 이상의 정수여야 합니다.');
    }
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
    const [{ extraLinkSlots, ...limits }, links] = await Promise.all([
      this.creator.limits(db, userId),
      this.creator.links(db, userId),
    ]);
    return {
      ...this.summary(row),
      extraLinkSlots,
      limits,
      links,
      // 부여 시각·배너 목록·사용 수는 0072(부여·차단)가 채웁니다.
      bannerSlot: { grantedAt: null },
      banners: [],
      bannerLimits: { ...this.config.bannerSlotLimits, visibleUsed: 0, totalUsed: 0 },
    };
  }

  async creatorStats(userId: string, from: unknown, to: unknown): Promise<OperatorCreatorStats> {
    const row = await this.summaryRow(userId);
    return this.stats.stats(row.short_link_id, from, to);
  }

  async setExtraSlots(userId: string, body: unknown): Promise<OperatorCreatorDetail> {
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
    await this.summaryRow(userId);
    await this.database.query('UPDATE users SET extra_link_slots = $2 WHERE id = $1', [userId, extraSlots]);
    return this.detail(userId);
  }

  /** 정지하면 기존 세션을 모두 지워 바로 로그아웃시키고, 랜딩·단축 URL은 안내 화면으로 바뀝니다. */
  async setSuspension(userId: string, body: unknown): Promise<OperatorCreatorDetail> {
    const suspended = bodyObject(body).suspended;
    if (typeof suspended !== 'boolean') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'suspended는 true 또는 false여야 합니다.');
    }
    await this.summaryRow(userId);
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE users SET suspended_at = CASE WHEN $2 THEN coalesce(suspended_at, now()) END WHERE id = $1`,
        [userId, suspended],
      );
      if (suspended) await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    });
    return this.detail(userId);
  }

  async setLinkBlock(linkId: string, body: unknown): Promise<LinkView> {
    const input = bodyObject(body);
    if (typeof input.blocked !== 'boolean') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'blocked는 true 또는 false여야 합니다.');
    }
    const reason = optionalText(input.reason, '차단 사유', CRELINK_LIMITS.blockedReasonMax) ?? null;
    const updated = UUID_PATTERN.test(linkId)
      ? await this.database.query<LinkRow>(
          `UPDATE links SET blocked_at = CASE WHEN $2 THEN coalesce(blocked_at, now()) END,
                            blocked_reason = CASE WHEN $2 THEN $3 END, updated_at = now()
           WHERE id = $1 RETURNING ${LINK_COLUMNS}`,
          [linkId, input.blocked, reason],
        )
      : null;
    if (!updated?.rowCount) throw apiError(HttpStatus.NOT_FOUND, 'link_not_found', '링크를 찾을 수 없습니다.');
    return this.creator.linkView(updated.rows[0]);
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

  /** 도메인을 막고, 그 도메인과 하위 도메인의 기존 링크를 같은 트랜잭션에서 차단합니다. */
  async addBlockedDomain(operatorId: string, body: unknown): Promise<BlockedDomainView[]> {
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
          operatorId,
        ]);
        await client.query(
          `UPDATE links SET blocked_at = now(), blocked_reason = $2, updated_at = now()
           WHERE blocked_at IS NULL AND (host = $1 OR right(host, length($1) + 1) = '.' || $1)`,
          [domain, reason ?? `차단 도메인: ${domain}`],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw apiError(HttpStatus.CONFLICT, 'domain_exists', '이미 차단 목록에 있는 도메인입니다.');
      }
      throw error;
    }
    return this.blockedDomains();
  }

  /** 목록에서만 뺍니다. 이미 차단된 링크는 운영자가 링크별로 풉니다. */
  async removeBlockedDomain(domain: string): Promise<void> {
    const deleted = await this.database.query('DELETE FROM blocked_domains WHERE domain = $1', [
      domain.trim().toLowerCase(),
    ]);
    if (!deleted.rowCount) {
      throw apiError(HttpStatus.NOT_FOUND, 'domain_not_found', '차단 목록에 없는 도메인입니다.');
    }
  }
}
