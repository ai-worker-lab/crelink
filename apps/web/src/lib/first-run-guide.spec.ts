// 관리 화면 시작 안내 카드의 상태 A~E·자리·로컬 저장값(design/first-run-guide/handoff.md). 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  firstRunGuideKey,
  firstRunGuidePlacement,
  firstRunGuideView,
  parseFirstRunProgress,
  type FirstRunProgress,
} from './first-run-guide.ts';

const view = (progress: FirstRunProgress | null, visibleCount = 0, finishedNow = false) =>
  firstRunGuideView({ progress, visibleCount, finishedNow });

test('하이드레이션 전(로컬 저장을 아직 읽지 않음)에는 카드가 없다', () => {
  assert.equal(view(null), null);
  assert.equal(view(null, 3), null);
});

test('A: 빈 랜딩·기록 없음이면 ①이 현재 단계, 0/3 완료', () => {
  assert.deepEqual(view({}), {
    kind: 'steps',
    current: 1,
    added: false,
    copied: false,
    confirmed: false,
    doneCount: 0,
    visibleCount: 0,
  });
});

test('B: 보이는 항목이 있으면 ① 완료(보이는 수)·②가 현재 단계', () => {
  assert.deepEqual(view({}, 2), {
    kind: 'steps',
    current: 2,
    added: true,
    copied: false,
    confirmed: false,
    doneCount: 1,
    visibleCount: 2,
  });
});

test('C: 항목이 있고 copied면 ③이 현재 단계, 2/3 완료', () => {
  assert.deepEqual(view({ copied: true }, 1), {
    kind: 'steps',
    current: 3,
    added: true,
    copied: true,
    confirmed: false,
    doneCount: 2,
    visibleCount: 1,
  });
});

test('②는 ①보다 먼저 해도 되고, 현재 단계는 아직 마치지 않은 첫 단계', () => {
  const early = view({ copied: true }, 0);
  assert.equal(early?.kind === 'steps' && early.current, 1);
  assert.equal(early?.kind === 'steps' && early.copied, true);
  assert.equal(early?.kind === 'steps' && early.doneCount, 1);
  // 보이는 항목을 모두 숨기거나 지우면 ①이 다시 미완료(닫지 않았다면)
  const reverted = view({ copied: true, instagramConfirmed: true }, 0);
  assert.equal(reverted?.kind === 'steps' && reverted.current, 1);
  assert.equal(reverted?.kind === 'steps' && reverted.doneCount, 2);
});

test('D: `붙여 넣었어요`를 누른 직후(이번 진입)에는 완료 카드', () => {
  assert.deepEqual(view({ copied: true, instagramConfirmed: true }, 1, true), { kind: 'finished' });
});

test('E: 세 단계를 마친 채 다시 들어오면 D를 건너뛰고 카드 없음', () => {
  assert.equal(view({ copied: true, instagramConfirmed: true }, 1, false), null);
});

test('E: 닫으면(`닫기`·×) 어느 단계에서든 카드 없음', () => {
  assert.equal(view({ dismissed: true }), null);
  assert.equal(view({ dismissed: true }, 2), null);
  assert.equal(view({ copied: true, dismissed: true }, 1), null);
  assert.equal(view({ copied: true, instagramConfirmed: true, dismissed: true }, 1, true), null);
});

test('자리: 1024px 이상은 처음 패널, 1023px 이하는 `편집` 모드에만, `미리보기` 모드와 다른 메뉴에는 없음', () => {
  assert.equal(firstRunGuidePlacement({ wide: true, pageEditor: true, preview: false }), 'panel');
  assert.equal(firstRunGuidePlacement({ wide: false, pageEditor: true, preview: false }), 'narrow');
  assert.equal(firstRunGuidePlacement({ wide: false, pageEditor: true, preview: true }), null);
  assert.equal(firstRunGuidePlacement({ wide: true, pageEditor: false, preview: false }), null);
  assert.equal(firstRunGuidePlacement({ wide: false, pageEditor: false, preview: false }), null);
});

test('로컬 저장 키는 랜딩 단위 `crelink.firstRunGuide.<publicId>`', () => {
  assert.equal(firstRunGuideKey('pub1'), 'crelink.firstRunGuide.pub1');
});

test('저장값은 참인 세 키만 읽고, 없거나 깨진 값은 빈 진행', () => {
  assert.deepEqual(parseFirstRunProgress(null), {});
  assert.deepEqual(parseFirstRunProgress(''), {});
  assert.deepEqual(parseFirstRunProgress('{'), {});
  assert.deepEqual(parseFirstRunProgress('null'), {});
  assert.deepEqual(parseFirstRunProgress('true'), {});
  assert.deepEqual(parseFirstRunProgress('{"copied":true,"dismissed":true}'), { copied: true, dismissed: true });
  assert.deepEqual(parseFirstRunProgress('{"copied":"yes","instagramConfirmed":true,"email":"a@b.c"}'), {
    instagramConfirmed: true,
  });
});
