import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CHANNEL_LINK_CODE_PATTERN,
  CHANNEL_LINK_LIMITS,
  channelLinkCampaign,
  ChannelLinkView,
  findChannelPreset,
  normalizeChannelCampaign,
} from '@crelink/shared';
import type { PoolClient } from 'pg';
import { apiError, insertWithRandomId } from '../common/http';
import { bodyObject } from '../common/input';
import { AppConfig } from '../config.service';
import { Database } from '../database';

interface ChannelLinkRow {
  code: string;
  channel: string;
  placement: string;
  campaign: string;
  created_at: Date;
}

const COLUMNS = 'code, channel, placement, campaign, created_at';

/**
 * 채널별 짧은 주소 관리(`/api/me/channel-links`). 세션 사용자의 랜딩만 다루며 페이지를 고르는 입력이 없습니다.
 * 설계: docs/specs/channel-links.md. 방문 처리는 `ShortLinkController`의 `GET {SHORT}/s/{code}`입니다.
 */
@Injectable()
export class ChannelLinksService {
  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
  ) {}

  private view(row: ChannelLinkRow): ChannelLinkView {
    return {
      code: row.code,
      url: `${this.config.shortLinkBaseUrl}/s/${row.code}`,
      channel: row.channel,
      placement: row.placement,
      campaign: row.campaign,
      createdAt: row.created_at.toISOString(),
    };
  }

  /** 보관하지 않은 주소, 최신순. 상한(`perLanding`)이 있어 쪽을 나누지 않습니다. */
  async list(userId: string): Promise<ChannelLinkView[]> {
    const result = await this.database.query<ChannelLinkRow>(
      `SELECT cl.code, cl.channel, cl.placement, cl.campaign, cl.created_at
       FROM channel_links cl JOIN landings l ON l.id = cl.landing_id
       WHERE l.user_id = $1 AND cl.archived_at IS NULL
       ORDER BY cl.created_at DESC, cl.code
       LIMIT $2`,
      [userId, CHANNEL_LINK_LIMITS.perLanding],
    );
    return result.rows.map((row) => this.view(row));
  }

  /**
   * 같은 조합의 보관되지 않은 주소가 있으면 그것(`created: false`), 없으면 새로 만듭니다.
   * 사용자 행을 잠가 같은 조합의 동시 요청과 한도 검사를 줄 세웁니다(`LinksService`와 같은 방식).
   */
  async create(userId: string, body: unknown): Promise<{ view: ChannelLinkView; created: boolean }> {
    const input = bodyObject(body);
    const preset = findChannelPreset(input.channel, input.placement);
    if (!preset) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '채널과 노출 위치를 목록에서 골라 주세요.');
    }
    if (input.campaign !== undefined && input.campaign !== null && typeof input.campaign !== 'string') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '캠페인 이름은 문자열이어야 합니다.');
    }
    const normalized = normalizeChannelCampaign(input.campaign);
    if (normalized === null) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        '캠페인 이름에는 영문 소문자·숫자·한글·하이픈만 쓸 수 있어요.',
      );
    }
    const channel = preset.channel.value;
    const placement = preset.placement.value;
    const campaign = channelLinkCampaign(placement, normalized);
    return this.database.transaction(async (client) => {
      await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const landingId = await this.landingId(client, userId);
      const existing = await client.query<ChannelLinkRow>(
        `SELECT ${COLUMNS} FROM channel_links
         WHERE landing_id = $1 AND channel = $2 AND placement = $3 AND campaign = $4 AND archived_at IS NULL`,
        [landingId, channel, placement, campaign],
      );
      if (existing.rows[0]) return { view: this.view(existing.rows[0]), created: false };
      const counts = await client.query<{ active: number; total: number }>(
        `SELECT count(*) FILTER (WHERE archived_at IS NULL)::int AS active, count(*)::int AS total
         FROM channel_links WHERE landing_id = $1`,
        [landingId],
      );
      const { active, total } = counts.rows[0];
      if (active >= CHANNEL_LINK_LIMITS.perLanding) {
        throw apiError(
          HttpStatus.CONFLICT,
          'channel_link_limit_reached',
          `채널 주소는 ${CHANNEL_LINK_LIMITS.perLanding}개까지 둘 수 있어요. 쓰지 않는 주소를 보관해 주세요.`,
        );
      }
      if (total >= CHANNEL_LINK_LIMITS.totalPerLanding) {
        throw apiError(
          HttpStatus.CONFLICT,
          'channel_link_total_limit_reached',
          `보관한 주소를 포함해 채널 주소는 ${CHANNEL_LINK_LIMITS.totalPerLanding}개까지 만들 수 있어요.`,
        );
      }
      // code는 먼저 영구 기록 표에 넣어 겹침만 재시도하고, 그다음 의미 표를 채웁니다.
      const code = await insertWithRandomId(CHANNEL_LINK_LIMITS.codeLength, async (candidate) => {
        const inserted = await client.query<{ code: string }>(
          'INSERT INTO channel_link_codes (code) VALUES ($1) ON CONFLICT (code) DO NOTHING RETURNING code',
          [candidate],
        );
        return inserted.rows[0]?.code;
      });
      const row = await client.query<ChannelLinkRow>(
        `INSERT INTO channel_links (code, landing_id, channel, placement, campaign)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [code, landingId, channel, placement, campaign],
      );
      return { view: this.view(row.rows[0]), created: true };
    });
  }

  /** 보관: 목록에서만 숨기고 주소는 계속 동작합니다. 이미 보관이면 그대로 성공. 남의 주소·없는 code는 404 `channel_link_not_found`. */
  async archive(userId: string, code: string): Promise<void> {
    const archived = CHANNEL_LINK_CODE_PATTERN.test(code)
      ? await this.database.query(
          `UPDATE channel_links SET archived_at = coalesce(archived_at, now())
           WHERE code = $1 AND landing_id = (SELECT id FROM landings WHERE user_id = $2)`,
          [code, userId],
        )
      : null;
    if (!archived?.rowCount) {
      throw apiError(HttpStatus.NOT_FOUND, 'channel_link_not_found', '채널 주소를 찾을 수 없습니다.');
    }
  }

  private async landingId(client: PoolClient, userId: string): Promise<string> {
    const landing = await client.query<{ id: string }>('SELECT id FROM landings WHERE user_id = $1', [userId]);
    if (!landing.rows[0]) throw apiError(HttpStatus.NOT_FOUND, 'creator_not_found', '크리에이터를 찾을 수 없습니다.');
    return landing.rows[0].id;
  }
}
