import { CRELINK_WEB_PATHS } from '@crelink/shared';
import type { Metadata } from 'next';
import { GUIDE_ARTICLES, PUBLIC_DOCS } from './docs';

/**
 * 운영 본 도메인. 운영 설정 `infra/prod/secrets/<대상>.sops.env`의 평문 `WEB_URL`과 같은 값이어야 합니다.
 * 홈·문서는 빌드 때 그려지거나(정적) 실행 환경 변수가 없어도 같은 값을 내야 하므로 코드에 둡니다.
 * OG 이미지·sitemap·robots의 절대 주소를 만듭니다(로컬에서도 운영 주소를 가리킴).
 */
export const SITE_URL = 'https://links.shaul.kr';

export const SITE_DESCRIPTION =
  '인스타그램 프로필 링크 하나로 SNS·포트폴리오·외부 링크를 모아 보여 주는 크리에이터 랜딩페이지, 크리링.';

/**
 * 크리링 소개 링크 미리보기(홈·문서). 원본 HTML은 `apps/web/docs/og-image/og-image.html`(1200×630 화면 캡처).
 * 루트 레이아웃에 두지 않습니다. 공개 랜딩(`/p/{publicId}`)이 물려받으면 크리에이터 미리보기에 크리링 소개가 섞입니다.
 */
export function crelinkOpenGraph(title: string, description: string): NonNullable<Metadata['openGraph']> {
  return {
    type: 'website',
    siteName: '크리링',
    locale: 'ko_KR',
    title,
    description,
    images: [
      { url: '/og-image.png', width: 1200, height: 630, alt: '크리링: 인스타그램 프로필 링크 하나로 나를 소개하세요.' },
    ],
  };
}

/**
 * sitemap에 넣는 공개 경로: 홈·문서 목록·공개 문서·활용 가이드 글.
 * 공개 랜딩은 넣지 않습니다. 외부에서 들어온 랜딩 요청은 단축 주소로 보내 방문을 기록하므로(PRD R7) 검색 봇이 방문 통계를 늘립니다.
 */
export const SITEMAP_PATHS = [
  '/',
  CRELINK_WEB_PATHS.docs,
  ...PUBLIC_DOCS.map((doc) => doc.href),
  ...GUIDE_ARTICLES.map((article) => article.href),
];

/** 검색 봇이 볼 필요 없는 로그인·관리·운영자·BFF 경로. */
export const ROBOTS_DISALLOW = ['/admin', '/me', '/auth/', '/api/'];
