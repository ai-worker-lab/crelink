# 0017 크리링 MVP 웹 구현

- 단계: 티켓
- 역할: web
- 상위: 0014
- 선행: 0015
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

공개 랜딩, 크리에이터 편집, 운영자, 로그인 콜백, 안내·개인정보 고지 화면과 BFF 확장을 구현합니다.

## 수용 기준

- [x] 설계 `화면 상태와 API 대응`의 화면과 상태(로딩·빈·오류·권한 없음)가 있다.
- [x] BFF가 새 경로를 허용하고 `cl_session` 쿠키·`Set-Cookie`·multipart 업로드를 전달하며, 상태 변경 요청의 `Origin`을 확인한다.
- [x] 390px·1280px에서 가로 넘침이 없고 콘솔 오류가 없다.
- [x] `pnpm verify --fast`, `pnpm --filter @crelink/web build` 통과.

## 범위

- 포함: `apps/web/**`.
- 제외: API, 루트 스크립트.

## 위험·복구

해당 없음

## 연결

- 설계: [docs/specs/crelink-mvp.md](../../specs/crelink-mvp.md)
- 요구: R1, R3~R5, R8~R10, R12~R16

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 구현. BFF 허용 목록·쿠키·`Set-Cookie`·multipart·이미지 바이너리·204·`Origin` 확인, `serverApi` 세션 옵션과 `loadSignedIn`, `/auth/google`·`/auth/google/callback` route handler, 화면 `/`·`/me`·`/p/[publicId]`·`/notice`·`/privacy`·`/admin`·`/admin/creators/[userId]`·`/admin/blocked-domains`. 변경 내용은 `apps/web/CHANGELOGS.md`, 경로 표는 `apps/web/README.md`.
- 2026-10-06: 검증. `pnpm --filter @crelink/shared build`, `pnpm verify --fast`(6단계 통과), `pnpm --filter @crelink/web build` 통과. 이 checkout 인스턴스 포트(웹 5193·API 3020)를 상위 checkout 서비스가 쓰고 있어 `make up` 대신 빌드 결과를 `next start --port 5293`(API_INTERNAL_URL=상위 checkout의 기존 API, 크리링 경로 없음 → 404)으로 띄워 Playwright Chromium으로 390px·1280px 확인: `/`(로그인 전), `/notice`(사유 7종 중 3종·알 수 없는 사유·사유 없음), `/privacy`, `/p/doesnotexist1`(404 안내), 세션 없는 `/me`·`/admin…`(→ `/`) 모두 가로 넘침 0, 콘솔 오류 0, 키보드 Tab 초점 표시 확인. BFF·로그인 route는 저장소 밖 임시 echo 서버로 Origin 없음·불일치 403, `cl_session`만 전달, multipart Content-Type(boundary) 전달, 이미지 바이너리·Content-Type·Cache-Control, 204와 `Set-Cookie` 여러 줄, 로그인 시작·콜백 302와 쿠키, 콜백 실패 `/notice?reason=` 확인. 로그인 화면(`/me`·`/p/{id}` 정상·빈·410·운영자 3화면)도 저장소 밖 임시 응답 서버로 390px·1280px 가로 넘침 0, 복사됨 피드백, 한도 도달 안내를 확인(사이트 아이콘·임시 이미지 주소 로드 실패의 `Failed to load resource`만 발생, 기본 아이콘으로 대체됨). 임시 서버·스크립트는 지웠고 실제 API 흐름은 0018에서 확인.
- 2026-10-06: 통합(0018). 주 checkout `make up` 인스턴스에서 실제 API로 `pnpm e2e` 5개 시나리오 통과(크리에이터 편집·방문자·운영자·안내 화면, 390px 확인 포함). 상태 `완료`.
