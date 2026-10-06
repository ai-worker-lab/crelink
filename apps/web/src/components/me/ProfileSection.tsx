'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type CreatorLandingState,
  type ImageRef,
  type UpdateLandingRequest,
} from '@crelink/shared';
import { useId, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { DefaultAvatar } from '../DefaultAvatar';
import { ImageField } from './ImageField';

export function ProfileSection({
  landing,
  onState,
}: {
  landing: CreatorLandingState['landing'];
  onState: (next: CreatorLandingState) => void;
}) {
  const nameId = useId();
  const bioId = useId();
  const [displayName, setDisplayName] = useState(landing.displayName ?? '');
  const [bio, setBio] = useState(landing.bio ?? '');
  const [avatar, setAvatar] = useState<ImageRef | null>(landing.avatar);
  const { pending, error, notice, run } = useAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: UpdateLandingRequest = {
      displayName: displayName.trim() || null,
      bio: bio.trim() || null,
      avatarFileId: avatar?.fileId ?? null,
    };
    await run(async () => {
      onState(
        await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      );
    }, '프로필을 저장했어요.');
  }

  return (
    <section className="card" aria-labelledby="profile-title">
      <h2 id="profile-title">프로필</h2>
      <p className="section-help">
        모두 선택 항목이에요. 비워 두면 방문자 화면에 보이지 않고, 프로필 사진이 없으면 기본 프로필이 보여요.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <ImageField
          label="프로필 사진"
          value={avatar}
          onChange={setAvatar}
          disabled={pending}
          placeholder={<DefaultAvatar className="image-preview" />}
        />
        <div className="field">
          <label htmlFor={nameId}>이름(닉네임)</label>
          <input
            id={nameId}
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={CRELINK_LIMITS.displayNameMax}
            disabled={pending}
          />
          <p className="field-help">
            {displayName.length}/{CRELINK_LIMITS.displayNameMax}자
          </p>
        </div>
        <div className="field">
          <label htmlFor={bioId}>소개</label>
          <textarea
            id={bioId}
            className="input"
            rows={4}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={CRELINK_LIMITS.bioMax}
            disabled={pending}
          />
          <p className="field-help">
            {bio.length}/{CRELINK_LIMITS.bioMax}자
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
