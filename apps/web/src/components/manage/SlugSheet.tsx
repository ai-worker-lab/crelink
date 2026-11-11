'use client';

import { CRELINK_LIMITS } from '@crelink/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { formatDate } from '../../lib/format';
import {
  SLUG_CHANGED_NEXT_STEP,
  SLUG_CHANGED_NOTICE,
  SLUG_LOCK_LEAD,
  slugChangeHelp,
  slugCheckMessage,
  slugUrlPrefix,
} from '../../lib/slug-change';
import { ActionStatus } from '../ActionStatus';
import { CopyButton } from '../CopyButton';
import { SlugChangeSummary } from './AddressParts';
import { EditSheet } from './EditSheet';
import { useManager } from './ManagerContext';
import { useSlugChange } from './use-slug-change';

type Step = 'input' | 'confirm' | 'done' | 'locked';

/**
 * 1023px 이하 주소 변경 하단 시트(design/manager-address-bar/handoff.md `1023px 이하`). 지금 주소·복사 + 새 주소 입력 → 같은 시트의 확인 단계 → 저장.
 * 잠겨 있으면 다음 변경 가능일을 보여 줍니다. 저장하면 30일 잠기므로 두 번 입력으로 저장되지 않게 단계마다 DOM을 나누고(`key`) 초점은 `뒤로`에 둡니다.
 * 확인 단계의 맨 아래 줄(`뒤로`)은 입력 단계의 버튼 줄과 같은 높이여서 `주소 바꾸기`를 한 번 더 눌러도 `뒤로`가 눌립니다.
 */
export function SlugSheet({ onClose }: { onClose: () => void }) {
  const { state, firstRunGuide } = useManager();
  const { shortLink } = state;
  const change = useSlugChange({ startsFromSaved: false });
  const inputId = useId();
  const statusId = useId();
  const [step, setStep] = useState<Step>(shortLink.nextChangeAvailableAt ? 'locked' : 'input');
  const [retryFailed, setRetryFailed] = useState(0);
  const seenStep = useRef(step);
  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const newCopyRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  // `EditSheet`의 `data-autofocus`는 마운트 때 한 번만 실행되므로 단계가 바뀔 때의 초점은 여기서 옮깁니다.
  useEffect(() => {
    if (seenStep.current === step) return;
    seenStep.current = step;
    const target = { input: inputRef, confirm: backRef, done: newCopyRef, locked: noticeRef }[step];
    target.current?.focus();
  }, [step]);

  useEffect(() => {
    if (retryFailed > 0) confirmRef.current?.focus();
  }, [retryFailed]);

  const prefix = slugUrlPrefix(shortLink.url, shortLink.slug);
  const canChange = change.check.kind === 'available';

  function toConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canChange) return;
    change.clearError();
    setStep('confirm');
  }

  async function confirm() {
    const outcome = await change.save();
    if (outcome.kind === 'saved') setStep('done');
    else if (outcome.kind === 'unusable') setStep('input');
    else if (outcome.kind === 'locked') setStep('locked');
    else if (outcome.kind !== 'ignored') setRetryFailed((count) => count + 1);
  }

  const currentLink = (
    <div className="form-stack slug-sheet-link">
      <h3>내 크리링 링크</h3>
      <div className="copy-row">
        <code className="url-text">{shortLink.url}</code>
        <CopyButton text={shortLink.url} label="내 크리링 링크 복사" onCopied={firstRunGuide.recordCopy} />
      </div>
      <p className="section-help">인스타그램 프로필 편집 &gt; 링크에 이 주소를 붙여 넣으세요.</p>
    </div>
  );

  return (
    <EditSheet title="주소 변경" pending={change.pending} onDismiss={onClose}>
      {/* 단계가 바뀌어도 남아 있어야 낭독됩니다. */}
      <p className="visually-hidden" aria-live="polite">
        {step === 'done' ? SLUG_CHANGED_NOTICE : ''}
      </p>
      {step === 'input' ? (
        <div key="input" className="form-stack">
          {currentLink}
          <form className="form-stack" onSubmit={toConfirm} noValidate>
            <div className="field">
              <label htmlFor={inputId}>새 주소</label>
              <div className="slug-input">
                <span className="url-text slug-prefix" aria-hidden="true">
                  {prefix}
                </span>
                <input
                  ref={inputRef}
                  id={inputId}
                  className="input"
                  data-autofocus
                  value={change.value}
                  onChange={(event) => change.onInput(event.target.value)}
                  maxLength={CRELINK_LIMITS.slugMaxLength}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={shortLink.slug}
                  aria-describedby={statusId}
                  aria-invalid={change.check.kind === 'unavailable' || undefined}
                />
              </div>
              <p id={statusId} className={`field-help check-${change.check.kind}`} aria-live="polite">
                {slugCheckMessage(change.check)}
              </p>
              {change.check.kind === 'error' ? (
                <button type="button" className="address-text-button" onClick={change.retryCheck}>
                  다시 확인
                </button>
              ) : null}
              <p className="field-help">{slugChangeHelp(shortLink.isAutoSlug)}</p>
            </div>
            <div className="form-actions edit-form-actions">
              <button type="button" className="secondary" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="secondary" disabled={!canChange}>
                주소 바꾸기
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {step === 'confirm' && change.check.kind === 'available' ? (
        <div key="confirm" className="form-stack">
          <SlugChangeSummary current={`${prefix}${shortLink.slug}`} next={`${prefix}${change.check.slug}`} />
          <ActionStatus error={change.error} />
          <div className="form-actions edit-form-actions is-stacked">
            <button ref={confirmRef} type="button" className="primary" disabled={change.pending} onClick={confirm}>
              {change.pending ? '바꾸는 중…' : '이 주소로 바꾸기'}
            </button>
            <button
              ref={backRef}
              type="button"
              className="secondary"
              disabled={change.pending}
              onClick={() => setStep('input')}
            >
              뒤로
            </button>
          </div>
        </div>
      ) : null}
      {step === 'done' ? (
        <div key="done" className="form-stack">
          <p className="form-success">{SLUG_CHANGED_NOTICE}</p>
          <p className="section-help">{SLUG_CHANGED_NEXT_STEP}</p>
          <div className="copy-row">
            <code className="url-text">{shortLink.url}</code>
            <CopyButton
              text={shortLink.url}
              idleText="새 주소 복사"
              onCopied={firstRunGuide.recordCopy}
              buttonRef={newCopyRef}
            />
          </div>
          <div className="form-actions edit-form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
      {step === 'locked' ? (
        <div key="locked" className="form-stack">
          {currentLink}
          <p ref={noticeRef} className="notice-box" tabIndex={-1}>
            {SLUG_LOCK_LEAD}{' '}
            <strong>{shortLink.nextChangeAvailableAt ? formatDate(shortLink.nextChangeAvailableAt) : ''}</strong>
          </p>
          <div className="field">
            <label htmlFor={inputId}>새 주소</label>
            <div className="slug-input">
              <span className="url-text slug-prefix" aria-hidden="true">
                {prefix}
              </span>
              <input id={inputId} className="input" disabled placeholder={shortLink.slug} />
            </div>
          </div>
          <div className="form-actions edit-form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </EditSheet>
  );
}
