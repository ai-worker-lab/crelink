import { HttpStatus, Injectable } from '@nestjs/common';
import { CRELINK_LIMITS, LinkView } from '@crelink/shared';
import type { PoolClient } from 'pg';
import { Database } from '../database';
import { apiError, insertWithRandomId, UUID_PATTERN } from '../common/http';
import {
  bodyObject,
  optionalBoolean,
  optionalNonNegativeInteger,
  optionalText,
  orderedIds,
  parseHttpUrl,
  requiredText,
} from '../common/input';
import { FilesService } from '../files/files.service';
import { CreatorService, LINK_COLUMNS, LinkRow, SLOT_INDEX_SQL } from './creator.service';

/** 공개 링크 ID 길이. 클릭 주소 `{SHORT}/c/{publicId}`에 씁니다. */
const LINK_PUBLIC_ID_LENGTH = 10;

function linkUrl(value: unknown): { url: string; host: string } {
  const url = typeof value === 'string' ? parseHttpUrl(value.trim()) : null;
  if (!url) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'link_url_invalid',
      'http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.',
    );
  }
  return { url: url.href, host: url.hostname };
}

@Injectable()
export class LinksService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
  ) {}

  /** 같은 사용자의 링크 변경을 줄 세워 한도 검사가 동시 요청에 뚫리지 않게 합니다. */
  private async lockUser(client: PoolClient, userId: string): Promise<void> {
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
  }

  private async assertDomainAllowed(client: PoolClient, host: string): Promise<void> {
    if (await this.creator.blockedDomainFor(client, host)) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'link_domain_blocked',
        '운영 정책으로 차단된 도메인이라 추가할 수 없습니다.',
      );
    }
  }

  private async assertVisibleSlot(client: PoolClient, userId: string): Promise<void> {
    const limits = await this.creator.limits(client, userId);
    if (limits.visibleUsed >= limits.visibleMax) {
      throw apiError(
        HttpStatus.CONFLICT,
        'link_limit_reached',
        `보이는 링크는 ${limits.visibleMax}개까지 둘 수 있습니다. 다른 링크를 숨기거나 지운 뒤 다시 시도해 주세요.`,
      );
    }
  }

  async create(userId: string, body: unknown): Promise<LinkView> {
    const input = bodyObject(body);
    const title = requiredText(input.title, '링크 제목', CRELINK_LIMITS.linkTitleMax);
    const { url, host } = linkUrl(input.url);
    const description = optionalText(input.description, '설명', CRELINK_LIMITS.linkDescriptionMax) ?? null;
    const hidden = optionalBoolean(input.hidden, '숨김') ?? false;
    return this.database.transaction(async (client) => {
      await this.lockUser(client, userId);
      const thumbnail = (await this.files.ownedFileId(client, userId, input.thumbnailFileId)) ?? null;
      await this.assertDomainAllowed(client, host);
      const limits = await this.creator.limits(client, userId);
      if (limits.totalUsed >= limits.totalMax) {
        throw apiError(
          HttpStatus.CONFLICT,
          'link_total_limit_reached',
          `링크는 숨긴 링크를 포함해 ${limits.totalMax}개까지 만들 수 있습니다.`,
        );
      }
      if (!hidden) await this.assertVisibleSlot(client, userId);
      const { blockId } = await this.creator.context(client, userId);
      const row = await insertWithRandomId(LINK_PUBLIC_ID_LENGTH, async (publicId) => {
        const inserted = await client.query<LinkRow>(
          `INSERT INTO links (public_id, user_id, block_id, title, url, host, description, thumbnail_file_id, hidden, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   (SELECT coalesce(max(position) + 1, 0) FROM links WHERE user_id = $2))
           ON CONFLICT (public_id) DO NOTHING
           RETURNING ${LINK_COLUMNS}`,
          [publicId, userId, blockId, title, url, host, description, thumbnail, hidden],
        );
        return inserted.rows[0];
      });
      return this.creator.linkView(row);
    });
  }

  async update(userId: string, linkId: string, body: unknown): Promise<LinkView> {
    const input = bodyObject(body);
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined) changes.title = requiredText(input.title, '링크 제목', CRELINK_LIMITS.linkTitleMax);
    if (input.url !== undefined) Object.assign(changes, linkUrl(input.url));
    const description = optionalText(input.description, '설명', CRELINK_LIMITS.linkDescriptionMax);
    if (description !== undefined) changes.description = description;
    const hidden = optionalBoolean(input.hidden, '숨김');
    if (hidden !== undefined) changes.hidden = hidden;
    return this.database.transaction(async (client) => {
      await this.lockUser(client, userId);
      const existing = await this.ownLink(client, userId, linkId);
      const thumbnail = await this.files.ownedFileId(client, userId, input.thumbnailFileId);
      if (thumbnail !== undefined) changes.thumbnail_file_id = thumbnail;
      if (typeof changes.host === 'string') await this.assertDomainAllowed(client, changes.host);
      // 숨김을 풀어 보이는 링크가 늘어나는 경우에만 한도를 확인합니다. 차단된 링크는 숨김을 풀어도 보이지 않습니다.
      if (existing.hidden && hidden === false && !existing.blocked) await this.assertVisibleSlot(client, userId);
      const columns = Object.keys(changes);
      const updated = await client.query<LinkRow>(
        `UPDATE links SET ${[...columns.map((column, index) => `${column} = $${index + 2}`), 'updated_at = now()'].join(', ')}
         WHERE id = $1 RETURNING ${LINK_COLUMNS}`,
        [linkId, ...columns.map((column) => changes[column])],
      );
      return this.creator.linkView(updated.rows[0]);
    });
  }

  private async ownLink(client: PoolClient, userId: string, linkId: string): Promise<LinkRow> {
    const found = UUID_PATTERN.test(linkId)
      ? await client.query<LinkRow>(`SELECT ${LINK_COLUMNS} FROM links WHERE id = $1 AND user_id = $2 FOR UPDATE`, [
          linkId,
          userId,
        ])
      : null;
    if (!found?.rowCount) throw apiError(HttpStatus.NOT_FOUND, 'link_not_found', '링크를 찾을 수 없습니다.');
    return found.rows[0];
  }

  async remove(userId: string, linkId: string): Promise<void> {
    const deleted = UUID_PATTERN.test(linkId)
      ? await this.database.query('DELETE FROM links WHERE id = $1 AND user_id = $2', [linkId, userId])
      : null;
    if (!deleted?.rowCount) throw apiError(HttpStatus.NOT_FOUND, 'link_not_found', '링크를 찾을 수 없습니다.');
  }

  /**
   * 링크를 0..n-1로 다시 매기고 같은 트랜잭션에서 광고 블록·배너 슬롯 위치(`landing_blocks.slot_position`)를 저장합니다(R20 ②).
   * slotIndex가 오면 n 이상은 맨 뒤(NULL), 아니면 그 값. 생략하면(옛 웹) 다시 매기기 전의 슬롯 앞 링크 수를 새 위치로 둬 상대 위치를 유지합니다.
   */
  async reorder(userId: string, body: unknown): Promise<LinkView[]> {
    const slotIndex = optionalNonNegativeInteger(bodyObject(body).slotIndex, 'slotIndex');
    return this.database.transaction(async (client) => {
      await this.lockUser(client, userId);
      const current = await client.query<{ id: string }>('SELECT id FROM links WHERE user_id = $1', [userId]);
      const ids = orderedIds(
        body,
        current.rows.map((row) => row.id),
      );
      const { blockId } = await this.creator.context(client, userId);
      let slotPosition: number | null;
      if (slotIndex === undefined) {
        const kept = await client.query<{ slot_index: number | null }>(
          `SELECT ${SLOT_INDEX_SQL} AS slot_index FROM landing_blocks b WHERE b.id = $1`,
          [blockId],
        );
        slotPosition = kept.rows[0].slot_index;
      } else {
        slotPosition = slotIndex >= ids.length ? null : slotIndex;
      }
      await client.query(
        `UPDATE links SET position = o.ord - 1, updated_at = now()
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
         WHERE links.id = o.id AND links.user_id = $1`,
        [userId, ids],
      );
      await client.query('UPDATE landing_blocks SET slot_position = $2 WHERE id = $1', [blockId, slotPosition]);
      return this.creator.links(client, userId);
    });
  }
}
