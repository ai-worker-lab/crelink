'use client';

import type { SlotEventView } from '@crelink/shared';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { formatDate, formatDateTime } from '../../lib/format';
import { ActionStatus } from '../ActionStatus';
import { useManager, type SlotEventResult } from './ManagerContext';
import { offeredSlotEvent } from './limits';

/**
 * 링크 슬롯 이벤트(R24) 신청 묶음(design/slot-event/handoff.md `관리 화면 페이지 편집 띠`·`외부 링크 패널`).
 * 띠(`SlotEventBand`)와 외부 링크 패널 줄(`SlotEventPanelRow`)이 같은 마크업(`.event-offer`)과 `ManagerContext`의 같은 요청·진행 상태를 씁니다.
 * 누른 버튼이 사라지면(완료·409·404) 그 자리에 남은 줄로, 네트워크 오류면 `다시 시도` 버튼으로 초점을 옮깁니다(handoff `상호작용·접근성`).
 */

/** 누른 쪽에서만 결과 뒤 초점을 옮깁니다(좁은 화면은 띠와 시트 안 카드가 함께 있음). 결과 줄이 있으면 그 줄, 없으면 버튼. */
function useApplyWithFocus(onResult?: (result: SlotEventResult | null) => void) {
  const { applySlotEvent } = useManager();
  const [settled, setSettled] = useState(0);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (settled > 0) (resultRef.current ?? buttonRef.current)?.focus();
  }, [settled]);
  async function apply() {
    const result = await applySlotEvent();
    onResult?.(result);
    setSettled((count) => count + 1);
  }
  return { apply, resultRef, buttonRef };
}

/** 신청 카드: 배지 `이벤트`·제목·설명, `신청하기`(진행 `신청 중…`, 네트워크 오류 뒤 `다시 시도`), 카드 안 오류 줄. */
function SlotEventOffer({
  variant,
  event,
  buttonRef,
  onApply,
}: {
  variant: 'band' | 'panel';
  event: SlotEventView;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onApply: () => void;
}) {
  const { slotEventAction } = useManager();
  const { pending, error } = slotEventAction;
  const titleId = useId();
  const band = variant === 'band';
  return (
    <section
      className={band ? 'event-offer' : 'event-offer is-compact'}
      aria-labelledby={titleId}
      aria-busy={pending || undefined}
    >
      <div className="event-offer-text">
        <p className="event-offer-title" id={titleId}>
          <span className="badge">이벤트</span>
          <span>외부 링크 +5 이벤트</span>
        </p>
        <p className="event-offer-body">
          {!band ? (
            `이벤트를 신청하면 보이는 링크를 ${event.bonusLinks}개 더 둘 수 있어요.`
          ) : event.endsAt ? (
            <>
              신청하면 보이는 외부 링크를 {event.bonusLinks}개 더 둘 수 있어요. 계정마다 한 번,{' '}
              <time dateTime={event.endsAt}>{formatDateTime(event.endsAt)}</time>까지 신청할 수 있어요.
            </>
          ) : (
            `신청하면 보이는 외부 링크를 ${event.bonusLinks}개 더 둘 수 있어요. 계정마다 한 번 신청할 수 있어요.`
          )}
        </p>
      </div>
      <button
        ref={buttonRef}
        type="button"
        className={band ? 'primary' : 'secondary'}
        aria-describedby={titleId}
        disabled={pending}
        onClick={onApply}
      >
        {pending ? '신청 중…' : error ? '다시 시도' : '신청하기'}
      </button>
      <ActionStatus error={error} />
    </section>
  );
}

/** 띠 자리에 남는 결과 줄(완료 `role="status"`, 기간 아님·이벤트 없음 `role="alert"`). */
function SlotEventResultLine({
  result,
  lineRef,
}: {
  result: SlotEventResult;
  lineRef: RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <p
      ref={lineRef}
      className={result.ok ? 'form-success event-result' : 'form-error event-result'}
      role={result.ok ? 'status' : 'alert'}
      tabIndex={-1}
    >
      {result.text}
    </p>
  );
}

/**
 * `페이지 편집` 이벤트 띠(A1~A8). 넓은 화면은 처음 패널 머리 아래·`구역 선택` 위, 좁은 화면은 sticky 줄 아래·미리보기 위
 * (`BannerSlotNotice`와 같은 자리). 신청 결과가 있으면 띠 대신 결과 줄을, 진행 중·미신청이면 띠를 그리고, 그 밖(신청함·시작 전·끝남·없음)은 그리지 않습니다.
 */
export function SlotEventBand() {
  const { state, slotEventAction, slotEventResult } = useManager();
  const { apply, resultRef, buttonRef } = useApplyWithFocus();
  if (slotEventResult) return <SlotEventResultLine result={slotEventResult} lineRef={resultRef} />;
  // 신청 중에는 다시 읽은 상태가 먼저 와도 결과 줄이 나올 때까지 띠를 둡니다(깜빡임 방지).
  const event = offeredSlotEvent(state.slotEvent) ?? (slotEventAction.pending ? state.slotEvent.event : null);
  if (!event) return null;
  return <SlotEventOffer variant="band" event={event} buttonRef={buttonRef} onApply={() => void apply()} />;
}

/**
 * 외부 링크 패널 이벤트 줄(B1~B10, 한도 배지 바로 아래). 신청했으면(기간과 무관) `신청함` 줄, 409·404 뒤에는 오류 줄,
 * 진행 중·미신청이면 신청 카드. `onApplied`는 완료 문장을 패널 `ActionStatus`에 넘길 때 씁니다.
 */
export function SlotEventPanelRow({ onApplied }: { onApplied: (text: string) => void }) {
  const { state, slotEventAction, slotEventResult } = useManager();
  const { apply, resultRef, buttonRef } = useApplyWithFocus((result) => {
    if (result?.ok) onApplied(result.text);
  });
  const { entry } = state.slotEvent;
  if (entry) {
    return (
      <p ref={resultRef} className="event-status" tabIndex={-1}>
        <span className="badge badge-positive">이벤트 보너스 +{entry.bonusLinks} 받음</span>
        <span>
          <time dateTime={entry.appliedAt}>{formatDate(entry.appliedAt)}</time> 신청
        </span>
      </p>
    );
  }
  if (slotEventResult && !slotEventResult.ok) {
    return <SlotEventResultLine result={slotEventResult} lineRef={resultRef} />;
  }
  const event = offeredSlotEvent(state.slotEvent) ?? (slotEventAction.pending ? state.slotEvent.event : null);
  if (!event) return null;
  return <SlotEventOffer variant="panel" event={event} buttonRef={buttonRef} onApply={() => void apply()} />;
}
