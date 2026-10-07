# 0038 외부에서 랜딩 주소로 들어와도 단축 주소를 거쳐 방문 기록

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

방문(`visits`)은 단축 주소 `GET {SHORT}/{slug}`에서만 기록되고, 그 뒤 302로 본 도메인 랜딩 주소 `{WEB}/p/{publicId}`가 열립니다. 방문자가 주소창의 `/p/…`를 복사해 카카오톡 등으로 공유하면 그 주소로 들어온 방문은 기록되지 않습니다(운영에서 실제 발생). 크리링 통계(PRD R2·R9·R10)가 실제보다 적게 잡힙니다.

## 수용 기준

- [x] API: 단축 주소(현재·옛 주소) 302 대상에 통과 표시 `?pass=<만료 epoch 초>.<HMAC 앞 16바이트 base64url>`가 붙는다. 표시는 publicId에 묶이고 60초 뒤 만료된다. 키는 프로세스 시작 때 만든 무작위 32바이트(새 비밀값 없음).
- [x] API: `GET /api/public/landings/{publicId}?pass=`가 `passAccepted`(이 랜딩에 대해 유효·미만료일 때 true)와 `shortUrl`(현재 단축 주소)을 준다. pass 없음·다른 랜딩·변조·만료·형식 오류는 false, 주소를 바꾸면 `shortUrl`은 새 주소.
- [x] 웹: `/p/{publicId}`는 `Sec-Fetch-Site: same-origin`이거나 `passAccepted`일 때만 그대로 그리고, 그 밖(외부 링크·주소창 직접 입력·미리보기 봇·Sec-Fetch 헤더 없는 클라이언트)은 `shortUrl`로 HTTP 307. 404·410·API 오류는 지금처럼 오류 화면.
- [x] 웹: 통과 표시로 그린 화면은 주소창의 `?pass=`를 지워(`history.replaceState`) 복사·공유되는 주소가 `/p/{publicId}`이다. 무효·만료 표시는 단축 주소에서 새 표시를 받아 한 번 더 돌아오며 반복되지 않는다.
- [x] 웹: `/me`의 크리링 링크 카드에 랜딩 주소 글자를 보여 주지 않고(미리보기 링크만), 관리 화면의 "공개 주소"는 단축 주소다.
- [x] 시험: API e2e·단위 시험, Playwright E2E(외부 직접 접속 → 단축 주소 → 방문 1건 → 랜딩, 주소창에 pass 없음, `/me` 미리보기는 방문으로 안 셈)가 수정 전 실패하고 수정 뒤 통과. `pnpm verify` 통과.
- [ ] 운영 배포 뒤 `links.shaul.kr/p/{publicId}` 직접 접속이 `go.shaul.kr/{slug}`를 거쳐 방문 1건으로 기록되는지 확인.

## 범위

- 포함: `apps/api/src/short-link/`(통과 표시 발급), `apps/api/src/creator/public-landing.controller.ts`(검증·현재 단축 주소), `packages/shared/src/crelink.ts`(`PublicLandingView`·`PublicLandingResponse`·`LANDING_PASS_PARAM`·경로), 웹 공개 랜딩·`/me`·관리 화면·개인정보 처리방침 문구, 루트 `loading.tsx`를 `/me`·`/admin`으로 옮김(아래 진행 기록), 시험, PRD R7, 기술 설계, 영역 문서·변경 기록.
- 제외: 운영 Caddy·인프라 변경(단축 호스트는 경로만 보고, 본 도메인은 쿼리를 그대로 웹에 넘기므로 필요 없음), 봇 방문 구분, 운영자 화면의 랜딩 주소 표시(내부용이라 유지).

## 위험·복구

- 데이터: 외부 진입이 이제 방문으로 세어져 방문 수가 이전보다 늘어난다(의도). 메신저 미리보기 봇이 `/p/…`를 읽어도 단축 주소를 거쳐 방문 1건이 된다(단축 주소를 공유했을 때와 같음).
- 새로고침: 통과 표시를 지운 주소를 새로고침하면 브라우저가 보내는 `Sec-Fetch-Site`(사용자 탐색은 `none`)에 따라 단축 주소를 한 번 더 거쳐 방문 1건이 더 기록될 수 있다.
- 키: 프로세스별 무작위 키라 Blue/Green 전환 순간 다른 색 API가 검증하면 실패하지만, 웹이 단축 주소로 한 번 더 보내 새 표시를 받으므로 스스로 복구된다. 한 색이 API 프로세스를 여러 개(cluster·복제) 띄우면 발급·검증 프로세스가 갈려 리디렉트가 반복될 수 있으므로 그때는 공유 키가 필요하다.
- 복구: 이 변경을 되돌려 배포하면 이전 동작(랜딩 주소 직접 접속은 기록 없음)으로 돌아간다. DB 변경 없음.

## 연결

- PRD: [R7](../../product/crelink.md#요구사항)(R2·R9의 방문 기록)
- 설계: [크리링 MVP 기술 설계 "구성과 흐름"](../../specs/crelink-mvp.md#구성과-흐름)
- 코드: `apps/api/src/short-link/landing-pass.service.ts`, `apps/api/src/short-link/short-link.controller.ts`, `apps/api/src/creator/public-landing.controller.ts`, `apps/web/src/app/(public)/p/[publicId]/page.tsx`, `apps/web/src/components/landing/PassCleanup.tsx`
- 시험: `apps/api/test/short-link.e2e-spec.ts`, `apps/api/src/short-link/landing-pass.service.spec.ts`, `tests/e2e/visitor.spec.ts`

## 진행 기록

- 2026-10-07: 생성·착수. 사용자 결정(원문): "링크나 우리 서비스 안에서는 랜딩 주소(`links.shaul.kr/p/{publicId}`)를 쓸 수 있지만, 외부에서는 항상 `go.shaul.kr`(단축 주소)을 거치게 해야 방문 데이터가 누락 없이 수집된다." 설계: 단축 주소 302에 publicId에 묶인 60초 HMAC 통과 표시, 공개 랜딩 API가 검증 결과와 현재 단축 주소를 주고, 웹은 같은 출처이거나 표시가 유효할 때만 그리고 그 밖은 단축 주소로 보냄.
- 2026-10-07: 구현. 웹 루트 `app/loading.tsx`가 모든 화면을 Suspense로 감싸 응답 머리를 먼저 보내므로, 공개 랜딩의 `redirect()`가 HTTP 307이 아니라 200 + `<meta http-equiv="refresh" content="1;url=…">`로 나가는 것을 로컬 curl로 확인(1초 지연이고, 메신저 미리보기 봇이 meta refresh를 따른다는 보장이 없음). 그래서 불러오는 중 화면을 로그인 화면(`app/me/loading.tsx`, `app/admin/loading.tsx`, 공통 `components/PageLoading.tsx`)으로 옮김. `/`·`/notice`·`/privacy`는 경계 없이 SSR이 끝난 뒤 응답한다.
- 2026-10-07: 검증(로컬 인스턴스 crelink-0038). API 시험: 바꾼 `short-link.e2e-spec.ts`를 수정 전 API 코드에 돌려 4개 실패(Location에 pass 없음, 응답에 `passAccepted`·`shortUrl` 없음), 수정 뒤 통과. Playwright 새 시나리오는 수정 전 웹 화면에서 실패(직접 접속이 단축 주소를 거치지 않음), 수정 뒤 `pnpm e2e` 7개 모두 통과. `pnpm verify` 통과(api 시험 91개), `pnpm work:check`·`pnpm docs:check`·`pnpm work:scope 0038` 통과. 로컬 curl: 단축 주소 302 `/p/{id}?pass=…`, 그 주소 200, `Sec-Fetch-Site` 없음·`none`·`cross-site`·`same-site`는 307 단축 주소, `same-origin` 200, 변조·만료 pass 307 단축 주소, 없는 랜딩은 오류 화면(리디렉트 없음). 운영 확인은 배포 뒤.
