'use client';

import { CRELINK_API_PATHS, type PageMembersResponse, type PageInviteResponse } from '@crelink/shared';
import { useEffect, useRef, useState } from 'react';
import { browserApi, describeError } from '../../lib/api/browser';
import { isPageOwner } from '../../lib/api/page-context';
import { formatDateTime } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { CopyButton } from '../CopyButton';
import { EditSheet } from './EditSheet';
import { useManager } from './ManagerContext';
import { managerMenuLabel } from './menu';

export function PageMembers() {
  const { state } = useManager();
  const owner = isPageOwner(state.pageAccess);
  const action = useAction();
  const [members, setMembers] = useState<PageMembersResponse | null>(null);
  const [invite, setInvite] = useState<PageInviteResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<{ userId: string; email: string } | 'leave' | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [closed, setClosed] = useState(0);
  useEffect(() => {
    if (closed) trigger.current?.focus();
  }, [closed]);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    browserApi<PageMembersResponse>(CRELINK_API_PATHS.pageMembers).then(
      (data) => {
        if (active) {
          setMembers(data);
          setLoadError(null);
        }
      },
      (error: unknown) => {
        if (active) setLoadError(describeError(error));
      },
    );
    return () => {
      active = false;
    };
  }, [owner, revision]);

  function dismiss() {
    setConfirm(null);
    setClosed((value) => value + 1);
  }
  async function remove() {
    if (!confirm || action.pending) return;
    const leaving = confirm === 'leave';
    const path = leaving ? CRELINK_API_PATHS.leavePage : CRELINK_API_PATHS.pageMember(confirm.userId);
    const ok = await action.run(
      async () => {
        await browserApi(path, { method: 'DELETE' });
      },
      leaving ? undefined : '공동 관리자를 내보냈어요.',
    );
    if (!ok) return;
    if (leaving) window.location.assign('/me');
    else {
      dismiss();
      setRevision((value) => value + 1);
    }
  }
  return (
    <section className="form-stack">
      <h1 className="page-title">{managerMenuLabel('members')}</h1>
      <h2>공동 관리자</h2>
      {owner ? (
        <>
          <p className="section-help">
            공동 관리자는 비밀글·숨긴 글과 통계를 보고 페이지를 편집할 수 있어요. 최대 5명까지 초대할 수 있어요.
          </p>
          {loadError ? (
            <>
              <ActionStatus error={loadError} />
              <button className="secondary" onClick={() => setRevision((value) => value + 1)}>
                다시 시도
              </button>
            </>
          ) : !members ? (
            <p role="status">불러오는 중…</p>
          ) : (
            <>
              {members.members.length === 0 ? (
                <p>아직 공동 관리자가 없어요.</p>
              ) : (
                <ul>
                  {members.members.map((member) => (
                    <li key={member.userId}>
                      {member.email}{' '}
                      <button
                        className="secondary danger"
                        disabled={action.pending}
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          action.setError(null);
                          setConfirm(member);
                        }}
                      >
                        내보내기<span className="visually-hidden"> {member.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="secondary"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () => {
                    setInvite(await browserApi<PageInviteResponse>(CRELINK_API_PATHS.pageInvites, { method: 'POST' }));
                    setRevision((value) => value + 1);
                  })
                }
              >
                {action.pending ? '처리 중…' : '초대 링크 만들기'}
              </button>
              {invite ? (
                <CopyButton text={window.location.origin + '/invite#' + invite.token} idleText="초대 링크 복사" />
              ) : null}
              {invite || members.invite ? (
                <>
                  <p>만료 시각: {formatDateTime((invite ?? members.invite)!.expiresAt)}</p>
                  <button
                    className="secondary"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(async () => {
                        await browserApi(CRELINK_API_PATHS.pageInvites, { method: 'DELETE' });
                        setInvite(null);
                        setRevision((value) => value + 1);
                      }, '초대를 취소했어요.')
                    }
                  >
                    초대 취소
                  </button>
                </>
              ) : null}
            </>
          )}
        </>
      ) : (
        <button
          className="secondary danger"
          disabled={action.pending}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            action.setError(null);
            setConfirm('leave');
          }}
        >
          이 페이지에서 나가기
        </button>
      )}
      <ActionStatus error={action.error} notice={action.notice} />
      {confirm ? (
        <EditSheet
          title={confirm === 'leave' ? '이 페이지에서 나갈까요?' : '공동 관리자를 내보낼까요?'}
          pending={action.pending}
          onDismiss={dismiss}
          className="centered-sheet"
        >
          <div className="form-stack">
            <p>
              {confirm === 'leave'
                ? '나가면 이 페이지를 편집하거나 비밀글·숨긴 글과 통계를 볼 수 없어요. 다시 참여하려면 새 초대가 필요해요.'
                : confirm.email + ' 님은 더 이상 이 페이지를 관리할 수 없어요.'}
            </p>
            <ActionStatus error={action.error} />
            <div className="form-actions edit-form-actions">
              <button className="secondary" data-autofocus disabled={action.pending} onClick={dismiss}>
                취소
              </button>
              <button className="secondary danger" disabled={action.pending} onClick={() => void remove()}>
                {action.pending ? '처리 중…' : confirm === 'leave' ? '나가기' : '내보내기'}
              </button>
            </div>
          </div>
        </EditSheet>
      ) : null}
    </section>
  );
}
