'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  SOCIAL_PLATFORMS,
  type ReplaceSocialsRequest,
  type SocialLinkView,
  type SocialPlatform,
} from '@crelink/shared';
import { useId, useRef, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { SOCIAL_PLATFORM_LABELS } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { SocialIcon } from '../SocialIcon';

interface Row extends SocialLinkView {
  key: number;
}

/** SNS 채널 목록. 저장하면 전체를 교체합니다(`PUT /api/me/socials`). */
export function SocialsSection({ socials, reload }: { socials: SocialLinkView[]; reload: () => Promise<void> }) {
  const baseId = useId();
  const [rows, setRows] = useState<Row[]>(() => socials.map((social, index) => ({ ...social, key: index })));
  const nextKey = useRef(socials.length);
  const { pending, error, notice, run } = useAction();
  const full = rows.length >= CRELINK_LIMITS.socialLinks;

  function update(key: number, patch: Partial<SocialLinkView>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add() {
    const key = nextKey.current;
    nextKey.current += 1;
    setRows((current) => [...current, { key, platform: 'instagram', url: '' }]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: ReplaceSocialsRequest = {
      items: rows.map(({ platform, url }) => ({ platform, url: url.trim() })).filter((item) => item.url.length > 0),
    };
    const saved = await run(async () => {
      await browserApi<SocialLinkView[]>(CRELINK_API_PATHS.meSocials, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await reload();
    }, 'SNS 채널을 저장했어요.');
    if (saved) setRows((current) => current.filter((row) => row.url.trim().length > 0));
  }

  return (
    <section className="card" aria-labelledby="socials-title">
      <h2 id="socials-title">SNS 채널</h2>
      <p className="section-help">
        계정 주소를 넣으면 방문자 화면에 아이콘으로 보여요. 최대 {CRELINK_LIMITS.socialLinks}개.
      </p>
      <form className="form-stack" onSubmit={submit}>
        {rows.length === 0 ? <p className="empty-text">아직 등록한 SNS 채널이 없어요.</p> : null}
        <ul className="edit-list">
          {rows.map((row, index) => (
            <li key={row.key} className="social-row">
              <SocialIcon platform={row.platform} className="social-row-icon" />
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
          <button type="submit" className="primary" disabled={pending}>
            {pending ? '저장 중…' : 'SNS 채널 저장'}
          </button>
        </div>
        <ActionStatus error={error} notice={notice} />
      </form>
    </section>
  );
}
