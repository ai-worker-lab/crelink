import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { ApiError } from '@crelink/shared';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { apiError } from '../common/http';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { clientIp } from '../short-link/tracking.service';
import { OptOutTokenPayload, verifyOptOutToken } from './crypto';

/** `crypto.ts` 형식의 최대 길이(`ig_user_id` 255바이트일 때 406자)보다 넉넉한 입력 상한. */
const TOKEN_MAX_LENGTH = 512;
const PERSON_LIMIT_PER_MINUTE = 10;
/** 공개 쓰기 경로(`telemetry/landing-events.service.ts`)의 IP 한도와 같은 값. */
const SOURCE_LIMIT_PER_MINUTE = 240;

// `landing_event_limits`는 보존 작업이 15분 지난 행을 지웁니다.
const COUNT_REQUEST = `
  INSERT INTO landing_event_limits(bucket,used) VALUES($1,1)
  ON CONFLICT(bucket) DO UPDATE SET
    used = CASE WHEN landing_event_limits.window_start < now() - interval '1 minute' THEN 1 ELSE landing_event_limits.used + 1 END,
    window_start = CASE WHEN landing_event_limits.window_start < now() - interval '1 minute' THEN now() ELSE landing_event_limits.window_start END
  RETURNING used`;

// 같은 IG 계정의 연결이 재인증 대기 행과 함께 여러 개일 수 있어 `ig_user_id`로 묶습니다. 응답은 대상 연결 유무와 관계없이 같습니다.
const CANCEL_PENDING = `
  UPDATE instagram_dm_deliveries d SET status = 'cancelled'
  FROM instagram_connections c
  WHERE c.id = d.connection_id AND c.ig_user_id = $1 AND d.commenter_hash = $2 AND d.status = 'pending'`;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function tokenOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { token } = body as { token?: unknown };
  return typeof token === 'string' && token.length <= TOKEN_MAX_LENGTH ? token : null;
}

/** 수신 거부 기록과 대기 건 취소. 토큰·요청 본문·작성자 해시는 로그와 오류에 넣지 않습니다. */
@Injectable()
export class InstagramOptOutService {
  private readonly logger = new Logger(InstagramOptOutService.name);

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
  ) {}

  async optOut(body: unknown, request: Request): Promise<void> {
    const settings = this.config.instagram;
    if (!settings) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'instagram_not_configured',
        'Instagram 연동이 설정되지 않았습니다.',
      );
    }
    const token = tokenOf(body);
    const person = token === null ? null : verifyOptOutToken(settings.optOutKey, token);
    if (!person) {
      throw apiError(HttpStatus.BAD_REQUEST, 'opt_out_invalid', '수신 거부 링크가 올바르지 않습니다.');
    }

    let allowed = false;
    try {
      // 소켓 주소는 넘기지 않습니다. BFF를 거친 요청의 소켓은 웹 서버 주소라 모든 방문자가 한 버킷에 묶입니다.
      allowed = await this.withinLimit(
        person,
        clientIp(undefined, request.headers['x-forwarded-for'], this.config.trustedProxyHops),
      );
      if (allowed) await this.record(person);
    } catch (error) {
      this.databaseFailure(error);
    }
    if (!allowed) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'telemetry_rate_limited',
        '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  /**
   * `landing-events`처럼 서명으로 확인한 대상을 기본 키로 쓰고, 서명이 맞는 요청만 한도를 씁니다.
   * IP 한도는 신뢰 프록시가 넘긴 방문자 IP가 있을 때만 적용합니다. 사람별 한도를 넘은 요청은 IP 한도를 쓰지 않습니다.
   */
  private async withinLimit(person: OptOutTokenPayload, ip: string | null): Promise<boolean> {
    const buckets: Array<readonly [string, number]> = [
      [
        `instagram-opt-out:person:${sha256(`${person.igUserId}:${person.commenterHash.toString('hex')}`)}`,
        PERSON_LIMIT_PER_MINUTE,
      ],
    ];
    if (ip) buckets.push([`instagram-opt-out:source:${sha256(ip)}`, SOURCE_LIMIT_PER_MINUTE]);
    for (const [bucket, max] of buckets) {
      const result = await this.database.query<{ used: number }>(COUNT_REQUEST, [bucket]);
      if (result.rows[0].used > max) return false;
    }
    return true;
  }

  /** 다시 불러도 결과가 같습니다. 재요청도 취소를 다시 실행해 웹훅과 경합해 남은 `pending`을 닫습니다. */
  private async record(person: OptOutTokenPayload): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        'INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [person.igUserId, person.commenterHash],
      );
      await client.query(CANCEL_PENDING, [person.igUserId, person.commenterHash]);
    });
  }

  /** PG 오류 문구에 값이 들어갈 수 있어 SQLSTATE만 남기고 503으로 바꿉니다. */
  private databaseFailure(error: unknown): never {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    this.logger.error(`Instagram 수신 거부 DB 처리 실패(SQLSTATE ${typeof code === 'string' ? code : '없음'})`);
    const body: ApiError = { code: 'database_unavailable', message: '데이터베이스에 연결할 수 없습니다.' };
    throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
