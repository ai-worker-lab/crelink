import { Injectable, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';

/** `NODE_ENV=production`에서 비어 있으면 기동을 거부하는 키. 근거: docs/specs/crelink-prod-deploy.md#환경변수 */
export const PRODUCTION_REQUIRED_KEYS = [
  'DATABASE_URL',
  'PORT',
  'WEB_URL',
  'SHORT_LINK_BASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'OPERATOR_EMAILS',
  'UPLOAD_DIR',
] as const;

/**
 * 운영 설정 문제 목록. `NODE_ENV=production`이 아니면 빈 목록입니다(로컬·테스트 영향 없음).
 * 비밀값이 섞이지 않도록 값은 넣지 않고 키 이름만 모읍니다.
 */
export function productionConfigProblems(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const missing = PRODUCTION_REQUIRED_KEYS.filter((key) =>
    key === 'OPERATOR_EMAILS' ? !parseOperatorEmails(env[key]).size : !env[key]?.trim(),
  );
  const notHttps = (['WEB_URL', 'SHORT_LINK_BASE_URL'] as const).filter((key) => {
    const value = env[key]?.trim();
    return value && !(URL.canParse(value) && new URL(value).protocol === 'https:');
  });
  return [
    ...(missing.length ? [`비어 있음: ${missing.join(', ')}`] : []),
    ...(notHttps.length ? [`https URL이 아님: ${notHttps.join(', ')}`] : []),
  ];
}

/** 운영 설정이 틀리면 문제를 한 번에 모아 기동을 거부합니다. main.ts가 Nest 모듈(DB 연결)보다 먼저 부릅니다. */
export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  const problems = productionConfigProblems(env);
  if (problems.length) {
    throw new Error(
      `NODE_ENV=production 설정 오류로 기동을 거부합니다. ${problems.join(' / ')}. 키 설명: apps/api/docs/README.md#환경변수`,
    );
  }
}

/** `TRUSTED_PROXY_HOPS`: 비면 0, 0 이상의 정수가 아니면 오류. */
export function parseTrustedProxyHops(value: string | undefined): number {
  const text = value?.trim() || '0';
  if (!/^\d+$/.test(text)) throw new Error('TRUSTED_PROXY_HOPS는 0 이상의 정수여야 합니다(기본 0 = 소켓 주소).');
  return Number(text);
}

/** `OPERATOR_EMAILS`(쉼표 구분, 대소문자 무시). 운영 필수 검증과 운영자 판정이 같은 규칙을 씁니다. */
function parseOperatorEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * API 설정. 값은 호출할 때 process.env에서 읽습니다(로컬은 loadLocalEnvironment가 apps/api/.env를 먼저 채움).
 * 키 설명: apps/api/docs/README.md#환경변수
 */
@Injectable()
export class AppConfig implements OnModuleInit {
  onModuleInit() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    for (const key of ['WEB_URL', 'SHORT_LINK_BASE_URL']) {
      const value = process.env[key];
      if (!value || !URL.canParse(value)) {
        throw new Error(`${key} is required (http(s) URL). 로컬 값: pnpm instance --get ${key}`);
      }
    }
    parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
  }

  /** 앞단의 신뢰할 리버스 프록시 수. 방문·클릭 IP를 `X-Forwarded-For`에서 고르는 기준(`clientIp`). */
  get trustedProxyHops(): number {
    return parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
  }

  /** 본 도메인(웹) 주소. 끝의 `/`는 뺍니다. */
  get webUrl(): string {
    return (process.env.WEB_URL ?? '').replace(/\/+$/, '');
  }

  /** 단축 도메인 주소. 로컬은 API 주소입니다. */
  get shortLinkBaseUrl(): string {
    return (process.env.SHORT_LINK_BASE_URL ?? '').replace(/\/+$/, '');
  }

  /** 본 도메인이 https면 세션·state 쿠키에 Secure를 붙입니다. */
  get webCookieSecure(): boolean {
    return this.webUrl.startsWith('https:');
  }

  get shortCookieSecure(): boolean {
    return this.shortLinkBaseUrl.startsWith('https:');
  }

  /** 구글 OAuth 클라이언트. 둘 중 하나라도 비면 null이며 로그인 API는 503 `auth_not_configured`입니다. */
  get google(): { clientId: string; clientSecret: string; redirectUri: string } | null {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri: `${this.webUrl}/auth/google/callback` };
  }

  /** 운영자 구글 이메일(쉼표 구분, 대소문자 무시). */
  get operatorEmails(): Set<string> {
    return parseOperatorEmails(process.env.OPERATOR_EMAILS);
  }

  /** 업로드 이미지 디렉터리. 비면 저장소 루트 `.local/uploads`(git 제외). */
  get uploadDir(): string {
    const value = process.env.UPLOAD_DIR?.trim();
    return value ? resolve(value) : resolve(__dirname, '../../../.local/uploads');
  }

  /** DB-IP Lite City 등 mmdb 파일 경로. 비면 국가·도시를 기록하지 않습니다. */
  get geoipMmdbPath(): string | null {
    return process.env.GEOIP_MMDB_PATH?.trim() || null;
  }
}
