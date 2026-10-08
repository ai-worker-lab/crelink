import type { CreatorLandingState, PublicLandingView } from '@crelink/shared';

/**
 * 편집 상태(`GET /api/me/landing`)를 방문자가 보는 공개 랜딩 형태로 바꿉니다. 공개 API
 * (`apps/api/src/creator/public-landing.controller.ts`)와 같은 규칙으로 숨긴 링크와 차단된 링크를 빼고 순서를 유지합니다.
 * 크리에이터 미리보기가 방문·클릭 통계를 남기지 않도록 링크 주소(`clickUrl`)는 단축 도메인 클릭 기록 주소가 아니라 저장된 URL입니다.
 */
export function toLandingPreview(state: CreatorLandingState): PublicLandingView {
  return {
    publicId: state.landing.publicId,
    displayName: state.landing.displayName,
    bio: state.landing.bio,
    avatarUrl: state.landing.avatar?.url ?? null,
    socials: state.socials,
    portfolio: state.portfolio.map(({ id, title, url, image, description }) => ({
      id,
      title,
      url,
      description,
      imageUrl: image?.url ?? null,
    })),
    blocks: [
      {
        type: 'list',
        links: state.links
          .filter((link) => !link.hidden && !link.blocked)
          .map((link) => ({
            id: link.id,
            title: link.title,
            description: link.description,
            thumbnailUrl: link.thumbnail?.url ?? null,
            faviconUrl: link.faviconUrl,
            clickUrl: link.url,
          })),
      },
    ],
    guestbookEnabled: state.landing.guestbookEnabled,
  };
}
