'use client';

import { CRELINK_API_PATHS, type CreatorLandingState, type LinkLayout } from '@crelink/shared';
import { useId } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import type { ActionState } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { useManager } from './ManagerContext';

export function LinkLayoutPicker({ action, busy }: { action: ActionState; busy: boolean }) {
  const { state, setState } = useManager();
  const name = useId();
  const selected = state.landing.linkLayout ?? 'list';
  async function change(linkLayout: LinkLayout) {
    if (busy || selected === linkLayout) return;
    const update = (value: LinkLayout) =>
      setState((current) => ({ ...current, landing: { ...current.landing, linkLayout: value } }));
    update(linkLayout);
    const saved = await action.run(async () => {
      const next = await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding, {
        method: 'PATCH',
        body: JSON.stringify({ linkLayout }),
      });
      if (next.landing.linkLayout !== linkLayout) {
        throw new BrowserApiError(
          'request_failed',
          '표시 방식을 저장하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.',
          409,
        );
      }
      update(next.landing.linkLayout);
    }, '링크 표시 방식을 저장했어요. 방문자 화면에도 적용돼요.');
    if (!saved) update(selected);
  }
  return (
    <div className="form-stack">
      <fieldset className="link-layout-picker" aria-disabled={busy || undefined}>
        <legend>링크 표시 방식</legend>
        {(['list', 'grid'] as const).map((value) => (
          <label key={value} className="check-field">
            <input
              type="radio"
              name={name}
              value={value}
              checked={selected === value}
              aria-disabled={busy || undefined}
              onChange={() => void change(value)}
            />
            {value === 'list' ? '리스트' : '카드형 그리드'}
          </label>
        ))}
      </fieldset>
      <p className="field-help">선택하면 바로 저장되며, 방문자에게도 같은 배치로 보여요.</p>
      <ActionStatus error={action.error} notice={action.notice} />
    </div>
  );
}
