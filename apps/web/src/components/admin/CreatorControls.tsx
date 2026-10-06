'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type LinkView,
  type OperatorCreatorDetail,
  type SetExtraSlotsRequest,
  type SetLinkBlockRequest,
  type SetSuspensionRequest,
} from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';

/** 운영자가 부여하는 추가 링크 슬롯 수(R13). */
export function ExtraSlotsForm({ userId, extraSlots }: { userId: string; extraSlots: number }) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(String(extraSlots));
  const { pending, error, notice, run } = useAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: SetExtraSlotsRequest = { extraSlots: Number(value) };
    await run(async () => {
      await browserApi<OperatorCreatorDetail>(CRELINK_API_PATHS.adminCreatorExtraSlots(userId), {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      router.refresh();
    }, '추가 슬롯을 저장했어요.');
  }

  return (
    <form className="subform" onSubmit={submit}>
      <div className="field">
        <label htmlFor={inputId}>추가 링크 슬롯</label>
        <div className="inline-fields">
          <input
            id={inputId}
            className="input input-number"
            type="number"
            min={0}
            step={1}
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={pending}
          />
          <button type="submit" className="primary" disabled={pending}>
            {pending ? '저장 중…' : '슬롯 저장'}
          </button>
        </div>
        <p className="field-help">
          보이는 링크 한도 = 무료 {CRELINK_LIMITS.freeVisibleLinks}개 + 추가 슬롯 {Number(value) || 0}개
        </p>
      </div>
      <ActionStatus error={error} notice={notice} />
    </form>
  );
}

/** 크리에이터 이용 정지·해제. 정지하면 로그인·편집이 막히고 랜딩·단축 주소가 안내로 바뀝니다. */
export function SuspensionToggle({ userId, suspended }: { userId: string; suspended: boolean }) {
  const router = useRouter();
  const { pending, error, notice, run } = useAction();

  async function toggle() {
    const next = !suspended;
    const question = next
      ? '이 크리에이터를 정지할까요? 로그인·편집이 막히고 랜딩페이지와 단축 주소는 안내 화면으로 바뀌어요.'
      : '이 크리에이터의 정지를 풀까요?';
    if (!window.confirm(question)) return;
    const payload: SetSuspensionRequest = { suspended: next };
    await run(
      async () => {
        await browserApi<OperatorCreatorDetail>(CRELINK_API_PATHS.adminCreatorSuspension(userId), {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        router.refresh();
      },
      next ? '정지했어요.' : '정지를 풀었어요.',
    );
  }

  return (
    <div className="subform">
      <p className="section-help">
        현재 상태: <strong>{suspended ? '정지' : '이용 중'}</strong>
      </p>
      <button
        type="button"
        className={suspended ? 'secondary' : 'secondary danger'}
        onClick={toggle}
        disabled={pending}
      >
        {pending ? '처리 중…' : suspended ? '정지 풀기' : '이용 정지'}
      </button>
      <ActionStatus error={error} notice={notice} />
    </div>
  );
}

/** 링크별 차단·해제와 사유(R14). */
export function LinkBlockControl({ link }: { link: LinkView }) {
  const router = useRouter();
  const inputId = useId();
  const [reason, setReason] = useState(link.blockedReason ?? '');
  const { pending, error, notice, run } = useAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const blocked = !link.blocked;
    const payload: SetLinkBlockRequest = { blocked, reason: blocked ? reason.trim() || null : null };
    await run(
      async () => {
        await browserApi<LinkView>(CRELINK_API_PATHS.adminLinkBlock(link.id), {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        router.refresh();
      },
      blocked ? '링크를 차단했어요.' : '차단을 풀었어요.',
    );
  }

  return (
    <form className="block-control" onSubmit={submit}>
      {link.blocked ? (
        <p className="blocked-reason">사유: {link.blockedReason ?? '없음'}</p>
      ) : (
        <div className="field">
          <label htmlFor={inputId}>차단 사유 (선택)</label>
          <input
            id={inputId}
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={CRELINK_LIMITS.blockedReasonMax}
            disabled={pending}
          />
        </div>
      )}
      <button type="submit" className={link.blocked ? 'secondary' : 'secondary danger'} disabled={pending}>
        {pending ? '처리 중…' : link.blocked ? '차단 풀기' : '차단'}
      </button>
      <ActionStatus error={error} notice={notice} />
    </form>
  );
}
