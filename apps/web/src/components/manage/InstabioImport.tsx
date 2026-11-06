'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type InstabioImportPreview,
  type InstabioImportRequest,
  type InstabioImportResult,
} from '@crelink/shared';
import { useId, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import { isProfileDirty, profileDraftOf } from '../../lib/landing-preview';
import type { ActionState } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { RemoteImage } from '../RemoteImage';
import { useManager } from './ManagerContext';

export interface InstabioImportDraft {
  url: string;
  setUrl: Dispatch<SetStateAction<string>>;
  preview: InstabioImportPreview | null;
  setPreview: Dispatch<SetStateAction<InstabioImportPreview | null>>;
  titles: Record<string, string>;
  setTitles: Dispatch<SetStateAction<Record<string, string>>>;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  replaceProfile: boolean;
  setReplaceProfile: Dispatch<SetStateAction<boolean>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

/** 패널/하단 시트가 교체돼도 남도록 PageEditor에서 소유하는 가져오기 초안입니다. */
export function useInstabioImportDraft(): InstabioImportDraft {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<InstabioImportPreview | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [replaceProfile, setReplaceProfile] = useState(false);
  const [open, setOpen] = useState(false);
  return {
    url,
    setUrl,
    preview,
    setPreview,
    titles,
    setTitles,
    selected,
    setSelected,
    replaceProfile,
    setReplaceProfile,
    open,
    setOpen,
  };
}

export function InstabioImport({ action, draft }: { action: ActionState; draft: InstabioImportDraft }) {
  const { state, setState, setProfile, reload, dirty } = useManager();
  const {
    url,
    setUrl,
    preview,
    setPreview,
    titles,
    setTitles,
    selected,
    setSelected,
    replaceProfile,
    setReplaceProfile,
    open,
    setOpen,
  } = draft;
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const id = useId();
  const { pending, error, notice, run, setNotice } = action;
  const remaining = state.limits.totalMax - state.limits.totalUsed;
  const existing = new Set(state.links.map((link) => link.url));
  const count = new Set(
    preview?.links.filter((link) => selected.includes(link.id) && !existing.has(link.url)).map((link) => link.url),
  ).size;
  const profileFits =
    !preview ||
    ((preview.profile.displayName?.length ?? 0) <= CRELINK_LIMITS.displayNameMax &&
      (preview.profile.bio?.length ?? 0) <= CRELINK_LIMITS.bioMax);

  async function read(event: FormEvent) {
    event.preventDefault();
    setPreview(null);
    await run(async () => {
      const next = await browserApi<InstabioImportPreview>(CRELINK_API_PATHS.meInstabioPreview, {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      setPreview(next);
      setTitles(
        Object.fromEntries(next.links.map((link) => [link.id, link.title.slice(0, CRELINK_LIMITS.linkTitleMax)])),
      );
      const seen = new Set(existing);
      setSelected(
        next.links
          .filter((link) => {
            if (seen.has(link.url)) return false;
            seen.add(link.url);
            return true;
          })
          .map((link) => link.id),
      );
      setReplaceProfile(false);
      requestAnimationFrame(() => heading.current?.focus());
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preview) return;
    await run(async () => {
      const payload: InstabioImportRequest = {
        url: preview.sourceUrl,
        fingerprint: preview.fingerprint,
        links: selected.map((key) => ({ id: key, title: titles[key] })),
        replaceProfile: replaceProfile && !dirty.profile,
        expectedProfile: {
          displayName: state.landing.displayName,
          bio: state.landing.bio,
          avatarFileId: state.landing.avatar?.fileId ?? null,
        },
      };
      let result: InstabioImportResult;
      try {
        result = await browserApi<InstabioImportResult>(CRELINK_API_PATHS.meInstabioImport, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (caught) {
        if (caught instanceof BrowserApiError && caught.code === 'import_source_changed') setPreview(null);
        throw caught;
      }
      setState((current) => {
        const added = result.links.filter((link) => !current.links.some((old) => old.id === link.id));
        return {
          ...current,
          links: [...current.links, ...added],
          limits: { ...current.limits, totalUsed: current.limits.totalUsed + added.length },
          landing: { ...current.landing, ...result.profile },
        };
      });
      if (result.profile)
        setProfile((current) =>
          isProfileDirty(state.landing, current) ? current : profileDraftOf({ ...state.landing, ...result.profile }),
        );
      setPreview(null);
      const message = `${result.links.length}개를 추가했어요.${result.skipped ? ` 같은 URL ${result.skipped}개는 건너뛰었어요.` : ''}${result.profile ? ' 프로필도 옮겼어요.' : ''}`;
      // 저장은 이미 확정됐으므로 뒤의 재조회 실패를 저장 실패로 알리지 않습니다.
      await reload().then(
        () => setNotice(message),
        () => setNotice(`${message} 최신 목록은 새로 고침해서 확인해 주세요.`),
      );
    });
    requestAnimationFrame(() => status.current?.focus());
  }

  return (
    <details className="instabio-import" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        Instabio에서 가져오기
      </summary>
      <div className="form-stack">
        <p className="section-help">
          직접 관리하는 공개 페이지를 가져오세요. 기존 링크 뒤에 추가하며, 같은 URL은 건너뛰어요. 저장하면 방문자에게
          바로 보여요.
        </p>
        <form className="form-stack" onSubmit={read}>
          <div className="field">
            <label htmlFor={`${id}-url`}>Instabio 페이지 주소</label>
            <input
              id={`${id}-url`}
              className="input"
              type="url"
              required
              maxLength={CRELINK_LIMITS.urlMax}
              placeholder="https://instabio.cc/페이지ID"
              value={url}
              disabled={pending}
              onChange={(event) => {
                setUrl(event.target.value);
                setPreview(null);
                action.setError(null);
                action.setNotice(null);
              }}
            />
          </div>
          <button type="submit" className="secondary" disabled={pending}>
            {pending ? '처리 중…' : '미리보기'}
          </button>
        </form>
        <div ref={status} tabIndex={-1}>
          <ActionStatus error={error} notice={notice} />
        </div>
        {preview ? (
          <form className="form-stack" onSubmit={save}>
            <h3 ref={heading} tabIndex={-1}>
              가져오기 미리보기 · {preview.links.length}개
            </h3>
            <div className="instabio-profile">
              {preview.profile.avatarUrl ? (
                <RemoteImage
                  src={preview.profile.avatarUrl}
                  alt="원본 프로필 사진"
                  width={56}
                  height={56}
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <strong>{preview.profile.displayName || '이름 없음'}</strong>
              <p>{preview.profile.bio || '소개 없음'}</p>
            </div>
            <p className="field-help">제휴·광고 고지가 소개에 있다면 함께 옮기거나 기존 소개에 고지를 반영해 주세요.</p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={replaceProfile && !dirty.profile}
                disabled={pending || dirty.profile || !profileFits}
                onChange={(event) => setReplaceProfile(event.target.checked)}
              />
              현재 프로필 이름·소개·사진을 원본으로 교체
            </label>
            {dirty.profile ? (
              <p className="notice-box">편집 중인 프로필을 먼저 저장하거나 취소하면 프로필도 옮길 수 있어요.</p>
            ) : !profileFits ? (
              <p className="notice-box">
                이름40자·소개300자를 넘는 프로필은 자동 교체할 수 없어요. 링크를 가져온 뒤 프로필에서 직접 옮겨 주세요.
              </p>
            ) : null}
            {preview.warnings.length ? (
              <ul className="notice-box">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {preview.links.some((link) => link.title.length > CRELINK_LIMITS.linkTitleMax) ? (
              <p className="notice-box">60자를 넘는 제목은 줄였어요. 저장할 제목을 확인해 주세요.</p>
            ) : null}
            {preview.links.length ? (
              <ol className="instabio-items">
                {preview.links.map((link, index) => {
                  const duplicate = existing.has(link.url);
                  return (
                    <li key={link.id}>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={selected.includes(link.id) && !duplicate}
                          disabled={pending || duplicate}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked ? [...current, link.id] : current.filter((key) => key !== link.id),
                            )
                          }
                        />
                        {index + 1}. {duplicate ? '같은 URL 있음 · 건너뜀' : '가져오기'}
                      </label>
                      <div className="instabio-item-body">
                        {link.imageUrl ? (
                          <RemoteImage
                            src={link.imageUrl}
                            alt=""
                            width={56}
                            height={56}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                        <div className="field">
                          <label htmlFor={`${id}-${index}`}>링크 제목 {index + 1}</label>
                          <input
                            id={`${id}-${index}`}
                            className="input"
                            value={titles[link.id] ?? ''}
                            maxLength={CRELINK_LIMITS.linkTitleMax}
                            required={selected.includes(link.id) && !duplicate}
                            disabled={pending || duplicate || !selected.includes(link.id)}
                            onChange={(event) =>
                              setTitles((current) => ({ ...current, [link.id]: event.target.value }))
                            }
                          />
                          <p className="field-help instabio-url">{link.url}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="empty-text">가져올 수 있는 공개 버튼 링크가 없어요.</p>
            )}
            <p className={count > remaining ? 'form-error' : 'field-help'}>
              선택 {count}개 · 추가 가능 {remaining}개. 제목·이미지를 확인하고 저장해 주세요.
            </p>
            <button
              type="submit"
              disabled={pending || count > remaining || (!selected.length && !(replaceProfile && !dirty.profile))}
            >
              {pending ? '가져오는 중…' : `선택 항목 저장${replaceProfile && !dirty.profile ? ' · 프로필 교체' : ''}`}
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}
