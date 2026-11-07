'use client';

import {
  CRELINK_API_PATHS,
  type CreatorLandingState,
  type LinkLayout,
  type ListDensity,
  type UpdateLandingRequest,
} from '@crelink/shared';
import { useId, useRef } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import type { ActionState } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { useManager } from './ManagerContext';

export function LinkLayoutPicker({ action, busy }: { action: ActionState; busy: boolean }) {
  const { state, setState } = useManager();
  const name = useId();
  const densityName = useId();
  const densityHelp = useId();
  const saving = useRef(false);
  const selected = state.landing.linkLayout ?? 'list';
  const density = state.landing.listDensity ?? 8;
  const pending = busy || action.pending;

  async function change<Field extends 'linkLayout' | 'listDensity'>(
    field: Field,
    value: NonNullable<CreatorLandingState['landing'][Field]>,
  ) {
    const before = field === 'linkLayout' ? selected : density;
    if (saving.current || pending || before === value) return;
    saving.current = true;
    const update = (next: typeof value | typeof before) =>
      setState((current) => ({ ...current, landing: { ...current.landing, [field]: next } }));
    update(value);
    try {
      const saved = await action.run(async () => {
        const payload: UpdateLandingRequest = { [field]: value };
        const next = await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        // 기본 표시값과 달리, 저장은 서버가 실제 선택값을 돌려줘야 성공입니다.
        if (next?.landing?.[field] !== value) {
          throw new BrowserApiError(
            'request_failed',
            '표시 설정을 저장하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.',
            409,
          );
        }
        update(value);
      }, '링크 표시 설정을 저장했어요. 방문자 화면에도 적용돼요.');
      if (!saved) update(before);
    } finally {
      saving.current = false;
    }
  }
  return (
    <div className="form-stack">
      <fieldset className="link-layout-picker" aria-disabled={pending || undefined}>
        <legend>링크 표시 방식</legend>
        {(['list', 'grid'] as const).map((value) => (
          <label key={value} className="check-field">
            <input
              type="radio"
              name={name}
              value={value}
              checked={selected === value}
              aria-disabled={pending || undefined}
              onChange={() => void change('linkLayout', value satisfies LinkLayout)}
            />
            {value === 'list' ? '리스트' : '카드형 그리드'}
          </label>
        ))}
      </fieldset>
      <p className="field-help">선택하면 바로 저장되며, 방문자에게도 같은 배치로 보여요.</p>
      {selected === 'list' ? (
        <>
          <fieldset className="link-layout-picker" aria-disabled={pending || undefined} aria-describedby={densityHelp}>
            <legend>리스트 밀도</legend>
            {([8, 10, 12] as const satisfies readonly ListDensity[]).map((value) => (
              <label key={value} className="check-field">
                <input
                  type="radio"
                  name={densityName}
                  value={value}
                  checked={density === value}
                  aria-disabled={pending || undefined}
                  onChange={() => void change('listDensity', value)}
                />
                {value === 8 ? '8개형 (여유롭게)' : value === 12 ? '12개형 (촘촘하게)' : '10개형'}
              </label>
            ))}
          </fieldset>
          <p id={densityHelp} className="field-help">
            선택하면 바로 저장돼요. 화면 높이·글자 크기·제목과 설명 길이에 따라 보이는 개수는 달라져요.
          </p>
        </>
      ) : null}
      <ActionStatus error={action.error} notice={action.notice} />
    </div>
  );
}
