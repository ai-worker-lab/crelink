/**
 * 관리 화면 `페이지 편집`의 시작 안내 카드(design/first-run-guide/handoff.md `단계와 완료 판정`·`상태와 전이`) 판정.
 * ①은 서버 편집 상태의 방문자에게 보이는 항목 수(`visibleItemCount`)로, ②·③·닫기는 이 기기 브라우저에만 남기는
 * 진행 표시(`crelink.firstRunGuide.<publicId>`)로 정합니다. 새 API·서버 저장은 없습니다.
 */

/** 로컬 저장값. 참인 키만 둡니다. 주소·이메일 같은 개인정보는 넣지 않습니다. */
export interface FirstRunProgress {
  copied?: true;
  instagramConfirmed?: true;
  dismissed?: true;
}

const PROGRESS_FLAGS = ['copied', 'instagramConfirmed', 'dismissed'] as const;

/** 카드 상태 줄 문구(handoff `문구 원문` 상태 줄). */
export const FIRST_RUN_NOTICE = {
  added: '1단계를 마쳤어요. 이제 내 크리링 링크를 복사해요.',
  copied: '주소를 복사했어요.',
} as const;

/** 로컬 저장 키. 랜딩 단위라 랜딩이 여러 개여도 그대로 씁니다. 바꾸면 이미 닫은 카드가 다시 보입니다. */
export function firstRunGuideKey(publicId: string): string {
  return `crelink.firstRunGuide.${publicId}`;
}

/** 저장값을 읽습니다. 없거나 형식이 틀리면 빈 진행이고, 참이 아닌 값·모르는 키는 버립니다. */
export function parseFirstRunProgress(raw: string | null): FirstRunProgress {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object') return {};
  const progress: FirstRunProgress = {};
  for (const flag of PROGRESS_FLAGS) {
    if ((value as Record<string, unknown>)[flag] === true) progress[flag] = true;
  }
  return progress;
}

export type FirstRunStep = 1 | 2 | 3;

/**
 * 카드 모양. `steps`는 상태 A~C(현재 단계 = 아직 마치지 않은 첫 단계), `finished`는 D(이번 `페이지 편집`에서 `붙여 넣었어요`를
 * 누른 직후), null은 카드 없음(하이드레이션 전, 닫음, 세 단계를 마친 채 다시 들어옴 = E).
 */
export type FirstRunGuideView =
  | {
      kind: 'steps';
      current: FirstRunStep;
      added: boolean;
      copied: boolean;
      confirmed: boolean;
      doneCount: number;
      visibleCount: number;
    }
  | { kind: 'finished' }
  | null;

export function firstRunGuideView({
  progress,
  visibleCount,
  finishedNow,
}: {
  /** 하이드레이션 전(로컬 저장을 아직 읽지 않음)이면 null. */
  progress: FirstRunProgress | null;
  visibleCount: number;
  finishedNow: boolean;
}): FirstRunGuideView {
  if (!progress || progress.dismissed) return null;
  const added = visibleCount > 0;
  const copied = progress.copied === true;
  const confirmed = progress.instagramConfirmed === true;
  const current: FirstRunStep | null = !added ? 1 : !copied ? 2 : !confirmed ? 3 : null;
  if (current === null) return finishedNow ? { kind: 'finished' } : null;
  return {
    kind: 'steps',
    current,
    added,
    copied,
    confirmed,
    doneCount: [added, copied, confirmed].filter(Boolean).length,
    visibleCount,
  };
}

/**
 * 카드 자리(handoff `화면 위치`). 1024px 이상은 처음 패널(`PageOverview`), 1023px 이하는 `편집` 모드의 sticky 줄 아래입니다.
 * `페이지 편집` 밖과 1023px 이하 `미리보기` 모드(방문자 화면과 같아야 함, R18)에는 두지 않습니다.
 */
export function firstRunGuidePlacement({
  wide,
  pageEditor,
  preview,
}: {
  wide: boolean;
  pageEditor: boolean;
  preview: boolean;
}): 'panel' | 'narrow' | null {
  if (!pageEditor) return null;
  if (wide) return 'panel';
  return preview ? null : 'narrow';
}
