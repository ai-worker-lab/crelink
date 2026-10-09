import { CRELINK_LIMITS, type CrelinkErrorCode, type NoticeReason } from '@crelink/shared';

/** 업로드 이미지 크기 한도 표시(예: `4MB`). 숫자는 계약 `CRELINK_LIMITS.imageMaxBytes`에서만 옵니다. */
export const IMAGE_MAX_LABEL = `${Math.floor(CRELINK_LIMITS.imageMaxBytes / (1024 * 1024))}MB`;

/** API 오류 코드별 사용자 안내. 계약(`CrelinkErrorCode`)의 모든 코드를 다룹니다. */
const API_ERROR_MESSAGES: Record<CrelinkErrorCode, string> = {
  validation_failed: '입력값을 확인해 주세요.',
  unauthenticated: '로그인이 필요해요. 다시 로그인해 주세요.',
  forbidden: '이 작업을 할 권한이 없어요.',
  auth_not_configured: '구글 로그인이 아직 설정되지 않았어요. 운영자에게 문의해 주세요.',
  oauth_state_invalid: '로그인 요청이 만료됐거나 올바르지 않아요. 처음부터 다시 로그인해 주세요.',
  oauth_failed: '구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.',
  account_suspended: '이용이 정지된 계정이에요. 운영자에게 문의해 주세요.',
  file_not_found: '이미지를 찾을 수 없어요. 다시 올려 주세요.',
  file_type_unsupported: 'JPG·PNG·WebP·GIF 이미지만 올릴 수 있어요.',
  file_too_large: `이미지는 ${IMAGE_MAX_LABEL} 이하만 올릴 수 있어요.`,
  slug_invalid: '주소는 영소문자·숫자·하이픈(-) 3~30자로, 처음과 끝은 영소문자나 숫자여야 해요.',
  slug_reserved: '크리링이 쓰는 예약 주소라 쓸 수 없어요.',
  slug_taken: '이미 사용 중이거나 다른 크리에이터를 위해 보관 중인 주소예요.',
  slug_change_too_soon: '주소는 30일에 한 번만 바꿀 수 있어요.',
  link_not_found: '링크를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요.',
  link_url_invalid: 'http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.',
  link_domain_blocked: '크리링 차단 목록에 있는 도메인이라 저장할 수 없어요.',
  link_limit_reached: '보이는 링크 한도에 도달했어요. 다른 링크를 숨기거나 지운 뒤 다시 시도해 주세요.',
  link_total_limit_reached: '숨긴 링크를 포함해 링크는 최대 50개까지 둘 수 있어요.',
  order_mismatch: '목록이 다른 곳에서 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.',
  portfolio_item_not_found: '포트폴리오 항목을 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요.',
  portfolio_limit_reached: '포트폴리오는 최대 20개까지 둘 수 있어요.',
  landing_not_found: '랜딩페이지를 찾을 수 없어요.',
  creator_suspended: '운영이 중지된 크리에이터예요.',
  creator_not_found: '크리에이터를 찾을 수 없어요.',
  date_range_invalid: '기간이 올바르지 않아요. 시작일이 종료일보다 늦지 않게, 최대 366일까지 골라 주세요.',
  domain_invalid: '올바른 도메인을 입력해 주세요. 예: example.com',
  domain_exists: '이미 차단 목록에 있는 도메인이에요.',
  domain_not_found: '차단 목록에 없는 도메인이에요.',
  guestbook_disabled: '방명록을 닫은 페이지예요.',
  guestbook_entry_not_found: '방명록 글을 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요.',
  // 배너 고정 문구(설계 docs/specs/crelink-ad-banner.md `상수·경로·오류 코드`). n·m을 넣은 문장과 회수 흐름은 배너 패널이 코드로 직접 처리합니다.
  banner_not_found: '배너를 찾을 수 없어요. 새로고침해 주세요.',
  banner_limit_reached: '보이는 배너 한도에 닿았어요.',
  banner_total_limit_reached: '배너 보관 한도에 닿았어요.',
  banner_slot_not_granted: '배너 슬롯이 회수되어 이 자리에 다시 크리링 광고 블록이 나와요.',
  ad_banner_not_found: '광고 배너를 찾을 수 없어요. 새로고침해 주세요.',
  banner_period_invalid: '게시 끝은 시작보다 뒤여야 해요.',
};

/** 웹(BFF·클라이언트)에서만 생기는 오류 코드. */
const WEB_ERROR_MESSAGES: Record<string, string> = {
  network_error: '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.',
  upstream_unavailable: 'API 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
  api_not_configured: 'API 서버 주소가 설정되지 않았어요.',
  route_not_allowed: '허용되지 않은 API 요청이에요.',
  /** 배너 이미지의 첫 장면 정지 이미지를 만들지 못함(`ImageField` 배너 모드, `lib/banner-image.ts`). */
  still_image_failed: '움직이는 이미지의 첫 장면을 만들지 못했어요. 다른 이미지를 골라 주세요.',
};

/**
 * 오류 코드에 맞는 한국어 안내를 고릅니다. `validation_failed`는 어떤 값이 틀렸는지 담긴 API 문구를 우선하고,
 * 나머지는 코드별 안내, 모르는 코드는 API 문구, 그것도 없으면 상태 코드 안내를 씁니다.
 */
export function errorMessage(code: string, apiMessage: string | null | undefined, status: number): string {
  if (code === 'validation_failed' && apiMessage) return apiMessage;
  const known = (API_ERROR_MESSAGES as Record<string, string>)[code] ?? WEB_ERROR_MESSAGES[code];
  if (known) return known;
  if (apiMessage) return apiMessage;
  return `요청을 처리하지 못했어요 (${status}). 잠시 후 다시 시도해 주세요.`;
}

/** `/notice?reason=` 안내 문구. 계약(`NoticeReason`)의 모든 사유를 다룹니다. */
export const NOTICE_MESSAGES: Record<NoticeReason, { title: string; body: string }> = {
  link_not_found: {
    title: '없는 주소예요.',
    body: '주소가 바뀌었거나 사라졌을 수 있어요. 크리에이터의 프로필에서 최신 링크를 확인해 주세요.',
  },
  link_unavailable: {
    title: '지금은 열 수 없는 링크예요.',
    body: '크리에이터가 링크를 숨기거나 지웠거나, 크리링이 안전을 위해 차단한 링크예요.',
  },
  creator_suspended: {
    title: '운영이 중지된 페이지예요.',
    body: '이 크리에이터의 크리링 페이지는 지금 볼 수 없어요.',
  },
  auth_not_configured: {
    title: '구글 로그인을 준비 중이에요.',
    body: '구글 로그인이 아직 설정되지 않았어요. 운영자에게 문의해 주세요.',
  },
  oauth_failed: {
    title: '구글 로그인에 실패했어요.',
    body: '로그인을 취소했거나 구글과 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
  oauth_state_invalid: {
    title: '로그인 요청이 만료됐어요.',
    body: '로그인 시간이 지났거나 다른 창에서 시작한 요청이에요. 처음부터 다시 로그인해 주세요.',
  },
  account_suspended: {
    title: '이용이 정지된 계정이에요.',
    body: '이 계정으로는 로그인할 수 없어요. 운영자에게 문의해 주세요.',
  },
};

export function isNoticeReason(value: string | null | undefined): value is NoticeReason {
  return !!value && Object.hasOwn(NOTICE_MESSAGES, value);
}
