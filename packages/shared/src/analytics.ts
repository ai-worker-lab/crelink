import type { CountByValue } from './crelink.js';
import type { LandingTargetKind } from './telemetry.js';

export const ANALYTICS_LIMITS = { defaultRangeDays: 30, maxRangeDays: 366, breakdownValues: 20, targets: 100 } as const;

/** 날짜는 Asia/Seoul 기준 양 끝 포함. 관리자만 creatorId·landingPublicId를 받습니다. */
export interface AnalyticsQuery {
  from?: string;
  to?: string;
  creatorId?: string;
  landingPublicId?: string;
  /** 관리자 서비스 조회에서 시험 계정도 포함. 생략하면 제외합니다. */
  includeExcluded?: '1';
}

export interface AnalyticsTotals {
  pageViews: number;
  clicks: number;
  impressions: number;
  /** page_view 앵커의 누적 최댓값만 합합니다. engagement 이벤트는 다시 더하지 않습니다. */
  activeMs: number;
  /** activeMs / pageViews. 표시가 없으면 null. */
  averageActiveMs: number | null;
  /** 선택 범위 전체 DISTINCT. 보존 집계를 포함하면 정확한 중복 제거가 불가능해 null. */
  uniqueVisitors: number | null;
  sessions: number | null;
  /** 일별·페이지별 순 방문자/세션 합. 전체 기간의 정확한 순 방문자/세션과 다릅니다. */
  dailyPageUniqueVisitors: number;
  dailyPageSessions: number;
  /** 해당 기간에 시작한 page_view 중 클릭이 한 번 이상인 수. 복원할 수 없는 과거 집계면 null. */
  clickedPageViews: number | null;
  /** clickedPageViews / pageViews(0~1). pageViews가 0이거나 과거 값이 없으면 null. */
  clickThroughRate: number | null;
  /** 해당 기간에 시작한 page_view 중 각 스크롤 비율에 도달한 수. 과거 값이 없으면 null. */
  scroll25: number | null;
  scroll50: number | null;
  scroll75: number | null;
  scroll100: number | null;
}

export interface AnalyticsDaily extends AnalyticsTotals {
  day: string;
  legacyVisits: number;
  legacyLinkClicks: number;
  legacyCreatorBannerClicks: number;
}

export interface AnalyticsTarget {
  targetKind: LandingTargetKind;
  targetId: string;
  /** 현재 대상 이름. 삭제된 대상은 null. 방문자 식별자는 포함하지 않습니다. */
  label: string | null;
  clicks: number;
  impressions: number;
  /** 해당 기간 관측 노출 중 같은 page_view·대상에 후속 클릭이 있는 비율(0~1). */
  clickThroughRate: number | null;
}

/** 모든 분포는 page_view 기준이며 값이 없으면 unknown. 상위 20개 뒤 나머지는 other로 합합니다. */
export interface AnalyticsBreakdowns {
  referrers: CountByValue[];
  countries: CountByValue[];
  cities: CountByValue[];
  devices: CountByValue[];
  browsers: CountByValue[];
  operatingSystems: CountByValue[];
  languages: CountByValue[];
  timeZones: CountByValue[];
  viewports: CountByValue[];
  screenSizes: CountByValue[];
  pixelRatios: CountByValue[];
  utm: Record<'source' | 'medium' | 'campaign' | 'term' | 'content' | 'id', CountByValue[]>;
}

/** 유입 값별 클릭 성과. 페이지뷰는 분포와 같은 합계이고 클릭 값은 원본에서만 계산합니다. */
export interface AnalyticsSourceRow {
  value: string;
  pageViews: number;
  /** 한 번 이상 클릭한 페이지뷰. 선택 기간에 보존 집계가 섞이면 null. */
  clickedPageViews: number | null;
  clickThroughRate: number | null;
}

/**
 * GET /api/me/analytics · /api/admin/analytics. 지표·통계 화면이 같은 응답을 사용합니다.
 * 일반 수량은 이벤트 발생일, CTR·체류·스크롤은 page_view/노출 시작일 기준입니다.
 * legacy는 서버 302 기록이며 브라우저 이벤트와 합산하지 않습니다. 원 IP·UA·방문자/세션 UUID는 반환하지 않습니다.
 */
export interface AnalyticsReport {
  from: string;
  to: string;
  timeZone: 'Asia/Seoul';
  generatedAt: string;
  coverage: {
    /** 현재 원본 보존 기준일. 이 날짜 전에도 보존 작업 전 원본이 남아 있을 수 있습니다. */
    rawFrom: string;
    includesRollups: boolean;
    /** 해당 소유 범위 전체 가용 자료의 첫 수집 날짜이며 실제 계측 도입일을 뜻하지 않습니다. */
    firstRecordedDay: string | null;
    /** 세부 분포를 복원할 수 없는 과거 page_view가 있어 unknown에 포함했는지 여부. */
    hasMissingDimensions: boolean;
  };
  scope: {
    kind: 'service' | 'creator';
    creatorId: string | null;
    landingPublicId: string | null;
    /** 서비스 범위일 때만 의미가 있습니다. */
    includeExcluded: boolean;
  };
  summary: AnalyticsTotals;
  daily: AnalyticsDaily[];
  legacy: { visits: number; linkClicks: number; creatorBannerClicks: number };
  breakdowns: AnalyticsBreakdowns;
  /** 유입 사이트·UTM 소스별 페이지뷰·클릭 성과. 값과 분모 규칙은 breakdowns와 같습니다. */
  sources: { referrers: AnalyticsSourceRow[]; utmSources: AnalyticsSourceRow[] };
  /**
   * 선택 기간 익명 방문자(uniqueVisitors)를 기간 시작 전 page_view 유무로 나눈 수. 비교는 같은 소유 범위의 남아 있는 원본 안에서 합니다.
   * 선택 기간에 보존 집계가 섞이면 null.
   */
  visitorRecency: { newVisitors: number | null; returningVisitors: number | null };
  /**
   * isBotUserAgent로 판별해 위 합계·분포·legacy에서 뺀 건수. 보존 집계는 User-Agent가 없어 구분할 수 없고 그대로 합계에 남으며,
   * 그 구간이 섞이면 null입니다.
   */
  botExclusions: { pageViews: number | null; visits: number | null; redirectClicks: number | null };
  /** 클릭·노출 내림차순 상위 100개 대상. */
  targets: AnalyticsTarget[];
}
