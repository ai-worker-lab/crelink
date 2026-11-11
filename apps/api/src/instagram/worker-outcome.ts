import { InstagramGraphError, isGraphTokenInvalid } from './graph';

/** 레이트 제한 응답에 대기 시간이 없을 때 쉬는 시간. */
export const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 60 * 60;

const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([613, 80002]);
const RATE_LIMIT_SUBCODES: ReadonlySet<number> = new Set([2534040]);

/** 코드 또는 서브코드 번호. 어느 쪽으로 오는지도 S8로 확정합니다. */
export interface SendErrorCodes {
  messagesAccess: ReadonlySet<number>;
  policyRestriction: ReadonlySet<number>;
}

/**
 * `[M?]` 메시지 접근 꺼짐·정책 제재 코드는 S8 실측 전이라 비어 있습니다. 추측한 번호를 넣지 않습니다.
 * 비어 있는 동안 이 두 오류는 일반 거절(`failed`, 재시도 없음)로 끝납니다. 값을 더할 때는 `graph.ts`의 허용 목록에도 같이 더합니다.
 */
export const SEND_ERROR_CODES: SendErrorCodes = { messagesAccess: new Set(), policyRestriction: new Set() };

export type SendFailure =
  /** 요청이 서버에 닿기 전 실패. 발송이 일어나지 않았으므로 재시도합니다. */
  | { kind: 'retry' }
  /** 발송 여부를 모릅니다. 중복 DM을 막기 위해 재시도하지 않습니다. */
  | { kind: 'unknown' }
  | { kind: 'rate_limited'; waitSeconds: number }
  | { kind: 'token_invalid' }
  | { kind: 'messages_access' }
  | { kind: 'policy_restricted' }
  /** 그 밖의 거절(잘못된 대상, 삭제된 댓글, 수신 불가, 이미 응답). 재시도하지 않습니다. */
  | { kind: 'rejected' };

function matches(error: InstagramGraphError, codes: ReadonlySet<number>, subcodes: ReadonlySet<number>): boolean {
  return (error.code !== null && codes.has(error.code)) || (error.subcode !== null && subcodes.has(error.subcode));
}

/** 설계의 오류 분류표. `InstagramGraphError`가 아닌 예외는 호출이 나갔는지 알 수 없으므로 `unknown`입니다. */
export function classifySendFailure(error: unknown, codes: SendErrorCodes): SendFailure {
  if (!(error instanceof InstagramGraphError)) return { kind: 'unknown' };
  if (error.kind === 'connect_failed') return { kind: 'retry' };
  if (error.kind === 'indeterminate') return { kind: 'unknown' };
  if (error.status === 429 || matches(error, RATE_LIMIT_CODES, RATE_LIMIT_SUBCODES)) {
    return { kind: 'rate_limited', waitSeconds: error.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS };
  }
  if (isGraphTokenInvalid(error)) return { kind: 'token_invalid' };
  if (matches(error, codes.policyRestriction, codes.policyRestriction)) return { kind: 'policy_restricted' };
  if (matches(error, codes.messagesAccess, codes.messagesAccess)) return { kind: 'messages_access' };
  return { kind: 'rejected' };
}
