'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type BannerLimits,
  type OperatorCreatorDetail,
  type SetBannerSlotRequest,
  type SetExtraSlotsRequest,
  type SetLinkBlockRequest,
  type SetSuspensionRequest,
} from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { formatDate } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';

/**
 * 운영자가 부여하는 추가 링크 슬롯 수(R13). 도움말은 입력 중인 값으로 한도를 나눠 보이고, 링크 슬롯 이벤트(R24)를 신청한 계정은
 * 이벤트 몫(`eventBonus`, 신청 때 받은 보너스)을 더합니다. 합이 전체 링크 상한을 넘으면 상한을 함께 보입니다
 * (design/slot-event/handoff.md `운영자 크리에이터 상세` E1~E3).
 */
export function ExtraSlotsForm({
  userId,
  extraSlots,
  eventBonus,
}: {
  userId: string;
  extraSlots: number;
  /** 이벤트를 신청하지 않았으면 null. */
  eventBonus: number | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(String(extraSlots));
  const { pending, error, notice, run } = useAction();
  const extra = Number(value) || 0;
  const total = CRELINK_LIMITS.freeVisibleLinks + extra + (eventBonus ?? 0);

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
            aria-describedby={`${inputId}-help`}
            disabled={pending}
          />
          <button type="submit" className="primary" disabled={pending}>
            {pending ? '저장 중…' : '슬롯 저장'}
          </button>
        </div>
        <p className="field-help" id={`${inputId}-help`}>
          보이는 링크 한도 = 무료 {CRELINK_LIMITS.freeVisibleLinks}개 + 추가 슬롯 {extra}개
          {eventBonus === null ? null : ` + 이벤트 ${eventBonus}개`}
          {eventBonus !== null && total > CRELINK_LIMITS.totalLinks
            ? ` → 전체 링크 상한 ${CRELINK_LIMITS.totalLinks}개`
            : null}
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

/**
 * 배너 슬롯 부여·회수(R21 ①⑤). 회수해도 크리에이터 배너는 지우지 않고 보관하며, 다시 부여하면 그대로 보입니다.
 * 문구: design/ad-banner-block/handoff.md `크리에이터 상세`.
 */
export function BannerSlotControl({
  userId,
  grantedAt,
  limits,
  bannerCount,
}: {
  userId: string;
  grantedAt: string | null;
  limits: BannerLimits;
  /** 보관 중 포함 크리에이터 배너 수. */
  bannerCount: number;
}) {
  const router = useRouter();
  const headingId = useId();
  const { pending, error, notice, run } = useAction();
  const granted = grantedAt !== null;

  async function toggle() {
    const next = !granted;
    const question = next
      ? '이 계정의 모든 랜딩에서 광고 블록 자리가 크리에이터 배너 슬롯으로 바뀌어요. 부여할까요?'
      : `회수하면 같은 자리에 다시 크리링 광고가 나와요. 크리에이터가 만든 배너 ${bannerCount}장은 지우지 않고 보관해요.`;
    if (!window.confirm(question)) return;
    const payload: SetBannerSlotRequest = { granted: next };
    await run(
      async () => {
        await browserApi<OperatorCreatorDetail>(CRELINK_API_PATHS.adminCreatorBannerSlot(userId), {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        router.refresh();
      },
      next ? '배너 슬롯을 부여했어요.' : '배너 슬롯을 회수했어요.',
    );
  }

  return (
    <div className="subform" role="group" aria-labelledby={headingId}>
      <h3 id={headingId}>배너 슬롯</h3>
      {granted ? (
        <p className="section-help">
          현재: <strong>부여됨({formatDate(grantedAt)}부터)</strong> — 보이는 배너 {limits.visibleUsed}장 · 전체{' '}
          {limits.totalUsed}장
        </p>
      ) : bannerCount > 0 ? (
        <p className="section-help">
          현재: <strong>없음</strong> — 보관 중인 배너 {bannerCount}장(다시 부여하면 그대로 보여요).
        </p>
      ) : (
        <>
          <p className="section-help">
            현재: <strong>없음</strong> — 랜딩에 크리링 광고 블록이 나와요.
          </p>
          <p className="field-help">배너는 {limits.visibleMax}장까지 둘 수 있어요(설정값).</p>
        </>
      )}
      <button type="button" className={granted ? 'secondary danger' : 'secondary'} onClick={toggle} disabled={pending}>
        {pending ? '처리 중…' : granted ? '배너 슬롯 회수' : '배너 슬롯 부여'}
      </button>
      <ActionStatus error={error} notice={notice} />
    </div>
  );
}

/**
 * 링크·크리에이터 배너 공용 차단·해제와 사유(R14, R21 ④). `path`는 `PUT` 차단 경로
 * (`CRELINK_API_PATHS.adminLinkBlock`·`adminBannerBlock`), 요청은 둘 다 `SetLinkBlockRequest`입니다.
 */
export function BlockControl({
  blocked,
  blockedReason,
  path,
  noun,
}: {
  blocked: boolean;
  blockedReason: string | null;
  path: string;
  /** 결과 안내 문구의 대상 이름. */
  noun: '링크' | '배너';
}) {
  const router = useRouter();
  const inputId = useId();
  const [reason, setReason] = useState(blockedReason ?? '');
  const { pending, error, notice, run } = useAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = !blocked;
    const payload: SetLinkBlockRequest = { blocked: next, reason: next ? reason.trim() || null : null };
    await run(
      async () => {
        await browserApi<unknown>(path, { method: 'PUT', body: JSON.stringify(payload) });
        router.refresh();
      },
      next ? `${noun}를 차단했어요.` : '차단을 풀었어요.',
    );
  }

  return (
    <form className="block-control" onSubmit={submit}>
      {blocked ? (
        <p className="blocked-reason">사유: {blockedReason ?? '없음'}</p>
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
      <button type="submit" className={blocked ? 'secondary' : 'secondary danger'} disabled={pending}>
        {pending ? '처리 중…' : blocked ? '차단 풀기' : '차단'}
      </button>
      <ActionStatus error={error} notice={notice} />
    </form>
  );
}
