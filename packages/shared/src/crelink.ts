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
  /** 배너 대체 문구 최대 길이(R20 ④, R21 ②). 한도 n·보관 상한은 공유 상수가 아니라 API 설정값이며 웹은 `BannerLimits`만 씁니다. */
  bannerAltMax: 100,
} as const;

/** 배너 비율(가로:세로). 공개 랜딩·관리 미리보기·운영자 미리보기·정지 이미지 자르기가 같은 값을 씁니다. 근거: docs/specs/crelink-ad-banner.md. */
export const BANNER_ASPECT_RATIO = { width: 3, height: 1 } as const;

/** 움직이는 배너의 첫 장면 정지 이미지 최대 크기(px). 바꾸면 정지 이미지를 다시 만들어야 합니다. */
export const BANNER_STILL_SIZE = { width: 1200, height: 400 } as const;

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
  | 'guestbook_entry_not_found'
  | 'banner_not_found'
  | 'banner_limit_reached'
  | 'banner_total_limit_reached'
  | 'banner_slot_not_granted'
  | 'ad_banner_not_found'
  | 'banner_period_invalid'
  // 링크 슬롯 이벤트(R24)
  | 'slot_event_not_found'
  | 'slot_event_closed'
  | 'slot_event_period_invalid'
  // AI 운영자(R23). 근거: docs/specs/crelink-ai-operator.md `오류 코드`.
  | 'agent_run_not_found'
  | 'agent_run_in_progress'
  | 'agent_run_closed'
  | 'agent_run_required'
  | 'ai_operator_paused'
  | 'api_token_not_found';

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
  /** 지금 보이게 둘 수 있는 최대 수 = min(freeVisibleLinks + extraLinkSlots + 링크 슬롯 이벤트 보너스 합, totalLinks). */
  visibleMax: number;
  /** 숨기지 않고 차단되지 않은 링크 수. */
  visibleUsed: number;
  totalMax: number;
  totalUsed: number;
}

/** 크리에이터 배너 한도(R21 ②). 이 랜딩의 배너만 셉니다. max 값은 API 설정 `BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX`입니다. */
export interface BannerLimits {
  /** 보이게 둘 수 있는 최대 장수(n). */
  visibleMax: number;
  /** 숨기지 않고 차단되지 않은 배너 수. */
  visibleUsed: number;
  /** 숨김·차단 포함 보관 상한. */
  totalMax: number;
  totalUsed: number;
}

/** 크리에이터 배너(R21). 관리 화면과 운영자 크리에이터 상세가 같은 모양을 씁니다. */
export interface CreatorBannerView {
  /** uuid. */
  id: string;
  image: ImageRef;
  /** 움직이는 배너의 첫 장면 정지 이미지(3:1). 움직이지 않으면 null. */
  stillImage: ImageRef | null;
  alt: string;
  /** 연결 URL. 없으면 누를 수 없는 배너입니다. */
  url: string | null;
  hidden: boolean;
  /** 운영자 차단 또는 차단 도메인. 주소를 바꿔도 유지됩니다(R21 ④). */
  blocked: boolean;
  blockedReason: string | null;
  position: number;
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
  /**
   * 링크 목록 안 광고 블록·배너 슬롯 자리(R20 ①②, R21 ①).
   * slotIndex: 숨김·차단 포함 전체 링크 순서에서 슬롯 앞 링크 수. null = 맨 뒤에 붙어 있음. grantedAt: 배너 슬롯 부여 시각(없으면 null).
   */
  slot: { kind: BannerSlotKind; slotIndex: number | null; grantedAt: string | null };
  /** 게시 중 크리링 배너(미리보기용, clickUrl = 저장된 URL). */
  adBanners: PublicBannerView[];
  /** 이 랜딩의 크리에이터 배너 전체(숨김·차단 포함, 순서대로). 회수 뒤에도 보관분이 들어 있고, 웹은 slot.kind = 'creator'일 때만 씁니다. */
  banners: CreatorBannerView[];
  bannerLimits: BannerLimits;
  /** 링크 슬롯 이벤트(R24)와 이 계정의 신청. `limits.visibleMax`에는 받은 보너스가 이미 들어 있습니다. */
  slotEvent: CreatorSlotEventState;
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

/** 같은 종류의 id 전체를 원하는 순서로 보냅니다. 포트폴리오·크리에이터 배너(`PUT /api/me/banners/order`)·크리링 배너(`PUT /api/admin/ad-banners/order`) 정렬이 씁니다. */
export interface ReorderRequest {
  ids: string[];
}

/**
 * `PUT /api/me/links/order`. 내 링크 id 전체를 원하는 순서로 보냅니다. 응답은 `LinkView[]`.
 * slotIndex: 숨김·차단 포함 전체 순서에서 슬롯 앞 링크 수(0 이상 정수). 링크 수 이상이면 맨 뒤. 생략하면 지금 상대 위치를 유지합니다(옛 웹 호환).
 * 0 이상 정수가 아니면 400 `validation_failed`, id 집합이 다르면 400 `order_mismatch`.
 */
export interface LinkOrderRequest extends ReorderRequest {
  slotIndex?: number;
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

/** `POST /api/me/files` (multipart 필드 `file`) 응답(201). animated: GIF·WebP·APNG가 움직이는 이미지인지(업로드 때 판정). */
export interface UploadFileResponse extends ImageRef {
  animated: boolean;
}

/**
 * `POST /api/me/banners`(201, 배너 슬롯 부여된 크리에이터). 응답은 `CreatorBannerView`.
 * 403 `banner_slot_not_granted`, 400 `validation_failed`·`link_url_invalid`, 404 `file_not_found`, 422 `link_domain_blocked`,
 * 409 `banner_total_limit_reached`·`banner_limit_reached`.
 */
export interface CreateBannerRequest {
  imageFileId: string;
  /** 이미지가 움직이면 필수(움직이지 않는 이미지), 아니면 null. */
  stillImageFileId?: string | null;
  /** 1~`CRELINK_LIMITS.bannerAltMax`자. */
  alt: string;
  /** http·https. null·생략이면 연결 없음. */
  url?: string | null;
  hidden?: boolean;
}

/**
 * `PATCH /api/me/banners/{id}`. 바뀐 필드만 보냅니다. imageFileId를 바꾸면 stillImageFileId도 같은 요청에 넣습니다.
 * 응답은 `CreatorBannerView`. 오류는 POST와 같고 404 `banner_not_found`가 더해집니다.
 * `DELETE /api/me/banners/{id}`는 204(403 `banner_slot_not_granted`, 404 `banner_not_found`).
 * `PUT /api/me/banners/order`는 `ReorderRequest`(이 랜딩 배너 전체) → `CreatorBannerView[]`.
 */
export type UpdateBannerRequest = Partial<CreateBannerRequest>;

// ---------- 공개 랜딩 (R3, R5, R12, R20, R21) ----------

export interface PublicLinkView {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  faviconUrl: string;
  /** 단축 도메인 클릭 기록 주소 `{SHORT}/c/{linkPublicId}`. 방문자는 이 주소로 이동합니다. */
  clickUrl: string;
}

/** 'ad' = 크리링 광고 블록(R20), 'creator' = 크리에이터 배너 슬롯(R21). */
export type BannerSlotKind = 'ad' | 'creator';

/** 공개 랜딩·미리보기의 배너 한 장. id: 공개 응답은 배너 공개 ID, 미리보기의 크리에이터 배너는 `CreatorBannerView.id`(uuid). */
export interface PublicBannerView {
  id: string;
  imageUrl: string;
  /** 움직이는 배너의 첫 장면 정지 이미지(3:1). 움직이지 않으면 null. */
  stillImageUrl: string | null;
  alt: string;
  /**
   * 공개 API: 광고는 passAccepted일 때 `{SHORT}/a/{bannerPublicId}/{landingPublicId}`, 아니면 저장된 URL.
   * 크리에이터 배너는 `{SHORT}/b/{bannerPublicId}`. 연결 URL이 없으면 null. 미리보기는 저장된 URL.
   */
  clickUrl: string | null;
}

export interface PublicBannerSlotView {
  kind: BannerSlotKind;
  /** 이 구역의 보이는 링크 중 슬롯 앞에 오는 수(0 = 맨 앞). */
  afterLinkCount: number;
  /** 1장 이상. */
  banners: PublicBannerView[];
}

export interface PublicBlockView {
  type: 'list';
  links: PublicLinkView[];
  /** 숨김 조건이면 null(R20 ⑥, R21 ③). 첫 list 구역에만 붙습니다. 웹은 없거나 null이면 그리지 않습니다. */
  slot: PublicBannerSlotView | null;
}

/** `resolveBannerSlot`의 숨김 사유. 'no_content' = 광고인데 보이는 링크·포트폴리오가 없음, 'no_banners' = 보일 배너가 없음. */
export type BannerSlotHiddenReason = 'no_banners' | 'no_content';

export interface ResolveBannerSlotInput<B> {
  /** 계정에 배너 슬롯이 부여됐는지(R21 ①). */
  granted: boolean;
  /** 숨김·차단 포함 전체 순서에서 슬롯 앞 링크 수. null = 맨 뒤. */
  slotIndex: number | null;
  /** 전체 순서의 링크마다 방문자에게 보이는지. */
  linkVisible: readonly boolean[];
  hasPortfolio: boolean;
  /** 게시 중 크리링 배너(순서대로). */
  adBanners: readonly B[];
  /** 보이는(숨김·차단 아님) 크리에이터 배너(순서대로). */
  creatorBanners: readonly B[];
}

export interface ResolvedBannerSlot<B> {
  kind: BannerSlotKind;
  /** 보이는 링크 중 슬롯 앞에 오는 수. 숨김일 때도 계산해 미리보기가 점선 자리를 그립니다. */
  afterLinkCount: number;
  banners: B[];
  hidden: BannerSlotHiddenReason | null;
}

/**
 * 슬롯 배치·숨김 규칙(R20 ①⑥, R21 ①③). 공개 랜딩 API와 관리 미리보기(`toLandingPreview`)가 함께 씁니다.
 * 공개 API는 hidden이 null이 아니면 `slot: null`로 바꿉니다. 미리보기는 'no_banners'일 때만 그 자리에 점선 자리를 그립니다.
 */
export function resolveBannerSlot<B>(input: ResolveBannerSlotInput<B>): ResolvedBannerSlot<B> {
  const kind: BannerSlotKind = input.granted ? 'creator' : 'ad';
  const banners = [...(input.granted ? input.creatorBanners : input.adBanners)];
  const before = Math.min(input.slotIndex ?? Infinity, input.linkVisible.length);
  let afterLinkCount = 0;
  for (let index = 0; index < before; index += 1) if (input.linkVisible[index]) afterLinkCount += 1;
  const hasVisibleLink = input.linkVisible.some(Boolean);
  let hidden: BannerSlotHiddenReason | null = null;
  if (kind === 'ad' && !hasVisibleLink && !input.hasPortfolio) hidden = 'no_content';
  else if (banners.length === 0) hidden = 'no_banners';
  return { kind, afterLinkCount, banners, hidden };
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
  /** 사람 계정인지 AI 운영자 계정인지(R23 ①). */
  accountKind: AccountKind;
  /** 운영자가 시험 계정으로 지표에서 뺐는지(PRD `목표`, R23 ⑧). */
  metricsExcluded: boolean;
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
  /** 배너 슬롯 부여 시각(R21 ①). null이면 부여되지 않음(광고 블록). */
  bannerSlot: { grantedAt: string | null };
  /** 크리에이터 배너 전체(회수 뒤 보관분·숨김·차단 포함, 순서대로). */
  banners: CreatorBannerView[];
  bannerLimits: BannerLimits;
  /** 링크 슬롯 이벤트 신청(R24). 신청하지 않았으면 null. 보너스는 extraLinkSlots와 따로 limits.visibleMax에 더해집니다. */
  slotEvent: SlotEventEntryView | null;
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
  /**
   * 크리에이터 배너별 클릭(R21 ④, 원본과 보존 집계 합계). bannerId는 배너 공개 ID, 지운 배너는 alt null.
   * `totals.linkClicks`·`daily`에는 넣지 않습니다.
   */
  bannerClicks: Array<{ bannerId: string; alt: string | null; clicks: number }>;
}

/** `PUT /api/admin/creators/{userId}/extra-slots`. 응답은 `OperatorCreatorDetail`. */
export interface SetExtraSlotsRequest {
  extraSlots: number;
}

/** `PUT /api/admin/creators/{userId}/suspension`. 응답은 `OperatorCreatorDetail`. */
export interface SetSuspensionRequest {
  suspended: boolean;
}

/** `PUT /api/admin/creators/{userId}/banner-slot`. 부여·회수(회수해도 배너는 보관). 응답은 `OperatorCreatorDetail`. 400 `validation_failed`, 404 `creator_not_found`. */
export interface SetBannerSlotRequest {
  granted: boolean;
}

/** `PUT /api/admin/links/{linkId}/block`은 `LinkView`, `PUT /api/admin/banners/{bannerId}/block`은 `CreatorBannerView`(404 `banner_not_found`)를 돌려줍니다. */
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

/**
 * 크리링 배너 상태(같은 시각 기준). live: 시작 ≤ 지금이고 끝이 없거나 지금보다 뒤, scheduled: 시작 > 지금, ended: 끝 ≤ 지금.
 */
export type AdBannerStatus = 'live' | 'scheduled' | 'ended';

/** 크리링 배너(R20 ④). */
export interface AdBannerView {
  /** uuid. */
  id: string;
  image: ImageRef;
  stillImage: ImageRef | null;
  alt: string;
  url: string;
  /** 시간대가 붙은 ISO 8601. */
  startsAt: string;
  endsAt: string | null;
  status: AdBannerStatus;
  /** 게시 시작부터의 누적 노출·클릭(설계 결정 6). */
  impressions: number;
  clicks: number;
  createdAt: string;
}

/** `GET /api/admin/ad-banners` 응답. 전체를 순서대로 돌려주며 웹이 item.status로 걸러 봅니다. */
export interface AdBannerListResponse {
  items: AdBannerView[];
  counts: { all: number; live: number; scheduled: number; ended: number };
}

/**
 * `POST /api/admin/ad-banners`(201, 맨 뒤 순서). 응답은 `AdBannerView`.
 * startsAt·endsAt는 시간대가 붙은 ISO 8601(없으면 400 `validation_failed`), endsAt > startsAt(아니면 400 `banner_period_invalid`).
 * 400 `validation_failed`·`link_url_invalid`·`banner_period_invalid`, 404 `file_not_found`, 422 `link_domain_blocked`.
 */
export interface AdBannerRequest {
  imageFileId: string;
  /** 이미지가 움직이면 필수, 아니면 null. */
  stillImageFileId?: string | null;
  alt: string;
  /** http·https. */
  url: string;
  startsAt: string;
  endsAt?: string | null;
}

/**
 * `PATCH /api/admin/ad-banners/{id}`. 바뀐 필드만 보냅니다. 응답은 `AdBannerView`. 오류는 POST와 같고 404 `ad_banner_not_found`가 더해집니다.
 * `PUT /api/admin/ad-banners/{id}/end`는 `AdBannerView`(끝남, 멱등, 404 `ad_banner_not_found`).
 * `PUT /api/admin/ad-banners/order`는 `ReorderRequest`(크리링 배너 전체) → `AdBannerView[]`(400 `order_mismatch`).
 */
export type UpdateAdBannerRequest = Partial<AdBannerRequest>;

// ---------- AI 운영자 (R23) ----------
// 근거: docs/specs/crelink-ai-operator.md (API 계약 초안). 0089(슬롯 이벤트)는 지표 `events`와 행동 이름만 더합니다.

/** 계정 종류. AI 계정은 Google 신원 없이 API 토큰(Bearer)으로만 로그인하는 운영자입니다. */
export type AccountKind = 'human' | 'ai';

/** 운영자 행동 기록의 행위자 종류. `system`은 서버 CLI(토큰 발급·폐기)입니다. */
export type OperatorActorKind = 'human' | 'ai' | 'system';

export const AI_OPERATOR_LIMITS = {
  /** 시작 뒤 이 시간이 지난 `running` 실행은 다음 시작 때 `abandoned`로 닫히고 실행 헤더로 쓸 수 없습니다. */
  staleRunMinutes: 90,
  runPageSize: 20,
  actionPageSize: 50,
  summaryMax: 2000,
  /** `actions`·`nextSteps` 항목 하나의 길이와 항목 수. */
  listItemMax: 300,
  listItemsMax: 30,
  refsMax: 20,
  refLabelMax: 100,
  pausedReasonMax: 200,
  hostMax: 60,
  modelMax: 100,
  tokenLabelMax: 60,
  /** PRD `목표`의 실사용자 목표 수. */
  realUserGoal: 100,
} as const;

/** AI의 상태 변경 요청에 붙이는 진행 중 실행 id 헤더. */
export const AGENT_RUN_HEADER = 'X-Crelink-Agent-Run';

/** AI 운영자 토큰 원문 접두사. 원문은 `crl_ai_` + base64url 43자이고 DB에는 SHA-256 해시만 둡니다. */
export const AI_TOKEN_PREFIX = 'crl_ai_';
export const AI_TOKEN_PATTERN = /^crl_ai_[A-Za-z0-9_-]{43}$/;

/** 웹의 토큰 전용 경로 접두사. `{AI_AGENT_PROXY_PATH}/api/…`를 같은 색 API의 `/api/…`로 넘깁니다(쿠키 없음). */
export const AI_AGENT_PROXY_PATH = '/api/agent';

export interface ApiTokenView {
  id: string;
  label: string;
  /** 원문 앞 12자(`crl_ai_` + 5자). */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AiAccountView {
  userId: string;
  email: string;
  createdAt: string;
  suspended: boolean;
  /** 만든 순서(최근 먼저). 폐기한 토큰도 포함합니다. */
  tokens: ApiTokenView[];
}

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'paused' | 'abandoned';
export type AgentRunTrigger = 'schedule' | 'manual';
export type AgentRunRefKind = 'pr' | 'work_item' | 'commit' | 'deploy' | 'other';

/** 실행과 관련된 PR·work item 등. url은 http·https만 받습니다. */
export interface AgentRunRef {
  kind: AgentRunRefKind;
  label: string;
  url: string | null;
}

export interface AgentRunView {
  id: string;
  status: AgentRunStatus;
  trigger: AgentRunTrigger;
  host: string | null;
  startedAt: string;
  /** `running`이면 null. `paused`는 같은 멈춤 동안 마지막으로 합친 시각입니다. */
  endedAt: string | null;
  /** 같은 멈춤 동안 합친 `paused` 기록 수(1부터). */
  pausedCount: number;
  summary: string | null;
  actions: string[];
  nextSteps: string[];
  refs: AgentRunRef[];
  model: string | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** 실행한 AI 계정의 이메일. 계정을 지웠으면 null. */
  actorEmail: string | null;
  /** 이 실행에서 남긴 운영자 행동 기록 수. */
  operatorActionCount: number;
}

/** `GET /api/admin/agent-runs?cursor=` 응답. 최신순 `AI_OPERATOR_LIMITS.runPageSize`개. 잘못된 커서는 400 `validation_failed`. */
export interface AgentRunPage {
  items: AgentRunView[];
  nextCursor: string | null;
}

/** `GET /api/admin/agent-runs/{runId}` 응답. 없거나 형식이 틀린 id는 404 `agent_run_not_found`. */
export interface AgentRunDetail extends AgentRunView {
  /** 이 실행의 운영자 행동 기록(최신순). */
  operatorActions: OperatorActionView[];
}

/**
 * `POST /api/admin/agent-runs`(AI만, 201). 응답은 `AgentRunView`이며 멈춤이면 `status: 'paused'`(실행하지 않음).
 * 90분이 지난 `running`은 먼저 `abandoned`로 닫힙니다. 진행 중 실행이 있으면 409 `agent_run_in_progress`.
 */
export interface StartAgentRunRequest {
  trigger: AgentRunTrigger;
  host?: string | null;
  model?: string | null;
}

/**
 * `PATCH /api/admin/agent-runs/{runId}`(AI만, 자기 실행). 응답은 `AgentRunView`. 바뀐 필드만 보내고, status를 주면 닫힙니다.
 * 400 `validation_failed`, 403 `forbidden`(다른 계정의 실행), 404 `agent_run_not_found`, 409 `agent_run_closed`.
 * 실행 헤더가 없어도 되고 멈춤 중에도 됩니다(기록 닫기).
 */
export interface UpdateAgentRunRequest {
  status?: 'succeeded' | 'failed';
  summary?: string | null;
  actions?: string[];
  nextSteps?: string[];
  refs?: Array<{ kind: AgentRunRefKind; label: string; url?: string | null }>;
  model?: string | null;
  costUsd?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/** `GET /api/admin/ai-operator` 응답. `PUT …/pause`·`PUT …/tokens/{id}/revoke`도 같은 형식을 돌려줍니다. */
export interface AiOperatorStatus {
  paused: boolean;
  pausedReason: string | null;
  updatedAt: string;
  /** 마지막으로 멈춤을 바꾼 사람 운영자 이메일. 없으면 null. */
  updatedBy: string | null;
  accounts: AiAccountView[];
  /** 진행 중(`running`) 실행. 90분이 지났어도 다음 시작 전까지는 여기 남습니다(`startedAt`으로 판단). */
  runningRun: AgentRunView | null;
  /** 가장 최근에 시작한 닫힌 실행(`running` 밖 상태: 성공·실패·멈춤·포기). */
  lastRun: AgentRunView | null;
}

/** `PUT /api/admin/ai-operator/pause`(사람 운영자만). reason은 `AI_OPERATOR_LIMITS.pausedReasonMax`자 이하. */
export interface SetAiOperatorPauseRequest {
  paused: boolean;
  reason?: string | null;
}

/** 운영자 행동 이름. 다른 에픽이 더한 행동도 기록에 오므로 화면은 모르는 값을 원래 키로 보여 줍니다. */
export type OperatorActionType =
  | 'creator.extra_slots'
  | 'creator.suspension'
  | 'creator.banner_slot'
  | 'creator.metrics_exclusion'
  | 'link.block'
  | 'banner.block'
  | 'blocked_domain.add'
  | 'blocked_domain.remove'
  | 'ad_banner.create'
  | 'ad_banner.update'
  | 'ad_banner.reorder'
  | 'ad_banner.end'
  | 'ai_operator.pause'
  | 'ai_operator.token_issue'
  | 'ai_operator.token_revoke';

export type OperatorActionTargetType =
  'user' | 'link' | 'creator_banner' | 'blocked_domain' | 'ad_banner' | 'ai_operator' | 'api_token';

export interface OperatorActionView {
  id: string;
  createdAt: string;
  actor: { kind: OperatorActorKind; userId: string | null; email: string | null };
  /** `OperatorActionType` 값. 다른 에픽이 더한 행동도 오므로 string입니다. */
  action: string;
  /** `OperatorActionTargetType` 값. */
  targetType: string;
  targetId: string | null;
  /** 행동이 걸린 크리에이터(링크·배너 차단은 그 소유자). 크리에이터 상세 링크에 씁니다. */
  subjectUserId: string | null;
  /** 바뀐 필드만 담은 이전·이후 값. 화면은 JSON 글자로만 보여 줍니다. */
  before: unknown;
  after: unknown;
  runId: string | null;
}

/**
 * `GET /api/admin/actions?cursor=&actor=` 응답. 최신순 `AI_OPERATOR_LIMITS.actionPageSize`개.
 * actor는 `OperatorActorKind` 중 하나(없으면 전체). 잘못된 커서·actor는 400 `validation_failed`.
 */
export interface OperatorActionPage {
  items: OperatorActionView[];
  nextCursor: string | null;
}

/** 지표 확장 지점(R24 이벤트 등). */
export interface AiOperatorMetricEvent {
  key: string;
  label: string;
  value: number;
}

/**
 * `GET /api/admin/metrics` 응답. 실사용자 정의는 PRD `목표`(설계 `지표 정의`). 기간은 지금부터 거꾸로 센 시간이고,
 * 광고 배너 노출·클릭만 서울 날짜 오늘 포함 7일입니다.
 */
export interface AiOperatorMetrics {
  generatedAt: string;
  goal: { realUsers: number };
  realUsers: number;
  /** 사람 크리에이터 수와 그중 지표 제외 수. */
  creators: { total: number; excluded: number };
  signups: { last24Hours: number; last7Days: number; last30Days: number };
  visits: { last7Days: number; last30Days: number };
  linkClicks: { last7Days: number; last30Days: number };
  adBanners: { live: number; impressionsLast7Days: number; clicksLast7Days: number };
  events: AiOperatorMetricEvent[];
}

/** `PUT /api/admin/creators/{userId}/metrics-exclusion`(사람 운영자만). 응답은 `OperatorCreatorDetail`. */
export interface SetMetricsExclusionRequest {
  excluded: boolean;
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
  meBanners: '/api/me/banners',
  meBanner: (id: string) => `/api/me/banners/${encodeURIComponent(id)}`,
  meBannersOrder: '/api/me/banners/order',
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
  adminCreatorBannerSlot: (userId: string) => `/api/admin/creators/${encodeURIComponent(userId)}/banner-slot`,
  adminBannerBlock: (bannerId: string) => `/api/admin/banners/${encodeURIComponent(bannerId)}/block`,
  adminAdBanners: '/api/admin/ad-banners',
  adminAdBanner: (id: string) => `/api/admin/ad-banners/${encodeURIComponent(id)}`,
  adminAdBannerEnd: (id: string) => `/api/admin/ad-banners/${encodeURIComponent(id)}/end`,
  adminAdBannersOrder: '/api/admin/ad-banners/order',
  /** 링크 슬롯 이벤트(R24). */
  publicSlotEvent: '/api/public/slot-event',
  meSlotEventEntry: '/api/me/slot-event/entry',
  /** `GET ?page=`(1부터), `PUT`은 `SetSlotEventPeriodRequest`. */
  adminSlotEvent: '/api/admin/slot-event',
  /** `cursor`: 이전 응답의 `GuestbookPage.nextCursor`. */
  landingGuestbook: (publicId: string, cursor?: string | null) =>
    `/api/landings/${encodeURIComponent(publicId)}/guestbook${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  guestbookEntry: (entryId: string) => `/api/guestbook/${encodeURIComponent(entryId)}`,
  guestbookEntryHidden: (entryId: string) => `/api/guestbook/${encodeURIComponent(entryId)}/hidden`,
  // AI 운영자(R23)
  adminAiOperator: '/api/admin/ai-operator',
  adminAiOperatorPause: '/api/admin/ai-operator/pause',
  adminApiTokenRevoke: (tokenId: string) => `/api/admin/ai-operator/tokens/${encodeURIComponent(tokenId)}/revoke`,
  /** `cursor`: 이전 응답의 `AgentRunPage.nextCursor`. */
  adminAgentRuns: (cursor?: string | null) =>
    `/api/admin/agent-runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  adminAgentRun: (runId: string) => `/api/admin/agent-runs/${encodeURIComponent(runId)}`,
  /** `cursor`: 이전 응답의 `OperatorActionPage.nextCursor`, `actor`: 행위자 걸러보기. */
  adminActions: (options: { cursor?: string | null; actor?: OperatorActorKind | null } = {}) => {
    const query = new URLSearchParams();
    if (options.actor) query.set('actor', options.actor);
    if (options.cursor) query.set('cursor', options.cursor);
    const text = query.toString();
    return `/api/admin/actions${text ? `?${text}` : ''}`;
  },
  adminMetrics: '/api/admin/metrics',
  adminCreatorMetricsExclusion: (userId: string) =>
    `/api/admin/creators/${encodeURIComponent(userId)}/metrics-exclusion`,
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
  // AI 운영자(R23) 운영자 화면
  adminAgentRuns: '/admin/agent-runs',
  adminAgentRun: (runId: string) => `/admin/agent-runs/${encodeURIComponent(runId)}`,
  adminActions: '/admin/actions',
} as const;

// ---------- 링크 슬롯 이벤트 (R24) ----------
// 근거: docs/specs/crelink-slot-event.md. 신청한 계정만 보이는 외부 링크 한도가 bonusLinks만큼 늘어납니다(R13 운영자 추가 슬롯과 따로 합산).

/** 'scheduled' = 시작 전, 'open' = 신청 받는 중, 'ended' = 끝남. API가 DB 시각으로 정합니다. 열림 = startsAt <= 지금 < endsAt. */
export type SlotEventStatus = 'scheduled' | 'open' | 'ended';

export interface SlotEventView {
  /** 신청하면 늘어나는 보이는 외부 링크 수. */
  bonusLinks: number;
  startsAt: string;
  /** null이면 운영자가 끝을 정할 때까지 계속. */
  endsAt: string | null;
  status: SlotEventStatus;
}

/** `GET /api/public/slot-event`. 이벤트가 없으면 event: null. */
export interface PublicSlotEventResponse {
  event: SlotEventView | null;
}

export interface SlotEventEntryView {
  appliedAt: string;
  /** 신청 때 받은 보너스(이벤트 설정이 바뀌어도 그대로, 회수 없음). */
  bonusLinks: number;
}

/**
 * `CreatorLandingState.slotEvent`, `POST /api/me/slot-event/entry` 응답(201 새로 신청, 200 이미 신청 — 멱등).
 * 신청 오류: 404 `slot_event_not_found`, 409 `slot_event_closed`(시작 전·끝남).
 */
export interface CreatorSlotEventState {
  event: SlotEventView | null;
  entry: SlotEventEntryView | null;
}

export interface OperatorSlotEventEntry {
  userId: string;
  email: string;
  displayName: string | null;
  slug: string;
  appliedAt: string;
}

/**
 * `GET /api/admin/slot-event?page=`, `PUT /api/admin/slot-event` 응답. entries는 신청 최신순, page는 1부터,
 * pageSize는 `CRELINK_LIMITS.operatorPageSize`. 이벤트가 없으면 404 `slot_event_not_found`.
 */
export interface OperatorSlotEventResponse {
  event: SlotEventView;
  entryCount: number;
  entries: OperatorSlotEventEntry[];
  page: number;
  pageSize: number;
}

/** `PUT /api/admin/slot-event`. ISO 8601. endsAt null = 끝 없음. 끝 ≤ 시작이면 400 `slot_event_period_invalid`. */
export interface SetSlotEventPeriodRequest {
  startsAt: string;
  endsAt: string | null;
}
