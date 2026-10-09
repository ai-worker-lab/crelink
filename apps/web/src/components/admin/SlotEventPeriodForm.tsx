'use client';

import { CRELINK_API_PATHS, type OperatorSlotEventResponse, type SetSlotEventPeriodRequest } from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browserApi, BrowserApiError } from '../../lib/api/browser';
import { errorMessage } from '../../lib/api/errors';
import { fromSeoulInput, toSeoulInput } from '../../lib/seoul-time';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';

/** 입력을 고쳐야 하는 오류 코드. 이 밖의 실패(연결·서버 오류)는 저장 버튼을 `다시 시도`로 바꿉니다. */
const INPUT_ERROR_CODES: Record<string, true> = { validation_failed: true, slot_event_period_invalid: true };

type Field = 'start' | 'end';

/**
 * 운영자 이벤트 기간 폼(디자인 design/slot-event/handoff.md `운영자 /admin/slot-event` D5~D9). 광고 배너 대화상자와 같은
 * `datetime-local` 두 칸(`ad-banner-period`)을 한국 시간으로 받아 `+09:00` ISO로 `PUT`합니다(`lib/seoul-time.ts`).
 * 시작 비움·끝 ≤ 시작은 화면에서 먼저 막고, API 400 `slot_event_period_invalid`도 같은 문구·같은 입력 표시로 보입니다.
 * 저장하면 서버 화면을 다시 읽어 상태 배지·신청자를 고칩니다.
 */
export function SlotEventPeriodForm({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
  const router = useRouter();
  const baseId = useId();
  const { pending, error, notice, run, setError, setNotice } = useAction();
  const [start, setStart] = useState(() => toSeoulInput(startsAt));
  const [end, setEnd] = useState(() => (endsAt ? toSeoulInput(endsAt) : ''));
  const [invalid, setInvalid] = useState<Field | null>(null);
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  /** 저장 중에는 입력·버튼이 잠겨 초점이 빠지므로, 잠금이 풀린 뒤 초점을 둘 곳. */
  const focusAfterSave = useRef<Field | 'submit' | null>(null);

  useEffect(() => {
    if (pending) return;
    const target = focusAfterSave.current;
    focusAfterSave.current = null;
    if (target === 'start') startRef.current?.focus();
    else if (target === 'end') endRef.current?.focus();
    else if (target === 'submit') submitRef.current?.focus();
  }, [pending]);

  function reject(field: Field, message: string) {
    setInvalid(field);
    setNotice(null);
    setError(message);
    (field === 'start' ? startRef : endRef).current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvalid(null);
    setFailedCode(null);
    const startIso = fromSeoulInput(start);
    // `datetime-local`은 다 채우지 않은 값을 빈 문자열로 주므로 끝이 비면 `끝 없음`입니다.
    const endIso = end ? fromSeoulInput(end) : null;
    if (!startIso) {
      reject('start', '시작 시각을 넣어 주세요.');
      return;
    }
    if (end && !endIso) {
      reject('end', errorMessage('validation_failed', null, 400));
      return;
    }
    if (endIso && Date.parse(endIso) <= Date.parse(startIso)) {
      reject('end', errorMessage('slot_event_period_invalid', null, 400));
      return;
    }

    const payload: SetSlotEventPeriodRequest = { startsAt: startIso, endsAt: endIso };
    await run(async () => {
      try {
        await browserApi<OperatorSlotEventResponse>(CRELINK_API_PATHS.adminSlotEvent, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } catch (caught) {
        const code = caught instanceof BrowserApiError ? caught.code : 'unknown';
        setFailedCode(code);
        if (code === 'slot_event_period_invalid') setInvalid('end');
        focusAfterSave.current = code === 'slot_event_period_invalid' ? 'end' : 'submit';
        throw caught;
      }
      focusAfterSave.current = 'submit';
      router.refresh();
    }, '이벤트 기간을 저장했어요.');
  }

  const retry = !!error && !!failedCode && !Object.hasOwn(INPUT_ERROR_CODES, failedCode);
  return (
    <form className="slot-event-form" onSubmit={submit} noValidate aria-label="이벤트 기간">
      <div className="ad-banner-period">
        <div className="field">
          <label htmlFor={`${baseId}-start`}>시작 (필수)</label>
          <input
            ref={startRef}
            id={`${baseId}-start`}
            className="input"
            type="datetime-local"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-invalid={invalid === 'start' || undefined}
            aria-describedby={`${baseId}-start-help`}
            disabled={pending}
          />
          <p className="field-help" id={`${baseId}-start-help`}>
            한국 시간 기준이에요.
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${baseId}-end`}>끝</label>
          <input
            ref={endRef}
            id={`${baseId}-end`}
            className="input"
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-invalid={invalid === 'end' || undefined}
            aria-describedby={`${baseId}-end-help`}
            disabled={pending}
          />
          <p className="field-help" id={`${baseId}-end-help`}>
            비워 두면 끝을 정할 때까지 계속 신청을 받아요.
          </p>
        </div>
      </div>
      <ActionStatus error={error} notice={notice} />
      <div className="form-actions">
        <button ref={submitRef} type="submit" className="primary" disabled={pending}>
          {pending ? '저장 중…' : retry ? '다시 시도' : '기간 저장'}
        </button>
      </div>
    </form>
  );
}
