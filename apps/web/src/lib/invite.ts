/** 초대 토큰만 세션 저장소에 잠시 둡니다. 활성 페이지는 저장하지 않습니다. */
export const INVITE_STORAGE_KEY = 'crelink:pending-invite';

export function takeInviteToken(
  location: { hash: string; pathname: string; search: string },
  history: { replaceState: (data: unknown, unused: string, url: string) => void },
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): string | null {
  const token = location.hash.slice(1);
  // 저장소 접근이 실패해도 프래그먼트부터 지웁니다.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  let saved: string | null = null;
  try {
    saved = storage.getItem(INVITE_STORAGE_KEY);
    storage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    /* 브라우저 저장소 차단 */
  }
  return token || saved || null;
}
