import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Meta가 보내는 값의 서명 검증. 근거: docs/specs/instagram-comment-dm.md `웹훅 수신 경로`, `OAuth·토큰·삭제`. */

const SIGNATURE_HEADER = /^sha256=([0-9a-f]{64})$/;
const SIGNED_REQUEST = /^([A-Za-z0-9_-]+={0,2})\.([A-Za-z0-9_-]+={0,2})$/;

function sameBytes(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * `X-Hub-Signature-256: sha256=<hex>`를 원문 바이트의 HMAC-SHA256과 비교합니다.
 * [M?] 서명 키가 앱 시크릿(`META_APP_SECRET`)인지는 스파이크 S1 실측 전입니다.
 */
export function verifyWebhookSignature(appSecret: string, rawBody: Buffer, header: unknown): boolean {
  if (typeof header !== 'string') return false;
  const match = SIGNATURE_HEADER.exec(header);
  if (!match) return false;
  return sameBytes(createHmac('sha256', appSecret).update(rawBody).digest(), Buffer.from(match[1], 'hex'));
}

/** 설정값과 요청값을 시간 차 없이 비교합니다(`hub.verify_token`). 해시로 길이를 맞추므로 길이도 드러나지 않습니다. */
export function constantTimeEquals(expected: string, actual: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(expected), digest(actual));
}

/**
 * 데이터 삭제 콜백의 `signed_request`(`<서명>.<내용>`, 둘 다 base64url)를 검증해 `user_id`를 돌려줍니다. 틀리면 null입니다.
 * 서명은 base64url로 인코딩된 내용 문자열의 HMAC-SHA256입니다.
 * [M?] `user_id` 값의 대응과 형식은 스파이크 S9 실측 전이라 문자열과 정수를 모두 받습니다.
 */
export function parseSignedRequest(appSecret: string, signedRequest: string): { userId: string } | null {
  const match = SIGNED_REQUEST.exec(signedRequest);
  if (!match) return null;
  const [, signature, encodedPayload] = match;
  const expected = createHmac('sha256', appSecret).update(encodedPayload, 'utf8').digest();
  if (!sameBytes(expected, Buffer.from(signature, 'base64url'))) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { algorithm, user_id: userId } = payload as { algorithm?: unknown; user_id?: unknown };
  if (algorithm !== 'HMAC-SHA256') return null;
  if (typeof userId === 'string' && userId.length > 0) return { userId };
  if (typeof userId === 'number' && Number.isSafeInteger(userId) && userId > 0) return { userId: String(userId) };
  return null;
}
