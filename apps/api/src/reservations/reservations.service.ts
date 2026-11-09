import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  CreateReservationRequest,
  CreateReservationResponse,
  CRELINK_LIMITS,
  formatReservationContact,
  LANDING_EVENT_LIMITS,
  LinkReservationSetting,
  normalizeReservationContact,
  RESERVATION_CONSENT_VERSION,
  RESERVATION_METHODS,
  RESERVATION_STATES,
  ReservationLinkSummary,
  ReservationMethod,
  ReservationPage,
  ReservationState,
} from '@crelink/shared';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { AppConfig } from '../config.service';
import { cursorAtSql, cursorBeforeSql, cursorPage, parseCursor } from '../common/cursor';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject } from '../common/input';
import { VISIBLE_LINK_CONDITION } from '../creator/creator.service';
import { Database } from '../database';
import { STATS_TIME_ZONE } from '../retention/retention.service';
import { LandingPassService } from '../short-link/landing-pass.service';
import { consumeLimitBuckets, SOURCE_VISIT_SQL } from '../telemetry/landing-limits';

const INPUT_KEYS = new Set(['token', 'method', 'contact', 'consent', 'website']);
const SETTING_KEYS = new Set(['state', 'methods']);
const LINK_PUBLIC_ID_PATTERN = /^[a-z0-9]{10}$/;
/** 제한 창(분). `[임시값]` */
const RATE_WINDOW_MINUTES = 10;
/** 창마다 받는 제출 수. `[임시값]` IP 값은 통신사 공유 IP에서 실사용자를 막을 수 있습니다. */
const RATE_LIMITS = { visitor: 5, source: 30, link: 600 } as const;
/** 서명된 방문 시각에서 이 시간 안의 제출은 봇으로 보고 저장하지 않습니다. */
const BOT_MIN_AGE_MS = 3000;
const SUBMIT_LOCK_NAMESPACE = 213;

const RECEIVED: CreateReservationResponse = { status: 'received' };
const invalid = (message: string) => apiError(HttpStatus.BAD_REQUEST, 'validation_failed', message);
const contactInvalid = (message: string) => apiError(HttpStatus.BAD_REQUEST, 'reservation_contact_invalid', message);
const unavailable = () =>
  apiError(HttpStatus.NOT_FOUND, 'reservation_unavailable', '지금은 신청할 수 없는 링크입니다.');
const closed = () => apiError(HttpStatus.CONFLICT, 'reservation_closed', '신청이 마감되었습니다.');
const linkNotFound = () => apiError(HttpStatus.NOT_FOUND, 'link_not_found', '링크를 찾을 수 없습니다.');
const reservationNotFound = () => apiError(HttpStatus.NOT_FOUND, 'reservation_not_found', '신청을 찾을 수 없습니다.');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

interface ReservationRow {
  id: string;
  link_id: string;
  link_title: string;
  method: ReservationMethod;
  contact: string;
  created_at: Date;
  /** created_at의 epoch 마이크로초(커서용, `cursorAtSql`). */
  cursor_at: string;
}

/** CSV 셀. 수식으로 해석될 첫 글자에 `'`를 붙이고 큰따옴표로 감쌉니다. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@＝＋－＠\t\r]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * 링크별 사전 신청(R29~R31). 연락처 값은 로그·오류 메시지에 쓰지 않습니다. 근거: docs/specs/crelink-reservations.md
 * 공개 제출 순서: Origin → 입력 키 → 토큰 → 제한 → 봇 판정 → 트랜잭션(플래그는 가드). `me` 경로는 모든 쿼리에 소유자 조건을 둡니다.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly passes: LandingPassService,
  ) {}

  async submit(
    publicId: string,
    linkPublicId: string,
    body: unknown,
    request: Request,
  ): Promise<CreateReservationResponse> {
    this.assertSameOrigin(request);
    const input = this.input(body);
    const binding = this.passes.verifyTelemetry(publicId, input.token);
    if (!binding) {
      throw apiError(HttpStatus.FORBIDDEN, 'reservation_session_expired', '페이지를 다시 열어 주세요.');
    }
    if (!LINK_PUBLIC_ID_PATTERN.test(linkPublicId)) throw unavailable();
    await this.limit(publicId, linkPublicId, binding.visitorId, binding.sourceAt);
    if ((input.website ?? '') !== '' || Date.now() - binding.sourceAt * 1000 < BOT_MIN_AGE_MS) return RECEIVED;
    const { method, contact } = this.contact(input);
    await this.database.transaction(async (client) => {
      // 링크별로 줄 세워 5,000건 상한이 동시 요청에 뚫리지 않게 합니다.
      await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [SUBMIT_LOCK_NAMESPACE, linkPublicId]);
      const found = await client.query<{
        id: string;
        state: ReservationState;
        methods: ReservationMethod[];
        visible: boolean;
        suspended: boolean;
      }>(
        `SELECT l.id, l.reservation_state AS state, l.reservation_methods AS methods,
                ${VISIBLE_LINK_CONDITION} AS visible, u.suspended_at IS NOT NULL AS suspended
         FROM links l
         JOIN landing_blocks b ON b.id = l.block_id
         JOIN landings la ON la.id = b.landing_id
         JOIN users u ON u.id = la.user_id
         WHERE la.public_id = $1 AND l.public_id = $2
         FOR SHARE OF l`,
        [publicId, linkPublicId],
      );
      const link = found.rows[0];
      if (!link) throw unavailable();
      if (link.suspended) {
        throw apiError(HttpStatus.GONE, 'creator_suspended', '운영 정책에 따라 지금은 볼 수 없는 페이지입니다.');
      }
      if (!link.visible || link.state === 'off') throw unavailable();
      if (link.state === 'closed') throw closed();
      if (!link.methods.includes(method)) throw contactInvalid('이 방식으로는 신청을 받지 않습니다.');
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM link_reservations WHERE link_id = $1',
        [link.id],
      );
      if (count.rows[0].count >= CRELINK_LIMITS.reservationsPerLink) throw closed();
      await client.query(
        `INSERT INTO link_reservations (link_id, method, contact, consent_version) VALUES ($1, $2, $3, $4)
         ON CONFLICT (link_id, method, contact) DO NOTHING`,
        [link.id, method, contact, RESERVATION_CONSENT_VERSION],
      );
    });
    return RECEIVED;
  }

  private assertSameOrigin(request: Request): void {
    let origin: string | null = null;
    try {
      origin = new URL(this.config.webUrl).origin;
    } catch {
      // 아래에서 403으로 답합니다.
    }
    if (
      !origin ||
      request.headers.origin !== origin ||
      !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')
    ) {
      throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '허용되지 않은 요청입니다.');
    }
  }

  private input(body: unknown): CreateReservationRequest {
    const input = bodyObject(body);
    if (Buffer.byteLength(JSON.stringify(input)) > LANDING_EVENT_LIMITS.bodyBytes) {
      throw new HttpException({ code: 'validation_failed', message: '요청 본문이 너무 큽니다.' }, 413);
    }
    if (
      Object.keys(input).some((key) => !INPUT_KEYS.has(key)) ||
      typeof input.token !== 'string' ||
      input.token.length > 256 ||
      (input.website !== undefined && typeof input.website !== 'string')
    ) {
      throw invalid('요청 형식이 올바르지 않습니다.');
    }
    return input as unknown as CreateReservationRequest;
  }

  private contact(input: CreateReservationRequest): { method: ReservationMethod; contact: string } {
    if (input.consent !== true) throw invalid('개인정보 수집에 동의해 주세요.');
    if (!RESERVATION_METHODS.includes(input.method)) throw invalid('신청 방식을 확인해 주세요.');
    const contact = typeof input.contact === 'string' ? normalizeReservationContact(input.method, input.contact) : null;
    if (!contact) {
      throw contactInvalid(input.method === 'email' ? '이메일 주소를 확인해 주세요.' : '휴대폰 번호를 확인해 주세요.');
    }
    return { method: input.method, contact };
  }

  private async limit(publicId: string, linkPublicId: string, visitorId: string, sourceAt: number): Promise<void> {
    // 방문 이벤트 한도와 섞이지 않게 `reservation:` 접두사를 씁니다.
    const source = await this.database.query<{ ip: string | null }>(`SELECT v.ip ${SOURCE_VISIT_SQL}`, [
      publicId,
      visitorId,
      sourceAt,
    ]);
    const ip = source.rows[0]?.ip ?? null;
    const buckets: Array<readonly [string, number]> = [[`reservation:visitor:${hash(visitorId)}`, RATE_LIMITS.visitor]];
    if (ip) buckets.push([`reservation:source:${hash(ip)}`, RATE_LIMITS.source]);
    buckets.push([`reservation:link:${linkPublicId}`, RATE_LIMITS.link]);
    if (!(await consumeLimitBuckets(this.database, buckets, RATE_WINDOW_MINUTES))) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'reservation_rate_limited',
        '신청이 많습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async setLinkReservation(userId: string, linkId: string, body: unknown): Promise<LinkReservationSetting> {
    const setting = this.setting(body);
    const updated = UUID_PATTERN.test(linkId)
      ? await this.database.query<{ state: ReservationState; methods: ReservationMethod[] }>(
          `UPDATE links SET reservation_state = $3, reservation_methods = $4::text[], updated_at = now()
           WHERE id = $1 AND user_id = $2 RETURNING reservation_state AS state, reservation_methods AS methods`,
          [linkId, userId, setting.state, setting.methods],
        )
      : null;
    if (!updated?.rowCount) throw linkNotFound();
    return updated.rows[0];
  }

  private setting(body: unknown): LinkReservationSetting {
    const input = bodyObject(body);
    if (Object.keys(input).some((key) => !SETTING_KEYS.has(key))) throw invalid('요청 형식이 올바르지 않습니다.');
    if (!RESERVATION_STATES.includes(input.state as ReservationState)) throw invalid('신청 상태를 확인해 주세요.');
    const given = input.methods;
    if (!Array.isArray(given) || new Set(given).size !== given.length) throw invalid('받을 방식을 확인해 주세요.');
    if (!given.every((method) => RESERVATION_METHODS.includes(method as ReservationMethod))) {
      throw invalid('받을 방식을 확인해 주세요.');
    }
    const state = input.state as ReservationState;
    if (state !== 'off' && given.length === 0) throw invalid('받을 방식을 1개 이상 골라 주세요.');
    return { state, methods: RESERVATION_METHODS.filter((method) => given.includes(method)) };
  }

  async list(userId: string, linkIdValue: unknown, cursorValue: unknown): Promise<ReservationPage> {
    const linkId = await this.linkFilter(userId, linkIdValue);
    const cursor = parseCursor(cursorValue, '신청 목록 위치가 올바르지 않습니다. 처음부터 다시 불러와 주세요.');
    const pageSize = CRELINK_LIMITS.reservationPageSize;
    const [rows, links] = await Promise.all([
      this.database.query<ReservationRow>(
        `SELECT r.id, r.link_id, l.title AS link_title, r.method, r.contact, r.created_at,
                ${cursorAtSql('r.created_at')} AS cursor_at
         FROM link_reservations r JOIN links l ON l.id = r.link_id
         WHERE l.user_id = $1 AND ($2::uuid IS NULL OR r.link_id = $2)
           AND ${cursorBeforeSql('r.created_at', 'r.id', 3, 4)}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $5`,
        [userId, linkId, cursor?.at ?? null, cursor?.id ?? null, pageSize + 1],
      ),
      this.database.query<ReservationLinkSummary>(
        `SELECT l.id, l.title, l.reservation_state AS state, count(r.id)::int AS count
         FROM links l LEFT JOIN link_reservations r ON r.link_id = l.id
         WHERE l.user_id = $1
         GROUP BY l.id
         HAVING l.reservation_state <> 'off' OR count(r.id) > 0
         ORDER BY l.position, l.created_at`,
        [userId],
      ),
    ]);
    const { items, nextCursor } = cursorPage(rows.rows, pageSize, (row) => ({
      id: row.id,
      linkId: row.link_id,
      linkTitle: row.link_title,
      method: row.method,
      contact: formatReservationContact(row.method, row.contact),
      createdAt: row.created_at.toISOString(),
    }));
    return { items, nextCursor, links: links.rows };
  }

  /** 없으면 "내 전체", 있으면 내 링크 uuid여야 합니다. 아니면 404 `link_not_found`(다른 사람 링크의 존재를 드러내지 않음). */
  private async linkFilter(userId: string, value: unknown): Promise<string | null> {
    if (value === undefined) return null;
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw linkNotFound();
    const owned = await this.database.query('SELECT 1 FROM links WHERE id = $1 AND user_id = $2', [value, userId]);
    if (!owned.rowCount) throw linkNotFound();
    return value;
  }

  /** 내 신청을 CSV로 만듭니다. 셀은 `csvCell`, UTF-8 BOM, 시각은 서울 기준입니다. */
  async exportCsv(userId: string, linkIdValue: unknown): Promise<string> {
    const linkId = await this.linkFilter(userId, linkIdValue);
    const rows = await this.database.query<{
      title: string;
      method: ReservationMethod;
      contact: string;
      created: string;
    }>(
      `SELECT l.title, r.method, r.contact, to_char(r.created_at AT TIME ZONE $3, 'YYYY-MM-DD HH24:MI:SS') AS created
       FROM link_reservations r JOIN links l ON l.id = r.link_id
       WHERE l.user_id = $1 AND ($2::uuid IS NULL OR r.link_id = $2)
       ORDER BY r.created_at DESC, r.id DESC`,
      [userId, linkId, STATS_TIME_ZONE],
    );
    const lines = [
      ['링크', '방식', '연락처', '신청 시각(KST)'],
      ...rows.rows.map((row) => [
        row.title,
        row.method === 'email' ? '이메일' : '휴대폰',
        formatReservationContact(row.method, row.contact),
        row.created,
      ]),
    ].map((cells) => cells.map(csvCell).join(','));
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = UUID_PATTERN.test(id)
      ? await this.database.query(
          'DELETE FROM link_reservations r USING links l WHERE r.id = $1 AND l.id = r.link_id AND l.user_id = $2',
          [id, userId],
        )
      : null;
    if (!deleted?.rowCount) throw reservationNotFound();
  }

  async removeForLink(userId: string, linkId: string): Promise<void> {
    if ((await this.linkFilter(userId, linkId)) === null) throw linkNotFound();
    await this.database.query(
      'DELETE FROM link_reservations r USING links l WHERE r.link_id = $1 AND l.id = r.link_id AND l.user_id = $2',
      [linkId, userId],
    );
  }
}
