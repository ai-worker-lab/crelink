'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  type ChangeSlugRequest,
  type CreatorLandingState,
  type SlugAvailabilityResponse,
  type SlugUnavailableReason,
} from '@crelink/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browserApi, describeError } from '../../lib/api/browser';
import { formatDate } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { CopyButton } from '../CopyButton';
import { useManager } from '../manage/ManagerContext';

const UNAVAILABLE_MESSAGES: Record<SlugUnavailableReason, string> = {
  slug_invalid: `영소문자·숫자·하이픈(-) ${CRELINK_LIMITS.slugMinLength}~${CRELINK_LIMITS.slugMaxLength}자로, 처음과 끝은 영소문자나 숫자여야 해요.`,
  slug_reserved: '크리링이 쓰는 예약 주소라 쓸 수 없어요.',
  slug_taken: '이미 사용 중이거나 다른 크리에이터를 위해 보관 중인 주소예요.',
  same_as_current: '지금 쓰는 주소와 같아요.',
};

type Check =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; slug: string }
  | { kind: 'unavailable'; reason: SlugUnavailableReason }
  | { kind: 'error'; message: string };

/** 입력이 바뀐 뒤 이만큼 멈추면 사용 가능 여부를 묻습니다. */
const CHECK_DELAY_MS = 400;

/** `주소 설정`의 내 크리링 링크(단축 주소)와 복사. 공유용 주소는 단축 주소만 보여 줍니다(PRD R7). */
export function ShortLinkSection() {
  const headingId = useId();
  const { state, firstRunGuide } = useManager();
  const { shortLink } = state;
  return (
    <section className="card" aria-labelledby={headingId}>
      <h2 id={headingId}>내 크리링 링크</h2>
      <p className="section-help">인스타그램 프로필 편집 &gt; 링크에 이 주소를 붙여 넣으세요.</p>
      <div className="copy-row">
        <code className="url-text">{shortLink.url}</code>
        <CopyButton text={shortLink.url} label="내 크리링 링크 복사" onCopied={firstRunGuide.recordCopy} />
      </div>
    </section>
  );
}

/**
 * `주소 설정`의 주소 바꾸기(PRD R8): 입력이 멈추면 사용 가능 여부 확인, 예약어·형식은 브라우저에서 먼저 거름,
 * 자동 발급 주소는 바로 바꿀 수 있고 그 뒤로는 30일에 한 번. 머리 카드 `주소 변경`으로 들어오면 새 주소 입력에 초점을 둡니다
 * (30일 제한으로 입력이 잠겨 있으면 이 구역 제목으로).
 */
export function SlugSection() {
  const { state, setState, slugFocusRequest, takeSlugFocus } = useManager();
  const { shortLink } = state;
  const inputId = useId();
  const statusId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState('');
  const [check, setCheck] = useState<Check>({ kind: 'idle' });
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef('');
  const { pending, error, notice, run } = useAction();
  const locked = shortLink.nextChangeAvailableAt !== null;
  // 주소 앞부분(단축 도메인). 입력란 앞에 붙여 보여 줍니다.
  const prefix = shortLink.url.slice(0, shortLink.url.length - shortLink.slug.length).replace(/^https?:\/\//, '');

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!takeSlugFocus()) return;
    if (inputRef.current && !inputRef.current.disabled) inputRef.current.focus();
    else headingRef.current?.focus();
  }, [slugFocusRequest, takeSlugFocus]);

  function localReason(value: string): SlugUnavailableReason | null {
    if (
      value.length < CRELINK_LIMITS.slugMinLength ||
      value.length > CRELINK_LIMITS.slugMaxLength ||
      !SLUG_PATTERN.test(value)
    )
      return 'slug_invalid';
    if (RESERVED_SLUGS.includes(value)) return 'slug_reserved';
    if (value === shortLink.slug) return 'same_as_current';
    return null;
  }

  function onInput(raw: string) {
    const value = raw.trim().toLowerCase();
    setSlug(value);
    latest.current = value;
    window.clearTimeout(timer.current);
    if (!value) {
      setCheck({ kind: 'idle' });
      return;
    }
    const reason = localReason(value);
    if (reason) {
      setCheck({ kind: 'unavailable', reason });
      return;
    }
    setCheck({ kind: 'checking' });
    timer.current = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ slug: value });
        const result = await browserApi<SlugAvailabilityResponse>(`${CRELINK_API_PATHS.meSlugAvailability}?${query}`);
        if (latest.current !== value) return;
        setCheck(
          result.available
            ? { kind: 'available', slug: value }
            : { kind: 'unavailable', reason: result.reason ?? 'slug_taken' },
        );
      } catch (caught) {
        if (latest.current === value) setCheck({ kind: 'error', message: describeError(caught) });
      }
    }, CHECK_DELAY_MS);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (check.kind !== 'available') return;
    const payload: ChangeSlugRequest = { slug: check.slug };
    const changed = await run(async () => {
      setState(
        await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meSlug, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }),
      );
    }, `주소를 바꿨어요. 옛 주소도 ${CRELINK_LIMITS.retiredSlugGraceDays}일 동안 새 주소로 연결돼요.`);
    if (changed) {
      setSlug('');
      latest.current = '';
      setCheck({ kind: 'idle' });
    }
  }

  return (
    <section className="card" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} ref={headingRef} tabIndex={-1}>
        주소 바꾸기
      </h2>
      {locked ? (
        <p className="notice-box">
          주소는 {CRELINK_LIMITS.slugChangeIntervalDays}일에 한 번 바꿀 수 있어요. 다음 변경 가능일:{' '}
          <strong>{formatDate(shortLink.nextChangeAvailableAt!)}</strong>
        </p>
      ) : (
        <p className="section-help">
          {shortLink.isAutoSlug
            ? `자동 발급 주소는 지금 바로 바꿀 수 있어요. 그 뒤로는 ${CRELINK_LIMITS.slugChangeIntervalDays}일에 한 번 바꿀 수 있어요.`
            : `지금 바꿀 수 있어요. 바꾸면 ${CRELINK_LIMITS.slugChangeIntervalDays}일 동안 다시 바꿀 수 없어요.`}
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
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
              value={slug}
              onChange={(event) => onInput(event.target.value)}
              disabled={locked || pending}
              maxLength={CRELINK_LIMITS.slugMaxLength}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={shortLink.slug}
              aria-describedby={statusId}
              aria-invalid={check.kind === 'unavailable' || undefined}
            />
          </div>
          <p id={statusId} className={`field-help check-${check.kind}`} aria-live="polite">
            {check.kind === 'checking'
              ? '사용할 수 있는지 확인하는 중…'
              : check.kind === 'available'
                ? '사용할 수 있는 주소예요.'
                : check.kind === 'unavailable'
                  ? UNAVAILABLE_MESSAGES[check.reason]
                  : check.kind === 'error'
                    ? check.message
                    : `영소문자·숫자·하이픈(-) ${CRELINK_LIMITS.slugMinLength}~${CRELINK_LIMITS.slugMaxLength}자`}
          </p>
        </div>
        <div className="form-actions">
          <button type="submit" className="secondary" disabled={locked || pending || check.kind !== 'available'}>
            {pending ? '바꾸는 중…' : '주소 바꾸기'}
          </button>
        </div>
        <ActionStatus error={error} notice={notice} />
      </form>
    </section>
  );
}
