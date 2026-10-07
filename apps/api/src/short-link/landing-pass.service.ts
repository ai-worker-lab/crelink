import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 통과 표시 유효 시간(초). 단축 주소 302 직후 브라우저가 바로 랜딩을 열므로 짧게 둡니다. */
export const LANDING_PASS_TTL_SECONDS = 60;

/** HMAC-SHA256 앞 16바이트(base64url 22자). 위조돼도 피해가 "방문이 안 세어짐"뿐이라 이 길이로 충분합니다. */
const SIGNATURE_BYTES = 16;
const PASS_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{22})$/;

/**
 * 단축 주소 리디렉트(`GET {SHORT}/{slug}`)가 랜딩 주소에 붙이는 통과 표시(PRD R7).
 * 웹 공개 랜딩은 이 표시가 유효해야 외부에서 온 요청을 그대로 그리고, 아니면 단축 주소로 보내 방문을 기록하게 합니다.
 *
 * 형식 `<만료 epoch 초>.<base64url HMAC 앞 16바이트>`, 서명 대상 `publicId + '.' + 만료`.
 *
 * 키는 새 비밀값 없이 프로세스가 시작할 때 만든 무작위 32바이트입니다.
 * - 위조·재사용의 결과는 "그 요청이 방문으로 안 세어짐"뿐이라 보호할 자산이 없습니다(랜딩은 원래 공개 정보).
 * - Blue/Green 전환 순간 다른 색 API가 검증해 실패해도, 웹이 단축 주소로 한 번 더 보내 새 표시를 받으므로 스스로 복구됩니다.
 *   그래서 키를 SOPS 비밀값으로 나눠 가질 필요가 없습니다. 단, 한 색이 API 프로세스를 여러 개 띄우면(cluster·복제) 발급과
 *   검증이 다른 프로세스로 갈 수 있어 이 전제가 깨집니다.
 */
@Injectable()
export class LandingPassService {
  private readonly key = randomBytes(32);

  /** `nowMs`는 시험에서 만료를 만들 때만 넘깁니다. */
  issue(publicId: string, nowMs = Date.now()): string {
    const expires = Math.floor(nowMs / 1000) + LANDING_PASS_TTL_SECONDS;
    return `${expires}.${this.sign(publicId, expires)}`;
  }

  /** 이 publicId에 대해 발급했고 아직 만료되지 않은 표시면 true. 형식이 틀리거나 비어 있으면 false. */
  verify(publicId: string, pass: unknown, nowMs = Date.now()): boolean {
    const match = typeof pass === 'string' ? PASS_PATTERN.exec(pass) : null;
    if (!match) return false;
    const expires = Number(match[1]);
    if (nowMs > expires * 1000) return false;
    const expected = Buffer.from(this.sign(publicId, expires));
    const given = Buffer.from(match[2]);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign(publicId: string, expires: number): string {
    return createHmac('sha256', this.key)
      .update(`${publicId}.${expires}`)
      .digest()
      .subarray(0, SIGNATURE_BYTES)
      .toString('base64url');
  }
}
