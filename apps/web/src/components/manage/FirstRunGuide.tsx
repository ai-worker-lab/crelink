'use client';

import { useEffect, useId, useRef, type MouseEvent } from 'react';
import type { FirstRunStep } from '../../lib/first-run-guide';
import { CopyButton } from '../CopyButton';
import { useManager } from './ManagerContext';

const checkIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path
      d="m5 12.5 4.5 4.5L19 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const closeIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const infoIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 11v6M12 7.5v.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** 단계 행 모양: 마친 단계(초록 체크), 현재 단계(짙은 테두리·흰 숫자 원), 아직(숫자). */
function stepClass(done: boolean, current: boolean) {
  return `guide-step${done ? ' is-done' : current ? ' is-current' : ''}`;
}

function StepMark({ step, done }: { step: FirstRunStep; done: boolean }) {
  // 순서는 `<ol>`이, 완료는 단계 안 글자가 전하므로 표시 원은 장식입니다.
  return (
    <span className="guide-mark" aria-hidden="true">
      {done ? checkIcon : step}
    </span>
  );
}

/**
 * `페이지 편집` 시작 안내 카드(design/first-run-guide/handoff.md, 상태 A~D). 1024px 이상은 처음 패널 제목 아래,
 * 1023px 이하는 `편집` 모드 sticky 줄 아래에 둡니다(`firstRunGuidePlacement`). 미리보기 안에는 그리지 않습니다.
 * `onClosed`는 카드를 닫은 뒤 초점을 옮깁니다(넓은 화면은 패널 제목, 좁은 화면은 sticky 줄 `복사`).
 */
export function FirstRunGuide({ onClosed }: { onClosed: () => void }) {
  const { state, select, formPending, firstRunGuide } = useManager();
  const { view, notice, recordCopy, confirmInstagram, dismiss } = firstRunGuide;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusClose = useRef(false);
  const finished = view?.kind === 'finished';
  // `붙여 넣었어요`를 누르면 그 버튼이 사라지므로 완료 카드의 `닫기`로 초점을 옮깁니다.
  useEffect(() => {
    if (finished && focusClose.current) {
      focusClose.current = false;
      closeRef.current?.focus();
    }
  }, [finished]);

  if (!view) return null;

  function close() {
    dismiss();
    onClosed();
  }

  const closeButton = (
    <button type="button" className="icon-button guide-close" aria-label="시작 안내 닫기" onClick={close}>
      {closeIcon}
    </button>
  );

  if (view.kind === 'finished') {
    return (
      <section className="first-run-guide is-finished" aria-labelledby={titleId}>
        <div className="guide-head">
          <div className="guide-head-text">
            <h2 id={titleId} className="guide-title">
              <span className="guide-mark is-done" aria-hidden="true">
                {checkIcon}
              </span>
              준비를 마쳤어요
            </h2>
            <p role="status">이제 인스타그램 프로필에서 내 크리링으로 들어올 수 있어요. 링크를 더 채워 보세요.</p>
          </div>
          {closeButton}
        </div>
        <div className="guide-foot">
          <span>3/3 완료</span>
          <button ref={closeRef} type="button" className="secondary" onClick={close}>
            닫기
          </button>
        </div>
      </section>
    );
  }

  const { current, added, copied, confirmed, doneCount, visibleCount } = view;
  const shortUrl = state.shortLink.url;
  const shownUrl = shortUrl.replace(/^https?:\/\//, '');

  function add(event: MouseEvent<HTMLButtonElement>, kind: 'link' | 'portfolio-item') {
    // 미리보기 `+ 링크 추가`·`+ 포트폴리오 추가`와 같은 동작(넓은 화면은 패널 폼, 좁은 화면은 하단 시트).
    if (!formPending) select({ kind, id: null }, event.currentTarget);
  }

  return (
    <section className="first-run-guide" aria-labelledby={titleId}>
      <div className="guide-head">
        <div className="guide-head-text">
          <h2 id={titleId} className="guide-title">
            인스타그램에 내 크리링 걸기
          </h2>
          <p>세 단계를 마치면 팔로워가 내 페이지를 볼 수 있어요.</p>
        </div>
        {closeButton}
      </div>
      <div className="guide-progress">
        <span>{doneCount}/3 완료</span>
        <span className="guide-bar" aria-hidden="true">
          {[added, copied, confirmed].map((done, index) => (
            <i key={index} className={done ? 'is-on' : undefined} />
          ))}
        </span>
      </div>
      <ol className="guide-steps">
        <li className={stepClass(added, current === 1)} aria-current={current === 1 ? 'step' : undefined}>
          <StepMark step={1} done={added} />
          <div className="guide-step-body">
            <p className="guide-step-title">링크나 포트폴리오 1개 추가하기</p>
            {added ? (
              <p className="guide-step-state">완료 · 방문자에게 {visibleCount}개가 보여요</p>
            ) : (
              <>
                <p className="guide-step-desc">지금은 방문자에게 ‘아직 준비 중인 페이지예요.’만 보여요.</p>
                <div className="guide-actions">
                  <button type="button" className="primary" onClick={(event) => add(event, 'link')}>
                    링크 추가
                  </button>
                  <button type="button" className="secondary" onClick={(event) => add(event, 'portfolio-item')}>
                    포트폴리오 추가
                  </button>
                </div>
              </>
            )}
          </div>
        </li>
        <li className={stepClass(copied, current === 2)} aria-current={current === 2 ? 'step' : undefined}>
          <StepMark step={2} done={copied} />
          <div className="guide-step-body">
            <p className="guide-step-title">내 크리링 링크 복사하기</p>
            {copied ? <p className="guide-step-state">복사했어요 · {shownUrl}</p> : null}
            {current === 2 ? <p className="guide-step-desc">인스타그램에는 이 짧은 주소를 넣어요.</p> : null}
            {/* 복사 뒤에도 같은 버튼(`다시 복사`)이 남아 초점을 잃지 않습니다. */}
            <div className="guide-actions">
              {copied ? null : <code className="guide-url">{shownUrl}</code>}
              <CopyButton
                text={shortUrl}
                idleText={copied ? '다시 복사' : '복사'}
                primary={current === 2}
                onCopied={recordCopy}
              />
            </div>
          </div>
        </li>
        <li className={stepClass(confirmed, current === 3)} aria-current={current === 3 ? 'step' : undefined}>
          <StepMark step={3} done={confirmed} />
          <div className="guide-step-body">
            <p className="guide-step-title">인스타그램 프로필에 붙여 넣기</p>
            {confirmed ? (
              <p className="guide-step-state">붙여 넣었어요</p>
            ) : current === 3 ? (
              <>
                <ol className="guide-howto">
                  <li>인스타그램 앱에서 내 프로필 &gt; 프로필 편집을 열어요.</li>
                  <li>링크 &gt; 외부 링크 추가에 복사한 주소를 붙여 넣어요.</li>
                  <li>저장한 뒤 아래 버튼을 눌러요.</li>
                </ol>
                <p className="guide-notice">
                  {infoIcon}
                  <span>크리링은 인스타그램 계정에 접속하거나 링크를 대신 등록하지 않아요. 직접 붙여 넣어 주세요.</span>
                </p>
                <div className="guide-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      focusClose.current = true;
                      confirmInstagram();
                    }}
                  >
                    붙여 넣었어요
                  </button>
                </div>
              </>
            ) : (
              <p className="guide-step-desc">인스타그램 앱에서 프로필 편집 &gt; 링크에 복사한 주소를 붙여 넣어요.</p>
            )}
          </div>
        </li>
      </ol>
      <p className="guide-status" role="status">
        {notice ? (
          <>
            {checkIcon}
            {notice}
          </>
        ) : null}
      </p>
    </section>
  );
}
