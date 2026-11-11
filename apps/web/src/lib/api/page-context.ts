/** 주소에서만 활성 페이지를 얻습니다. 저장소에 보관하지 않습니다. */
export function pageIdFromPath(pathname: string): string | null {
  return /^\/me\/landings\/([a-z0-9]{10})(?:\/|$)/.exec(pathname)?.[1] ?? null;
}
export function forwardPageHeader(source: Headers, target: Headers): void {
  target.delete('X-Crelink-Page');
  const value = source.get('X-Crelink-Page');
  if (value && /^[a-z0-9]{10}$/.test(value)) target.set('X-Crelink-Page', value);
}
/** 계약 누락은 기존 개인 페이지 응답이므로 소유자로 취급합니다. */
export function isPageOwner(access?: { role: 'owner' | 'editor' }): boolean {
  return access?.role !== 'editor';
}
