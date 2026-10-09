import type {
  CreatorLandingState,
  ImageRef,
  LinkView,
  PortfolioItemView,
  PublicLandingView,
  PublicLinkView,
  SocialLinkView,
} from '@crelink/shared';

/** 프로필 카드 입력값(저장 전). 빈 문자열은 저장할 때 null(비움)이 됩니다. */
export interface ProfileDraft {
  displayName: string;
  bio: string;
  avatar: ImageRef | null;
}

/** SNS 채널 편집 행. `key`는 화면 목록 키이고 저장에는 쓰지 않습니다. */
export interface SocialDraftRow extends SocialLinkView {
  key: number;
}

/** 링크 추가·수정 폼의 입력값. `id`가 null이면 새 링크입니다. 관리 화면은 항목마다 하나씩 들고 있습니다(`draftKey`). */
export interface LinkDraft {
  id: string | null;
  title: string;
  url: string;
  description: string;
  thumbnail: ImageRef | null;
}

/** 포트폴리오 추가·수정 폼의 입력값. `id`가 null이면 새 항목입니다. */
export interface PortfolioDraft {
  id: string | null;
  title: string;
  url: string;
  description: string;
  image: ImageRef | null;
}

/** 미리보기에 덮어 그릴 저장하지 않은 입력. 없는 항목은 저장된 값 그대로입니다. */
export interface LandingDrafts {
  profile?: ProfileDraft;
  socials?: ReadonlyArray<SocialLinkView>;
  links?: ReadonlyArray<LinkDraft>;
  portfolio?: ReadonlyArray<PortfolioDraft>;
}

/** 미리보기에서 새 링크·포트폴리오 초안 카드에 쓰는 id(서버 id와 겹치지 않음). */
export const DRAFT_ITEM_ID = 'draft';

/** 항목별 초안의 열쇠: 저장된 항목은 그 id, 새 항목은 `DRAFT_ITEM_ID`. */
export function draftKey(id: string | null): string {
  return id ?? DRAFT_ITEM_ID;
}

export function profileDraftOf(landing: CreatorLandingState['landing']): ProfileDraft {
  return { displayName: landing.displayName ?? '', bio: landing.bio ?? '', avatar: landing.avatar };
}

export function isProfileDirty(landing: CreatorLandingState['landing'], draft: ProfileDraft): boolean {
  return (
    (draft.displayName.trim() || null) !== landing.displayName ||
    (draft.bio.trim() || null) !== landing.bio ||
    (draft.avatar?.fileId ?? null) !== (landing.avatar?.fileId ?? null)
  );
}

export function socialRowsOf(socials: ReadonlyArray<SocialLinkView>): SocialDraftRow[] {
  return socials.map((social, index) => ({ ...social, key: index }));
}

/** 저장(`PUT /api/me/socials`)과 미리보기가 쓰는 SNS 목록: 주소 앞뒤 공백을 자르고 빈 주소 행은 뺍니다. */
export function socialItems(rows: ReadonlyArray<SocialLinkView>): SocialLinkView[] {
  return rows.map(({ platform, url }) => ({ platform, url: url.trim() })).filter((item) => item.url.length > 0);
}

export function isSocialsDirty(saved: ReadonlyArray<SocialLinkView>, rows: ReadonlyArray<SocialLinkView>): boolean {
  return (
    rows.length !== saved.length ||
    rows.some((row, index) => row.platform !== saved[index].platform || row.url.trim() !== saved[index].url)
  );
}

export function linkDraftOf(link: LinkView | null): LinkDraft {
  return {
    id: link?.id ?? null,
    title: link?.title ?? '',
    url: link?.url ?? '',
    description: link?.description ?? '',
    thumbnail: link?.thumbnail ?? null,
  };
}

export function isLinkDraftDirty(links: ReadonlyArray<LinkView>, draft: LinkDraft): boolean {
  const saved = draft.id === null ? null : links.find((link) => link.id === draft.id);
  const base = linkDraftOf(saved ?? null);
  return (
    draft.title !== base.title ||
    draft.url !== base.url ||
    draft.description !== base.description ||
    (draft.thumbnail?.fileId ?? null) !== (base.thumbnail?.fileId ?? null)
  );
}

export function portfolioDraftOf(item: PortfolioItemView | null): PortfolioDraft {
  return {
    id: item?.id ?? null,
    title: item?.title ?? '',
    url: item?.url ?? '',
    description: item?.description ?? '',
    image: item?.image ?? null,
  };
}

export function isPortfolioDraftDirty(items: ReadonlyArray<PortfolioItemView>, draft: PortfolioDraft): boolean {
  const saved = draft.id === null ? null : items.find((item) => item.id === draft.id);
  const base = portfolioDraftOf(saved ?? null);
  return (
    draft.title !== base.title ||
    draft.url !== base.url ||
    draft.description !== base.description ||
    (draft.image?.fileId ?? null) !== (base.image?.fileId ?? null)
  );
}

/**
 * 편집 상태(`GET /api/me/landing`)를 방문자가 보는 공개 랜딩 형태로 바꿉니다. 공개 API
 * (`apps/api/src/creator/public-landing.controller.ts`)와 같은 규칙으로 숨긴 링크와 차단된 링크를 빼고 순서를 유지합니다.
 * 크리에이터 미리보기가 방문·클릭 통계를 남기지 않도록 링크 주소(`clickUrl`)는 단축 도메인 클릭 기록 주소가 아니라 저장된 URL입니다.
 *
 * `drafts`를 주면 저장하지 않은 입력을 덮어 그립니다(관리 화면 실시간 미리보기, PRD R18). 링크·포트폴리오 초안은 항목마다 하나씩입니다.
 * - 프로필: 앞뒤 공백을 자르고 빈 값은 비움(저장과 같은 규칙).
 * - SNS: 빈 주소 행은 뺌(저장과 같은 규칙).
 * - 링크: 고치는 링크는 제자리에서 바꾸되 숨긴·차단된 링크는 그대로 빠지고, 새 링크는 표시 이름이 있을 때만 맨 끝에 붙습니다.
 *   주소를 바꿨거나 새 링크면 사이트 아이콘이 아직 없으므로 `faviconUrl`을 비워(`''`) 기본 아이콘으로 그립니다.
 * - 포트폴리오: 고치는 항목은 제자리에서, 새 항목은 제목이 있을 때만 맨 끝에.
 */
export function toLandingPreview(state: CreatorLandingState, drafts: LandingDrafts = {}): PublicLandingView {
  const { profile, socials, links: linkDrafts = [], portfolio: portfolioDrafts = [] } = drafts;
  const linkDraftById = new Map(linkDrafts.map((draft) => [draftKey(draft.id), draft]));
  const portfolioDraftById = new Map(portfolioDrafts.map((draft) => [draftKey(draft.id), draft]));
  const newLink = linkDraftById.get(DRAFT_ITEM_ID);
  const newPortfolio = portfolioDraftById.get(DRAFT_ITEM_ID);
  const links: PublicLinkView[] = state.links
    .filter((link) => !link.hidden && !link.blocked)
    .map((link) => {
      const linkDraft = linkDraftById.get(link.id);
      if (!linkDraft) {
        return {
          id: link.id,
          title: link.title,
          description: link.description,
          thumbnailUrl: link.thumbnail?.url ?? null,
          faviconUrl: link.faviconUrl,
          clickUrl: link.url,
        };
      }
      const url = linkDraft.url.trim();
      return {
        id: link.id,
        title: linkDraft.title.trim() || link.title,
        description: linkDraft.description.trim() || null,
        thumbnailUrl: linkDraft.thumbnail?.url ?? null,
        faviconUrl: url === link.url ? link.faviconUrl : '',
        clickUrl: url || link.url,
      };
    });
  if (newLink?.title.trim()) {
    links.push({
      id: DRAFT_ITEM_ID,
      title: newLink.title.trim(),
      description: newLink.description.trim() || null,
      thumbnailUrl: newLink.thumbnail?.url ?? null,
      faviconUrl: '',
      clickUrl: newLink.url.trim(),
    });
  }

  const portfolio: PublicLandingView['portfolio'] = state.portfolio.map((item) => {
    const portfolioDraft = portfolioDraftById.get(item.id);
    return portfolioDraft
      ? {
          id: item.id,
          title: portfolioDraft.title.trim() || item.title,
          url: portfolioDraft.url.trim() || null,
          description: portfolioDraft.description.trim() || null,
          imageUrl: portfolioDraft.image?.url ?? null,
        }
      : {
          id: item.id,
          title: item.title,
          url: item.url,
          description: item.description,
          imageUrl: item.image?.url ?? null,
        };
  });
  if (newPortfolio?.title.trim()) {
    portfolio.push({
      id: DRAFT_ITEM_ID,
      title: newPortfolio.title.trim(),
      url: newPortfolio.url.trim() || null,
      description: newPortfolio.description.trim() || null,
      imageUrl: newPortfolio.image?.url ?? null,
    });
  }

  return {
    publicId: state.landing.publicId,
    displayName: profile ? profile.displayName.trim() || null : state.landing.displayName,
    bio: profile ? profile.bio.trim() || null : state.landing.bio,
    avatarUrl: profile ? (profile.avatar?.url ?? null) : (state.landing.avatar?.url ?? null),
    socials: socials ? socialItems(socials) : state.socials,
    portfolio,
    // 광고 블록·배너 슬롯 미리보기(resolveBannerSlot)는 0079(미리보기·광고 블록 패널)가 채웁니다.
    blocks: [{ type: 'list', links, slot: null }],
    guestbookEnabled: state.landing.guestbookEnabled,
  };
}
