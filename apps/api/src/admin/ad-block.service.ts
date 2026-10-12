import { Injectable } from '@nestjs/common';
import { AdBlockSettingView } from '@crelink/shared';
import { booleanField } from '../common/input';
import { Database } from '../database';
import { OperatorActor, recordOperatorAction } from '../ai-operator/audit';

/**
 * 플랫폼 광고 블록 스위치(R20 ⑩, `platform_settings` 1행, 기본 false). 근거: docs/specs/crelink-link-limit-ad-toggle.md.
 * 꺼져 있으면 공개 랜딩이 광고 블록을 그리지 않고 크리에이터 스위치(`PUT /api/me/ad-block`)도 409 `ad_block_unavailable`입니다.
 */
@Injectable()
export class AdBlockService {
  constructor(private readonly database: Database) {}

  /** `GET /api/admin/ad-block`. 바꾼 사람은 이메일(계정을 지웠으면 null). */
  async setting(): Promise<AdBlockSettingView> {
    const result = await this.database.query<{ enabled: boolean; updated_at: Date; updated_by: string | null }>(
      `SELECT s.ad_block_enabled AS enabled, s.updated_at, u.email AS updated_by
       FROM platform_settings s LEFT JOIN users u ON u.id = s.updated_by`,
    );
    const row = result.rows[0];
    return { enabled: row.enabled, updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by };
  }

  /**
   * `PUT /api/admin/ad-block`. 설정 행을 `FOR UPDATE`로 잡아 크리에이터 스위치 쓰기의 `FOR SHARE` 확인과 줄 세웁니다.
   * 값이 그대로면 바꾼 사람·시각도 그대로 두고 행동 기록 `platform.ad_block`만 남깁니다(`ai_operator.pause`와 같음).
   */
  async set(actor: OperatorActor, body: unknown): Promise<AdBlockSettingView> {
    const enabled = booleanField(body, 'enabled');
    await this.database.transaction(async (client) => {
      const current = await client.query<{ enabled: boolean }>(
        'SELECT ad_block_enabled AS enabled FROM platform_settings FOR UPDATE',
      );
      const before = current.rows[0];
      if (before.enabled !== enabled) {
        await client.query('UPDATE platform_settings SET ad_block_enabled = $1, updated_at = now(), updated_by = $2', [
          enabled,
          actor.userId,
        ]);
      }
      await recordOperatorAction(client, actor, {
        action: 'platform.ad_block',
        targetType: 'platform_setting',
        targetId: 'ad_block',
        subjectUserId: null,
        before: { enabled: before.enabled },
        after: { enabled },
      });
    });
    return this.setting();
  }
}
