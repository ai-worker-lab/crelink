'use client';

import {
  CRELINK_API_PATHS,
  type InstagramDmAudience,
  type InstagramDmSettingsView,
  type SetInstagramDmAudienceRequest,
} from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import {
  INSTAGRAM_DM_AUDIENCE_NOTICE,
  INSTAGRAM_DM_AUDIENCE_OPTIONS,
  INSTAGRAM_DM_EVERYONE_WARNING,
  planAudienceChange,
} from '../../lib/instagram-dm-audience';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { EditSheet } from '../manage/EditSheet';

/**
 * 운영자 인스타그램 DM 스위치(기본 꺼짐). `/admin/ad-banners`의 광고 블록 카드 아래에 둡니다. 서버가 읽은 `GET /api/admin/instagram-dm`을 받아
 * `끔`·`운영자만`·`모든 크리에이터` 중 하나를 `PUT /api/admin/instagram-dm`으로 저장하고, 응답 값으로 바꾼 뒤 서버 화면을 다시 읽습니다.
 * `모든 크리에이터`는 일반 공개라 경고를 늘 보이고, 고르면 확인 시트(첫 초점 취소)를 거칩니다. 계정별 정지 화면은 설계에 없어 만들지 않습니다.
 * 바꾸면 API가 운영자 행동 기록을 남깁니다.
 */
export function InstagramDmSetting({ setting }: { setting: InstagramDmSettingsView }) {
  const router = useRouter();
  const headingId = useId();
  const warningId = useId();
  const { pending, error, notice, run } = useAction();
  const [current, setCurrent] = useState(setting);
  const [source, setSource] = useState(setting);
  const [confirming, setConfirming] = useState(false);
  if (source !== setting) {
    setSource(setting);
    setCurrent(setting);
  }

  async function save(audience: InstagramDmAudience) {
    const payload: SetInstagramDmAudienceRequest = { audience };
    const saved = await run(async () => {
      setCurrent(
        await browserApi<InstagramDmSettingsView>(CRELINK_API_PATHS.adminInstagramDm, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }),
      );
      router.refresh();
    }, INSTAGRAM_DM_AUDIENCE_NOTICE[audience]);
    if (saved) setConfirming(false);
  }

  function choose(audience: InstagramDmAudience) {
    if (pending) return;
    const plan = planAudienceChange(current.audience, audience);
    if (plan === 'confirm') setConfirming(true);
    else if (plan === 'save') void save(audience);
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId}>인스타그램 DM</h2>
      </div>
      <p className="section-help">크리에이터의 인스타그램 댓글 자동 DM을 누구에게 열지 정해요. 기본은 꺼짐이에요.</p>
      <fieldset className="form-stack" aria-describedby={warningId} disabled={pending}>
        <legend className="section-help">공개 범위</legend>
        {INSTAGRAM_DM_AUDIENCE_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="instagram-dm-audience"
              value={option.value}
              checked={current.audience === option.value}
              onChange={() => choose(option.value)}
            />{' '}
            <strong>{option.label}</strong>
            <span className="section-help"> · {option.help}</span>
          </label>
        ))}
      </fieldset>
      <p className="form-error" id={warningId}>
        {INSTAGRAM_DM_EVERYONE_WARNING}
      </p>
      <ActionStatus error={confirming ? null : error} notice={notice} />
      {confirming ? (
        <EditSheet
          title="모든 크리에이터에게 열까요?"
          pending={pending}
          onDismiss={() => setConfirming(false)}
          className="centered-sheet"
        >
          <div className="form-stack">
            <p>{INSTAGRAM_DM_EVERYONE_WARNING}</p>
            <ActionStatus error={error} />
            <div className="form-actions edit-form-actions">
              <button
                type="button"
                className="secondary"
                data-autofocus
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="secondary danger"
                disabled={pending}
                onClick={() => void save('everyone')}
              >
                {pending ? '처리 중…' : '모든 크리에이터에게 열기'}
              </button>
            </div>
          </div>
        </EditSheet>
      ) : null}
    </section>
  );
}
