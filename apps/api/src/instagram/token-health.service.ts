import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { InstagramConnectionService } from './connection.service';
import { decryptToken, encryptToken, TokenKeyring } from './crypto';
import { InstagramGraph, InstagramGraphError } from './graph';

const HOUR_MS = 60 * 60 * 1000;
/** 한 tick의 상한. 호출은 순서대로 하므로 최악(건당 10초)에도 tick 한 번(1시간) 안에 끝납니다. */
export const TOKEN_HEALTH_BATCH_SIZE = 100;

interface DueConnection {
  id: string;
  ig_user_id: string;
  token_ciphertext: Buffer;
  token_key_version: number;
  token_revision: number;
  expired: boolean;
}

export interface TokenHealthResult {
  checked: number;
  invalidated: number;
  reencrypted: number;
  failed: number;
}

/**
 * 일일 토큰 점검과 재암호화. 1시간 tick에서 `token_checked_at`이 24시간 지난 연결을 최대 100개 처리합니다.
 * 근거: docs/specs/instagram-comment-dm.md (`일일 점검`, `토큰 세대`). 외부 호출 중에는 DB 잠금을 잡지 않고,
 * 결과는 읽은 `token_revision`이 그대로일 때만 적용합니다. 설정이 없으면 시작하지 않습니다.
 */
@Injectable()
export class InstagramTokenHealthService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(InstagramTokenHealthService.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<unknown> | null = null;
  private stopping = false;

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly graph: InstagramGraph,
    private readonly connections: InstagramConnectionService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.instagram) return;
    const tick = () => {
      if (this.running) return;
      this.running = this.runOnce()
        .catch((error: unknown) =>
          this.logger.error(`토큰 점검 실패: ${error instanceof Error ? error.message : String(error)}`),
        )
        .finally(() => {
          this.running = null;
        });
    };
    tick();
    this.timer = setInterval(tick, HOUR_MS);
    this.timer.unref();
  }

  /** 새 호출을 멈추고 진행 중인 호출을 기다립니다. Database는 맨 뒤에 닫힙니다. */
  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }

  /** 한 번 실행합니다. 대상은 한 UPDATE로 선점해 두 색이 동시에 돌아도 같은 행을 처리하지 않습니다. */
  async runOnce(): Promise<TokenHealthResult> {
    const result: TokenHealthResult = { checked: 0, invalidated: 0, reencrypted: 0, failed: 0 };
    const settings = this.config.instagram;
    if (!settings) return result;
    const due = await this.database.query<DueConnection>(
      `UPDATE instagram_connections SET token_checked_at = now()
       WHERE id IN (
         SELECT id FROM instagram_connections
         WHERE status <> 'reauth_required' AND token_checked_at <= now() - interval '24 hours'
         ORDER BY token_checked_at LIMIT $1 FOR UPDATE SKIP LOCKED
       )
       RETURNING id, ig_user_id, token_ciphertext, token_key_version, token_revision,
                 (token_expires_at IS NOT NULL AND token_expires_at <= now()) AS expired`,
      [TOKEN_HEALTH_BATCH_SIZE],
    );
    for (const row of due.rows) {
      if (this.stopping) break;
      result.checked += 1;
      try {
        await this.inspect(row, settings.tokenKeyring, result);
      } catch (error) {
        result.failed += 1;
        this.logger.error(`토큰 점검 실패: ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  }

  private async inspect(row: DueConnection, keyring: TokenKeyring, result: TokenHealthResult): Promise<void> {
    if (row.expired) {
      if (await this.connections.markReauthRequired(row.id, row.token_revision)) result.invalidated += 1;
      return;
    }
    let accessToken: string;
    try {
      accessToken = decryptToken(keyring, row.id, row.token_ciphertext, row.token_key_version);
    } catch {
      // 키 설정 실수로 모든 연결의 토큰을 파기하면 안 되므로 무효로 보지 않습니다. 다음 점검까지 그대로 둡니다.
      result.failed += 1;
      this.logger.error(`Instagram 토큰을 복호화하지 못했습니다: ${row.id}`);
      return;
    }
    let verdict: 'valid' | 'invalid' | 'unknown';
    try {
      verdict = await this.graph.checkToken(accessToken, row.ig_user_id);
    } catch (error) {
      // 무효로 판정되지 않았습니다. 다음 날 다시 봅니다. Graph 경계가 이미 허용된 코드만 로그에 남겼습니다.
      if (!(error instanceof InstagramGraphError)) throw error;
      result.failed += 1;
      verdict = 'unknown';
    }
    if (verdict === 'invalid') {
      if (await this.connections.markReauthRequired(row.id, row.token_revision)) result.invalidated += 1;
      return;
    }
    // 키 회전은 Graph 상태와 무관합니다. 같은 토큰을 다시 암호화하므로 revision은 올리지 않습니다.
    if (row.token_key_version !== keyring.current) {
      const encrypted = encryptToken(keyring, row.id, accessToken);
      const updated = await this.database.query(
        `UPDATE instagram_connections SET token_ciphertext = $1, token_key_version = $2, updated_at = now()
         WHERE id = $3 AND token_revision = $4 AND status <> 'reauth_required'`,
        [encrypted.ciphertext, encrypted.keyVersion, row.id, row.token_revision],
      );
      if (updated.rowCount === 1) result.reencrypted += 1;
    }
  }
}
