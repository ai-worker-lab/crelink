'use client';

import { useId } from 'react';
import { ActionStatus } from '../ActionStatus';
import { GuestbookPanel } from '../landing/GuestbookPanel';
import { GuestbookSwitch } from './GuestbookSwitch';
import { useManager } from './ManagerContext';
import { managerMenuLabel } from './menu';

/**
 * `방명록` 메뉴: 방명록 켜기 스위치와 크리에이터 세션으로 부른 글 목록(`GuestbookPanel` 관리 쓰임: 비밀글·숨김 표시,
 * 숨기기·숨김 해제, 더 보기). 꺼진 랜딩의 목록은 API가 404 `guestbook_disabled`로 주므로 부르지 않고 꺼짐 안내를 보여 줍니다.
 * 켜기 저장이 끝나기 전에도 부르지 않습니다.
 */
export function GuestbookManager() {
  const headingId = useId();
  const { state, guestbookAction, guestbookChanged } = useManager();
  const enabled = state.landing.guestbookEnabled;
  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <div>
          <h1 id={headingId} className="card-title">
            {managerMenuLabel('guestbook')}
          </h1>
          <p className="card-subtitle">{enabled ? '방명록이 켜져 있어요.' : '방명록이 꺼져 있어요.'}</p>
        </div>
        <GuestbookSwitch />
      </div>
      <ActionStatus error={guestbookAction.error} notice={guestbookAction.notice} />
      {!enabled ? (
        <p className="notice-box">방명록이 꺼져 있어요. 켜면 이전 글이 그대로 다시 보여요.</p>
      ) : guestbookAction.pending ? (
        <p className="empty-text" role="status">
          방명록을 불러오는 중…
        </p>
      ) : (
        <GuestbookPanel publicId={state.landing.publicId} mode="manage" onChanged={guestbookChanged} />
      )}
    </section>
  );
}
