import { Injectable, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';

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
    return new Set(
      (process.env.OPERATOR_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
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
