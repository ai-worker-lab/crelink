/**
 * 크리링 MVP API 계약. 근거: docs/specs/crelink-mvp.md (API 계약 초안, 데이터 모델).
 * 오류 응답은 모두 `ApiError { code, message }`이며 code는 `CrelinkErrorCode` 중 하나입니다.
 * 날짜·시각은 ISO 8601 문자열, 날짜만 쓰는 값은 `YYYY-MM-DD`입니다.
 */

/** 설계의 `[임시값]`. MVP 이후 사용자 결정으로 바꿉니다. */
export const CRELINK_LIMITS = {
  /** 무료 계정이 보이게 둘 수 있는 외부 링크 수(R13). 운영자 부여 슬롯만큼 늘어납니다. */
  freeVisibleLinks: 5,
  /** 숨긴 링크 포함 계정당 전체 외부 링크 상한(R13 안전 장치). */
  totalLinks: 50,
  portfolioItems: 20,
  socialLinks: 10,
  linkTitleMax: 60,
  linkDescriptionMax: 120,
  urlMax: 2048,
  displayNameMax: 40,
  bioMax: 300,
  portfolioTitleMax: 60,
  portfolioDescriptionMax: 200,
  blockedReasonMax: 200,
  /** 업로드 이미지 최대 크기(바이트, MVP 임시값 4MB). 운영 스택 Caddy가 웹 요청 본문을 6MB(multipart 여유 포함)로 막으므로 이 값을 그보다 작게 둡니다(infra/prod/Caddyfile). */
  imageMaxBytes: 4 * 1024 * 1024,
  /** 단축 주소 규칙(R8): 영소문자·숫자·`-`, 3~30자. */
  slugMinLength: 3,
  slugMaxLength: 30,
  /** 자동 발급 단축 주소 길이(영소문자·숫자). */
  autoSlugLength: 7,
  /** 랜딩페이지 공개 ID 길이(영소문자·숫자, R7). */
  landingPublicIdLength: 10,
  /** 첫 변경 뒤 다음 변경까지의 기간(일, R8). */
  slugChangeIntervalDays: 30,
  /** 옛 주소를 새 주소로 연결·예약하는 기간(일, R8). */
  retiredSlugGraceDays: 90,
  /** 접근 로그 원본 보관 기간(일, R11). */
  rawLogRetentionDays: 365,
  sessionDays: 30,
  operatorPageSize: 20,
  /** 방명록 글 본문 최대 길이(앞뒤 공백을 자른 뒤, R19). */
  guestbookBodyMax: 500,
  /** 방명록 목록 한 번에 돌려주는 글 수(R19). */
  guestbookPageSize: 20,
} as const;

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** 단축 주소로 쓸 수 없는 값(설계 `[임시값]`). */
export const RESERVED_SLUGS: readonly string[] = [
  'api',
  'c',
  'health',
  'admin',
  'auth',
  'p',
  'me',
  'notice',
  'privacy',
  'docs',
  'static',
  'files',
  'www',
  'crelink',
];

export const ALLOWED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export type SocialPlatform = 'instagram' | 'youtube' | 'tiktok' | 'naver_blog' | 'x' | 'threads' | 'facebook' | 'other';
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'instagram',
  'youtube',
  'tiktok',
  'naver_blog',
  'x',
  'threads',
  'facebook',
  'other',
];

export type UserRole = 'creator' | 'operator';

export type CrelinkErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'auth_not_configured'
  | 'oauth_state_invalid'
  | 'oauth_failed'
  | 'account_suspended'
  | 'file_not_found'
  | 'file_type_unsupported'
  | 'file_too_large'
  | 'slug_invalid'
  | 'slug_reserved'
  | 'slug_taken'
  | 'slug_change_too_soon'
  | 'link_not_found'
  | 'link_url_invalid'
  | 'link_domain_blocked'
  | 'link_limit_reached'
  | 'link_total_limit_reached'
  | 'order_mismatch'
  | 'portfolio_item_not_found'
  | 'portfolio_limit_reached'
  | 'landing_not_found'
  | 'creator_suspended'
  | 'creator_not_found'
  | 'date_range_invalid'
  | 'domain_invalid'
  | 'domain_exists'
  | 'domain_not_found'
  | 'guestbook_disabled'
  | 'guestbook_entry_not_found';

/** `/notice?reason=`에 쓰는 사유. 단축 도메인 리디렉트와 로그인 콜백이 사용합니다. */
export type NoticeReason =
  | 'link_not_found'
  | 'link_unavailable'
  | 'creator_suspended'
  | 'auth_not_configured'
  | 'oauth_failed'
  | 'oauth_state_invalid'
  | 'account_suspended';

/** 쿠키 이름. `cl_session`·`cl_return_to`는 본 도메인, `cl_vid`·`cl_oauth_state`는 각 발급 도메인. */
export const COOKIE_NAMES = {
  session: 'cl_session',
  oauthState: 'cl_oauth_state',
  visitor: 'cl_vid',
  /** 로그인 뒤 돌아갈 웹 주소(`LOGIN_RETURN_TO_PATTERN`에 맞는 값만). 웹 로그인 시작이 발급하고 콜백이 지웁니다. */
  returnTo: 'cl_return_to',
} as const;

// ---------- 인증 (R15) ----------

/** `GET /api/auth/google/start`. 응답과 함께 `cl_oauth_state` 쿠키를 발급합니다. */
export interface GoogleAuthStartResponse {
  authorizationUrl: string;
}

/** `POST /api/auth/google/callback` 요청. 성공 시 `cl_session` 쿠키를 발급합니다. */
export interface GoogleAuthCallbackRequest {
  code: string;
  state: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

/** `POST /api/auth/google/callback` 응답. */
export interface GoogleAuthCallbackResponse {
  user: SessionUser;
}

/** `GET /api/me` 응답. 로그인하지 않았으면 401 `unauthenticated`. */
export type MeResponse = SessionUser;

// ---------- 크리에이터 편집 (R1, R3~R8, R12, R13) ----------

export interface ImageRef {
  fileId: string;
  url: string;
}

export interface ShortLinkView {
  /** 전체 단축 URL. 예: `http://127.0.0.1:3020/ab12cd3`. */
  url: string;
  slug: string;
  /** 자동 발급 주소를 아직 쓰고 있으면 true. 이때 첫 변경은 바로 가능합니다. */
  isAutoSlug: boolean;
  /** 다음에 주소를 바꿀 수 있는 시각. 지금 바꿀 수 있으면 null. */
  nextChangeAvailableAt: string | null;
}

export interface LinkView {
  id: string;
  title: string;
  url: string;
  description: string | null;
  thumbnail: ImageRef | null;
  /** 방문자 브라우저가 불러올 사이트 아이콘 주소(`https://{host}/favicon.ico`). */
  faviconUrl: string;
  hidden: boolean;
  /** 운영자 차단 또는 차단 도메인. 차단된 링크는 방문자에게 보이지 않습니다. */
  blocked: boolean;
  blockedReason: string | null;
  position: number;
}

export interface SocialLinkView {
  platform: SocialPlatform;
  url: string;
}

export interface PortfolioItemView {
  id: string;
  title: string;
  url: string | null;
  image: ImageRef | null;
  description: string | null;
  position: number;
}

export interface LinkLimits {
  /** 지금 보이게 둘 수 있는 최대 수 = freeVisibleLinks + extraLinkSlots. */
  visibleMax: number;
  /** 숨기지 않고 차단되지 않은 링크 수. */
  visibleUsed: number;
  totalMax: number;
  totalUsed: number;
}

/** `GET /api/me/landing` 응답. 편집 화면 전체 상태입니다. */
export interface CreatorLandingState {
  landing: {
    publicId: string;
    /** 본 도메인 랜딩 주소. 예: `http://127.0.0.1:5193/p/k3j9x0a1b2`. */
    url: string;
    displayName: string | null;
    bio: string | null;
    avatar: ImageRef | null;
    /** 방명록 탭을 켰는지(R19, 기본 true). */
    guestbookEnabled: boolean;
  };
  shortLink: ShortLinkView;
  links: LinkView[];
  socials: SocialLinkView[];
  portfolio: PortfolioItemView[];
  limits: LinkLimits;
}

/** `PATCH /api/me/landing`. 빈 문자열·null은 비움입니다. 응답은 `CreatorLandingState`. */
export interface UpdateLandingRequest {
  displayName?: string | null;
  bio?: string | null;
  avatarFileId?: string | null;
  /** 방명록 켜기·끄기(R19). 꺼도 글은 남습니다. */
  guestbookEnabled?: boolean;
}

export type SlugUnavailableReason = 'slug_invalid' | 'slug_reserved' | 'slug_taken' | 'same_as_current';

/** `GET /api/me/short-link/availability?slug=` 응답. */
export interface SlugAvailabilityResponse {
  slug: string;
  available: boolean;
  reason: SlugUnavailableReason | null;
}

/** `PUT /api/me/short-link/slug`. 응답은 `CreatorLandingState`. */
export interface ChangeSlugRequest {
  slug: string;
}

/** `POST /api/me/links`. 응답은 `LinkView`(201). */
export interface CreateLinkRequest {
  title: string;
  url: string;
  description?: string | null;
  thumbnailFileId?: string | null;
  hidden?: boolean;
}

/** `PATCH /api/me/links/{id}`. 응답은 `LinkView`. */
export type UpdateLinkRequest = Partial<CreateLinkRequest>;

/** `PUT /api/me/links/order`. 내 링크 id 전체를 원하는 순서로 보냅니다. 응답은 `LinkView[]`. */
export interface ReorderRequest {
  ids: string[];
}

/** `PUT /api/me/socials`. 전체 교체. 응답은 `SocialLinkView[]`. */
export interface ReplaceSocialsRequest {
  items: SocialLinkView[];
}

/** `POST /api/me/portfolio`(201), `PATCH /api/me/portfolio/{id}`. 응답은 `PortfolioItemView`. `PUT /api/me/portfolio/order`는 `ReorderRequest` → `PortfolioItemView[]`. */
export interface PortfolioItemRequest {
  title: string;
  url?: string | null;
  imageFileId?: string | null;
  description?: string | null;
}

/** `POST /api/me/files` (multipart 필드 `file`) 응답(201). */
export type UploadFileResponse = ImageRef;

// ---------- 공개 랜딩 (R3, R5, R12) ----------

export interface PublicLinkView {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  faviconUrl: string;
  /** 단축 도메인 클릭 기록 주소 `{SHORT}/c/{linkPublicId}`. 방문자는 이 주소로 이동합니다. */
  clickUrl: string;
}

export interface PublicBlockView {
  type: 'list';
  links: PublicLinkView[];
}

/** 방문자가 보는 공개 랜딩 내용. 공개 랜딩(`/p/{publicId}`)과 관리 화면 보기 모드가 같은 모양으로 그립니다. */
export interface PublicLandingView {
  publicId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  socials: SocialLinkView[];
  portfolio: Array<Omit<PortfolioItemView, 'image' | 'position'> & { imageUrl: string | null }>;
  blocks: PublicBlockView[];
  /** false면 방명록 탭을 그리지 않습니다(R19). */
  guestbookEnabled: boolean;
}

/**
 * `GET /api/public/landings/{publicId}?pass=` 응답. 404 `landing_not_found`, 410 `creator_suspended`.
 * 외부에서 랜딩에 들어온 방문은 단축 주소를 거쳐야 기록되므로(PRD R7), 웹은 이 두 값으로 그대로 그릴지 단축 주소로 보낼지 정합니다.
 */
export interface PublicLandingResponse extends PublicLandingView {
  /** `pass`가 단축 주소 리디렉트(`GET {SHORT}/{slug}`)가 이 랜딩에 붙여 준, 아직 만료되지 않은 통과 표시이면 true. */
  passAccepted: boolean;
  /** 이 랜딩의 현재 단축 주소 `{SHORT}/{slug}`(옛 주소 아님). */
  shortUrl: string;
}

// ---------- 방명록 (R19) ----------

export interface GuestbookAuthorView {
  /** 작성자 랜딩의 현재 표시 이름. null이면 웹이 '크리링 회원'으로 그립니다. */
  displayName: string | null;
  /** 작성자 랜딩의 현재 프로필 사진. null이면 기본 프로필(R17). */
  avatarUrl: string | null;
}

/**
 * 방명록 글. 보는 사람에게 허용된 글만 응답에 들어갑니다: 공개·숨기지 않은 글은 누구나, 비밀글은 작성자와 랜딩 크리에이터,
 * 숨긴 글은 작성자와 랜딩 크리에이터. 작성자가 정지된 글은 아무에게도 보이지 않습니다.
 */
export interface GuestbookEntryView {
  id: string;
  body: string;
  secret: boolean;
  /** 랜딩 크리에이터가 숨긴 글이면 true. 보는 사람이 랜딩 크리에이터일 때만 true가 될 수 있고, 작성자에게는 숨김 사실을 알리지 않습니다. */
  hidden: boolean;
  /** 보는 사람이 작성자이면 true. 삭제 버튼의 근거입니다. */
  mine: boolean;
  author: GuestbookAuthorView;
  createdAt: string;
}

/**
 * `GET /api/landings/{publicId}/guestbook?cursor=` 응답. 세션 쿠키가 있으면 보는 사람을 판정하고 없으면 비회원으로 봅니다.
 * 최신순 `CRELINK_LIMITS.guestbookPageSize`개. 404 `landing_not_found`·`guestbook_disabled`, 410 `creator_suspended`,
 * 400 `validation_failed`(해석할 수 없는 커서).
 */
export interface GuestbookPage {
  entries: GuestbookEntryView[];
  /** 다음 쪽을 부를 불투명 커서. 더 없으면 null. */
  nextCursor: string | null;
  viewer: {
    signedIn: boolean;
    /** 보는 사람이 이 랜딩의 크리에이터이면 true. 숨기기 버튼의 근거입니다. */
    isOwner: boolean;
  };
}

/**
 * `POST /api/landings/{publicId}/guestbook`(로그인). 응답은 `GuestbookEntryView`(201).
 * `body`는 앞뒤 공백을 자른 뒤 1~`CRELINK_LIMITS.guestbookBodyMax`자, 줄바꿈 허용. `secret` 생략은 false.
 * 401 `unauthenticated`, 400 `validation_failed`, 404 `landing_not_found`·`guestbook_disabled`, 410 `creator_suspended`.
 */
export interface CreateGuestbookEntryRequest {
  body: string;
  secret?: boolean;
}

/**
 * `PUT /api/guestbook/{entryId}/hidden`(랜딩 크리에이터). 응답은 `GuestbookEntryView`.
 * `DELETE /api/guestbook/{entryId}`(작성자)는 204. 둘 다 없거나 권한이 없는 글은 404 `guestbook_entry_not_found`(글의 존재를 드러내지 않음).
 */
export interface SetGuestbookEntryHiddenRequest {
  hidden: boolean;
}

// ---------- 운영자 (R10, R13, R14) ----------

export interface OperatorCreatorSummary {
  userId: string;
  email: string;
  displayName: string | null;
  slug: string;
  shortUrl: string;
  landingUrl: string;
  visitsLast30Days: number;
  suspended: boolean;
  createdAt: string;
}

/** `GET /api/admin/creators?query=&page=` 응답. page는 1부터. */
export interface OperatorCreatorListResponse {
  items: OperatorCreatorSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/** `GET /api/admin/creators/{userId}` 응답. */
export interface OperatorCreatorDetail extends OperatorCreatorSummary {
  extraLinkSlots: number;
  limits: LinkLimits;
  links: LinkView[];
}

export interface CountByValue {
  value: string;
  count: number;
}

/** `GET /api/admin/creators/{userId}/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` 응답. 기간은 양 끝 포함, 최대 366일. */
export interface OperatorCreatorStats {
  from: string;
  to: string;
  totals: { visits: number; uniqueVisitors: number; linkClicks: number };
  daily: Array<{ day: string; visits: number; uniqueVisitors: number; linkClicks: number }>;
  referrers: CountByValue[];
  devices: CountByValue[];
  browsers: CountByValue[];
  operatingSystems: CountByValue[];
  countries: CountByValue[];
  linkClicks: Array<{ linkId: string; title: string | null; clicks: number }>;
}

/** `PUT /api/admin/creators/{userId}/extra-slots`. 응답은 `OperatorCreatorDetail`. */
export interface SetExtraSlotsRequest {
  extraSlots: number;
}

/** `PUT /api/admin/creators/{userId}/suspension`. 응답은 `OperatorCreatorDetail`. */
export interface SetSuspensionRequest {
  suspended: boolean;
}

/** `PUT /api/admin/links/{linkId}/block`. 응답은 `LinkView`. */
export interface SetLinkBlockRequest {
  blocked: boolean;
  reason?: string | null;
}

export interface BlockedDomainView {
  domain: string;
  reason: string | null;
  createdAt: string;
}

/** `POST /api/admin/blocked-domains`(201). 응답은 `BlockedDomainView[]`(전체 목록). `GET`도 같은 목록, `DELETE /api/admin/blocked-domains/{domain}`은 204. */
export interface AddBlockedDomainRequest {
  domain: string;
  reason?: string | null;
}

/** 단축 주소 리디렉트가 랜딩 주소에 붙이는 통과 표시 쿼리 이름. 웹은 이 표시가 유효할 때만 외부에서 온 요청을 그대로 그립니다(PRD R7). */
export const LANDING_PASS_PARAM = 'pass';

export const CRELINK_API_PATHS = {
  authGoogleStart: '/api/auth/google/start',
  authGoogleCallback: '/api/auth/google/callback',
  authLogout: '/api/auth/logout',
  me: '/api/me',
  meLanding: '/api/me/landing',
  meSlugAvailability: '/api/me/short-link/availability',
  meSlug: '/api/me/short-link/slug',
  meLinks: '/api/me/links',
  meLink: (id: string) => `/api/me/links/${encodeURIComponent(id)}`,
  meLinksOrder: '/api/me/links/order',
  meSocials: '/api/me/socials',
  mePortfolio: '/api/me/portfolio',
  mePortfolioItem: (id: string) => `/api/me/portfolio/${encodeURIComponent(id)}`,
  mePortfolioOrder: '/api/me/portfolio/order',
  meFiles: '/api/me/files',
  file: (id: string) => `/api/files/${encodeURIComponent(id)}`,
  /** `pass`: 단축 주소 리디렉트가 랜딩 주소에 붙인 통과 표시(`LANDING_PASS_PARAM`). 있으면 그대로 넘겨 검증을 받습니다. */
  publicLanding: (publicId: string, pass?: string) =>
    `/api/public/landings/${encodeURIComponent(publicId)}${pass ? `?${LANDING_PASS_PARAM}=${encodeURIComponent(pass)}` : ''}`,
  adminCreators: '/api/admin/creators',
  adminCreator: (userId: string) => `/api/admin/creators/${encodeURIComponent(userId)}`,
  adminCreatorStats: (userId: string) => `/api/admin/creators/${encodeURIComponent(userId)}/stats`,
  adminCreatorExtraSlots: (userId: string) => `/api/admin/creators/${encodeURIComponent(userId)}/extra-slots`,
  adminCreatorSuspension: (userId: string) => `/api/admin/creators/${encodeURIComponent(userId)}/suspension`,
  adminLinkBlock: (linkId: string) => `/api/admin/links/${encodeURIComponent(linkId)}/block`,
  adminBlockedDomains: '/api/admin/blocked-domains',
  adminBlockedDomain: (domain: string) => `/api/admin/blocked-domains/${encodeURIComponent(domain)}`,
  /** `cursor`: 이전 응답의 `GuestbookPage.nextCursor`. */
  landingGuestbook: (publicId: string, cursor?: string | null) =>
    `/api/landings/${encodeURIComponent(publicId)}/guestbook${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  guestbookEntry: (entryId: string) => `/api/guestbook/${encodeURIComponent(entryId)}`,
  guestbookEntryHidden: (entryId: string) => `/api/guestbook/${encodeURIComponent(entryId)}/hidden`,
} as const;

/** 랜딩의 방명록 탭을 여는 주소 해시(`#guestbook`). 해시는 리디렉트를 지나도 유지되어 단축 주소(R7)를 거쳐도 탭이 열립니다. */
export const GUESTBOOK_TAB_HASH = 'guestbook';

/** 로그인 뒤 돌아갈 수 있는 웹 주소: 랜딩(`/p/{publicId}`)과 선택 방명록 해시뿐입니다. 그 밖은 버리고 `/me`로 갑니다(열린 리디렉트 방지). */
export const LOGIN_RETURN_TO_PATTERN = /^\/p\/[a-z0-9]{10}(?:#guestbook)?$/;

/** 웹 로그인 시작(`/auth/google`)의 돌아갈 주소 쿼리 이름. */
export const LOGIN_RETURN_TO_PARAM = 'returnTo';

/** 본 도메인(웹) 경로. API가 리디렉트 대상을 만들 때도 씁니다. */
export const CRELINK_WEB_PATHS = {
  landing: (publicId: string, pass?: string) =>
    `/p/${encodeURIComponent(publicId)}${pass ? `?${LANDING_PASS_PARAM}=${encodeURIComponent(pass)}` : ''}`,
  landingGuestbook: (publicId: string) => `/p/${encodeURIComponent(publicId)}#${GUESTBOOK_TAB_HASH}`,
  notice: (reason: NoticeReason) => `/notice?reason=${reason}`,
  /** 웹 구글 로그인 시작. `returnTo`가 `LOGIN_RETURN_TO_PATTERN`에 맞으면 로그인 뒤 그 주소로 돌아갑니다. */
  googleLogin: (returnTo?: string) =>
    `/auth/google${returnTo ? `?${LOGIN_RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : ''}`,
  googleCallback: '/auth/google/callback',
  privacy: '/privacy',
  docs: '/docs',
  docsGuide: '/docs/guide',
  docsReleases: '/docs/releases',
  docsBrand: '/docs/brand',
} as const;
