'use client';

import { useEffect, useRef } from 'react';
import { sendSignupFunnelEvent, signupContextFromPage } from '../lib/signup-funnel';

/** 로그인 전 홈 방문을 일별 합계로 한 번 보고합니다. 화면을 그리지 않고 실패해도 화면에 영향을 주지 않습니다. */
export function SignupFunnelHomeView() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    sendSignupFunnelEvent(
      'home_view',
      signupContextFromPage(location.search, document.referrer, location.hostname, navigator.userAgent),
    );
  }, []);

  return null;
}
