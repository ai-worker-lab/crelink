import { HttpStatus, Injectable } from '@nestjs/common';
import { INSTAGRAM_DM_LIMITS, InstagramDmDeliveryView } from '@crelink/shared';
import { cursorAtSql, cursorBeforeSql, cursorPage, parseCursor } from '../common/cursor';
import { apiError } from '../common/http';
import { AppConfig } from '../config.service';
import { Database } from '../database';

interface DeliveryRow {
  id: string;
  rule_public_id: string;
  keyword: string;
  media_caption_preview: string;
  status: InstagramDmDeliveryView['status'];
  created_at: Date;
  sent_at: Date | null;
  cursor_at: string;
}

@Injectable()
export class InstagramDeliveriesService {
  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
  ) {}

  async list(userId: string, cursorValue?: unknown, rule?: unknown) {
    if (!this.config.instagram) {
      throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'instagram_not_configured', '인스타그램 연동 설정이 필요합니다.');
    }
    const cursor = parseCursor(cursorValue, '발송 내역 커서 형식이 올바르지 않습니다.');
    if (rule !== undefined && (typeof rule !== 'string' || !/^[a-z0-9]{10}$/.test(rule))) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '규칙 필터 형식이 올바르지 않습니다.');
    }
    // 보관된 규칙의 내역도 유지하며, 타 소유자 필터는 빈 목록 대신 404입니다.
    if (rule !== undefined) {
      const owned = await this.database.query<{ id: string }>(
        `SELECT r.id FROM instagram_dm_rules r JOIN instagram_connections c ON c.id = r.connection_id
         WHERE c.user_id = $1 AND r.public_id = $2`,
        [userId, rule],
      );
      if (!owned.rows[0]) {
        throw apiError(HttpStatus.NOT_FOUND, 'instagram_rule_not_found', '규칙을 찾을 수 없습니다.');
      }
    }
    const result = await this.database.query<DeliveryRow>(
      `SELECT d.id, r.public_id AS rule_public_id, r.keyword, r.media_caption_preview,
              d.status, d.created_at, d.sent_at, ${cursorAtSql('d.created_at')} AS cursor_at
       FROM instagram_dm_deliveries d
       JOIN instagram_connections c ON c.id = d.connection_id
       JOIN instagram_dm_rules r ON r.id = d.rule_id AND r.connection_id = c.id
       WHERE c.user_id = $1 AND ($2::text IS NULL OR r.public_id = $2)
         AND ${cursorBeforeSql('d.created_at', 'd.id', 3, 4)}
       ORDER BY d.created_at DESC, d.id DESC LIMIT $5`,
      [userId, rule ?? null, cursor?.at ?? null, cursor?.id ?? null, INSTAGRAM_DM_LIMITS.deliveryPageSize + 1],
    );
    return cursorPage(result.rows, INSTAGRAM_DM_LIMITS.deliveryPageSize, (row): InstagramDmDeliveryView => ({
      id: row.id,
      ruleId: row.rule_public_id,
      keyword: row.keyword,
      mediaPreview: row.media_caption_preview,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      sentAt: row.sent_at?.toISOString() ?? null,
    }));
  }
}
