'use client';

import {
  CRELINK_API_PATHS,
  type InstagramConnectionView,
  type SetInstagramConnectionPauseRequest,
} from '@crelink/shared';
import { useEffect, useRef, useState } from 'react';
import { BrowserApiError, browserApi } from '../../../lib/api/browser';
import { formatDate } from '../../../lib/format';
import { useAction } from '../../../lib/use-action';
import { ActionStatus } from '../../ActionStatus';
import { CopyButton } from '../../CopyButton';
import { ConfirmSheet } from './ConfirmSheet';
import { CONNECT_FAILURE_MESSAGES, tokenExpiryNotice, type ConnectFailureCode, type ConnectionScreen } from './state';

/**
 * 연결 카드: 미연결·연결 전 안내, 연결됨(정지 스위치·해제), 메시지 접근 꺼짐(`다시 확인`), 재연결 필요, 만료 임박,
 * 연결 실패·계정 선택 오류, 운영자 정지, 인앱 브라우저 안내를 그립니다. 상태표: docs/specs/instagram-comment-dm.md `화면 상태와 API 대응`.
 */
export function ConnectionPanel({
  screen,
  connection,
  inApp,
  failure,
  now,
  onConnectionChange,
  onDisconnected,
}: {
  screen: ConnectionScreen;
  connection: InstagramConnectionView | null;
  inApp: boolean;
  failure: ConnectFailureCode | null;
  /** 서버가 화면을 만든 시각(ms). 하이드레이션 전후로 만료 일수가 달라지지 않게 서버 값을 씁니다. */
  now: number;
  onConnectionChange: (connection: InstagramConnectionView) => void;
  onDisconnected: () => void;
}) {
  const connect = useAction();
  const recheck = useAction();
  const pause = useAction();
  const disconnect = useAction();
  const [confirming, setConfirming] = useState(false);
  const disconnectTrigger = useRef<HTMLButtonElement>(null);
  const [closed, setClosed] = useState(0);

  useEffect(() => {
    if (closed) disconnectTrigger.current?.focus();
  }, [closed]);

  const expiry = connection ? tokenExpiryNotice(connection.tokenExpiresAt, now) : null;
  const canConnect = !inApp && !connect.pending;

  async function startConnect() {
    await connect.run(async () => {
      const { authorizationUrl } = await browserApi<{ authorizationUrl: string }>(
        CRELINK_API_PATHS.meInstagramConnect,
        {
          method: 'POST',
        },
      );
      if (!authorizationUrl.startsWith('https://')) throw new BrowserApiError('instagram_upstream_failed', '', 502);
      // 동의 화면은 같은 브라우저에서 이어져야 하므로(state 쿠키) 새 탭이 아니라 이 탭에서 엽니다. 이동하는 동안 버튼은 잠긴 채로 둡니다.
      window.location.assign(authorizationUrl);
      await new Promise(() => undefined);
    });
  }

  const connectButton = (label: string) => (
    <button type="button" className="primary" onClick={() => void startConnect()} disabled={!canConnect}>
      {connect.pending ? '인스타그램으로 이동 중…' : label}
    </button>
  );

  const inAppNotice = inApp ? (
    <div className="notice-box ig-inapp" role="status">
      <strong>기본 브라우저에서 열어 주세요.</strong>
      <p>
        인스타그램·카카오톡 같은 앱 안의 브라우저에서는 인스타그램 로그인을 마칠 수 없어요. 아래 주소를 복사해 Safari나
        Chrome에서 열면 연결할 수 있어요.
      </p>
      <CopyButton
        text={typeof window === 'undefined' ? '' : window.location.origin + window.location.pathname}
        idleText="주소 복사"
      />
    </div>
  ) : null;

  const failureNotice = failure ? (
    <p className="form-error" role="alert">
      {CONNECT_FAILURE_MESSAGES[failure]}
    </p>
  ) : null;

  if (screen === 'unavailable') {
    return (
      <section className="card" aria-labelledby="ig-connection-heading">
        <h2 id="ig-connection-heading" className="card-title">
          인스타그램 연결
        </h2>
        <p className="empty-text">자동 DM은 아직 사용할 수 없어요. 열리면 이 화면에서 알려 드릴게요.</p>
      </section>
    );
  }

  if (screen === 'disconnected' || !connection) {
    return (
      <section className="card" aria-labelledby="ig-connection-heading">
        <div className="card-head">
          <div>
            <h2 id="ig-connection-heading" className="card-title">
              인스타그램 연결
            </h2>
            <p className="card-subtitle">
              게시물에 달린 댓글의 키워드를 보고, 댓글 단 사람에게 내가 정한 링크를 DM으로 보내 줘요.
            </p>
          </div>
        </div>
        <div className="form-stack">
          {inAppNotice}
          {failureNotice}
          <div>
            <h3 className="ig-guide-title">연결하기 전에 확인해 주세요</h3>
            <ul className="ig-guide">
              <li>프로페셔널(비즈니스·크리에이터) 계정이고 공개 계정이어야 해요.</li>
              <li>브라우저에서 인스타그램(페이스북) 로그인이 열려요. 로그인에 비밀번호가 필요해요.</li>
              <li>
                동의 화면에서 <strong>Allow access to messages</strong>(메시지 접근 허용)를 켜 주세요. 꺼져 있으면 DM을
                보낼 수 없어요.
              </li>
              <li>계정은 하나만 골라 주세요.</li>
            </ul>
          </div>
          <div className="form-actions">{connectButton('인스타그램 연결')}</div>
          <ActionStatus error={connect.error} />
        </div>
      </section>
    );
  }

  const switchLocked = connection.operatorPaused || screen === 'reauth_required';
  return (
    <section className="card" aria-labelledby="ig-connection-heading">
      <div className="card-head">
        <div>
          <h2 id="ig-connection-heading" className="card-title">
            인스타그램 연결
          </h2>
          <p className="card-subtitle">
            <strong>@{connection.igUsername}</strong> · {formatDate(connection.connectedAt)} 연결
          </p>
        </div>
        <span
          className={`badge ${screen === 'active' && !connection.paused && !connection.operatorPaused ? 'badge-positive' : screen === 'active' ? 'badge-muted' : 'badge-warning'}`}
        >
          {screen === 'reauth_required'
            ? '연결 끊김'
            : screen === 'messages_access_required'
              ? '메시지 접근 필요'
              : connection.operatorPaused
                ? '운영자가 정지함'
                : connection.paused
                  ? '일시 정지'
                  : '연결됨'}
        </span>
      </div>

      <div className="form-stack">
        {inAppNotice}
        {failureNotice}

        {screen === 'reauth_required' ? (
          <div className="notice-box" role="status">
            <strong>연결이 끊겼어요. 다시 연결해 주세요.</strong>
            <p>
              크리링은 연결을 자동으로 다시 시도하지 않아요. 다시 연결하기 전까지 자동 DM은 가지 않고, 보내지 못한 대기
              DM은 취소돼요. 규칙은 읽기만 할 수 있어요.
            </p>
          </div>
        ) : null}

        {screen === 'messages_access_required' ? (
          <div className="notice-box" role="status">
            <strong>인스타그램에서 메시지 접근을 켜 주세요.</strong>
            <p>
              인스타그램 앱 설정의 메시지 관리 → 연결된 도구에서 크리링 앱의 <strong>Allow access to messages</strong>를
              켠 뒤 아래 버튼을 눌러 주세요. 메뉴 이름은 앱 버전에 따라 조금 달라요. 켠 것이 실제로 맞는지는 다음 DM을
              보낼 때 확인돼요.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                disabled={recheck.pending}
                onClick={() =>
                  void recheck.run(async () => {
                    onConnectionChange(
                      await browserApi<InstagramConnectionView>(CRELINK_API_PATHS.meInstagramRecheck, {
                        method: 'POST',
                      }),
                    );
                  }, '다시 확인했어요. 다음 DM을 보낼 때 접근이 실제로 맞는지 확인돼요.')
                }
              >
                {recheck.pending ? '확인 중…' : '다시 확인'}
              </button>
            </div>
          </div>
        ) : null}

        {expiry && screen !== 'reauth_required' ? (
          <div className="notice-box" role="status">
            {expiry.kind === 'expired'
              ? '연결 유효 기간이 지났어요. 다시 연결해 주세요.'
              : `연결 유효 기간이 ${expiry.days}일 남았어요. 만료되기 전에 다시 연결해 주세요.`}
          </div>
        ) : null}

        {connection.operatorPaused ? (
          <p className="notice-box" role="status">
            운영자가 이 계정의 자동 DM을 멈췄어요. 직접 다시 켤 수 없어요. 궁금한 점은 피드백으로 알려 주세요.
          </p>
        ) : null}

        {screen !== 'reauth_required' ? (
          <div className="ig-pause-row">
            <div>
              <strong id="ig-pause-label">자동 DM 보내기</strong>
              <p className="field-help">끄면 새 댓글에도 DM을 보내지 않고, 보내지 않은 대기 DM은 그대로 있어요.</p>
            </div>
            <button
              type="button"
              role="switch"
              className="hide-switch"
              aria-checked={!connection.paused && !connection.operatorPaused}
              aria-labelledby="ig-pause-label"
              aria-disabled={switchLocked || pause.pending || undefined}
              onClick={() => {
                if (switchLocked || pause.pending) return;
                const body: SetInstagramConnectionPauseRequest = { paused: !connection.paused };
                void pause.run(async () => {
                  try {
                    onConnectionChange(
                      await browserApi<InstagramConnectionView>(CRELINK_API_PATHS.meInstagramPause, {
                        method: 'PUT',
                        body: JSON.stringify(body),
                      }),
                    );
                  } catch (caught) {
                    // 그 사이 운영자가 멈췄다면 화면을 현재 상태로 맞춥니다.
                    if (caught instanceof BrowserApiError && caught.code === 'instagram_operator_paused') {
                      onConnectionChange({ ...connection, operatorPaused: true });
                    }
                    throw caught;
                  }
                });
              }}
            >
              <span className="hide-switch-track" aria-hidden="true">
                <span className="hide-switch-thumb" />
              </span>
              <span className="hide-switch-text" aria-hidden="true">
                {!connection.paused && !connection.operatorPaused ? '켜짐' : '꺼짐'}
              </span>
            </button>
          </div>
        ) : null}

        <div className="form-actions">
          {screen === 'reauth_required' || expiry ? connectButton('다시 연결') : null}
          <button
            ref={disconnectTrigger}
            type="button"
            className="secondary danger"
            disabled={disconnect.pending}
            onClick={() => {
              disconnect.setError(null);
              setConfirming(true);
            }}
          >
            연결 해제
          </button>
        </div>
        <ActionStatus error={connect.error ?? pause.error ?? recheck.error} notice={recheck.notice ?? pause.notice} />
      </div>

      {confirming ? (
        <ConfirmSheet
          title="인스타그램 연결을 해제할까요?"
          confirmLabel="연결 해제"
          pending={disconnect.pending}
          error={disconnect.error}
          onCancel={() => {
            setConfirming(false);
            disconnect.setError(null);
            setClosed((value) => value + 1);
          }}
          onConfirm={() =>
            void disconnect.run(async () => {
              await browserApi<void>(CRELINK_API_PATHS.meInstagram, { method: 'DELETE' });
              setConfirming(false);
              onDisconnected();
            })
          }
        >
          <p>
            연결을 해제하면 자동 DM이 멈추고, 이 계정의 <strong>규칙과 발송 내역이 함께 지워져요.</strong> 보내지 않은
            대기 DM도 취소돼요. 다시 연결해도 지운 규칙은 돌아오지 않아요.
          </p>
        </ConfirmSheet>
      ) : null}
    </section>
  );
}
