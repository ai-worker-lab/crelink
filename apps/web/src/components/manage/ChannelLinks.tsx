'use client';

import {
  CHANNEL_LINK_LIMITS,
  CHANNEL_LINK_PRESETS,
  CRELINK_API_PATHS,
  type ChannelLinkView,
  type CreateChannelLinkRequest,
} from '@crelink/shared';
import { useId, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { channelLinkTitle } from '../../lib/channel-links';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { CopyButton } from '../CopyButton';
import { managerMenuLabel } from './menu';

/**
 * `채널 주소` 메뉴(docs/specs/channel-links.md): 채널과 노출 위치를 고르면 `{SHORT}/s/{code}` 주소를 만들고, 복사하거나 보관합니다.
 * 같은 조합을 다시 만들면 이미 있는 주소를 보여 줍니다. 보관은 목록에서만 숨기며 이미 공유한 주소는 계속 열립니다.
 */
export function ChannelLinks({ initial }: { initial: ChannelLinkView[] }) {
  const baseId = useId();
  const headingId = useId();
  const [items, setItems] = useState(initial);
  const [channel, setChannel] = useState(CHANNEL_LINK_PRESETS[0].value);
  const [placement, setPlacement] = useState(CHANNEL_LINK_PRESETS[0].placements[0].value);
  const [campaign, setCampaign] = useState('');
  const create = useAction();
  const archive = useAction();
  const preset = CHANNEL_LINK_PRESETS.find((item) => item.value === channel) ?? CHANNEL_LINK_PRESETS[0];
  const full = items.length >= CHANNEL_LINK_LIMITS.perLanding;
  const pending = create.pending || archive.pending;

  function changeChannel(value: string) {
    setChannel(value);
    const next = CHANNEL_LINK_PRESETS.find((item) => item.value === value);
    if (next && !next.placements.some((item) => item.value === placement)) setPlacement(next.placements[0].value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    archive.setError(null);
    archive.setNotice(null);
    const payload: CreateChannelLinkRequest = { channel, placement, campaign: campaign.trim() || null };
    let existed = false;
    const made = await create.run(async () => {
      const link = await browserApi<ChannelLinkView>(CRELINK_API_PATHS.meChannelLinks, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      existed = items.some((item) => item.code === link.code);
      setItems((current) => [link, ...current.filter((item) => item.code !== link.code)]);
    });
    if (made) {
      create.setNotice(
        existed
          ? '같은 조합의 주소가 이미 있어요. 그 주소를 맨 위로 올렸어요.'
          : '주소를 만들었어요. 복사해서 써 보세요.',
      );
      setCampaign('');
    }
  }

  async function remove(link: ChannelLinkView) {
    create.setError(null);
    create.setNotice(null);
    await archive.run(
      async () => {
        await browserApi<void>(CRELINK_API_PATHS.meChannelLinkArchive(link.code), { method: 'POST' });
        setItems((current) => current.filter((item) => item.code !== link.code));
      },
      `${channelLinkTitle(link)} 주소를 보관했어요. 이미 공유한 주소는 계속 열려요.`,
    );
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <div>
          <h1 id={headingId} className="card-title">
            {managerMenuLabel('channels')}
          </h1>
          <p className="card-subtitle">
            채널과 위치를 고르면 짧은 주소가 만들어져요. 이 주소로 들어온 방문은 통계에 채널별로 나눠 보여요.
          </p>
        </div>
      </div>

      <form className="form-stack" onSubmit={submit}>
        <div className="channel-form-row">
          <div className="field">
            <label htmlFor={`${baseId}-channel`}>채널</label>
            <select
              id={`${baseId}-channel`}
              className="input"
              value={channel}
              onChange={(event) => changeChannel(event.target.value)}
              disabled={create.pending}
            >
              {CHANNEL_LINK_PRESETS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${baseId}-placement`}>노출 위치</label>
            <select
              id={`${baseId}-placement`}
              className="input"
              value={placement}
              onChange={(event) => setPlacement(event.target.value)}
              disabled={create.pending}
            >
              {preset.placements.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${baseId}-campaign`}>캠페인 이름 (선택)</label>
          <input
            id={`${baseId}-campaign`}
            className="input"
            value={campaign}
            onChange={(event) => setCampaign(event.target.value)}
            maxLength={CHANNEL_LINK_LIMITS.campaignMax}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${baseId}-campaign-help`}
            disabled={create.pending}
          />
          <p id={`${baseId}-campaign-help`} className="field-help">
            비우면 프로필은 profile, 그 밖은 general로 기록돼요. 영문 소문자·숫자·한글·하이픈만 남아요.
          </p>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={create.pending || full}>
            {create.pending ? '만드는 중…' : '주소 만들기'}
          </button>
        </div>
        {full ? (
          <p className="notice-box" role="status">
            채널 주소는 {CHANNEL_LINK_LIMITS.perLanding}개까지 둘 수 있어요. 쓰지 않는 주소를 보관하면 새로 만들 수
            있어요.
          </p>
        ) : null}
        <ActionStatus error={create.error} notice={create.notice} />
      </form>

      <h2 className="channel-list-title">만든 주소</h2>
      {items.length === 0 ? (
        <p className="empty-text">아직 만든 주소가 없어요. 위에서 채널을 고르고 주소를 만들어 보세요.</p>
      ) : (
        <ul className="edit-list channel-list">
          {items.map((link) => (
            <li key={link.code} className="item-card channel-item">
              <div className="channel-item-text">
                <strong className="channel-item-title">{channelLinkTitle(link)}</strong>
                <code className="url-text channel-item-url">{link.url}</code>
              </div>
              <div className="channel-item-actions">
                <CopyButton text={link.url} label={`${channelLinkTitle(link)} 주소 복사`} />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => remove(link)}
                  disabled={pending}
                  aria-label={`${channelLinkTitle(link)} 주소 보관`}
                >
                  보관
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="field-help">보관해도 이미 공유한 주소는 계속 열려요.</p>
      <ActionStatus error={archive.error} notice={archive.notice} />
    </section>
  );
}
