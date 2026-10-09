import { Injectable, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';

/** `NODE_ENV=production`에서 비어 있으면 기동을 거부하는 공통 키. 저장소 키(`UPLOAD_DIR` 또는 `S3_REQUIRED_KEYS`)는 `FILE_STORAGE`에 따라 더합니다. 근거: docs/specs/crelink-prod-deploy.md#비밀값과-환경변수 */
export const PRODUCTION_REQUIRED_KEYS = [
  'DATABASE_URL',
  'PORT',
  'WEB_URL',
  'SHORT_LINK_BASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'OPERATOR_EMAILS',
] as const;

/** `FILE_STORAGE` 값. 비면 `disk`(로컬 디스크 `UPLOAD_DIR`), `s3`면 S3 호환 저장소. */
export const FILE_STORAGE_KINDS = ['disk', 's3'] as const;
export type FileStorageKind = (typeof FILE_STORAGE_KINDS)[number];

/** `FILE_STORAGE=s3`에 필요한 키. `S3_REGION`은 비면 `us-east-1`이라 여기 없습니다. */
export const S3_REQUIRED_KEYS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
export const S3_DEFAULT_REGION = 'us-east-1';

export interface S3StorageConfig {
  /** path-style로 부르는 엔드포인트(예: `https://s3.shaul.kr`). 끝의 `/`는 뺍니다. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type FileStorageConfig = { kind: 'disk' } | ({ kind: 's3' } & S3StorageConfig);

/** `FILE_STORAGE`: 비면 `disk`, `disk`·`s3`가 아니면 오류. */
export function parseFileStorageKind(value: string | undefined): FileStorageKind {
  const text = value?.trim() || 'disk';
  if (!(FILE_STORAGE_KINDS as readonly string[]).includes(text)) {
    throw new Error(`FILE_STORAGE는 ${FILE_STORAGE_KINDS.join(' 또는 ')}여야 합니다(기본 disk).`);
  }
  return text as FileStorageKind;
}

/**
 * 파일 저장소 설정. `s3`인데 필수 키가 비거나 `S3_ENDPOINT`가 http(s) URL이 아니면 오류입니다.
 * 비밀값이 섞이지 않도록 오류에는 키 이름만 넣습니다.
 */
export function parseFileStorageConfig(env: NodeJS.ProcessEnv): FileStorageConfig {
  const kind = parseFileStorageKind(env.FILE_STORAGE);
  if (kind === 'disk') return { kind };
  const missing = S3_REQUIRED_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`FILE_STORAGE=s3에는 ${missing.join(', ')}가 필요합니다.`);
  const endpoint = env.S3_ENDPOINT!.trim().replace(/\/+$/, '');
  if (!URL.canParse(endpoint) || !['http:', 'https:'].includes(new URL(endpoint).protocol)) {
    throw new Error('S3_ENDPOINT는 http(s) URL이어야 합니다(예: https://s3.shaul.kr).');
  }
  return {
    kind,
    endpoint,
    region: env.S3_REGION?.trim() || S3_DEFAULT_REGION,
    bucket: env.S3_BUCKET!.trim(),
    accessKeyId: env.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!.trim(),
  };
}

/**
 * 운영 설정 문제 목록. `NODE_ENV=production`이 아니면 빈 목록입니다(로컬·테스트 영향 없음).
 * 비밀값이 섞이지 않도록 값은 넣지 않고 키 이름만 모읍니다.
 */
export function productionConfigProblems(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  let storage: FileStorageKind | null = null;
  try {
    storage = parseFileStorageKind(env.FILE_STORAGE);
  } catch {
    // 아래 문제 목록에 넣습니다.
  }
  const storageKeys = storage === 's3' ? S3_REQUIRED_KEYS : storage === 'disk' ? ['UPLOAD_DIR'] : [];
  const missing = [...PRODUCTION_REQUIRED_KEYS, ...storageKeys].filter((key) =>
    key === 'OPERATOR_EMAILS' ? !parseOperatorEmails(env[key]).size : !env[key]?.trim(),
  );
  const httpsKeys = ['WEB_URL', 'SHORT_LINK_BASE_URL', ...(storage === 's3' ? ['S3_ENDPOINT'] : [])];
  const notHttps = httpsKeys.filter((key) => {
    const value = env[key]?.trim();
    return value && !(URL.canParse(value) && new URL(value).protocol === 'https:');
  });
  return [
    ...(storage ? [] : [`FILE_STORAGE가 ${FILE_STORAGE_KINDS.join('·')} 중 하나가 아님`]),
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

/** `DATABASE_POOL_MAX`가 비었을 때의 pg Pool 최대 연결 수. */
export const DEFAULT_DATABASE_POOL_MAX = 15;

/**
 * `DATABASE_POOL_MAX`: 비면 15, 1 이상의 정수가 아니면 오류(기동 거부). 오류에는 키 이름만 넣습니다.
 * 운영값 산정 기준: apps/api/docs/README.md#db-연결-수
 */
export function parseDatabasePoolMax(value: string | undefined): number {
  const text = value?.trim();
  if (!text) return DEFAULT_DATABASE_POOL_MAX;
  const max = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(max) || max < 1) {
    throw new Error(`DATABASE_POOL_MAX는 1 이상의 정수여야 합니다(기본 ${DEFAULT_DATABASE_POOL_MAX}).`);
  }
  return max;
}

/** 크리에이터 배너 한도(R21 ②, 랜딩마다). 키가 비었을 때 값은 설계 `[임시값]`입니다. */
export const DEFAULT_BANNER_SLOT_MAX = 5;
export const DEFAULT_BANNER_SLOT_TOTAL_MAX = 20;

export interface BannerSlotLimits {
  /** `BANNER_SLOT_MAX`: 보이는(숨김·차단 아님) 배너 상한 n. */
  visibleMax: number;
  /** `BANNER_SLOT_TOTAL_MAX`: 숨김·차단 포함 보관 상한. */
  totalMax: number;
}

/**
 * `BANNER_SLOT_MAX`(비면 5, 1 이상 정수)와 `BANNER_SLOT_TOTAL_MAX`(비면 20, `BANNER_SLOT_MAX` 이상 정수).
 * 어기면 오류(기동 거부). 오류에는 키 이름과 규칙만 넣습니다.
 */
export function parseBannerSlotLimits(env: NodeJS.ProcessEnv): BannerSlotLimits {
  const [visibleMax, totalMax] = (
    [
      ['BANNER_SLOT_MAX', DEFAULT_BANNER_SLOT_MAX],
      ['BANNER_SLOT_TOTAL_MAX', DEFAULT_BANNER_SLOT_TOTAL_MAX],
    ] as const
  ).map(([key, fallback]) => {
    const text = env[key]?.trim();
    if (!text) return fallback;
    const value = Number(text);
    return /^\d+$/.test(text) && Number.isSafeInteger(value) && value >= 1 ? value : NaN;
  });
  if (Number.isNaN(visibleMax)) {
    throw new Error(`BANNER_SLOT_MAX는 1 이상의 정수여야 합니다(기본 ${DEFAULT_BANNER_SLOT_MAX}).`);
  }
  if (Number.isNaN(totalMax) || totalMax < visibleMax) {
    throw new Error(
      `BANNER_SLOT_TOTAL_MAX는 BANNER_SLOT_MAX 이상의 정수여야 합니다(기본 ${DEFAULT_BANNER_SLOT_TOTAL_MAX}).`,
    );
  }
  return { visibleMax, totalMax };
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
    parseFileStorageConfig(process.env);
    parseBannerSlotLimits(process.env);
  }

  /** 크리에이터 배너 한도(`BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX`). 웹은 응답의 `bannerLimits`로만 봅니다. */
  get bannerSlotLimits(): BannerSlotLimits {
    return parseBannerSlotLimits(process.env);
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

  /** 업로드 이미지 저장소(`FILE_STORAGE`·`S3_*`). FilesModule이 이 값으로 구현을 고릅니다. */
  get fileStorage(): FileStorageConfig {
    return parseFileStorageConfig(process.env);
  }

  /** DB-IP Lite City 등 mmdb 파일 경로. 비면 국가·도시를 기록하지 않습니다. */
  get geoipMmdbPath(): string | null {
    return process.env.GEOIP_MMDB_PATH?.trim() || null;
  }
}
