'use client';

import {
  CRELINK_API_PATHS,
  type ChangeSlugRequest,
  type CreatorLandingState,
  type SlugAvailabilityResponse,
} from '@crelink/shared';
import { useEffect, useRef, useState } from 'react';
import { browserApi, BrowserApiError, describeError } from '../../lib/api/browser';
import {
  localSlugReason,
  normalizeSlugInput,
  SLUG_CHECK_DELAY_MS,
  slugSaveFailure,
  type SlugCheck,
} from '../../lib/slug-change';
import { useAction } from '../../lib/use-action';
import { useManager } from './ManagerContext';

/** 저장 결과. 화면마다 대화상자·시트 처리와 초점이 달라 결과만 돌려줍니다. */
export type SlugSaveOutcome =
  | { kind: 'saved' }
  /** 주소를 쓸 수 없음(경합 409 등). `check`가 `unavailable`로 바뀌어 있습니다. */
  | { kind: 'unusable' }
  /** 30일 제한에 걸림. 편집 상태를 다시 읽어 잠금으로 맞췄습니다. */
  | { kind: 'locked'; nextChangeAvailableAt: string | null }
  /** 30일 제한에 걸렸는데 다시 읽기도 실패함. 서버 문구를 그대로 보여 줍니다. */
  | { kind: 'locked-stale'; message: string }
  /** 연결·서버 오류. `error`가 채워져 있고 같은 주소로 다시 시도할 수 있습니다. */
  | { kind: 'retry' }
  /** 저장할 상태가 아니거나 이미 저장 중이어서 아무것도 하지 않음. */
  | { kind: 'ignored' };

/**
 * 주소 바꾸기(PRD R8) 입력·사용 가능 확인·저장. 넓은 화면 주소 막대와 좁은 화면 시트가 같이 씁니다.
 * `startsFromSaved`면 입력란이 저장값으로 채워져 있어 값이 저장값과 같아지면 `same_as_current` 대신 `idle`로 돌아갑니다.
 */
export function useSlugChange({ startsFromSaved }: { startsFromSaved: boolean }) {
  const { state, setState, reload } = useManager();
  const saved = state.shortLink.slug;
  const [draft, setDraft] = useState<string | null>(null);
  const [check, setCheck] = useState<SlugCheck>({ kind: 'idle' });
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef('');
  const saving = useRef(false);
  const action = useAction();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = draft ?? (startsFromSaved ? saved : '');
  const edited = draft !== null;

  function askAvailability(slug: string, delay: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ slug });
        const result = await browserApi<SlugAvailabilityResponse>(`${CRELINK_API_PATHS.meSlugAvailability}?${query}`);
        if (latest.current !== slug) return;
        setCheck(
          result.available
            ? { kind: 'available', slug }
            : { kind: 'unavailable', reason: result.reason ?? 'slug_taken' },
        );
      } catch (caught) {
        if (latest.current === slug) setCheck({ kind: 'error', message: describeError(caught) });
      }
    }, delay);
  }

  function reset() {
    window.clearTimeout(timer.current);
    latest.current = '';
    setDraft(null);
    setCheck({ kind: 'idle' });
  }

  function onInput(raw: string) {
    const next = normalizeSlugInput(raw);
    if (startsFromSaved && next === saved) {
      reset();
      return;
    }
    window.clearTimeout(timer.current);
    latest.current = next;
    setDraft(next);
    if (!next) {
      setCheck({ kind: 'idle' });
      return;
    }
    const reason = localSlugReason(next, saved);
    if (reason) {
      setCheck({ kind: 'unavailable', reason });
      return;
    }
    setCheck({ kind: 'checking' });
    askAvailability(next, SLUG_CHECK_DELAY_MS);
  }

  function retryCheck() {
    if (!latest.current) return;
    setCheck({ kind: 'checking' });
    askAvailability(latest.current, 0);
  }

  async function save(): Promise<SlugSaveOutcome> {
    if (check.kind !== 'available' || saving.current) return { kind: 'ignored' };
    saving.current = true;
    const payload: ChangeSlugRequest = { slug: check.slug };
    /** 실패 코드(task 안에서 정해짐). `useAction`은 문구만 남깁니다. */
    const failure: { code: string | null; message: string } = { code: null, message: '' };
    const changed = await action.run(async () => {
      try {
        setState(
          await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meSlug, {
            method: 'PUT',
            body: JSON.stringify(payload),
          }),
        );
      } catch (caught) {
        if (caught instanceof BrowserApiError) {
          failure.code = caught.code;
          failure.message = caught.message;
        }
        throw caught;
      }
    });
    saving.current = false;
    if (changed) {
      reset();
      return { kind: 'saved' };
    }
    const handling = slugSaveFailure(failure.code);
    if (handling.kind === 'unusable') {
      action.setError(null);
      setCheck({ kind: 'unavailable', reason: handling.reason });
      return { kind: 'unusable' };
    }
    if (handling.kind === 'locked') {
      const next = await reload().catch(() => null);
      if (!next) return { kind: 'locked-stale', message: failure.message };
      action.setError(null);
      reset();
      return { kind: 'locked', nextChangeAvailableAt: next.shortLink.nextChangeAvailableAt };
    }
    return { kind: 'retry' };
  }

  return {
    value,
    edited,
    check,
    pending: action.pending,
    error: action.error,
    clearError: () => action.setError(null),
    onInput,
    reset,
    retryCheck,
    save,
  };
}
