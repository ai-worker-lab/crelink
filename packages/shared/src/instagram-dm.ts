/** Instagram 댓글 자동 DM 계약. 근거: docs/specs/instagram-comment-dm.md (`API 계약 초안`, `화면 상태`, `데이터 모델`). */

export const INSTAGRAM_DM_LIMITS = {
  /** 활성 규칙 상한. */
  activeRules: 10,
  /** 보관 규칙을 포함한 규칙 상한. */
  totalRules: 100,
  /** 게시물 목록 응답 상한. */
  mediaPageSize: 25,
  /** 발송 내역 응답 상한. */
  deliveryPageSize: 20,
  keywordMaxLength: 30,
  messageMaxLength: 250,
} as const;

export type InstagramConnectionStatus = 'active' | 'messages_access_required' | 'reauth_required';
export type InstagramDmDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'expired' | 'cancelled';
export type InstagramDmAudience = 'off' | 'operators' | 'everyone';

/** 연결 정보. 만료 시각이 없으면 `tokenExpiresAt`은 null입니다. */
export interface InstagramConnectionView {
  igUsername: string;
  status: InstagramConnectionStatus;
  paused: boolean;
  operatorPaused: boolean;
  connectedAt: string;
  tokenExpiresAt: string | null;
}

/** `GET /api/me/instagram` 응답. */
export interface InstagramIntegrationView {
  available: boolean;
  connection: InstagramConnectionView | null;
  limits: {
    activeRules: number;
    totalRules: number;
  };
}

/** 게시물 선택 목록 항목. */
export interface InstagramDmMediaView {
  id: string;
  caption: string;
  permalink: string;
  thumbnailUrl: string;
  timestamp: string;
}

/** 규칙 목록·변경 응답. 보관된 규칙은 일반 규칙 목록에서 반환하지 않습니다. */
export interface InstagramDmRuleView {
  publicId: string;
  mediaId: string;
  mediaPermalink: string;
  mediaCaptionPreview: string;
  keyword: string;
  message: string;
  channelLinkCode: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 규칙 생성 요청. keyword 1~30자, message 1~250자입니다. */
export interface CreateInstagramDmRuleRequest {
  mediaId: string;
  keyword: string;
  message: string;
}

/** 규칙 부분 수정 요청. keyword 1~30자, message 1~250자입니다. */
export interface UpdateInstagramDmRuleRequest {
  keyword?: string;
  message?: string;
  enabled?: boolean;
}

/** 발송 내역 항목. 개인정보·내부 실패 정보는 포함하지 않습니다. */
export interface InstagramDmDeliveryView {
  id: string;
  ruleId: string;
  keyword: string;
  mediaPreview: string;
  status: InstagramDmDeliveryStatus;
  createdAt: string;
  sentAt: string | null;
}

/** 운영자 스위치 설정. */
export interface InstagramDmSettingsView {
  audience: InstagramDmAudience;
}

/** 운영자 스위치 변경 요청. */
export interface SetInstagramDmAudienceRequest {
  audience: InstagramDmAudience;
}

/** 크리에이터 또는 운영자의 연결 정지 요청. */
export interface SetInstagramConnectionPauseRequest {
  paused: boolean;
}

/** 공개 수신 거부 요청. 토큰은 서버에서 검증하며 공유 계약은 본문 길이를 계산하지 않습니다. */
export interface InstagramDmOptOutRequest {
  token: string;
}
