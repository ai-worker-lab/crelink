import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstagramDmAudience, InstagramDmSettingsView } from '@crelink/shared';
import { backendRules } from './api/backend-rules.ts';
import { INSTAGRAM_DM_AUDIENCE_OPTIONS, planAudienceChange } from './instagram-dm-audience.ts';

const allowed = (method: string, path: string) =>
  backendRules.some((rule) => rule.methods.includes(method) && rule.pattern.test(path));

test('everyone만 확인을 거치고 off·operators는 바로 저장한다', () => {
  assert.equal(planAudienceChange('operators', 'everyone'), 'confirm');
  assert.equal(planAudienceChange('off', 'everyone'), 'confirm');
  assert.equal(planAudienceChange('everyone', 'off'), 'save');
  assert.equal(planAudienceChange('everyone', 'operators'), 'save');
  assert.equal(planAudienceChange('off', 'off'), 'none');
  assert.deepEqual(
    INSTAGRAM_DM_AUDIENCE_OPTIONS.map((option) => option.value),
    ['off', 'operators', 'everyone'],
  );
});

test('off 전환: mock API로 PUT 본문과 응답 반영을 확인한다', async () => {
  let current: InstagramDmAudience = 'everyone';
  const calls: Array<{ method: string; body: string }> = [];
  const mockPut = async (body: string): Promise<InstagramDmSettingsView> => {
    calls.push({ method: 'PUT', body });
    current = (JSON.parse(body) as { audience: InstagramDmAudience }).audience;
    return { audience: current };
  };
  assert.equal(planAudienceChange(current, 'off'), 'save');
  const saved = await mockPut(JSON.stringify({ audience: 'off' }));
  assert.deepEqual(saved, { audience: 'off' });
  assert.deepEqual(calls, [{ method: 'PUT', body: '{"audience":"off"}' }]);
  assert.equal(planAudienceChange(saved.audience, 'off'), 'none');
});

test('BFF는 운영자 PUT 두 경로만 허용하고 GET은 서버 렌더만 부른다', () => {
  assert.equal(allowed('PUT', 'api/admin/instagram-dm'), true);
  assert.equal(allowed('PUT', 'api/admin/instagram-dm/connections/abc/pause'), true);
  assert.equal(allowed('GET', 'api/admin/instagram-dm'), false);
  assert.equal(allowed('POST', 'api/admin/instagram-dm'), false);
  assert.equal(allowed('PUT', 'api/admin/instagram-dm/connections/abc'), false);
});
