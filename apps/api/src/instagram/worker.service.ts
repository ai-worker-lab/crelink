import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AppConfig, type InstagramSettings } from '../config.service';
import { Database } from '../database';
import { countBusinessMetric } from '../monitoring/metrics';
import { InstagramConnectionService } from './connection.service';
import { decryptToken } from './crypto';
import { InstagramGraph } from './graph';
import { classifySendFailure, SEND_ERROR_CODES, type SendErrorCodes } from './worker-outcome';

const TICK_MS = 2_000;
/** 프로세스당 동시 호출 수(두 색 합쳐 최대 10건). */
const MAX_CONCURRENT_SENDS = 5;
/** 호출 타임아웃(`GRAPH_REQUEST_TIMEOUT_MS`, 10초)보다 넉넉해야 정상 호출이 만료되지 않습니다. */
const LEASE_MS = 2 * 60 * 1000;
/** 연결 전 실패의 재시도 간격(초). 길이가 곧 최대 재시도 횟수입니다. */
const RETRY_DELAYS_SECONDS = [30, 2 * 60, 10 * 60, 60 * 60];

/**
 * 선점, 호출 직전 재확인, 재시도 복귀가 같이 쓰는 조건. 별칭 s(설정), c(연결), u(사용자), r(규칙), d(발송)가 있는 쿼리에서만 씁니다.
 * `d.rule_version`이 규칙의 현재 version과 다르면 저장된 문구가 옛 문구이므로, 수신 거부와 함께 여기서 막습니다.
 */
const SENDABLE_SQL = `s.instagram_dm_audience <> 'off'
    AND (s.instagram_dm_audience = 'everyone' OR u.role = 'operator')
    AND c.status = 'active'
    AND (c.token_expires_at IS NULL OR c.token_expires_at > now())
    AND c.dm_paused_at IS NULL
    AND c.operator_paused_at IS NULL
    AND u.suspended_at IS NULL
    AND r.enabled
    AND r.archived_at IS NULL
    AND d.rule_version = r.version
    AND NOT EXISTS (
      SELECT 1 FROM instagram_dm_opt_outs o
      WHERE o.ig_user_id = c.ig_user_id AND o.commenter_hash = d.commenter_hash
    )`;

const WINDOW_EXPIRED_SQL = `c.rate_window_started_at <= now() - interval '1 hour'`;

/**
 * `sending`을 `pending`으로 되돌리기 전에 지금도 보낼 수 있는지 봅니다. `$1`은 발송 행 ID입니다.
 * 정지·비활성화·규칙 수정 트랜잭션은 `sending`을 취소하지 않으므로, 연결·규칙·설정 행을 잠가 그 트랜잭션과 줄을 세웁니다.
 * 잠금 순서는 `lock-order.ts`의 설정 → 연결 → 규칙이고(FOR 절 순서가 곧 잠금 순서입니다), 같은 트랜잭션에서 연결을 갱신할 수 있어 연결은 처음부터 쓰기 잠금입니다.
 */
const RETRY_GATE_CTE = `gate AS (
         SELECT d.id, (${SENDABLE_SQL}) AS sendable
         FROM instagram_dm_deliveries d
         JOIN instagram_connections c ON c.id = d.connection_id
         JOIN users u ON u.id = c.user_id
         JOIN instagram_dm_rules r ON r.id = d.rule_id
         JOIN platform_settings s ON s.id
         WHERE d.id = $1 AND d.status = 'sending'
         FOR SHARE OF s
         FOR NO KEY UPDATE OF c
         FOR SHARE OF r
       )`;

const STOPPED_FAILURE_CODE = 'stopped_before_send';

interface Claim {
  id: string;
  /** 선점 때 쓴 `lease_until`의 원문. 자기 lease인지 확인하는 값이며 마이크로초까지 그대로 비교합니다. */
  lease: string;
}

interface SendState {
  comment_id: string;
  message_body: string;
  connection_id: string;
  ig_user_id: string;
  token_ciphertext: Buffer | null;
  token_key_version: number | null;
  token_revision: number;
  lease_held: boolean;
  sendable: boolean;
}

export interface InstagramWorkerTick {
  claimed: number;
  leaseExpired: number;
  expired: number;
}

const EMPTY_TICK: InstagramWorkerTick = { claimed: 0, leaseExpired: 0, expired: 0 };

/** 예외 내용에는 Graph 원문이나 토큰이 섞일 수 있어 이름만 남깁니다. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

function countDm(result: string, value = 1): void {
  if (value > 0) countBusinessMetric('crelink.instagram.dm', { result }, value);
}

/**
 * 발송 worker. 설계: docs/specs/instagram-comment-dm.md#발송-경로.
 * 빈 슬롯 수만큼만 `sending`으로 선점하고 바로 호출하므로 메모리 대기열이 없습니다. DB 연결을 물고 외부 호출을 하지 않습니다.
 * 결과는 `status='sending'` 조건으로만 쓰고, 결과를 모르는 호출은 다시 보내지 않습니다(중복 DM 0건이 미발송보다 우선).
 */
@Injectable()
export class InstagramWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(InstagramWorkerService.name);
  private readonly inFlight = new Set<Promise<void>>();
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private activeTick?: Promise<InstagramWorkerTick>;
  /** S8 코드표. 코드가 확정되기 전에는 비어 있고, 시험은 가짜 번호를 넣어 전이를 확인합니다. */
  errorCodes: SendErrorCodes = SEND_ERROR_CODES;

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly graph: InstagramGraph,
    private readonly connections: InstagramConnectionService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.instagram) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((error: unknown) =>
        this.logger.error(`발송 tick 실패: ${error instanceof Error ? error.message : String(error)}`),
      );
    }, TICK_MS);
    this.timer.unref();
  }

  /** 선점을 멈추고 진행 중인 tick과 호출을 기다립니다. Database는 이 뒤에 닫힙니다(최악 10초, 종료 유예 30초 안). */
  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.activeTick?.catch(() => undefined);
    await this.drain();
  }

  /** 진행 중인 호출이 모두 끝날 때까지 기다립니다. */
  async drain(): Promise<void> {
    await Promise.all(this.inFlight);
  }

  /**
   * 한 번 실행합니다. 호출을 시작만 하고 끝을 기다리지 않으므로 다음 tick이 빈 슬롯을 채웁니다(끝을 기다리려면 `drain`).
   * tick이 겹치면 슬롯을 두 번 세게 되므로 앞 tick이 끝날 때까지 새 선점을 하지 않습니다.
   */
  async runOnce(): Promise<InstagramWorkerTick> {
    const settings = this.config.instagram;
    if (!settings || this.stopping || this.activeTick) return EMPTY_TICK;
    const tick = this.tick(settings);
    this.activeTick = tick;
    try {
      return await tick;
    } finally {
      this.activeTick = undefined;
    }
  }

  private async tick(settings: InstagramSettings): Promise<InstagramWorkerTick> {
    const swept = await this.sweep();
    const slots = MAX_CONCURRENT_SENDS - this.inFlight.size;
    if (this.stopping || slots <= 0) return { claimed: 0, ...swept };
    const claims = await this.claim(slots, settings.dmHourlyLimit);
    for (const claim of claims) this.startSend(claim, settings);
    return { claimed: claims.length, ...swept };
  }

  /**
   * lease가 끝난 `sending`은 호출 여부를 모르므로 `unknown`, 24시간 지난 `pending`은 `expired`, 규칙 version이 달라진 `pending`은 `cancelled`로 끝냅니다.
   * 일괄 변경이지만 연결 행을 잡지 않으므로 `SKIP LOCKED`로 기다리지 않고, 다음 tick에 나머지를 처리합니다(`lock-order.ts`).
   */
  private async sweep(): Promise<Pick<InstagramWorkerTick, 'leaseExpired' | 'expired'>> {
    const { rows } = await this.database.query<{ lease_expired: number; expired: number; stale_version: number }>(
      `WITH lease AS (
         UPDATE instagram_dm_deliveries SET status = 'unknown', failure_code = 'lease_expired', lease_until = NULL
         WHERE id IN (
           SELECT id FROM instagram_dm_deliveries WHERE status = 'sending' AND lease_until < now() FOR UPDATE SKIP LOCKED
         )
         RETURNING 1
       ), stale AS (
         UPDATE instagram_dm_deliveries SET status = 'expired'
         WHERE id IN (
           SELECT id FROM instagram_dm_deliveries
           WHERE status = 'pending' AND commented_at <= now() - interval '24 hours' FOR UPDATE SKIP LOCKED
         )
         RETURNING 1
       ), version_changed AS (
         UPDATE instagram_dm_deliveries SET status = 'cancelled', failure_code = $1
         WHERE id IN (
           SELECT d.id FROM instagram_dm_deliveries d JOIN instagram_dm_rules r ON r.id = d.rule_id
           WHERE d.status = 'pending' AND d.commented_at > now() - interval '24 hours' AND d.rule_version <> r.version
           FOR UPDATE OF d SKIP LOCKED
         )
         RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM lease) AS lease_expired, (SELECT count(*)::int FROM stale) AS expired,
              (SELECT count(*)::int FROM version_changed) AS stale_version`,
      [STOPPED_FAILURE_CODE],
    );
    countDm('lease_expired', rows[0].lease_expired);
    countDm('expired', rows[0].expired);
    countDm('cancelled', rows[0].stale_version);
    return { leaseExpired: rows[0].lease_expired, expired: rows[0].expired };
  }

  /**
   * 한 문장(한 트랜잭션)으로 빈 슬롯 수만큼 선점하고 시간당 예산을 씁니다. 연결 행도 잠가 두 프로세스가 예산을 겹쳐 쓰지 못하게 합니다.
   * 잠금은 연결 → 발송 순서이고(`lock-order.ts`), 둘 다 `SKIP LOCKED`라 기다리지 않습니다.
   * 예산은 호출 시도 수를 넘기지 않기 위한 상한이라 선점 때 쓰고 돌려주지 않습니다.
   */
  private async claim(slots: number, hourlyLimit: number): Promise<Claim[]> {
    const { rows } = await this.database.query<Claim>(
      `WITH locked AS (
         SELECT d.id, d.connection_id, d.next_attempt_at,
                CASE WHEN ${WINDOW_EXPIRED_SQL} THEN $2::int ELSE $2::int - c.rate_window_count END AS budget
         FROM instagram_dm_deliveries d
         JOIN instagram_connections c ON c.id = d.connection_id
         JOIN users u ON u.id = c.user_id
         JOIN instagram_dm_rules r ON r.id = d.rule_id
         JOIN platform_settings s ON s.id
         WHERE d.status = 'pending'
           AND d.next_attempt_at <= now()
           AND d.commented_at > now() - interval '24 hours'
           AND ${SENDABLE_SQL}
           AND (c.rate_limited_until IS NULL OR c.rate_limited_until <= now())
           AND (${WINDOW_EXPIRED_SQL} OR c.rate_window_count < $2::int)
         ORDER BY d.next_attempt_at, d.id
         LIMIT $1
         FOR NO KEY UPDATE OF c SKIP LOCKED
         FOR UPDATE OF d SKIP LOCKED
       ), ranked AS (
         SELECT locked.*, row_number() OVER (PARTITION BY connection_id ORDER BY next_attempt_at, id) AS position
         FROM locked
       ), claimed AS (
         UPDATE instagram_dm_deliveries d
         SET status = 'sending', lease_until = now() + ($3::int * interval '1 millisecond')
         FROM ranked
         WHERE d.id = ranked.id AND ranked.position <= ranked.budget
         RETURNING d.id, d.connection_id, d.lease_until
       ), spent AS (
         UPDATE instagram_connections c
         SET rate_window_count = CASE WHEN ${WINDOW_EXPIRED_SQL} THEN n.count ELSE c.rate_window_count + n.count END,
             rate_window_started_at = CASE WHEN ${WINDOW_EXPIRED_SQL} THEN now() ELSE c.rate_window_started_at END
         FROM (SELECT connection_id, count(*)::int AS count FROM claimed GROUP BY connection_id) n
         WHERE c.id = n.connection_id
       )
       SELECT id, lease_until::text AS lease FROM claimed`,
      [slots, hourlyLimit, LEASE_MS],
    );
    return rows;
  }

  private startSend(claim: Claim, settings: InstagramSettings): void {
    const task: Promise<void> = this.send(claim, settings)
      .catch((error: unknown) => this.logger.error(`발송 처리 실패: ${errorName(error)}`))
      .finally(() => this.inFlight.delete(task));
    this.inFlight.add(task);
  }

  private async send(claim: Claim, settings: InstagramSettings): Promise<void> {
    const state = await this.readSendState(claim);
    // lease를 잃은 행은 더 이상 이 프로세스의 것이 아니므로 아무것도 쓰지 않습니다(만료 처리가 `unknown`으로 끝냅니다).
    if (!state?.lease_held) return;
    if (!state.sendable) {
      await this.finish(claim.id, 'cancelled', STOPPED_FAILURE_CODE);
      countDm('cancelled');
      return;
    }
    let accessToken: string;
    try {
      accessToken = decryptToken(
        settings.tokenKeyring,
        state.connection_id,
        state.token_ciphertext!,
        state.token_key_version!,
      );
    } catch (error) {
      this.logger.error(`연결 ${state.connection_id}의 토큰을 읽지 못했습니다: ${errorName(error)}`);
      await this.finish(claim.id, 'failed', 'token_unreadable');
      countDm('token_unreadable');
      return;
    }
    try {
      await this.graph.sendPrivateReply(accessToken, state.ig_user_id, state.comment_id, state.message_body);
    } catch (error) {
      await this.recordFailure(claim.id, state, error);
      return;
    }
    await this.finish(claim.id, 'sent', null);
    countDm('sent');
  }

  /** 호출 직전 재확인. 토큰·본문도 이 시점의 값을 읽어 정지·토큰 교체를 최대한 늦게 반영합니다. */
  private async readSendState(claim: Claim): Promise<SendState | undefined> {
    const { rows } = await this.database.query<SendState>(
      `SELECT d.comment_id, d.message_body, c.id AS connection_id, c.ig_user_id,
              c.token_ciphertext, c.token_key_version, c.token_revision,
              (d.status = 'sending' AND d.lease_until = $2::timestamptz AND d.lease_until > now()) AS lease_held,
              (${SENDABLE_SQL}) AS sendable
       FROM instagram_dm_deliveries d
       JOIN instagram_connections c ON c.id = d.connection_id
       JOIN users u ON u.id = c.user_id
       JOIN instagram_dm_rules r ON r.id = d.rule_id
       JOIN platform_settings s ON s.id
       WHERE d.id = $1`,
      [claim.id, claim.lease],
    );
    return rows[0];
  }

  private async finish(id: string, status: string, failureCode: string | null): Promise<void> {
    await this.database.query(
      `UPDATE instagram_dm_deliveries
       SET status = $2, failure_code = $3, lease_until = NULL,
           sent_at = CASE WHEN $2::text = 'sent' THEN now() ELSE sent_at END
       WHERE id = $1 AND status = 'sending'`,
      [id, status, failureCode],
    );
  }

  private async recordFailure(id: string, state: SendState, error: unknown): Promise<void> {
    const failure = classifySendFailure(error, this.errorCodes);
    countDm(failure.kind);
    switch (failure.kind) {
      case 'retry':
        await this.scheduleRetry(id);
        return;
      case 'unknown':
        await this.finish(id, 'unknown', 'indeterminate');
        return;
      case 'rate_limited':
        await this.waitForRateLimit(id, state.connection_id, failure.waitSeconds);
        return;
      case 'token_invalid':
        await this.finish(id, 'failed', 'token_invalid');
        await this.requireReauth(state);
        return;
      case 'messages_access':
        await this.disableMessagesAccess(id, state);
        return;
      case 'policy_restricted':
        await this.pauseForPolicy(id, state.connection_id);
        return;
      case 'rejected':
        await this.finish(id, 'failed', 'rejected');
        return;
    }
  }

  /** 연결 전 실패만 재시도합니다. 횟수를 다 쓰면 `failed`이고, 그 사이 정지됐으면 `pending`으로 되돌리지 않고 `cancelled`입니다. */
  private async scheduleRetry(id: string): Promise<void> {
    await this.database.query(
      `WITH ${RETRY_GATE_CTE}
       UPDATE instagram_dm_deliveries d
       SET status = CASE WHEN NOT gate.sendable THEN 'cancelled'
                         WHEN d.attempts >= cardinality($2::int[]) THEN 'failed'
                         ELSE 'pending' END,
           failure_code = CASE WHEN gate.sendable THEN 'connect_failed' ELSE $3 END,
           next_attempt_at = CASE WHEN d.attempts >= cardinality($2::int[]) THEN d.next_attempt_at
                                  ELSE now() + (($2::int[])[d.attempts + 1] * interval '1 second') END,
           attempts = d.attempts + 1,
           lease_until = NULL
       FROM gate
       WHERE d.id = gate.id AND d.status = 'sending'`,
      [id, RETRY_DELAYS_SECONDS, STOPPED_FAILURE_CODE],
    );
  }

  /**
   * 연결 전체를 쉬게 하고 이 건은 시도 횟수를 쓰지 않고 되돌립니다. 그 사이 정지됐으면 되돌리지 않고 `cancelled`입니다.
   * 한 문장으로 합치면 연결 갱신이 먼저 실행돼 gate 잠금이 그 행을 건너뛰므로 두 문장으로 나눕니다.
   */
  private async waitForRateLimit(id: string, connectionId: string, waitSeconds: number): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `WITH ${RETRY_GATE_CTE}
         UPDATE instagram_dm_deliveries d
         SET status = CASE WHEN gate.sendable THEN 'pending' ELSE 'cancelled' END,
             failure_code = CASE WHEN gate.sendable THEN d.failure_code ELSE $3 END,
             lease_until = NULL,
             next_attempt_at = now() + ($2::double precision * interval '1 second')
         FROM gate
         WHERE d.id = gate.id AND d.status = 'sending'`,
        [id, waitSeconds, STOPPED_FAILURE_CODE],
      );
      await client.query(
        `UPDATE instagram_connections
         SET rate_limited_until = GREATEST(rate_limited_until, now() + ($2::double precision * interval '1 second')),
             updated_at = now()
         WHERE id = $1`,
        [connectionId, waitSeconds],
      );
    });
    this.logger.warn(`연결 ${connectionId}이 Graph 레이트 제한에 걸려 ${waitSeconds}초 쉽니다.`);
  }

  /** 전이 실패로 발송 결과 기록이 되돌아가면 안 되므로 예외를 삼키고, 다음 무효 응답이나 일일 점검이 다시 시도하게 둡니다. */
  private async requireReauth(state: SendState): Promise<void> {
    try {
      const applied = await this.connections.markReauthRequired(state.connection_id, state.token_revision);
      if (applied) this.logger.warn(`연결 ${state.connection_id}의 토큰이 무효라 재인증이 필요합니다.`);
    } catch (error) {
      this.logger.error(`연결 ${state.connection_id}의 재인증 전이 실패: ${errorName(error)}`);
    }
  }

  /** 토큰은 유지합니다. 호출 중 토큰이 바뀌었으면 옛 토큰의 결과이므로 연결은 건드리지 않습니다. 바깥 문장이 `changed`를 참조해 연결 행을 먼저 잠급니다(`lock-order.ts`). */
  private async disableMessagesAccess(id: string, state: SendState): Promise<void> {
    await this.database.query(
      `WITH finished AS (
         UPDATE instagram_dm_deliveries
         SET status = 'failed', failure_code = 'messages_access_required', lease_until = NULL
         WHERE id = $1 AND status = 'sending'
       ), changed AS (
         UPDATE instagram_connections SET status = 'messages_access_required', updated_at = now()
         WHERE id = $2 AND status = 'active' AND token_revision = $3
         RETURNING id
       )
       UPDATE instagram_dm_deliveries
       SET status = 'cancelled', failure_code = 'messages_access_required'
       WHERE status = 'pending' AND connection_id IN (SELECT id FROM changed)`,
      [id, state.connection_id, state.token_revision],
    );
  }

  /**
   * 운영자 정지와 같은 효과입니다. 크리에이터가 스스로 풀 수 없어야 하므로 `operator_paused_at`을 씁니다.
   * 바깥 문장이 `paused`를 참조해야 연결 행을 먼저 잠급니다(`lock-order.ts`). `finished`는 바깥 문장 뒤에 실행됩니다.
   */
  private async pauseForPolicy(id: string, connectionId: string): Promise<void> {
    await this.database.query(
      `WITH finished AS (
         UPDATE instagram_dm_deliveries
         SET status = 'failed', failure_code = 'policy_restricted', lease_until = NULL
         WHERE id = $1 AND status = 'sending'
       ), paused AS (
         UPDATE instagram_connections SET operator_paused_at = COALESCE(operator_paused_at, now()), updated_at = now()
         WHERE id = $2
         RETURNING id
       )
       UPDATE instagram_dm_deliveries
       SET status = 'cancelled', failure_code = 'policy_restricted'
       WHERE status = 'pending' AND connection_id IN (SELECT id FROM paused)`,
      [id, connectionId],
    );
    this.logger.warn(`연결 ${connectionId}을 정책 제재 응답으로 자동 정지했습니다.`);
    Sentry.captureMessage('Instagram DM 정책 제재로 계정을 자동 정지했습니다.', {
      level: 'warning',
      extra: { connectionId },
    });
  }
}
