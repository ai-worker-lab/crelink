import { CRELINK_WEB_PATHS } from '@crelink/shared';

/** 공개 문서(/docs) 목록. 공개해도 되는 문서만 여기에 둡니다(내부 기록 CHANGELOGS.md·운영 문서는 넣지 않음, docs/work/orchestrator/0043-public-docs-page.md). */
export const PUBLIC_DOCS = [
  {
    href: CRELINK_WEB_PATHS.docsGuide,
    title: '사용 안내',
    description: '가입부터 프로필·링크 편집, 크리링 링크를 인스타그램에 붙이기까지.',
  },
  {
    href: CRELINK_WEB_PATHS.docsReleases,
    title: '릴리스 노트',
    description: '공개한 버전마다 바뀐 점.',
  },
  {
    href: CRELINK_WEB_PATHS.docsBrand,
    title: '브랜드와 디자인',
    description: '크리링 화면이 쓰는 색·글꼴·간격·모서리.',
  },
  {
    href: CRELINK_WEB_PATHS.privacy,
    title: '개인정보 처리방침',
    description: '수집하는 항목과 보관 기간, 국외 이전.',
  },
] as const;

/**
 * 검색 유입용 활용 가이드 글(docs/work/web/0146-usage-guide-content.md). 크리에이터가 검색할 질문 하나에 답하고 가입으로 이어집니다.
 * 문서 목록(/docs)과 sitemap에 들어가고, 문서 사이 이동 메뉴(DocsNav)에는 넣지 않습니다(메뉴를 짧게 둠).
 */
export const GUIDE_ARTICLES = [
  {
    href: '/docs/instagram-profile-links',
    title: '인스타그램 프로필에 링크 여러 개 넣는 법',
    description: '프로필 링크 칸에 링크를 넣는 방법과, 링크 한 개로 SNS·포트폴리오·외부 링크를 모두 보여 주는 방법.',
  },
  {
    href: '/docs/creator-portfolio-page',
    title: '협업 제안을 받는 크리에이터 포트폴리오 페이지 만들기',
    description: '협업 이력·SNS 채널·연락 링크를 한 페이지에 정리해 프로필 링크로 전하는 순서.',
  },
] as const;
