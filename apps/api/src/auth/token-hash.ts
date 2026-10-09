import { createHash } from 'node:crypto';

/** 세션 쿠키·API 토큰 원문을 DB에 저장할 값(SHA-256 hex)으로 바꿉니다. 원문은 저장하지 않습니다. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
