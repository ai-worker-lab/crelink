import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  LANDING_EVENT_LIMITS,
  LANDING_EVENT_TYPES,
  LANDING_TARGET_KINDS,
  LANDING_UTM_KEYS,
  type LandingEventRequest,
  type LandingUtm,
} from '@crelink/shared';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AppConfig } from '../config.service';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject } from '../common/input';
import { Database } from '../database';
import { LandingPassService } from '../short-link/landing-pass.service';
import { VISIBLE_LINK_CONDITION } from '../creator/creator.service';
import { consumeLimitBuckets, SOURCE_VISIT_SQL } from './landing-limits';

const INPUT_KEYS = new Set([
  'token',
  'eventId',
  'sessionId',
  'pageViewId',
  'type',
  'targetKind',
  'targetId',
  'activeMs',
  'scrollPercent',
  'language',
  'timeZone',
  'viewportWidth',
  'viewportHeight',
  'screenWidth',
  'screenHeight',
  'pixelRatio',
  'utm',
]);
const invalid = (): never => {
  throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '방문 이벤트 형식을 확인해 주세요.');
};
const forbidden = (): never => {
  throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '허용되지 않은 방문 이벤트입니다.');
};
const limited = (): never => {
  throw new HttpException({ code: 'telemetry_rate_limited', message: '방문 이벤트 요청이 많습니다.' }, 429);
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

interface EventRow {
  event_id: string;
  page_view_id: string;
  session_id: string;
  short_link_id: string;
  visitor_id: string;
  source_visit_id: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  referrer_host: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  utm: LandingUtm;
  language: string | null;
  time_zone: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  screen_width: number | null;
  screen_height: number | null;
  pixel_ratio: number | null;
}

@Injectable()
export class LandingEventsService {
  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly passes: LandingPassService,
  ) {}

  private input(body: unknown): LandingEventRequest {
    const input = bodyObject(body);
    if (Buffer.byteLength(JSON.stringify(input)) > LANDING_EVENT_LIMITS.bodyBytes) {
      throw new HttpException({ code: 'validation_failed', message: '방문 이벤트 본문이 너무 큽니다.' }, 413);
    }
    if (
      Object.keys(input).some((key) => !INPUT_KEYS.has(key)) ||
      typeof input.token !== 'string' ||
      input.token.length > 256
    )
      invalid();
    for (const key of ['eventId', 'sessionId', 'pageViewId']) {
      if (typeof input[key] !== 'string' || !UUID_PATTERN.test(input[key] as string)) invalid();
      input[key] = (input[key] as string).toLowerCase();
    }
    if (!LANDING_EVENT_TYPES.includes(input.type as LandingEventRequest['type'])) invalid();
    const target = input.type === 'click' || input.type === 'impression';
    if (target) {
      if (
        !LANDING_TARGET_KINDS.includes(input.targetKind as NonNullable<LandingEventRequest['targetKind']>) ||
        typeof input.targetId !== 'string' ||
        !(/^[a-z0-9]{10}$/.test(input.targetId) || UUID_PATTERN.test(input.targetId))
      )
        invalid();
      if (UUID_PATTERN.test(input.targetId as string)) input.targetId = (input.targetId as string).toLowerCase();
    } else if (input.targetKind !== undefined || input.targetId !== undefined) invalid();
    if (input.type !== 'engagement' && (input.activeMs !== undefined || input.scrollPercent !== undefined)) invalid();
    const integer = (key: string, min: number, max: number) => {
      const value = input[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max))
        invalid();
    };
    integer('activeMs', 0, LANDING_EVENT_LIMITS.activeMsMax);
    integer('scrollPercent', 0, 100);
    if (input.type === 'engagement' && input.activeMs === undefined && input.scrollPercent === undefined) invalid();
    for (const key of ['viewportWidth', 'viewportHeight', 'screenWidth', 'screenHeight'])
      integer(key, 1, LANDING_EVENT_LIMITS.dimensionMax);
    if (
      input.pixelRatio !== undefined &&
      (typeof input.pixelRatio !== 'number' ||
        !Number.isFinite(input.pixelRatio) ||
        input.pixelRatio < 0.1 ||
        input.pixelRatio > LANDING_EVENT_LIMITS.pixelRatioMax)
    )
      invalid();
    for (const [key, max] of [
      ['language', LANDING_EVENT_LIMITS.languageLength],
      ['timeZone', LANDING_EVENT_LIMITS.timeZoneLength],
    ] as const) {
      if (
        input[key] !== undefined &&
        (typeof input[key] !== 'string' || (input[key] as string).length > max || /\p{Cc}/u.test(input[key] as string))
      )
        invalid();
    }
    if (input.timeZone)
      try {
        new Intl.DateTimeFormat('en', { timeZone: input.timeZone as string });
      } catch {
        invalid();
      }
    if (input.utm !== undefined) {
      const utm = bodyObject(input.utm);
      for (const [key, value] of Object.entries(utm)) {
        if (
          !LANDING_UTM_KEYS.includes(key as keyof LandingUtm) ||
          typeof value !== 'string' ||
          value.length > LANDING_EVENT_LIMITS.utmValueLength ||
          /\p{Cc}/u.test(value)
        )
          invalid();
      }
    }
    return input as unknown as LandingEventRequest;
  }

  private async rate(visitorId: string, sourceIp: string | null): Promise<void> {
    // BFF 소켓·임의 XFF는 방문자 IP가 아닙니다. 서명과 연결한 기존 방문 IP만 제한에 씁니다.
    const buckets: Array<readonly [string, number]> = [[`visitor:${hash(visitorId)}`, 120]];
    if (sourceIp) buckets.push([`source:${hash(sourceIp)}`, 240]);
    if (!(await consumeLimitBuckets(this.database, buckets, 1))) limited();
  }

  private async target(
    client: PoolClient,
    landingId: string,
    event: LandingEventRequest,
    userId: string,
  ): Promise<void> {
    if (!event.targetKind) return;
    const queries = {
      block: 'SELECT 1 FROM landing_blocks WHERE id::text=$2 AND landing_id=$1',
      social: 'SELECT 1 FROM social_links WHERE id::text=$2 AND landing_id=$1',
      portfolio: `SELECT 1 FROM portfolio_items WHERE id::text=$2 AND landing_id=$1 ${event.type === 'click' ? 'AND url IS NOT NULL' : ''}`,
      link: `SELECT 1 FROM links l JOIN landing_blocks b ON b.id=l.block_id WHERE b.landing_id=$1 AND l.public_id=$2 AND ${VISIBLE_LINK_CONDITION}`,
      creator_banner: `SELECT 1 FROM creator_banners WHERE landing_id=$1 AND public_id=$2 AND NOT hidden AND blocked_at IS NULL ${event.type === 'click' ? 'AND url IS NOT NULL' : ''}`,
      ad_banner: `SELECT 1 FROM ad_banners b JOIN users u ON u.id=$3 JOIN platform_settings p ON true
        WHERE b.public_id=$2 AND b.starts_at<=now() AND (b.ends_at IS NULL OR b.ends_at>now())
        AND u.banner_slot_granted_at IS NULL AND u.ad_block_enabled AND p.ad_block_enabled
        AND EXISTS(SELECT 1 FROM landing_blocks WHERE landing_id=$1)
        AND (EXISTS(SELECT 1 FROM portfolio_items WHERE landing_id=$1)
          OR EXISTS(SELECT 1 FROM links l JOIN landing_blocks lb ON lb.id=l.block_id WHERE lb.landing_id=$1 AND ${VISIBLE_LINK_CONDITION}))`,
    };
    const result = await client.query(
      queries[event.targetKind],
      event.targetKind === 'ad_banner' ? [landingId, event.targetId, userId] : [landingId, event.targetId],
    );
    if (!result.rowCount) forbidden();
    if (event.targetKind === 'creator_banner') {
      const owner = await client.query('SELECT 1 FROM users WHERE id=$1 AND banner_slot_granted_at IS NOT NULL', [
        userId,
      ]);
      if (!owner.rowCount) forbidden();
    }
  }

  async record(publicId: string, body: unknown, request: Request): Promise<void> {
    let origin: string;
    try {
      origin = new URL(this.config.webUrl).origin;
    } catch {
      forbidden();
    }
    if (
      request.headers.origin !== origin! ||
      !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')
    )
      forbidden();
    const event = this.input(body);
    const binding = this.passes.verifyTelemetry(publicId, event.token) ?? forbidden();
    const shortSource = (
      await this.database.query<EventRow>(
        `SELECT v.id AS source_visit_id, v.ip, v.country, v.city, v.referrer_host, v.user_agent, v.device_type, v.browser, v.os, v.utm
       ${SOURCE_VISIT_SQL}`,
        [publicId, binding.visitorId, binding.sourceAt],
      )
    ).rows[0];
    await this.rate(binding.visitorId, shortSource?.ip ?? null);
    await this.database.transaction(async (client) => {
      const landing = await client.query<{ id: string; user_id: string; short_link_id: string }>(
        `SELECT l.id,l.user_id,sl.id AS short_link_id FROM landings l JOIN users u ON u.id=l.user_id JOIN short_links sl ON sl.landing_id=l.id
         WHERE l.public_id=$1 AND u.suspended_at IS NULL`,
        [publicId],
      );
      const page = landing.rows[0];
      if (!page) forbidden();
      // 같은 브라우저 세션의 최초 요청도 소유 바인딩 확인과 함께 직렬화합니다.
      await client.query('SELECT pg_advisory_xact_lock(181, hashtext($1))', [event.sessionId]);
      await client.query('SELECT pg_advisory_xact_lock(182, hashtext($1))', [event.pageViewId]);
      const sessionMismatch = await client.query(
        'SELECT 1 FROM landing_events WHERE session_id=$1 AND visitor_id<>$2 LIMIT 1',
        [event.sessionId, binding.visitorId],
      );
      if (sessionMismatch.rowCount) forbidden();
      const anchors = await client.query<EventRow>(
        "SELECT * FROM landing_events WHERE page_view_id=$1 AND kind='page_view' FOR UPDATE",
        [event.pageViewId],
      );
      const anchor = anchors.rows[0];
      if (
        anchor &&
        (anchor.short_link_id !== page.short_link_id ||
          anchor.visitor_id !== binding.visitorId ||
          anchor.session_id !== event.sessionId)
      )
        forbidden();
      const duplicate = await client.query<{ page_view_id: string }>(
        'SELECT page_view_id FROM landing_events WHERE event_id=$1',
        [event.eventId],
      );
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].page_view_id !== event.pageViewId) forbidden();
        return;
      }
      if (!anchor && event.type !== 'page_view') invalid();
      if (anchor && event.type === 'page_view') return;
      await this.target(client, page.id, event, page.user_id);
      const counts = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM landing_events WHERE page_view_id=$1',
        [event.pageViewId],
      );
      if (counts.rows[0].count >= 500) limited();
      const source = anchor ?? shortSource;
      const context = {
        utm: event.utm ?? source?.utm ?? {},
        language: event.language ?? anchor?.language ?? null,
        time_zone: event.timeZone ?? anchor?.time_zone ?? null,
        viewport_width: event.viewportWidth ?? anchor?.viewport_width ?? null,
        viewport_height: event.viewportHeight ?? anchor?.viewport_height ?? null,
        screen_width: event.screenWidth ?? anchor?.screen_width ?? null,
        screen_height: event.screenHeight ?? anchor?.screen_height ?? null,
        pixel_ratio: event.pixelRatio ?? anchor?.pixel_ratio ?? null,
      };
      const inserted = await client.query(
        `INSERT INTO landing_events(event_id,page_view_id,session_id,short_link_id,visitor_id,kind,target_kind,target_id,
          source_visit_id,ip,country,city,referrer_host,user_agent,device_type,browser,os,utm,language,time_zone,
          viewport_width,viewport_height,screen_width,screen_height,pixel_ratio,active_ms,scroll_percent)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
         ON CONFLICT DO NOTHING RETURNING event_id`,
        [
          event.eventId,
          event.pageViewId,
          event.sessionId,
          page.short_link_id,
          binding.visitorId,
          event.type,
          event.targetKind ?? '',
          event.targetId ?? '',
          source?.source_visit_id ?? null,
          source?.ip ?? null,
          source?.country ?? null,
          source?.city ?? null,
          source?.referrer_host ?? null,
          source?.user_agent ?? null,
          source?.device_type ?? null,
          source?.browser ?? null,
          source?.os ?? null,
          context.utm,
          context.language,
          context.time_zone,
          context.viewport_width,
          context.viewport_height,
          context.screen_width,
          context.screen_height,
          context.pixel_ratio,
          event.activeMs ?? 0,
          event.scrollPercent ?? 0,
        ],
      );
      if (!inserted.rowCount) {
        const conflict = await client.query<{ page_view_id: string }>(
          'SELECT page_view_id FROM landing_events WHERE event_id=$1',
          [event.eventId],
        );
        if (conflict.rows[0] && conflict.rows[0].page_view_id !== event.pageViewId) forbidden();
      }
      if (inserted.rowCount && event.type === 'engagement') {
        await client.query(
          "UPDATE landing_events SET active_ms=greatest(active_ms,$2),scroll_percent=greatest(scroll_percent,$3) WHERE page_view_id=$1 AND kind='page_view'",
          [event.pageViewId, event.activeMs ?? 0, event.scrollPercent ?? 0],
        );
      }
    });
  }
}
