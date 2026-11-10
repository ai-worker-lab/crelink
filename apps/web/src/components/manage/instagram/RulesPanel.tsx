'use client';

import {
  CRELINK_API_PATHS,
  type InstagramConnectionView,
  type InstagramDmRuleView,
  type UpdateInstagramDmRuleRequest,
} from '@crelink/shared';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserApiError, browserApi, describeError } from '../../../lib/api/browser';
import { useAction } from '../../../lib/use-action';
import { ActionStatus } from '../../ActionStatus';
import { useManager } from '../ManagerContext';
import { managerHref } from '../menu';
import { ConfirmSheet } from './ConfirmSheet';
import { RuleEditor } from './RuleEditor';
import { ruleLimit, rulesEditable } from './state';

type Editing = InstagramDmRuleView | 'new' | null;

/**
 * 연결된 계정의 규칙 목록(`GET·POST /api/me/instagram/rules`, `PATCH·DELETE .../rules/:publicId`).
 * `재연결 필요`에서는 읽기 전용입니다. 삭제는 보관이라 규칙이 목록에서 사라지고 대기 중 DM은 취소됩니다.
 */
export function RulesPanel({
  connection,
  limits,
  onReauthRequired,
}: {
  connection: InstagramConnectionView;
  limits: { activeRules: number; totalRules: number };
  onReauthRequired: () => void;
}) {
  const { state } = useManager();
  const statsHref = managerHref(state.landing.publicId, 'stats');
  const [rules, setRules] = useState<InstagramDmRuleView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editingState, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<InstagramDmRuleView | null>(null);
  const toggle = useAction();
  const remove = useAction();
  const trigger = useRef<HTMLElement | null>(null);
  const [closed, setClosed] = useState(0);
  const editable = rulesEditable(connection);
  // 연결이 끊기면(게시물 목록의 409 포함) 열려 있던 입력 칸은 닫고 읽기 전용으로 바꿉니다.
  const editing = editable ? editingState : null;
  const limit = rules ? ruleLimit(rules, limits) : null;
  const takenMediaIds = useMemo(() => new Set((rules ?? []).map((rule) => rule.mediaId)), [rules]);

  useEffect(() => {
    if (closed) trigger.current?.focus();
  }, [closed]);

  useEffect(() => {
    let active = true;
    browserApi<{ rules: InstagramDmRuleView[] }>(CRELINK_API_PATHS.meInstagramRules).then(
      (data) => {
        if (active) setRules(data.rules);
      },
      (error: unknown) => {
        if (active) setLoadError(describeError(error));
      },
    );
    return () => {
      active = false;
    };
  }, [reload]);

  function closeEditor() {
    setEditing(null);
    setClosed((value) => value + 1);
  }

  function closeRemove() {
    setRemoving(null);
    remove.setError(null);
    setClosed((value) => value + 1);
  }

  async function setEnabled(rule: InstagramDmRuleView, enabled: boolean) {
    remove.setNotice(null);
    await toggle.run(async () => {
      const body: UpdateInstagramDmRuleRequest = { enabled };
      const next = await browserApi<InstagramDmRuleView>(CRELINK_API_PATHS.meInstagramRule(rule.publicId), {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setRules((current) => current?.map((item) => (item.publicId === next.publicId ? next : item)) ?? current);
    });
  }

  async function archive(rule: InstagramDmRuleView) {
    const ok = await remove.run(async () => {
      try {
        await browserApi<void>(CRELINK_API_PATHS.meInstagramRule(rule.publicId), { method: 'DELETE' });
      } catch (caught) {
        // 이미 지워졌다면 목록만 맞춥니다.
        if (!(caught instanceof BrowserApiError && caught.code === 'instagram_rule_not_found')) throw caught;
      }
      setRules((current) => current?.filter((item) => item.publicId !== rule.publicId) ?? current);
    }, '규칙을 삭제했어요. 보내지 못한 대기 DM은 취소돼요.');
    if (ok) closeRemove();
  }

  const busy = toggle.pending || remove.pending;
  return (
    <section className="card" aria-labelledby="ig-rules-heading">
      <div className="card-head">
        <div>
          <h2 id="ig-rules-heading" className="card-title">
            자동 DM 규칙
          </h2>
          <p className="card-subtitle">
            고른 게시물에 키워드가 들어간 댓글이 달리면 댓글 단 사람에게 메시지를 보내요. 활성 규칙은{' '}
            {limits.activeRules}개, 보관한 규칙까지 {limits.totalRules}개까지 둘 수 있어요.
          </p>
        </div>
        <Link className="secondary" href={`${managerHref(state.landing.publicId, 'instagram')}/deliveries`}>
          발송 내역
        </Link>
      </div>

      {!editable ? (
        <p className="notice-box" role="status">
          연결이 끊겨서 규칙을 읽기만 할 수 있어요. 다시 연결하면 고칠 수 있어요.
        </p>
      ) : null}

      {loadError ? (
        <div role="alert" className="form-stack">
          <p className="form-error">{loadError}</p>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setLoadError(null);
                setReload((value) => value + 1);
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      ) : rules === null ? (
        <p className="empty-text" aria-busy="true">
          규칙을 불러오는 중이에요…
        </p>
      ) : (
        <>
          {rules.length === 0 && editing !== 'new' ? (
            <p className="empty-text">
              아직 규칙이 없어요. 게시물을 고르고 키워드와 메시지를 정하면 자동 DM이 시작돼요.
            </p>
          ) : (
            <ul className="edit-list channel-list">
              {rules.map((rule) => (
                <li key={rule.publicId} className="item-card ig-rule">
                  {editing !== 'new' && editing?.publicId === rule.publicId ? (
                    <RuleEditor
                      rule={rule}
                      takenMediaIds={takenMediaIds}
                      onCancel={closeEditor}
                      onReauthRequired={onReauthRequired}
                      onSaved={(next) => {
                        setRules(
                          (current) =>
                            current?.map((item) => (item.publicId === next.publicId ? next : item)) ?? current,
                        );
                        closeEditor();
                      }}
                    />
                  ) : (
                    <>
                      <div className="ig-rule-main">
                        <strong className="item-title">{rule.keyword}</strong>
                        <p className="ig-rule-media">{rule.mediaCaptionPreview || '캡션 없음'}</p>
                        <p className="ig-rule-message">{rule.message}</p>
                        <p className="field-help">
                          채널 주소 코드 <code className="url-text">{rule.channelLinkCode}</code> ·{' '}
                          <Link href={statsHref}>통계에서 보기</Link>
                        </p>
                      </div>
                      <div className="channel-item-actions">
                        <button
                          type="button"
                          role="switch"
                          className="hide-switch"
                          aria-checked={rule.enabled}
                          aria-label={`${rule.keyword} 규칙 켜기`}
                          aria-disabled={busy || !editable || (!rule.enabled && limit === 'active_full') || undefined}
                          onClick={() => {
                            if (busy || !editable || (!rule.enabled && limit === 'active_full')) return;
                            void setEnabled(rule, !rule.enabled);
                          }}
                        >
                          <span className="hide-switch-track" aria-hidden="true">
                            <span className="hide-switch-thumb" />
                          </span>
                          <span className="hide-switch-text" aria-hidden="true">
                            {rule.enabled ? '켜짐' : '꺼짐'}
                          </span>
                        </button>
                        {editable ? (
                          <>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              aria-label={`${rule.keyword} 규칙 고치기`}
                              onClick={(event) => {
                                trigger.current = event.currentTarget;
                                setEditing(rule);
                              }}
                            >
                              고치기
                            </button>
                            <button
                              type="button"
                              className="secondary danger"
                              disabled={busy}
                              aria-label={`${rule.keyword} 규칙 삭제`}
                              onClick={(event) => {
                                trigger.current = event.currentTarget;
                                remove.setError(null);
                                setRemoving(rule);
                              }}
                            >
                              삭제
                            </button>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {limit === 'active_full' ? (
            <p className="notice-box" role="status">
              켜 둔 규칙이 {limits.activeRules}개예요. 다른 규칙을 끄거나 삭제하면 새 규칙을 만들거나 켤 수 있어요.
            </p>
          ) : null}
          {limit === 'total_full' ? (
            <p className="notice-box" role="status">
              보관한 규칙까지 {limits.totalRules}개를 모두 썼어요. 더 만들 수 없어요.
            </p>
          ) : null}

          {editing === 'new' ? (
            <RuleEditor
              rule={null}
              takenMediaIds={takenMediaIds}
              onCancel={closeEditor}
              onReauthRequired={onReauthRequired}
              onSaved={(next) => {
                setRules((current) => [next, ...(current ?? [])]);
                closeEditor();
              }}
            />
          ) : editable ? (
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || limit !== null || editing !== null}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  toggle.setError(null);
                  setEditing('new');
                }}
              >
                규칙 추가
              </button>
            </div>
          ) : null}
        </>
      )}
      <ActionStatus error={toggle.error} notice={remove.notice} />
      {removing ? (
        <ConfirmSheet
          title="이 규칙을 삭제할까요?"
          confirmLabel="삭제"
          pending={remove.pending}
          error={remove.error}
          onCancel={closeRemove}
          onConfirm={() => void archive(removing)}
        >
          <p>
            “{removing.keyword}” 규칙을 삭제하면 이 게시물에는 더 이상 자동 DM이 가지 않고, 아직 보내지 않은 DM은
            취소돼요.
          </p>
        </ConfirmSheet>
      ) : null}
    </section>
  );
}
