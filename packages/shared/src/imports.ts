import type { CreatorLandingState, LinkView } from './crelink.js';

/** 공개 Instabio 버튼 링크만 가져옵니다. 목적 URL은 서버에서 방문하지 않습니다. */
export interface InstabioImportPreview {
  sourceUrl: string;
  fingerprint: string;
  profile: { displayName: string | null; bio: string | null; avatarUrl: string | null };
  links: { id: string; title: string; url: string; imageUrl: string | null }[];
  warnings: string[];
}

export interface InstabioImportRequest {
  url: string;
  fingerprint: string;
  links: { id: string; title: string }[];
  replaceProfile: boolean;
  /** 프로필을 교체할 때 다른 탭의 변경을 덮지 않도록 현재 저장값을 비교합니다. */
  expectedProfile?: { displayName: string | null; bio: string | null; avatarFileId: string | null };
}

/** 커밋된 결과만 반환합니다. 이후 편집 상태 재조회 실패가 저장 실패가 되지 않습니다. */
export interface InstabioImportResult {
  links: LinkView[];
  skipped: number;
  profile: Pick<CreatorLandingState['landing'], 'displayName' | 'bio' | 'avatar'> | null;
}
