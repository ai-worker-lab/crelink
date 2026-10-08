'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useRef } from 'react';
import { SENTRY_DSN } from '../lib/monitoring';

/**
 * 의견 보내기(Sentry User Feedback) 설정. 이름·이메일 칸은 없고(`useSentryUser`도 비워 숨은 값으로도 보내지 않음), 스크린숏은 사용자가 직접 고를 때만 붙습니다.
 * 창 색·글꼴은 `src/styles.css`의 `#sentry-feedback` 규칙이 디자인 토큰으로 정합니다.
 */
function createFeedbackIntegration() {
  return Sentry.feedbackIntegration({
    autoInject: false,
    showBranding: false,
    showName: false,
    showEmail: false,
    isNameRequired: false,
    isEmailRequired: false,
    useSentryUser: { email: '', name: '' },
    enableScreenshot: true,
    colorScheme: 'light',
    triggerLabel: '의견 보내기',
    triggerAriaLabel: '의견 보내기',
    formTitle: '의견 보내기',
    nameLabel: '이름',
    namePlaceholder: '이름',
    emailLabel: '이메일',
    emailPlaceholder: '이메일',
    messageLabel: '내용',
    messagePlaceholder: '불편한 점이나 바라는 점을 적어 주세요. 오류였다면 무엇을 하다가 생겼는지 알려 주세요.',
    isRequiredLabel: '(필수)',
    addScreenshotButtonLabel: '화면 캡처 첨부',
    removeScreenshotButtonLabel: '화면 캡처 빼기',
    highlightToolText: '강조',
    hideToolText: '가리기',
    removeHighlightText: '지우기',
    confirmButtonLabel: '확인',
    cancelButtonLabel: '취소',
    submitButtonLabel: '보내기',
    successMessageText: '의견을 보냈어요. 고마워요!',
    errorEmptyMessageText: '내용을 적어 주세요.',
    errorNoClientText: '지금은 의견을 보낼 수 없어요.',
    errorTimeoutText: '보내는 데 시간이 너무 걸려요. 잠시 뒤 다시 보내 주세요.',
    errorForbiddenText: '이 주소에서는 의견을 보낼 수 없어요.',
    errorGenericText: '의견을 보내지 못했어요. 광고·추적 차단 기능이 막았을 수 있어요. 잠시 뒤 다시 보내 주세요.',
  });
}

/**
 * 로그인 화면(`/me`·`/admin`) 오른쪽 아래에 떠 있는 `의견 보내기` 버튼. 누르면 Sentry 의견 창을 엽니다. 머리글이 아니라 화면 틀 맨 끝에 둡니다.
 * 1023px 이하는 이름 있는 아이콘 버튼입니다(`styles.css`의 `.feedback-fab`). 대화상자·하단 시트는 최상위 층이라 이 버튼을 덮습니다.
 * Sentry가 꺼진 빌드(`NEXT_PUBLIC_SENTRY_DSN` 없음)에서는 그리지 않습니다. 의견 통합은 이 버튼이 처음 그려질 때 붙여 공개 화면 번들에는 들어가지 않습니다.
 */
export function FeedbackButton() {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!button.current || !Sentry.getClient()) return;
    let feedback = Sentry.getFeedback();
    if (!feedback) {
      const integration = createFeedbackIntegration();
      Sentry.addIntegration(integration);
      feedback = integration;
    }
    return feedback.attachTo(button.current);
  }, []);

  if (!SENTRY_DSN) return null;
  return (
    <button ref={button} type="button" className="feedback-fab" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path
          d="M5 5h14v10H9l-4 4V5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="feedback-fab-label">의견 보내기</span>
    </button>
  );
}
