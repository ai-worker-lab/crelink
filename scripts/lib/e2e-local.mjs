// E2E는 가입·정리까지 DB를 바꾸므로, 네 대상 모두 루프백임을 네트워크 연결 전에 검사합니다.
// pnpm e2e와 직접 Playwright 실행이 같은 경계를 씁니다. 원격 대상 허용 플래그는 없습니다.
const WEB_KEYS = ['WEB_URL', 'API_URL', 'SHORT_LINK_BASE_URL'];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function localUrl(key, value, protocols) {
  const invalid = () => new Error(`E2E 로컬 안전 경계: ${key}는 localhost/127.0.0.1/::1 URL만 허용합니다.`);
  if (typeof value !== 'string' || /\s/.test(value) || value.includes('\0') || !/^[a-z]+:\/\//i.test(value)) {
    throw invalid();
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (!protocols.includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) throw invalid();
  return url;
}

/** HTTP(S) 웹·API·단축 주소와 postgres(ql) DB를 모두 검사합니다. 비밀값은 오류에 넣지 않습니다. */
export function assertLocalE2ETargets(env) {
  for (const key of WEB_KEYS) localUrl(key, env[key], ['http:', 'https:']);
  const database = localUrl('DATABASE_URL', env.DATABASE_URL, ['postgres:', 'postgresql:']);
  // pg의 연결 문자열 query는 authority의 host를 덮어쓸 수 있습니다. 이중 연결 대상은 허용하지 않습니다.
  for (const key of database.searchParams.keys()) {
    if (['host', 'hostaddr', 'service', 'connectionstring'].includes(key.toLowerCase())) {
      throw new Error('E2E 로컬 안전 경계: DATABASE_URL의 연결 대상 덮어쓰기는 허용하지 않습니다.');
    }
  }
}
