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
