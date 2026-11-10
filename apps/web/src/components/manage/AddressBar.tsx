'use client';

import { isPageOwner } from '../../lib/api/page-context';
import { CRELINK_LIMITS } from '@crelink/shared';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react';
import { formatDate, formatMonthDay } from '../../lib/format';
import {
  SLUG_CHANGED_NEXT_STEP,
  SLUG_CHANGED_NOTICE,
  SLUG_LOCK_LEAD,
  slugChangeHelp,
  slugCheckMessage,
  slugUrlPrefix,
} from '../../lib/slug-change';
import { useCopyResult } from '../../lib/use-copy-result';
import { ActionStatus } from '../ActionStatus';
import { CopyButton } from '../CopyButton';
import { CopyResultLine, lockIcon, openIcon, SlugChangeSummary } from './AddressParts';
import { EditSheet } from './EditSheet';
import { useManager } from './ManagerContext';
import { useSlugChange } from './use-slug-change';

/** 잠금 전체 문장(`slug_change_too_soon`)을 보여 주는 시간. */
const LOCK_NOTICE_MS = 4000;

type FocusTarget = 'input' | 'copy' | 'change' | 'confirm' | 'new-copy';

/**
 * 1024px 이상 무대의 주소 막대(design/manager-address-bar/handoff.md): 도메인 글자 · 저장된 주소가 채워진 입력란 · 복사 아이콘 · 공개 페이지 열기.
 * 값이 저장값과 다르면 복사·열기 대신 `취소`·`변경`을 두고, 저장은 `변경` → 확인 대화상자 두 단계입니다(저장하면 30일 동안 되돌릴 수 없음).
 * 30일 제한 중에는 입력란 대신 주소 글자와 다음 변경 가능일을 보여 줍니다. 막대 높이(60px)를 지키려고 상태 문장은 막대 아래에 겹쳐 띄웁니다.
 */
export function AddressBar() {
  const { state } = useManager();
  return isPageOwner(state.pageAccess) ? (
    <OwnerAddressBar />
  ) : (
    <div className="address-bar">
      <code className="url-text">{state.shortLink.url}</code>
      <CopyButton text={state.shortLink.url} />
      <a className="secondary" href={state.landing.url} target="_blank" rel="noopener">
        공개 페이지 열기
      </a>
    </div>
  );
}
function OwnerAddressBar() {
  const { state, firstRunGuide } = useManager();
  const { landing, shortLink } = state;
  const change = useSlugChange({ startsFromSaved: true });
  const copy = useCopyResult();
  const inputId = useId();
  const domainHintId = useId();
  const statusId = useId();
  const barRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const newCopyRef = useRef<HTMLButtonElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changed, setChanged] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusRequest, requestFocus] = useState<{ target: FocusTarget } | null>(null);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // 대화상자가 닫히거나 버튼이 사라진 뒤에야 옮길 수 있으므로 그 렌더가 끝난 뒤에 옮깁니다.
  useEffect(() => {
    if (!focusRequest) return;
    const targets = {
      input: inputRef,
      copy: copyRef,
      change: changeRef,
      confirm: confirmRef,
      'new-copy': newCopyRef,
    };
    targets[focusRequest.target].current?.focus();
  }, [focusRequest]);

  // 무대는 메뉴를 옮겨도 마운트가 유지되므로 메뉴 이동을 직접 보고 메시지를 닫습니다.
  const pathname = usePathname();
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    setChanged(false);
    setNotice(null);
    copy.clear();
  }

  const locked = shortLink.nextChangeAvailableAt !== null;
  const editing = !locked && change.edited;
  const prefix = slugUrlPrefix(shortLink.url, shortLink.slug);
  const canChange = change.check.kind === 'available';

  function onInput(raw: string) {
    change.onInput(raw);
    setNotice(null);
    if (copy.result === 'failed') copy.clear();
  }

  function onBlur(event: FocusEvent<HTMLInputElement>) {
    setFocused(false);
    // 빈 값은 초점이 막대 밖으로 나갈 때만 되돌립니다(막대 안 `취소`로 옮기는 중이면 그대로).
    const next = event.relatedTarget;
    if (change.value === '' && !(next instanceof Node && barRef.current?.contains(next))) change.reset();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && change.edited) {
      event.preventDefault();
      change.reset();
    }
  }

  function onKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    // Tab으로 들어오면 브라우저가 전체 선택합니다. 누른 글자 하나로 주소 전체가 지워지지 않게 커서를 끝으로 둡니다.
    if (event.key === 'Tab') event.currentTarget.setSelectionRange(change.value.length, change.value.length);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canChange) return;
    change.clearError();
    setConfirming(true);
  }

  function dismissConfirm() {
    setConfirming(false);
    requestFocus({ target: 'change' });
  }

  function cancel() {
    change.reset();
    requestFocus({ target: 'input' });
  }

  function closeMessage() {
    setChanged(false);
    copy.clear();
    requestFocus({ target: 'copy' });
  }

  async function confirm() {
    const outcome = await change.save();
    if (outcome.kind === 'ignored') return;
    if (outcome.kind === 'retry') {
      requestFocus({ target: 'confirm' });
      return;
    }
    setConfirming(false);
    if (outcome.kind === 'saved') {
      setChanged(true);
      copy.clear();
      requestFocus({ target: 'new-copy' });
    } else if (outcome.kind === 'unusable') {
      requestFocus({ target: 'input' });
    } else if (outcome.kind === 'locked') {
      const date = outcome.nextChangeAvailableAt ? ` ${formatDate(outcome.nextChangeAvailableAt)}` : '';
      setNotice(`${SLUG_LOCK_LEAD}${date}`);
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), LOCK_NOTICE_MS);
      requestFocus({ target: 'copy' });
    } else {
      setNotice(outcome.message);
      requestFocus({ target: 'input' });
    }
  }

  // 표시 우선순위는 저장 성공 > 복사 결과 > 입력 상태입니다. 입력 상태는 복사 결과가 떠 있는 동안 시각적으로만 숨깁니다.
  const inputStatusShown = !locked && (focused || editing);
  const statusShown = changed || notice !== null || (inputStatusShown && copy.result === null);
  const inputStatus = !changed && notice === null;
  const statusText = changed ? SLUG_CHANGED_NOTICE : (notice ?? (locked ? '' : slugCheckMessage(change.check)));
  const statusClass = changed ? 'check-available' : inputStatus ? `check-${change.check.kind}` : undefined;
  const helpShown = statusShown && inputStatus && !locked && focused;
  const retryShown = statusShown && inputStatus && !locked && change.check.kind === 'error';
  const closable = changed || copy.result === 'failed';
  const messageShown = statusShown || copy.result !== null;
  const messageClass = ['address-message', messageShown ? '' : 'is-empty', closable || retryShown ? '' : 'is-passive']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <form ref={barRef} className="address-bar" onSubmit={onSubmit} noValidate>
        {locked ? (
          <code className="url-text">{shortLink.url.replace(/^https?:\/\//, '')}</code>
        ) : (
          <>
            <span className="url-text address-domain" aria-hidden="true">
              {prefix}
            </span>
            <label className="visually-hidden" htmlFor={inputId}>
              내 크리링 주소
            </label>
            <span id={domainHintId} className="visually-hidden">
              {prefix} 뒤에 붙는 부분이에요.
            </span>
            <input
              ref={inputRef}
              id={inputId}
              className="input address-input"
              value={change.value}
              onChange={(event) => onInput(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              maxLength={CRELINK_LIMITS.slugMaxLength}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={`${domainHintId} ${statusId}`}
              aria-invalid={change.check.kind === 'unavailable' || undefined}
            />
          </>
        )}
        {editing ? null : (
          <CopyButton
            icon
            text={shortLink.url}
            label="내 크리링 링크 복사"
            onCopied={firstRunGuide.recordCopy}
            onResult={copy.report}
            buttonRef={copyRef}
          />
        )}
        <div className="address-actions">
          {editing ? (
            <>
              {/* 누르는 동안 입력란 초점을 지켜 빈 값 되돌림으로 `취소`가 먼저 사라지지 않게 합니다(Safari는 버튼에 초점을 주지 않음). */}
              <button
                type="button"
                className="secondary"
                onPointerDown={(event) => event.preventDefault()}
                onClick={cancel}
              >
                취소
              </button>
              <button ref={changeRef} type="submit" className="secondary" disabled={!canChange}>
                <span className="visually-hidden">주소 </span>변경
              </button>
            </>
          ) : (
            <>
              {locked ? (
                <span className="address-lock">
                  {lockIcon}
                  <span>
                    <span className="visually-hidden">주소 변경 잠김. </span>
                    {formatMonthDay(shortLink.nextChangeAvailableAt!)}부터
                    <span className="address-lock-tail"> 변경 가능</span>
                  </span>
                </span>
              ) : null}
              <a className="secondary address-open" href={landing.url} target="_blank" rel="noopener">
                {openIcon}
                <span className="address-open-text">공개 페이지 열기</span>
                <span className="visually-hidden"> (새 창)</span>
              </a>
            </>
          )}
        </div>
        <div className={messageClass}>
          <p id={statusId} className={statusShown ? statusClass : 'visually-hidden'} aria-live="polite">
            {statusText}
          </p>
          {/* 둘째 줄보다 위에 둡니다. 누르는 순간 입력란 초점이 나가 둘째 줄이 사라져도 버튼이 움직이지 않아야 클릭이 맞습니다. */}
          {retryShown ? (
            <button type="button" className="address-text-button" onClick={change.retryCheck}>
              다시 확인
            </button>
          ) : null}
          {helpShown ? <p>{slugChangeHelp(shortLink.isAutoSlug)}</p> : null}
          {changed ? <p>{SLUG_CHANGED_NEXT_STEP}</p> : null}
          <CopyResultLine result={copy.result} url={shortLink.url} />
          {closable ? (
            <div className="address-message-actions">
              {changed ? (
                <CopyButton
                  text={shortLink.url}
                  idleText="새 주소 복사"
                  onCopied={firstRunGuide.recordCopy}
                  onResult={copy.report}
                  buttonRef={newCopyRef}
                />
              ) : null}
              <button type="button" className="secondary" onClick={closeMessage}>
                닫기
              </button>
            </div>
          ) : null}
        </div>
      </form>
      {confirming && change.check.kind === 'available' ? (
        <EditSheet
          title="주소를 바꿀까요?"
          pending={change.pending}
          onDismiss={dismissConfirm}
          className="centered-sheet"
        >
          <div className="form-stack">
            <SlugChangeSummary current={`${prefix}${shortLink.slug}`} next={`${prefix}${change.check.slug}`} />
            <ActionStatus error={change.error} />
            <div className="form-actions edit-form-actions">
              {/* 첫 초점을 `취소`에 둬 입력란에서 Enter를 두 번 눌러도 저장되지 않게 합니다. */}
              <button
                type="button"
                className="secondary"
                data-autofocus
                disabled={change.pending}
                onClick={dismissConfirm}
              >
                취소
              </button>
              <button ref={confirmRef} type="button" className="primary" disabled={change.pending} onClick={confirm}>
                {change.pending ? '바꾸는 중…' : '이 주소로 바꾸기'}
              </button>
            </div>
          </div>
        </EditSheet>
      ) : null}
    </>
  );
}
