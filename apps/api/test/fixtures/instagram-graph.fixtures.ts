/**
 * test-only synthetic Unified Login 응답. 실제 식별자·token·code/state를 담지 않습니다.
 * shape 출처: 2026-11-11 Coordinator 관측, docs/work/orchestrator/0279-instagram-token-identity.md.
 * token 200/access_token·token_type, /me 빈 객체, debug_token 네 필드, assigned 한 계정.
 * 아래 값은 전부 새로 만든 예시이며 실계정·현재 Meta 가용성의 증거가 아닙니다.
 */
export const unifiedLoginFixture = () => ({
  config: {
    appId: 'synthetic-app',
    appSecret: 'synthetic-secret',
    loginConfigId: 'synthetic-config',
    redirectUri: 'https://synthetic.example.test/callback',
  },
  token: { access_token: 'opaque.synthetic.token', token_type: 'bearer' },
  me: {},
  principal: { data: { app_id: 'synthetic-app', type: 'SYSTEM_USER', is_valid: true, user_id: 'synthetic-principal' } },
  assigned: { data: [{ id: 'synthetic-ig-one', username: 'synthetic_one' }] },
});
