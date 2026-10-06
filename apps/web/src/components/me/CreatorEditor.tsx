'use client';

import { CRELINK_API_PATHS, type CreatorLandingState } from '@crelink/shared';
import { useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import { LinksSection } from './LinksSection';
import { PortfolioSection } from './PortfolioSection';
import { ProfileSection } from './ProfileSection';
import { ShortLinkSection } from './ShortLinkSection';
import { SocialsSection } from './SocialsSection';

/**
 * 크리에이터 편집 화면 전체 상태(`GET /api/me/landing`). 전체 상태를 돌려주는 요청은 그 응답으로,
 * 링크·SNS·포트폴리오 요청은 저장 뒤 다시 읽어 한도·순서를 서버 값과 맞춥니다.
 */
export function CreatorEditor({ initial }: { initial: CreatorLandingState }) {
  const [state, setState] = useState(initial);

  async function reload() {
    setState(await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding));
  }

  return (
    <div className="editor">
      <ShortLinkSection state={state} onState={setState} />
      <ProfileSection landing={state.landing} onState={setState} />
      <LinksSection links={state.links} limits={state.limits} reload={reload} />
      <SocialsSection socials={state.socials} reload={reload} />
      <PortfolioSection items={state.portfolio} reload={reload} />
    </div>
  );
}
