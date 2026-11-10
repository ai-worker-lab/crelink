'use client';

import type { InstagramConnectionView, InstagramIntegrationView } from '@crelink/shared';
import { useState } from 'react';
import { ConnectionPanel } from './ConnectionPanel';
import { RulesPanel } from './RulesPanel';
import { connectionScreen, type ConnectFailureCode } from './state';

/**
 * `인스타그램 DM` 메뉴(설계 docs/specs/instagram-comment-dm.md): 위에 연결 카드, 연결돼 있으면 아래에 규칙 카드입니다.
 * 서버가 읽은 연결 정보로 시작하고, 이후 변경은 각 요청의 응답으로 맞춥니다. 발송 내역 화면은 별도 티켓(0265)입니다.
 */
export function InstagramSettings({
  initial,
  inApp,
  failure,
  now,
}: {
  initial: InstagramIntegrationView;
  inApp: boolean;
  failure: ConnectFailureCode | null;
  now: number;
}) {
  const [connection, setConnection] = useState<InstagramConnectionView | null>(initial.connection);
  const screen = connectionScreen(initial.available, connection);
  return (
    <>
      <h1 className="visually-hidden">인스타그램 DM</h1>
      <ConnectionPanel
        screen={screen}
        connection={connection}
        inApp={inApp}
        failure={failure}
        now={now}
        onConnectionChange={setConnection}
        onDisconnected={() => setConnection(null)}
      />
      {connection ? (
        <RulesPanel
          connection={connection}
          limits={initial.limits}
          onReauthRequired={() =>
            setConnection((current) => (current ? { ...current, status: 'reauth_required' } : current))
          }
        />
      ) : null}
    </>
  );
}
