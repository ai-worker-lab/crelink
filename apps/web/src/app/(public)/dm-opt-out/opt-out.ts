/** 수신 거부 토큰은 URL 프래그먼트(`#t=`)로만 받습니다. 쿼리·경로·저장소에는 두지 않습니다. */
export const OPT_OUT_TOKEN_MAX_LENGTH = 512;

/** `#t=<토큰>`에서 토큰을 읽습니다. 없거나 비었거나 너무 길면 null입니다. */
export function readOptOutToken(hash: string): string | null {
  const value = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('t');
  if (!value || value.length > OPT_OUT_TOKEN_MAX_LENGTH) return null;
  return value;
}

/** 처리 뒤 주소에서 프래그먼트를 지웁니다. 경로와 쿼리는 그대로 둡니다. */
export function clearOptOutFragment(
  location: { pathname: string; search: string; hash: string },
  history: { replaceState: (data: unknown, unused: string, url: string) => void },
): void {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

export type OptOutView = 'checking' | 'ready' | 'pending' | 'done' | 'invalid' | 'error';

/** 오류 코드로 화면 상태를 정합니다. 400 `opt_out_invalid`만 다시 시도해도 소용없는 `invalid`입니다. */
export function viewForError(code: string | null): 'invalid' | 'error' {
  return code === 'opt_out_invalid' ? 'invalid' : 'error';
}
