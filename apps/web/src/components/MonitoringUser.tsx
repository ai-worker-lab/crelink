'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * 서버가 세션으로 확인한 로그인 사용자의 내부 ID(UUID)를 브라우저 Sentry 이벤트에 붙입니다. 이메일·이름은 넣지 않습니다.
 * 브라우저 SDK의 user는 문서를 새로 불러올 때까지 남고, 로그아웃은 문서를 새로 불러오므로(`LogoutButton`) 함께 지워집니다.
 * Sentry가 꺼져 있으면 아무것도 보내지 않습니다.
 */
export function MonitoringUser({ id }: { id: string }) {
  useEffect(() => {
    Sentry.setUser({ id });
  }, [id]);
  return null;
}
