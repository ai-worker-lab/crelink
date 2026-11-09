import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  EMPTY_SIGNUP_FUNNEL_CONTEXT,
  SIGNUP_FUNNEL_CLIENT_STEPS,
  SIGNUP_FUNNEL_LIMITS,
  signupContextOf,
  type SignupFunnelClientStep,
  type SignupFunnelContext,
  type SignupFunnelStep,
  type SignupInAppKind,
} from '@crelink/shared';
import type { Request } from 'express';
import { hashToken } from '../auth/token-hash';
import { apiError } from '../common/http';
import { bodyObject } from '../common/input';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { STATS_TIME_ZONE } from '../retention/retention.service';

const EVENT_KEYS = new Set(['step', 'source', 'medium', 'campaign', 'referrerHost', 'inAppKind']);
const RATE_BUCKET = 'signup-funnel:global';

/**
 * 가입 경로 일별 합계(0231). 계측 실패가 로그인·링크 저장을 막지 않도록 서버 단계는 오류를 로그로만 남깁니다.
 * 계정·세션·방문자와 잇지 않습니다. 그래서 `first_link`에는 유입값이 없습니다(apps/api/docs/README.md `가입 경로 계측`).
 */
@Injectable()
export class SignupFunnelService {
  private readonly logger = new Logger(SignupFunnelService.name);

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
  ) {}

  /** 브라우저 보고(홈 방문·가입 버튼). 같은 출처 BFF만 받습니다. */
  async recordClientEvent(body: unknown, request: Request): Promise<void> {
    let origin: string | null = null;
    try {
      origin = new URL(this.config.webUrl).origin;
    } catch {
      // 아래에서 거부합니다.
    }
    if (
      !origin ||
      request.headers.origin !== origin ||
      !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')
    ) {
      throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '허용되지 않은 가입 경로 이벤트입니다.');
    }
    const { step, context } = this.parseClientEvent(body);
    await this.assertWithinRate();
    await this.increment(step, context);
  }

  private parseClientEvent(body: unknown): { step: SignupFunnelClientStep; context: SignupFunnelContext } {
    const input = bodyObject(body);
    if (
      Buffer.byteLength(JSON.stringify(input)) > SIGNUP_FUNNEL_LIMITS.bodyBytes ||
      Object.keys(input).some((key) => !EVENT_KEYS.has(key)) ||
      !SIGNUP_FUNNEL_CLIENT_STEPS.includes(input.step as SignupFunnelClientStep)
    ) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '가입 경로 이벤트 형식을 확인해 주세요.');
    }
    return { step: input.step as SignupFunnelClientStep, context: signupContextOf(input) };
  }

  /** 식별값 없이 전체 합계로만 제한합니다. 넘어도 가입 동선은 영향받지 않습니다(브라우저가 응답을 쓰지 않음). */
  private async assertWithinRate(): Promise<void> {
    const result = await this.database.query<{ used: number }>(
      `INSERT INTO landing_event_limits(bucket,used) VALUES($1,1)
       ON CONFLICT(bucket) DO UPDATE SET used = CASE WHEN landing_event_limits.window_start < now() - interval '1 minute' THEN 1 ELSE landing_event_limits.used + 1 END,
       window_start = CASE WHEN landing_event_limits.window_start < now() - interval '1 minute' THEN now() ELSE landing_event_limits.window_start END RETURNING used`,
      [RATE_BUCKET],
    );
    if (result.rows[0].used > SIGNUP_FUNNEL_LIMITS.eventsPerMinute) {
      throw new HttpException({ code: 'telemetry_rate_limited', message: '가입 경로 이벤트 요청이 많습니다.' }, 429);
    }
  }

  private async increment(step: SignupFunnelStep, context: SignupFunnelContext): Promise<void> {
    await this.database.query(
      `WITH today AS (SELECT (now() AT TIME ZONE $1)::date AS day),
            load AS (SELECT count(*) >= $8::int AS capped FROM signup_funnel_daily f, today WHERE f.day = today.day)
       INSERT INTO signup_funnel_daily (day, step, source, medium, campaign, referrer_host, in_app_kind, events)
       SELECT today.day, $2::text,
              CASE WHEN load.capped THEN 'other' ELSE $3::text END,
              CASE WHEN load.capped THEN '' ELSE $4::text END,
              CASE WHEN load.capped THEN '' ELSE $5::text END,
              CASE WHEN load.capped THEN '' ELSE $6::text END,
              $7::text, 1
       FROM today, load
       ON CONFLICT (day, step, source, medium, campaign, referrer_host, in_app_kind)
       DO UPDATE SET events = signup_funnel_daily.events + 1`,
      [
        STATS_TIME_ZONE,
        step,
        context.source,
        context.medium,
        context.campaign,
        context.referrerHost,
        context.inAppKind,
        SIGNUP_FUNNEL_LIMITS.dailyRowsMax,
      ],
    );
  }

  /** 서버가 세는 단계. 실패해도 호출한 쪽의 흐름을 막지 않습니다. */
  async count(step: SignupFunnelStep, context: SignupFunnelContext): Promise<void> {
    try {
      await this.increment(step, context);
    } catch (error) {
      this.warn(step, error);
    }
  }

  /** OAuth 시작: 유입값을 state 해시에 묶어 두고 단계를 셉니다. 값을 state나 주소에 싣지 않으려는 저장입니다. */
  async oauthStarted(state: string, context: SignupFunnelContext): Promise<void> {
    try {
      await this.database.query(
        "DELETE FROM signup_funnel_oauth_contexts WHERE created_at < now() - interval '15 minutes'",
      );
      await this.database.query(
        `INSERT INTO signup_funnel_oauth_contexts (state_hash, source, medium, campaign, referrer_host, in_app_kind)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (state_hash) DO NOTHING`,
        [hashToken(state), context.source, context.medium, context.campaign, context.referrerHost, context.inAppKind],
      );
      await this.increment('oauth_start', context);
    } catch (error) {
      this.warn('oauth_start', error);
    }
  }

  /** 콜백 도달: state가 쿠키와 일치한 뒤에만 부릅니다. 묶어 둔 유입값을 꺼내 지우고 돌려줍니다. */
  async oauthCallback(state: string): Promise<SignupFunnelContext> {
    let context: SignupFunnelContext = { ...EMPTY_SIGNUP_FUNNEL_CONTEXT };
    try {
      const row = await this.database.query<{
        source: string;
        medium: string;
        campaign: string;
        referrer_host: string;
        in_app_kind: SignupInAppKind;
      }>(
        `DELETE FROM signup_funnel_oauth_contexts WHERE state_hash = $1
         RETURNING source, medium, campaign, referrer_host, in_app_kind`,
        [hashToken(state)],
      );
      const found = row.rows[0];
      if (found) {
        context = {
          source: found.source,
          medium: found.medium,
          campaign: found.campaign,
          referrerHost: found.referrer_host,
          inAppKind: found.in_app_kind,
        };
      }
      await this.increment('oauth_callback', context);
    } catch (error) {
      this.warn('oauth_callback', error);
    }
    return context;
  }

  /** 사람 계정의 첫 링크만 셉니다. 지표 제외 계정과 AI 운영자는 뺍니다. */
  async firstLink(userId: string, inAppKind: SignupInAppKind): Promise<void> {
    try {
      const user = await this.database.query(
        "SELECT 1 FROM users WHERE id = $1 AND kind = 'human' AND metrics_excluded_at IS NULL",
        [userId],
      );
      if (user.rowCount) await this.increment('first_link', { ...EMPTY_SIGNUP_FUNNEL_CONTEXT, inAppKind });
    } catch (error) {
      this.warn('first_link', error);
    }
  }

  private warn(step: SignupFunnelStep, error: unknown): void {
    this.logger.warn(`가입 경로 기록 실패(${step}): ${error instanceof Error ? error.message : String(error)}`);
  }
}
