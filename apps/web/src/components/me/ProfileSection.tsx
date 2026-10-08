'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type CreatorLandingState,
  type UpdateLandingRequest,
} from '@crelink/shared';
import { useId, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { profileDraftOf, type ProfileDraft } from '../../lib/landing-preview';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { DefaultAvatar } from '../DefaultAvatar';
import { useManager } from '../manage/ManagerContext';
import { ImageField } from './ImageField';

/** 프로필(사진·이름·소개). 입력은 관리 화면 초안으로 두어 미리보기가 바로 그리고, `프로필 저장`으로 `PATCH /api/me/landing`. */
export function ProfileSection() {
  const headingId = useId();
  const nameId = useId();
  const bioId = useId();
  const { profile, setProfile, setState, dirty } = useManager();
  const { pending, error, notice, run } = useAction();
  const update = (patch: Partial<ProfileDraft>) => setProfile((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: UpdateLandingRequest = {
      displayName: profile.displayName.trim() || null,
      bio: profile.bio.trim() || null,
      avatarFileId: profile.avatar?.fileId ?? null,
    };
    await run(async () => {
      const next = await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setState(next);
      setProfile(profileDraftOf(next.landing));
    }, '프로필을 저장했어요.');
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId}>프로필</h2>
        {dirty.profile ? <span className="badge dirty-chip">저장 안 함</span> : null}
      </div>
      <p className="section-help">
        모두 선택 항목이에요. 비워 두면 방문자 화면에 보이지 않고, 프로필 사진이 없으면 기본 프로필이 보여요.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <ImageField
          label="프로필 사진"
          value={profile.avatar}
          onChange={(avatar) => update({ avatar })}
          disabled={pending}
          placeholder={<DefaultAvatar className="image-preview" />}
        />
        <div className="field">
          <label htmlFor={nameId}>이름(닉네임)</label>
          <input
            id={nameId}
            className="input"
            value={profile.displayName}
            onChange={(event) => update({ displayName: event.target.value })}
            maxLength={CRELINK_LIMITS.displayNameMax}
            disabled={pending}
          />
          <p className="field-help">
            {profile.displayName.length}/{CRELINK_LIMITS.displayNameMax}자
          </p>
        </div>
        <div className="field">
          <label htmlFor={bioId}>소개</label>
          <textarea
            id={bioId}
            className="input"
            rows={4}
            value={profile.bio}
            onChange={(event) => update({ bio: event.target.value })}
            maxLength={CRELINK_LIMITS.bioMax}
            disabled={pending}
          />
          <p className="field-help">
            {profile.bio.length}/{CRELINK_LIMITS.bioMax}자
          </p>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={pending}>
            {pending ? '저장 중…' : '프로필 저장'}
          </button>
        </div>
        <ActionStatus error={error} notice={notice} />
      </form>
    </section>
  );
}
