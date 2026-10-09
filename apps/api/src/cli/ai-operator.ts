/**
 * AI 운영자 계정·토큰 CLI(설계 `CLI(토큰 발급)`). 빌드 `dist/cli/ai-operator.js`, 실행 `node dist/cli/ai-operator.js <명령>`.
 * DB 연결 1개(`max: 1`)만 쓰고 AppConfig·Sentry 초기화·Nest 앱·migration은 부르지 않습니다. 표준 출력에는 결과만(토큰은 원문 한 줄),
 * 진단은 표준 오류로 내고 실패는 종료 코드 1입니다. 사용법: apps/api/docs/README.md#ai-운영자-토큰-cli
 */
import { AI_OPERATOR_LIMITS } from '@crelink/shared';
import { DatabaseError, Pool } from 'pg';
import { resolve } from 'node:path';
import { SYSTEM_ACTOR } from '../ai-operator/audit';
import { API_TOKEN_COLUMNS, ApiTokenRow, issueApiToken, revokeApiToken } from '../ai-operator/tokens';
import { provisionAccount } from '../auth/provision';
import { UUID_PATTERN } from '../common/http';
import { databaseConnectionConfig, isUniqueViolation, Queryable, withTransaction } from '../database';
import { loadLocalEnvironment } from '../local-env';

/** 예약 최상위 도메인(`.invalid`)이라 실제로 메일이 가지 않습니다. */
export const DEFAULT_AI_EMAIL = 'ai-operator@crelink.invalid';

const USAGE = `사용법: ai-operator <명령> [옵션]
  ensure-account [--email <이메일>]                 AI 계정(없을 때만)을 만들고 userId 출력
  issue-token --label <이름> [--email <이메일>]     토큰을 만들어 원문 한 줄 출력(계정이 없으면 만듦)
  list-tokens [--email <이메일>]                    토큰 목록(id, label, prefix, 생성, 마지막 사용, 폐기) 탭 구분
  revoke-token <토큰 id>                            토큰 폐기(멱등)
기본 이메일: ${DEFAULT_AI_EMAIL}`;

/** 사용자에게 보여 줄 실패(종료 코드 1). 메시지에 DATABASE_URL·토큰을 넣지 않습니다. */
export class CliError extends Error {}

export interface CliOutput {
  /** 결과 한 줄(표준 출력). */
  out(line: string): void;
  /** 진단 한 줄(표준 오류). */
  err(line: string): void;
}

function normalizeEmail(value: string | undefined): string {
  const email = (value ?? DEFAULT_AI_EMAIL).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new CliError(`이메일 형식이 아닙니다: ${email}`);
  return email;
}

/** 이 이메일의 AI 계정 id. 없으면 null, 같은 이메일의 사람 계정이 있으면 바꾸지 않고 실패합니다. */
async function findAiAccount(client: Queryable, email: string): Promise<string | null> {
  const users = await client.query<{ id: string; kind: string }>('SELECT id, kind FROM users WHERE lower(email) = $1', [
    email,
  ]);
  const ai = users.rows.find((row) => row.kind === 'ai');
  if (ai) return ai.id;
  if (users.rowCount) {
    throw new CliError(`${email}은(는) 사람 계정이 쓰는 이메일입니다. 다른 --email을 지정하세요.`);
  }
  return null;
}

/** AI 계정(`kind='ai'`, `role='operator'`)과 랜딩·단축 주소를 없을 때만 만듭니다. 동시 실행은 `users_ai_email_idx`로 한 번 더 찾습니다. */
async function ensureAiAccount(client: Queryable, email: string): Promise<{ userId: string; created: boolean }> {
  const existing = await findAiAccount(client, email);
  if (existing) return { userId: existing, created: false };
  return { userId: await provisionAccount(client, { email, role: 'operator', kind: 'ai' }), created: true };
}

async function withAccountRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) return run();
    throw error;
  }
}

export async function ensureAccountCommand(pool: Pool, io: CliOutput, emailValue?: string): Promise<void> {
  const email = normalizeEmail(emailValue);
  const { userId, created } = await withAccountRetry(() =>
    withTransaction(pool, (client) => ensureAiAccount(client, email)),
  );
  io.err(created ? `AI 계정을 만들었습니다: ${email}` : `AI 계정이 이미 있습니다: ${email}`);
  io.out(userId);
}

export async function issueTokenCommand(
  pool: Pool,
  io: CliOutput,
  options: { label?: string; email?: string },
): Promise<void> {
  const label = options.label?.trim() ?? '';
  if (label.length < 1 || label.length > AI_OPERATOR_LIMITS.tokenLabelMax) {
    throw new CliError(`--label은 1~${AI_OPERATOR_LIMITS.tokenLabelMax}자로 지정하세요.`);
  }
  const email = normalizeEmail(options.email);
  const issued = await withAccountRetry(() =>
    withTransaction(pool, async (client) => {
      const { userId } = await ensureAiAccount(client, email);
      return issueApiToken(client, SYSTEM_ACTOR, { userId, label });
    }),
  );
  io.err(`토큰을 발급했습니다: id ${issued.row.id}, prefix ${issued.row.prefix}. 원문은 지금 한 번만 출력됩니다.`);
  io.out(issued.token);
}

export async function listTokensCommand(pool: Pool, io: CliOutput, emailValue?: string): Promise<void> {
  const email = normalizeEmail(emailValue);
  const userId = await findAiAccount(pool, email);
  if (!userId) throw new CliError(`AI 계정이 없습니다: ${email}. ensure-account 또는 issue-token으로 만드세요.`);
  const tokens = await pool.query<ApiTokenRow>(
    `SELECT ${API_TOKEN_COLUMNS} FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC, id`,
    [userId],
  );
  io.out(['id', 'label', 'prefix', 'created_at', 'last_used_at', 'revoked_at'].join('\t'));
  for (const row of tokens.rows) {
    io.out(
      [
        row.id,
        row.label,
        row.prefix,
        row.created_at.toISOString(),
        row.last_used_at?.toISOString() ?? '-',
        row.revoked_at?.toISOString() ?? '-',
      ].join('\t'),
    );
  }
}

export async function revokeTokenCommand(pool: Pool, io: CliOutput, tokenId: string | undefined): Promise<void> {
  if (!tokenId || !UUID_PATTERN.test(tokenId)) throw new CliError('폐기할 토큰 id(uuid)를 지정하세요.');
  const row = await withTransaction(pool, (client) => revokeApiToken(client, SYSTEM_ACTOR, tokenId));
  if (!row) throw new CliError(`토큰을 찾을 수 없습니다: ${tokenId}`);
  io.err(`토큰을 폐기했습니다: ${row.prefix}`);
  io.out([row.id, row.revoked_at?.toISOString() ?? '-'].join('\t'));
}

/** `--name 값` 옵션과 위치 인자를 나눕니다. 모르는 옵션은 실패입니다. */
function parseArgs(args: string[], allowed: string[]): { options: Record<string, string>; positional: string[] } {
  const options: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!allowed.includes(name)) throw new CliError(`알 수 없는 옵션: ${arg}\n${USAGE}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new CliError(`${arg}에 값을 지정하세요.`);
    options[name] = value;
    index += 1;
  }
  return { options, positional };
}

/** 명령 하나를 실행하고 종료 코드를 돌려줍니다. pool은 호출하는 쪽이 만들고 닫습니다. */
export async function runCommand(pool: Pool, argv: string[], io: CliOutput): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'ensure-account':
        await ensureAccountCommand(pool, io, parseArgs(rest, ['email']).options.email);
        return 0;
      case 'issue-token':
        await issueTokenCommand(pool, io, parseArgs(rest, ['label', 'email']).options);
        return 0;
      case 'list-tokens':
        await listTokensCommand(pool, io, parseArgs(rest, ['email']).options.email);
        return 0;
      case 'revoke-token':
        await revokeTokenCommand(pool, io, parseArgs(rest, []).positional[0]);
        return 0;
      default:
        io.err(USAGE);
        return 1;
    }
  } catch (error) {
    if (error instanceof CliError) {
      io.err(error.message);
      return 1;
    }
    // 0004 migration 전 DB: 테이블(42P01)·컬럼(42703)이 없습니다.
    if (error instanceof DatabaseError && (error.code === '42P01' || error.code === '42703')) {
      io.err('AI 운영자 테이블이 없습니다. migration 0004_ai_operator가 적용된 API를 먼저 배포(또는 로컬 기동)하세요.');
      return 1;
    }
    io.err(`실패: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function main(): Promise<number> {
  const io: CliOutput = {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };
  // src/cli·dist/cli 모두 두 단계 위가 apps/api입니다. 컨테이너에는 파일이 없고 실행 환경 값을 씁니다.
  loadLocalEnvironment(resolve(__dirname, '../../.env'));
  if (!process.env.DATABASE_URL) {
    io.err('DATABASE_URL이 필요합니다. 로컬은 apps/api/.env(pnpm instance)를 준비하세요.');
    return 1;
  }
  let pool: Pool;
  try {
    pool = new Pool({
      ...databaseConnectionConfig(process.env),
      max: 1,
      application_name: 'crelink-ai-operator-cli',
      connectionTimeoutMillis: 5000,
    });
  } catch (error) {
    io.err(`DB 설정 오류: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  pool.on('error', (error) => io.err(`idle PostgreSQL 연결 오류: ${error.message}`));
  try {
    return await runCommand(pool, process.argv.slice(2), io);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
