'use client';

import { CRELINK_API_PATHS, type AdBlockSettingView, type SetAdBlockRequest } from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import { formatDateTime } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';

/**
 * 운영자 플랫폼 광고 블록 스위치(R20 ⑩, 기본 꺼짐). `/admin/ad-banners` 머리 아래 카드입니다. 서버가 읽은 `GET /api/admin/ad-block`을 받아
 * `광고 블록 사용` 스위치(방명록·링크 숨기기와 같은 `hide-switch`)로 `PUT /api/admin/ad-block`을 보내고, 응답 값으로 바꾼 뒤 서버 화면을 다시 읽습니다.
 * 저장 중에는 `aria-disabled`로 누르기만 무시하고(초점 유지), 실패하면 값은 그대로 두고 오류 줄을 보입니다.
 * 바꾸면 API가 운영자 행동 기록 `platform.ad_block`을 남깁니다.
 */
export function AdBlockSetting({ setting }: { setting: AdBlockSettingView }) {
  const router = useRouter();
  const headingId = useId();
  const helpId = useId();
  const { pending, error, notice, run } = useAction();
  // 저장 응답을 바로 보이고, 서버가 새 값을 주면(다시 읽기) 그 값으로 맞춥니다.
  const [current, setCurrent] = useState(setting);
  const [source, setSource] = useState(setting);
  if (source !== setting) {
    setSource(setting);
    setCurrent(setting);
  }

  async function toggle() {
    const payload: SetAdBlockRequest = { enabled: !current.enabled };
    await run(
      async () => {
        setCurrent(
          await browserApi<AdBlockSettingView>(CRELINK_API_PATHS.adminAdBlock, {
            method: 'PUT',
            body: JSON.stringify(payload),
          }),
        );
        router.refresh();
      },
      payload.enabled
        ? '광고 블록을 켰어요. 광고 블록을 켠 크리에이터 페이지에 크리링 광고 배너가 보여요.'
        : '광고 블록을 껐어요. 모든 공개 페이지에서 크리링 광고가 빠져요.',
    );
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId}>광고 블록</h2>
      </div>
      <div className="panel-switch-row">
        <p className="section-help" id={helpId}>
          켜면 광고 블록을 켠 크리에이터 페이지에만 크리링 광고 배너가 보여요. 꺼 두면 모든 공개 페이지에서 광고가
          빠지고 크리에이터 편집 화면에도 광고 블록이 보이지 않아요.
        </p>
        <button
          type="button"
          role="switch"
          className="hide-switch"
          aria-checked={current.enabled}
          aria-label="광고 블록 사용"
          aria-describedby={helpId}
          aria-disabled={pending || undefined}
          onClick={() => {
            if (!pending) void toggle();
          }}
        >
          <span className="hide-switch-track" aria-hidden="true">
            <span className="hide-switch-thumb" />
          </span>
          <span className="hide-switch-text" aria-hidden="true">
            {current.enabled ? '켜짐' : '꺼짐'}
          </span>
        </button>
      </div>
      <p className="section-help">
        지금 <strong>{current.enabled ? '켜짐' : '꺼짐'}</strong> · 마지막 변경{' '}
        <time dateTime={current.updatedAt}>{formatDateTime(current.updatedAt)}</time>
        {current.updatedBy ? ` · ${current.updatedBy}` : null}
      </p>
      <ActionStatus error={error} notice={notice} />
    </section>
  );
}
