'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  SOCIAL_PLATFORMS,
  type ReplaceSocialsRequest,
  type SocialLinkView,
  type SocialPlatform,
} from '@crelink/shared';
import { useId, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { SOCIAL_PLATFORM_LABELS } from '../../lib/format';
import { socialItems, socialRowsOf } from '../../lib/landing-preview';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { SocialIcon } from '../SocialIcon';
import { useManager } from '../manage/ManagerContext';

/** SNS 채널 목록. 행은 관리 화면 초안으로 두어 미리보기가 바로 그리고, 저장하면 전체를 교체합니다(`PUT /api/me/socials`). */
export function SocialsSection() {
  const baseId = useId();
  const { socials: rows, setSocials: setRows, reload, dirty } = useManager();
  const { pending, error, notice, run } = useAction();
  const full = rows.length >= CRELINK_LIMITS.socialLinks;

  function update(key: number, patch: Partial<SocialLinkView>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add() {
    setRows((current) => [
      ...current,
      { key: Math.max(-1, ...current.map((row) => row.key)) + 1, platform: 'instagram', url: '' },
    ]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: ReplaceSocialsRequest = { items: socialItems(rows) };
    await run(async () => {
      await browserApi<SocialLinkView[]>(CRELINK_API_PATHS.meSocials, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setRows(socialRowsOf((await reload()).socials));
    }, 'SNS 채널을 저장했어요.');
  }

  return (
    <section className="card" aria-labelledby={`${baseId}-title`}>
      <div className="card-head">
        <h2 id={`${baseId}-title`}>SNS 채널</h2>
        {dirty.socials ? <span className="badge dirty-chip">저장 안 함</span> : null}
      </div>
      <p className="section-help">
        계정 주소를 넣으면 방문자 화면에 아이콘으로 보여요. 최대 {CRELINK_LIMITS.socialLinks}개.
      </p>
      <form className="form-stack" onSubmit={submit}>
        {rows.length === 0 ? <p className="empty-text">아직 등록한 SNS 채널이 없어요.</p> : null}
        <ul className="edit-list">
          {rows.map((row, index) => (
            <li key={row.key} className="social-row">
              <span className="social-row-slot">
                <SocialIcon platform={row.platform} />
              </span>
              <div className="field">
                <label htmlFor={`${baseId}-platform-${row.key}`}>플랫폼 {index + 1}</label>
                <select
                  id={`${baseId}-platform-${row.key}`}
                  className="input"
                  value={row.platform}
                  onChange={(event) => update(row.key, { platform: event.target.value as SocialPlatform })}
                  disabled={pending}
                >
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {SOCIAL_PLATFORM_LABELS[platform].name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field grow">
                <label htmlFor={`${baseId}-url-${row.key}`}>계정 주소 {index + 1}</label>
                <input
                  id={`${baseId}-url-${row.key}`}
                  className="input"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={row.url}
                  onChange={(event) => update(row.key, { url: event.target.value })}
                  maxLength={CRELINK_LIMITS.urlMax}
                  disabled={pending}
                />
              </div>
              <button
                type="button"
                className="secondary danger"
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                disabled={pending}
                aria-label={`SNS 채널 ${index + 1} 빼기`}
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
        <div className="form-actions">
          {full ? (
            <p className="notice-box">SNS 채널은 최대 {CRELINK_LIMITS.socialLinks}개까지 넣을 수 있어요.</p>
          ) : (
            <button type="button" className="secondary" onClick={add} disabled={pending}>
              SNS 채널 추가
            </button>
          )}
          <button type="submit" className="secondary" disabled={pending}>
            {pending ? '저장 중…' : 'SNS 채널 저장'}
          </button>
        </div>
        <ActionStatus error={error} notice={notice} />
      </form>
    </section>
  );
}
