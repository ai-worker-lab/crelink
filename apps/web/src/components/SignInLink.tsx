'use client';

import {
  CRELINK_WEB_PATHS,
  detectInAppBrowser,
  detectMobilePlatform,
  type InAppBrowserKind,
  type MobilePlatform,
} from '@crelink/shared';
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { chromeIntentUrl, sendSignupFunnelEvent, signupContextFromPage } from '../lib/signup-funnel';
import { CopyButton } from './CopyButton';
import { EditSheet } from './manage/EditSheet';

const APP_NAMES: Record<InAppBrowserKind, string> = {
  instagram: '인스타그램',
  facebook: '페이스북',
  kakaotalk: '카카오톡',
  naver: '네이버',
  line: '라인',
};

const EXTERNAL_HELP: Record<Exclude<MobilePlatform, 'android'>, string> = {
  ios: '화면 위나 아래의 메뉴(··· 또는 공유 버튼)에서 "Safari로 열기"를 누르거나, 주소를 복사해 Safari에 붙여 넣어 주세요.',
  other: '주소를 복사해 평소 쓰는 브라우저에 붙여 넣어 주세요.',
};

interface Notice {
  kind: InAppBrowserKind;
  platform: MobilePlatform;
  url: string;
}

/**
 * 구글 로그인으로 가는 링크(route handler로 가는 전체 이동이라 next/link 대신 a). 구글은 앱 내 브라우저의 OAuth를 막으므로(0231)
 * 앱 내 브라우저에서 누르면 이동을 멈추고 외부 브라우저 안내를 엽니다. JS가 돌기 전이나 일반 브라우저에서는 그대로 `/auth/google`로 갑니다.
 * 안내의 주소는 기존 `returnTo`만 싣고 유입값은 싣지 않습니다(`packages/shared/src/signup-funnel.ts`).
 */
export function SignInLink({ returnTo, children }: { returnTo?: string; children: ReactNode }) {
  const href = CRELINK_WEB_PATHS.googleLogin(returnTo);
  const anchor = useRef<HTMLAnchorElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const userAgent = navigator.userAgent;
    sendSignupFunnelEvent(
      'signup_click',
      signupContextFromPage(location.search, document.referrer, location.hostname, userAgent),
    );
    const kind = detectInAppBrowser(userAgent);
    if (!kind) return;
    event.preventDefault();
    setNotice({ kind, platform: detectMobilePlatform(userAgent), url: new URL(href, location.origin).href });
  }

  return (
    <>
      <a ref={anchor} className="primary" href={href} onClick={handleClick}>
        {children}
      </a>
      {notice ? (
        <InAppBrowserNotice
          notice={notice}
          onDismiss={() => {
            setNotice(null);
            anchor.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/** 판별이 틀렸거나 외부로 나갈 수 없는 사람도 막히지 않도록 `그래도 계속`을 항상 둡니다. */
function InAppBrowserNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { kind, platform, url } = notice;
  return (
    <EditSheet title="외부 브라우저에서 열어 주세요" pending={false} onDismiss={onDismiss}>
      <div className="signin-notice">
        <p>{APP_NAMES[kind]} 안에서는 구글 로그인이 막힐 수 있어요. 외부 브라우저에서 이어서 진행해 주세요.</p>
        {platform === 'android' ? (
          <a className="primary" href={chromeIntentUrl(url)}>
            Chrome으로 열기
          </a>
        ) : (
          <p>{EXTERNAL_HELP[platform]}</p>
        )}
        <input className="input" readOnly aria-label="로그인 주소" value={url} />
        <div className="button-row">
          <CopyButton text={url} idleText="주소 복사" label="로그인 주소 복사" />
          <a className="secondary" href={url}>
            그래도 계속
          </a>
        </div>
      </div>
    </EditSheet>
  );
}
