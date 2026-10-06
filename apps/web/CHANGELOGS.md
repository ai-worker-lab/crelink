# 웹 변경 기록

내부 참고용으로 웹 클라이언트의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-06

- 개발 서버 출력 디렉터리를 빌드와 나눔: `next.config.ts`의 `distDir: process.env.NEXT_DIST_DIR || '.next'`, `start`가 `NEXT_DIST_DIR=.next-dev`로 실행. `next-env.d.ts`를 Git에서 빼고 `typecheck`를 `next typegen && tsc --noEmit`으로, `tsconfig.json` include에 `.next-dev/types`. 개발 서버가 떠 있어도 `pnpm verify`의 `next build`가 개발 서버를 깨뜨리지 않음. 근거: `docs/work/orchestrator/0019-verify-build-clobbers-dev-web.md`.
- 랜딩 관리 화면 `/me/landings/[publicId]`(편집·보기 모드)를 추가하고 외부 링크 관리를 `/me`에서 옮김. 근거: `docs/work/web/0022-landing-link-editor.md`, PRD R18(R4·R5·R13·R14).
  - 공개 랜딩 본문을 공용 `src/components/landing/Landing.tsx`(`Landing`, `LinkCardContent`)로 빼 `/p/[publicId]`와 관리 화면이 함께 씀. 편집 상태를 공개 형태로 바꾸는 `src/lib/landing-preview.ts`(`toLandingPreview`: 공개 API와 같이 숨긴·차단 링크 제외, 링크 주소는 클릭 기록 주소 대신 저장된 URL이라 미리보기가 방문·클릭 통계를 남기지 않음).
  - 관리 화면: 남의 랜딩 ID는 찾을 수 없음 안내, 401은 `/`. 편집/보기 전환(`?mode=view`, `aria-current`), `/me`로 돌아가기, 공개 페이지 열기(새 창).
  - 편집 모드(`src/components/manage/`): 랜딩과 같은 배치에서 링크 구역만 편집. 카드별 끌기 손잡이·숨기기 스위치(`role="switch"`, 실패 시 되돌리고 안내)·숨김 흐리게·차단 배지와 사유, 한도(보이는 링크·전체) 표시와 도달 시 추가 대신 안내. 카드·'링크 추가'는 네이티브 `<dialog>` 하단 시트(`LinkSheet`: 제목·URL·설명·썸네일, 저장·삭제(확인)·닫기, Esc·배경 누르기로 닫기, 열 때 첫 입력 포커스, 닫으면 연 요소로 포커스 복귀, 모바일은 화면 아래·넓은 화면은 560px).
  - 순서 변경: `@dnd-kit/core` 6.3.1·`@dnd-kit/sortable` 10.0.0·`@dnd-kit/utilities` 3.2.2(모두 MIT) 의존성 추가. 마우스·터치(손잡이 `touch-action: none`)·키보드(스페이스/엔터로 들고 화살표로 옮김) 모두 지원, 한국어 스크린리더 안내, 놓으면 `PUT /api/me/links/order`, 실패 시 원래 순서로 되돌림.
  - `/me`: 외부 링크 폼 `LinksSection`을 지우고 '링크 관리' 요약 카드(`LinksSummary`: 보이는 링크 수/한도, 숨긴·차단 수, 관리 화면 버튼)로 바꿈. `/me` 머리글과 홈(로그인 후)에 '링크 관리' 링크 추가. 쓰지 않게 된 `.inline-notice` 스타일 삭제, `useAction`이 `setNotice`도 돌려줌.
- 프로필 사진이 없으면 기본 프로필(`src/components/DefaultAvatar.tsx`, 디자인 토큰 색의 인라인 SVG, 장식용 `aria-hidden`)을 랜딩페이지 머리와 `/me` 프로필 사진 자리에 표시. `ImageField`에 `placeholder` 속성 추가. 근거: `docs/work/web/0021-default-profile-avatar.md`, PRD R17.
- 크리링 MVP 웹 구현. 근거: `docs/work/web/0017-crelink-mvp-web.md`, 설계 `docs/specs/crelink-mvp.md`.
  - BFF 허용 목록을 계약(`CRELINK_API_PATHS`)의 공개·`me`·`admin`·`files`·로그아웃 경로로 넓힘. `cl_session` 쿠키만 API로 넘기고 API `Set-Cookie`·`Content-Type`·`Cache-Control`과 본문(이미지 바이너리)을 그대로 돌려줌, 204 처리, `POST api/me/files`의 multipart 본문·Content-Type 전달, POST·PUT·PATCH·DELETE의 `Origin` 불일치(없음 포함) 403 `forbidden`.
  - `serverApi`에 `session` 옵션(현재 요청의 `cl_session` 전달)과 401이면 `/`로 보내는 `loadSignedIn` 추가. API 오류 코드·`NoticeReason`별 한국어 안내(`src/lib/api/errors.ts`).
  - 구글 로그인 route handler `/auth/google`·`/auth/google/callback`(API `Set-Cookie`를 붙여 302, 실패는 `/notice?reason=`), 로그아웃 버튼.
  - 화면: `/`(소개·로그인 상태별 링크, 실행 확인용 API·DB 상태 표시 제거), `/me`(단축 URL 복사·주소 변경·프로필·외부 링크·SNS·포트폴리오), `/p/[publicId]`, `/notice`, `/privacy`, `/admin`, `/admin/creators/[userId]`, `/admin/blocked-domains`. 공통 폼·버튼·표·랜딩 스타일을 `src/styles.css`에 추가. 사이트 제목을 `크리링`으로 바꿈.

## 2026-10-01

- 개발 서버 포트 기본값 숫자를 없앰: `start`는 `WEB_PORT`가 없으면 `pnpm instance --get WEB_PORT`로 이 checkout 인스턴스 포트를 씀(worktree 직접 실행도 그 슬롯 포트). `.env.example`의 `API_INTERNAL_URL`은 빈 값과 형식 주석, README는 포트 자리표시자와 `pnpm instance` 안내로 바꿈. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- `apps/web/README.md`의 `.env.local` 수동 복사 안내를 `make up`/`pnpm instance` 자동 생성과 인스턴스 값 우선 규칙으로 바꿈. 근거: `docs/work/0004-agents-map-and-policy-docs.md`.
- 개발 서버 포트를 `WEB_PORT` 환경변수로 받도록 변경(`next dev --port ${WEB_PORT:-5193}`, 없으면 5193). `make web-up`은 checkout 인스턴스의 `WEB_PORT`·`API_INTERNAL_URL`을 넘깁니다. 근거: `docs/work/0001-worktree-local-instances.md`.
- Next.js App Router 뼈대: 레이아웃·오류·로딩·404, 디자인 토큰 기반 공통 스타일, same-origin BFF(`/api/backend`, `GET api/health`만 허용)와 API 클라이언트, 서비스 이름과 API·DB 준비 상태를 보여 주는 시작 화면, Pretendard 글꼴과 OFL 라이선스 고지, 작업 규칙. 개발 서버 포트 5193.
