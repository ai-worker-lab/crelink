/** API(`apps/api/src/instagram/webhook.service.ts`의 CONFIRMATION_CODE_PATTERN)와 같은 확인 코드 형식입니다. */
export const CONFIRMATION_CODE_PATTERN = /^[a-z0-9]{16}$/;

export type DeletionView = { kind: 'processed'; processedAt: string } | { kind: 'not_found' } | { kind: 'unavailable' };

/** API 응답을 화면 상태로 바꿉니다. 404는 코드가 없거나 90일이 지나 지워진 경우이고, 그 밖의 실패는 확인 불가입니다. */
export function deletionView(result: { status: number; processedAt?: unknown }): DeletionView {
  if (result.status === 404) return { kind: 'not_found' };
  if (
    result.status === 200 &&
    typeof result.processedAt === 'string' &&
    !Number.isNaN(Date.parse(result.processedAt))
  ) {
    return { kind: 'processed', processedAt: result.processedAt };
  }
  return { kind: 'unavailable' };
}
