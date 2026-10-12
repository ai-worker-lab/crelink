'use client';

import { useManager } from './ManagerContext';

/**
 * 광고 블록 표시 스위치(R20 ⑩, `PUT /api/me/ad-block`, 기본 꺼짐). 플랫폼 스위치가 켜졌을 때만 그립니다(부르는 쪽이 정함).
 * 외부 링크 패널의 광고 블록 행과 광고 블록 패널이 같은 상태를 씁니다. 방명록 스위치와 같은 모양(`hide-switch`)이고,
 * 저장 중에는 `aria-disabled`로 누르기만 무시합니다(초점 유지).
 */
export function AdBlockSwitch() {
  const { state, adBlockAction, toggleAdBlock } = useManager();
  const enabled = state.adBlock.enabled;
  return (
    <button
      type="button"
      role="switch"
      className="hide-switch"
      aria-checked={enabled}
      aria-label="광고 블록 표시"
      aria-disabled={adBlockAction.pending || undefined}
      onClick={() => {
        if (!adBlockAction.pending) void toggleAdBlock(!enabled);
      }}
    >
      <span className="hide-switch-track" aria-hidden="true">
        <span className="hide-switch-thumb" />
      </span>
      <span className="hide-switch-text" aria-hidden="true">
        {enabled ? '켜짐' : '꺼짐'}
      </span>
    </button>
  );
}
