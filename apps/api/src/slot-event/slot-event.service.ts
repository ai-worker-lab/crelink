import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CreatorSlotEventState,
  CRELINK_LIMITS,
  OperatorSlotEventEntry,
  OperatorSlotEventResponse,
  SlotEventEntryView,
  SlotEventStatus,
  SlotEventView,
} from '@crelink/shared';
import { Database, Queryable } from '../database';
import { apiError } from '../common/http';
import { bodyObject, pageNumber, zonedTime } from '../common/input';
import { changedFields, OperatorActor, recordOperatorAction } from '../ai-operator/audit';

/** API가 다루는 이벤트 행의 코드. migration `0005_slot_event`가 시드합니다(설계 핵심 결정 5). */
export const SLOT_EVENT_CODE = 'link-slots-plus-5';

/**
 * 이벤트 상태. 한 문장 안의 같은 `now()`로 정하며, 신청 INSERT의 열림 조건(`starts_at <= now() AND (ends_at IS NULL OR now() < ends_at)`)과
 * 크리링 배너 게시 기간 규칙과 같습니다. 별칭 `e`는 slot_events입니다.
 */
const STATUS_SQL = `CASE WHEN e.starts_at > now() THEN 'scheduled'
  WHEN e.ends_at IS NOT NULL AND e.ends_at <= now() THEN 'ended'
  ELSE 'open' END`;

const EVENT_COLUMNS = `e.id, e.bonus_links, e.starts_at, e.ends_at, ${STATUS_SQL} AS status`;

interface EventRow {
  id: string;
  bonus_links: number;
  starts_at: Date;
  ends_at: Date | null;
  status: SlotEventStatus;
}

/** 이벤트와 이 계정의 신청(없으면 entry_ 컬럼이 NULL). */
interface StateRow extends EventRow {
  entry_applied_at: Date | null;
  entry_bonus_links: number | null;
}

interface OperatorEntryRow {
  user_id: string;
  email: string;
  display_name: string | null;
  slug: string;
  applied_at: Date;
}

function eventView(row: EventRow): SlotEventView {
  return {
    bonusLinks: row.bonus_links,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at?.toISOString() ?? null,
    status: row.status,
  };
}

function slotEventNotFound() {
  return apiError(HttpStatus.NOT_FOUND, 'slot_event_not_found', '링크 슬롯 이벤트를 찾을 수 없습니다.');
}

/**
 * 링크 슬롯 +5 이벤트(R24 ①③⑤). 설계: docs/specs/crelink-slot-event.md `구성과 흐름`.
 * 보이는 링크 한도 합산은 `CreatorService.limits`가 신청 행 `bonus_links` 합으로 합니다.
 */
@Injectable()
export class SlotEventService {
  constructor(private readonly database: Database) {}

  private async eventRow(db: Queryable): Promise<EventRow | null> {
    const result = await db.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM slot_events e WHERE e.code = $1`, [
      SLOT_EVENT_CODE,
    ]);
    return result.rows[0] ?? null;
  }

  /** `GET /api/public/slot-event`: 기간·보너스만(신청 수·신청자 없음). 이벤트 행이 없으면 null. */
  async publicEvent(): Promise<SlotEventView | null> {
    const row = await this.eventRow(this.database.pool);
    return row ? eventView(row) : null;
  }

  /** `CreatorLandingState.slotEvent`, 신청 응답. 이벤트와 이 계정의 신청을 질의 하나로 읽습니다. */
  async state(db: Queryable, userId: string): Promise<CreatorSlotEventState> {
    const result = await db.query<StateRow>(
      `SELECT ${EVENT_COLUMNS}, en.applied_at AS entry_applied_at, en.bonus_links AS entry_bonus_links
       FROM slot_events e
       LEFT JOIN slot_event_entries en ON en.event_id = e.id AND en.user_id = $2
       WHERE e.code = $1`,
      [SLOT_EVENT_CODE, userId],
    );
    const row = result.rows[0];
    if (!row) return { event: null, entry: null };
    return {
      event: eventView(row),
      entry:
        row.entry_applied_at && row.entry_bonus_links !== null
          ? { appliedAt: row.entry_applied_at.toISOString(), bonusLinks: row.entry_bonus_links }
          : null,
    };
  }

  /** `OperatorCreatorDetail.slotEvent`: 이 계정의 신청(없으면 null). */
  async entry(db: Queryable, userId: string): Promise<SlotEventEntryView | null> {
    const result = await db.query<{ applied_at: Date; bonus_links: number }>(
      `SELECT en.applied_at, en.bonus_links
       FROM slot_event_entries en JOIN slot_events e ON e.id = en.event_id
       WHERE e.code = $1 AND en.user_id = $2`,
      [SLOT_EVENT_CODE, userId],
    );
    const row = result.rows[0];
    return row ? { appliedAt: row.applied_at.toISOString(), bonusLinks: row.bonus_links } : null;
  }

  /**
   * `POST /api/me/slot-event/entry`(멱등). 기간 검사와 보너스 사본은 같은 `INSERT … SELECT … WHERE` 안에서 DB 시각으로 하고,
   * 동시 신청은 PK `(event_id, user_id)`와 `ON CONFLICT DO NOTHING`이 막습니다(겹친 요청은 앞 요청의 커밋을 기다린 뒤 아무것도 하지 않음).
   * 행이 생기면 created = true(201). 아니면 이미 신청한 계정은 기간과 관계없이 created = false(200),
   * 이벤트 행이 없으면 404 `slot_event_not_found`, 그 밖에는 409 `slot_event_closed`(시작 전·끝남을 문구로 구분).
   */
  async apply(userId: string): Promise<{ created: boolean; state: CreatorSlotEventState }> {
    return this.database.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO slot_event_entries (event_id, user_id, bonus_links)
         SELECT id, $2, bonus_links FROM slot_events
         WHERE code = $1 AND starts_at <= now() AND (ends_at IS NULL OR now() < ends_at)
         ON CONFLICT (event_id, user_id) DO NOTHING
         RETURNING applied_at`,
        [SLOT_EVENT_CODE, userId],
      );
      const state = await this.state(client, userId);
      if (inserted.rowCount || state.entry) return { created: Boolean(inserted.rowCount), state };
      if (!state.event) throw slotEventNotFound();
      throw apiError(
        HttpStatus.CONFLICT,
        'slot_event_closed',
        state.event.status === 'scheduled'
          ? '아직 신청 기간이 아닙니다. 이벤트가 시작되면 신청해 주세요.'
          : '신청 기간이 끝난 이벤트입니다.',
      );
    });
  }

  /** `GET /api/admin/slot-event?page=`: 이벤트·신청 수·신청 최신순 한 쪽. page 검사는 운영자 크리에이터 목록과 같습니다(1 이상 정수, 아니면 400). */
  async operatorView(pageInput: unknown): Promise<OperatorSlotEventResponse> {
    return this.operatorPage(this.database.pool, pageNumber(pageInput));
  }

  private async operatorPage(db: Queryable, page: number): Promise<OperatorSlotEventResponse> {
    const event = await this.eventRow(db);
    if (!event) throw slotEventNotFound();
    const pageSize = CRELINK_LIMITS.operatorPageSize;
    // 계정마다 랜딩·단축 URL·현재 주소가 가입 트랜잭션에서 함께 생기므로(AuthService) 조인으로 빠지는 신청 행은 없습니다.
    const [entries, total] = await Promise.all([
      db.query<OperatorEntryRow>(
        `SELECT en.user_id, u.email, l.display_name, s.slug, en.applied_at
         FROM slot_event_entries en
         JOIN users u ON u.id = en.user_id
         JOIN landings l ON l.user_id = u.id
         JOIN short_links sl ON sl.user_id = u.id
         JOIN short_slugs s ON s.short_link_id = sl.id AND s.retired_at IS NULL
         WHERE en.event_id = $1
         ORDER BY en.applied_at DESC, en.user_id
         LIMIT $2 OFFSET $3`,
        [event.id, pageSize, (page - 1) * pageSize],
      ),
      db.query<{ count: number }>('SELECT count(*)::int AS count FROM slot_event_entries WHERE event_id = $1', [
        event.id,
      ]),
    ]);
    return {
      event: eventView(event),
      entryCount: total.rows[0].count,
      entries: entries.rows.map((row): OperatorSlotEventEntry => ({
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        slug: row.slug,
        appliedAt: row.applied_at.toISOString(),
      })),
      page,
      pageSize,
    };
  }

  /**
   * `PUT /api/admin/slot-event` `SetSlotEventPeriodRequest`: 시작 필수·끝 선택(null·생략 = 끝 없음), 시간대가 붙은 ISO 8601(아니면 400
   * `validation_failed`), 끝 ≤ 시작이면 400 `slot_event_period_invalid`. 받은 보너스는 바뀌지 않습니다. 응답은 1쪽.
   * 같은 트랜잭션에서 이전 기간을 `FOR UPDATE`로 읽고 행동 기록 `slot_event.period_update`(바뀐 필드만, 값이 같아도 기록)를 남깁니다
   * (AI 운영자 설계 `행동 기록 규칙`).
   */
  async setPeriod(actor: OperatorActor, body: unknown): Promise<OperatorSlotEventResponse> {
    const input = bodyObject(body);
    const startsAt = zonedTime(input.startsAt, '이벤트 시작');
    const endsAt = input.endsAt === undefined || input.endsAt === null ? null : zonedTime(input.endsAt, '이벤트 끝');
    if (endsAt && endsAt.ms <= startsAt.ms) {
      throw apiError(HttpStatus.BAD_REQUEST, 'slot_event_period_invalid', '이벤트 끝은 시작보다 뒤여야 합니다.');
    }
    return this.database.transaction(async (client) => {
      const previous = await client.query<{ id: string; starts_at: Date; ends_at: Date | null }>(
        'SELECT id, starts_at, ends_at FROM slot_events WHERE code = $1 FOR UPDATE',
        [SLOT_EVENT_CODE],
      );
      if (!previous.rowCount) throw slotEventNotFound();
      const updated = await client.query<{ starts_at: Date; ends_at: Date | null }>(
        'UPDATE slot_events SET starts_at = $2, ends_at = $3, updated_at = now() WHERE id = $1 RETURNING starts_at, ends_at',
        [previous.rows[0].id, startsAt.text, endsAt?.text ?? null],
      );
      const period = (row: { starts_at: Date; ends_at: Date | null }) => ({
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at?.toISOString() ?? null,
      });
      await recordOperatorAction(client, actor, {
        action: 'slot_event.period_update',
        targetType: 'slot_event',
        targetId: SLOT_EVENT_CODE,
        ...changedFields(period(previous.rows[0]), period(updated.rows[0])),
      });
      return this.operatorPage(client, 1);
    });
  }
}
