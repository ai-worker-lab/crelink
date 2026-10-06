# crelink 웹

Next.js App Router와 TypeScript 기반 크리링(CreLink) 웹 클라이언트입니다. 서버 컴포넌트는 서버 전용 `API_INTERNAL_URL`로 Nest API를 직접 읽고(`src/lib/api/server.ts`, 로그인 화면은 요청의 `cl_session` 쿠키를 함께 보냄), 브라우저 요청은 same-origin BFF(`/api/backend`)를 거쳐 Nest API로 전달합니다. 화면·API 계약의 기준은 [크리링 MVP 기술 설계](../../docs/specs/crelink-mvp.md)와 [`packages/shared/src/crelink.ts`](../../packages/shared/src/crelink.ts)입니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 소개, 로그인 전 `구글로 시작하기`, 로그인 후 `/me`·랜딩 관리 화면(운영자는 `/admin`) 링크 |
| `/auth/google`, `/auth/google/callback` | 구글 로그인 route handler. API의 `cl_oauth_state`·`cl_session` `Set-Cookie`를 그대로 붙여 302 |
| `/me` | 크리에이터 편집(단축 URL 복사·주소 변경, 프로필, SNS, 포트폴리오)과 외부 링크 요약·관리 화면 진입점. 401이면 `/` |
| `/me/landings/[publicId]` | 랜딩 관리 화면(PRD R18). 기본 편집 모드: 랜딩과 같은 배치에서 외부 링크 추가·수정·삭제(하단 시트), 끌어서 순서 변경(마우스·터치·키보드), 숨기기 스위치, 한도·차단 표시. `?mode=view` 보기 모드: 공개 랜딩과 같은 `Landing`으로 방문자 화면(숨긴·차단 링크 제외, 링크는 클릭 기록 없이 저장된 URL로). 내 랜딩이 아니면 찾을 수 없음 안내, 401이면 `/` |
| `/p/[publicId]` | 공개 랜딩(SSR, `src/components/landing/Landing.tsx`). 404·410 안내 |
| `/notice?reason=` | 단축 주소·로그인 오류 안내 |
| `/privacy` | 개인정보 수집·보관·쿠키 고지(법률 검토 전 문구) |
| `/admin`, `/admin/creators/[userId]`, `/admin/blocked-domains` | 운영자 화면. 401이면 `/`, 403이면 권한 없음 안내 |

SNS 채널 아이콘 자산의 출처·상표 사용 규칙은 [SNS 채널 아이콘](docs/sns-icons.md)에 있습니다.

## BFF(`src/app/api/backend/[...path]/route.ts`)

- 허용 목록(메서드·경로)에 있는 요청만 전달하고 나머지는 404 `route_not_allowed`입니다. 로그인 시작·콜백은 BFF가 아니라 위 route handler가 부릅니다.
- 요청 쿠키 중 `cl_session`만 API로 넘기고, API 응답의 `Set-Cookie`·`Content-Type`·`Cache-Control`·`ETag`·`Last-Modified`와 본문(이미지 바이너리 포함)을 그대로 돌려줍니다. 204는 본문 없이 돌려줍니다.
- `POST api/me/files`만 multipart 본문과 `Content-Type`(boundary 포함)을 그대로 넘기고, 그 밖의 본문은 JSON으로 넘깁니다.
- POST·PUT·PATCH·DELETE는 `Origin` 헤더의 호스트가 요청 호스트와 같아야 하며, 없거나 다르면 403 `forbidden`입니다.

## 실행

저장소 루트에서 `pnpm dev:web` 또는 `pnpm --filter @crelink/web start`로 개발 서버를 `http://localhost:<웹 포트>`에서 실행하고, `pnpm --filter @crelink/web build`로 프로덕션 빌드를 생성합니다. `<웹 포트>`는 `WEB_PORT` 환경변수, 없으면 이 checkout 인스턴스의 웹 포트(`pnpm instance --get WEB_PORT`)이고, API는 `http://127.0.0.1:<API 포트>`를 사용합니다. 실제 포트는 `pnpm instance`로 확인합니다.

`make up`(또는 `pnpm instance`)이 `apps/web/.env.local`이 없으면 `.env.example`에서 만들고 `API_INTERNAL_URL`을 이 checkout 인스턴스의 API 주소(`pnpm instance --get API_INTERNAL_URL`)로 채웁니다. `make web-up`으로 띄우면 인스턴스 값이 파일 값보다 우선합니다([로컬 개발 환경](../../docs/development/local-environment.md#인스턴스와-포트)). `.env.local`에는 실제 비밀값을 저장하지 말고 서버 비밀값도 `NEXT_PUBLIC_*`로 설정하지 않습니다.
