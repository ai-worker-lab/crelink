import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstagramConnectionView } from '@crelink/shared';
import {
  CONNECT_FAILURE_MESSAGES,
  RULE_FIELD_COPY,
  connectionScreen,
  instagramMenuVisible,
  readConnectFailure,
  ruleDraftProblem,
  ruleLimit,
  rulesEditable,
  tokenExpiryNotice,
} from './state.ts';

const NOW = Date.parse('2026-11-11T00:00:00Z');
const DAY = 86_400_000;
const connection = (status: InstagramConnectionView['status']): InstagramConnectionView => ({
  igUsername: 'creator',
  status,
  paused: false,
  operatorPaused: false,
  connectedAt: '2026-11-01T00:00:00Z',
  tokenExpiresAt: null,
});

test('만료 값이 없으면 표시하지 않고 14일 이내만 안내한다', () => {
  assert.equal(tokenExpiryNotice(null, NOW), null);
  assert.equal(tokenExpiryNotice('not-a-date', NOW), null);
  assert.equal(tokenExpiryNotice(new Date(NOW + 15 * DAY).toISOString(), NOW), null);
  assert.deepEqual(tokenExpiryNotice(new Date(NOW + 14 * DAY).toISOString(), NOW), { kind: 'soon', days: 14 });
  assert.deepEqual(tokenExpiryNotice(new Date(NOW + 3 * DAY - 1000).toISOString(), NOW), { kind: 'soon', days: 3 });
  assert.deepEqual(tokenExpiryNotice(new Date(NOW + 1000).toISOString(), NOW), { kind: 'soon', days: 1 });
  assert.deepEqual(tokenExpiryNotice(new Date(NOW - 1).toISOString(), NOW), { kind: 'expired' });
});

test('연결 상태에 따라 화면이 정해진다', () => {
  assert.equal(connectionScreen(true, null), 'disconnected');
  assert.equal(connectionScreen(false, null), 'unavailable');
  assert.equal(connectionScreen(true, connection('active')), 'active');
  assert.equal(connectionScreen(true, connection('messages_access_required')), 'messages_access_required');
  assert.equal(connectionScreen(true, connection('reauth_required')), 'reauth_required');
});

test('재연결 필요와 미연결에서는 규칙을 고칠 수 없다', () => {
  assert.equal(rulesEditable(null), false);
  assert.equal(rulesEditable(connection('reauth_required')), false);
  assert.equal(rulesEditable(connection('active')), true);
  assert.equal(rulesEditable(connection('messages_access_required')), true);
});

test('메뉴는 소유자에게 instagramDmAvailable=true일 때만 보인다', () => {
  assert.equal(instagramMenuVisible({ instagramDmAvailable: true }), true);
  assert.equal(instagramMenuVisible({ instagramDmAvailable: true, pageAccess: { role: 'owner' } as never }), true);
  assert.equal(instagramMenuVisible({ instagramDmAvailable: false }), false);
  assert.equal(instagramMenuVisible({ instagramDmAvailable: true, pageAccess: { role: 'editor' } as never }), false);
});

test('연결 실패 코드는 알려진 값만 읽는다', () => {
  assert.equal(readConnectFailure('instagram_account_in_use'), 'instagram_account_in_use');
  assert.equal(readConnectFailure('instagram_operator_paused'), 'instagram_operator_paused');
  assert.equal(readConnectFailure('oauth_state_invalid'), 'oauth_state_invalid');
  assert.equal(readConnectFailure('instagram_access_denied'), 'instagram_access_denied');
  assert.equal(readConnectFailure('other'), null);
  assert.equal(readConnectFailure(['instagram_account_in_use']), null);
  assert.equal(readConnectFailure(undefined), null);
});

test('규칙 입력은 길이만 검사한다', () => {
  const ok = { mediaId: 'm1', keyword: '링크', message: '안내' };
  assert.equal(ruleDraftProblem(ok, true), null);
  assert.equal(ruleDraftProblem({ ...ok, mediaId: '' }, true), 'media');
  assert.equal(ruleDraftProblem({ ...ok, mediaId: '' }, false), null);
  assert.equal(ruleDraftProblem({ ...ok, keyword: '  ' }, true), 'keyword');
  assert.equal(ruleDraftProblem({ ...ok, keyword: 'a'.repeat(31) }, true), 'keyword');
  assert.equal(ruleDraftProblem({ ...ok, keyword: 'a'.repeat(30) }, true), null);
  assert.equal(ruleDraftProblem({ ...ok, message: '' }, true), 'message');
  assert.equal(ruleDraftProblem({ ...ok, message: 'a'.repeat(250) }, true), null);
  assert.equal(ruleDraftProblem({ ...ok, message: 'a'.repeat(251) }, true), 'message');
});

test('규칙 한도는 전체와 활성 순으로 본다', () => {
  const limits = { activeRules: 2, totalRules: 3 };
  assert.equal(ruleLimit([{ enabled: true }], limits), null);
  assert.equal(ruleLimit([{ enabled: true }, { enabled: true }], limits), 'active_full');
  assert.equal(ruleLimit([{ enabled: false }, { enabled: false }, { enabled: false }], limits), 'total_full');
});

test('기본 문구에 독점 콘텐츠 표현과 팔로우 조건이 없다', () => {
  const copy = [...Object.values(RULE_FIELD_COPY), ...Object.values(CONNECT_FAILURE_MESSAGES)].join('\n');
  assert.doesNotMatch(copy, /독점|댓글해야|팔로우|follow/i);
});

test('0280 모든 댓글은 빈 키워드를 허용하고 끄면 같은 초안을 다시 검증한다', () => {
  const draft = { mediaId: 'post', keyword: '', message: '안내', matchAllComments: true };
  assert.equal(ruleDraftProblem(draft, true), null);
  assert.equal(ruleDraftProblem({ ...draft, matchAllComments: false }, true), 'keyword');
  assert.equal(ruleDraftProblem({ ...draft, keyword: '😀'.repeat(30) }, true), null);
  assert.equal(ruleDraftProblem({ ...draft, keyword: '😀'.repeat(31) }, true), 'keyword');
  assert.equal(ruleDraftProblem({ ...draft, keyword: 'a\u0000' }, true), 'keyword');
  assert.equal(ruleDraftProblem({ ...draft, mediaId: '' }, true), 'media');
  assert.equal(ruleDraftProblem({ ...draft, message: 'a'.repeat(251) }, true), 'message');
  const savedKeyword = { ...draft, keyword: '  링크  ' };
  assert.equal(ruleDraftProblem({ ...savedKeyword, matchAllComments: false }, false), null);
  assert.equal(savedKeyword.keyword, '  링크  ');
});
