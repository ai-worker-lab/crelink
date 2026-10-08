# 0049 방명록 탭 웹 구현

- 단계: 티켓
- 역할: web
- 상위: 0046
- 선행: 0047
- 상태: 검증
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-08

## 목적

공개 랜딩과 관리 화면에 방명록 탭을 그리고, 로그인 뒤 원래 랜딩 방명록 탭으로 돌아오게 합니다.

## 수용 기준

- [x] `guestbookEnabled`면 공개 랜딩·관리 화면 보기 모드에 `링크`·`방명록` 탭이 있고, `#guestbook`으로 방명록 탭이 열린다. 꺼져 있으면 탭이 없다.
- [x] 설계 `화면 상태와 API 대응`의 상태(로딩·빈 상태·비회원·회원·내 글·크리에이터·더 보기·오류)를 그린다.
- [x] 관리 화면 편집 모드에 방명록 켜기/끄기 스위치가 있고 바로 저장된다.
- [ ] 비회원 로그인 안내가 `/auth/google?returnTo=…`로 가고, 로그인하면 같은 랜딩 방명록 탭으로 돌아오며 그 복귀가 단축 주소를 다시 거치지 않는다(`Sec-Fetch-Site: same-origin`). 허용 형식 밖 `returnTo`는 `/me`로 간다. (구성 단계는 모두 확인, 실제 구글 로그인 성공 콜백은 미확인 — 진행 기록)
- [x] BFF 허용 경로에 방명록 네 경로가 있다.
- [x] `/privacy`에 방명록 수집 항목·공개 범위·보관 기간이 있다.
- [ ] 390px·1280px 가로 넘침 없음, `pnpm --filter @crelink/web typecheck`·`lint`·`build` 통과. (넘침·typecheck·lint 통과, `build`는 개발 서버 보호를 위해 통합 담당의 `pnpm verify`로 넘김)

## 범위

- 포함: 방명록 탭·목록·작성·삭제·숨김 구성 요소, 관리 화면 스위치, `/auth/google` `returnTo`와 콜백 복귀, BFF 경로, `/privacy`, `PassCleanup` 해시 유지, 웹 변경 기록.
- 제외: API, E2E(0050), 새 디자인 토큰.

## 위험·복구

로그인 복귀 주소는 허용 형식만 씁니다(열린 리디렉트 방지). 되돌리기는 커밋 되돌림.

## 연결

- 설계: [구성과 흐름](../../specs/crelink-guestbook.md#구성과-흐름), [화면 상태와 API 대응](../../specs/crelink-guestbook.md#화면-상태와-api-대응)
- 요구: R19

## 진행 기록

- 2026-10-08: 생성.
- 2026-10-08: 착수(`진행`). 같은 작업 트리 `work/0050-guestbook-integration`에서 api(0048)와 동시 작업.
- 2026-10-08: 구현 완료, `검증`으로 넘김.
  - 계약: `packages/shared` 확정 계약 그대로 사용(mock 없음). 로컬 API(0048 작업 중 인스턴스)가 방명록 경로에 응답해 실제 API로 확인.
  - 구현: `Landing`에 탭(`LandingTabs`), 방명록 패널(`GuestbookPanel`), 편집 모드 스위치(`LandingEditor`), 보기 모드 안내 문구, BFF 네 경로, 오류 문구 두 개, `/auth/google` `returnTo`·콜백 복귀·새 화면 `/auth/return`(`ReturnRedirect`), `/privacy`, `styles.css`, README 화면 표, 웹 변경 기록. `PassCleanup`은 이미 `url.hash`를 붙여 해시를 지키므로 바꾸지 않음(브라우저에서 단축 주소 → `?pass=` → 정리 뒤 `#guestbook` 유지 확인).
  - 설계와 다른·더한 판단: (1) 로그인 복귀는 콜백 → `/auth/return?to=`(서버에서 `LOGIN_RETURN_TO_PATTERN` 재검증, 밖이면 `/me`) → 클라이언트 `location.replace`. 인라인 스크립트가 없어 CSP 영향 없음(지금 CSP도 없음). (2) `cl_return_to`의 Secure는 웹이 자기 공개 주소를 모르므로 같은 응답의 API 쿠키(`webCookieSecure`)를 따름. (3) `/auth/google`에 `returnTo`가 없거나 형식 밖이면 이전 시도가 남긴 `cl_return_to`를 지움(예전 랜딩으로 잘못 돌아가지 않게). 콜백은 실패 경로에서도 쿠키를 지움(`/notice` 대상은 그대로). (4) 편집 모드(`Landing`에 `links` 전달)는 탭 없이 링크 편집기만 그림(스위치는 미리보기 위 별도 구역). (5) 쓰기 401은 `useAction`처럼 홈으로 보내지 않고 로그인 안내로 바꿈(방문자가 랜딩에 남도록). (6) 링크·포트폴리오가 없는 방명록 켠 랜딩의 `링크` 탭은 "아직 올린 링크가 없어요". (7) 작성 폼의 글자 수는 `maxLength` 500(앞뒤 공백 포함 원문 길이), 공백만이면 `남기기` 비활성.
  - 검증 명령: `pnpm --filter @crelink/web typecheck` 통과, `npx eslint apps/web` 통과(오류·경고 0), `npx prettier --check apps/web` 통과, `pnpm smoke` 5건 통과. `pnpm work:scope 0049`는 같은 브랜치의 다른 역할 변경(`apps/api/**`, `packages/shared`, `docs/specs`, `docs/product`)만 범위 밖으로 표시하고 웹 변경은 모두 소유 경로 안. `next build`·`pnpm verify`는 지시대로 실행하지 않음.
  - 브라우저(Playwright MCP, 개발 DB에 `@e2e.crelink.test` 사용자 A·B·C와 세션 행을 넣고 `cl_session` 쿠키, 끝나고 지움): 외부 진입 `/p/{A}#guestbook` → 단축 주소 → 방명록 탭 열림·해시 유지, SSR HTML은 `링크` 탭 선택. 탭 클릭·좌우 화살표·Home·End로 해시 갱신(`history.length` 늘지 않음), 새로고침 뒤 유지. 비회원: 로그인 안내 링크 `/auth/google?returnTo=%2Fp%2F{A}%23guestbook`, 빈 상태 문구. B: 공개글·비밀글 작성 → 맨 위, 폼·체크 비움, 글자 수 표시. 비회원·C에게 공개글만, 버튼 없음. A: 둘 다 보이고 숨기기 → 흐림(opacity 0.45)+숨김 배지, 비회원에게서 사라지고 B에게는 표시 없이 그대로, 숨김 해제 뒤 다시 보임. B 삭제(확인 창) → 사라짐. 22개 더 넣어 `더 보기`로 24개, 버튼 사라짐, 이름 없는 작성자 '크리링 회원'. 편집 모드 스위치 끄기 → 저장 유지, 열어 둔 B 화면에서 `남기기` → "방명록을 닫은 페이지예요", 공개 랜딩 탭 없음, 다시 켜기. 보기 모드(A) 방명록 탭·숨기기 버튼. 오류는 BFF 응답을 가로채 확인: 목록 503 → "방명록을 불러오지 못했어요"+다시 시도(성공), 작성 400 → `role=alert` API 문구·`aria-invalid`, 작성 401 → 로그인 안내로 전환·주소 그대로. 로딩 표시(응답 1.5초 지연). 390px·1280px 가로 넘침 0(공개 랜딩 회원·비회원, 긴 단어 본문, 편집 모드, 보기 모드). 콘솔 오류는 시드한 가짜 링크 아이콘 주소(`example.e2e.test`) DNS 실패와 의도한 4xx·5xx 응답뿐.
  - 로그인 복귀: `/auth/google?returnTo=%2Fp%2F{A}%23guestbook` → 302 구글 + `cl_return_to=%2Fp%2F{A}%23guestbook; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`(로컬 http라 Secure 없음). 형식 밖(`https://evil.example/`) → 쿠키 삭제만. 콜백(잘못된 state) → `/notice?reason=oauth_state_invalid` + 쿠키 삭제. `/auth/return?to=//evil.example/...` → `/me`. 다른 사이트(`localhost:5193`)에서 `/auth/return?to=/p/{A}%23guestbook`로 이동(`cross-site`) → 랜딩 요청 `Sec-Fetch-Site: same-origin`, 단축 주소 요청 없음, 방명록 탭 열림.
  - 확인 못 한 것: 실제 구글 로그인 성공 콜백(구글 계정 로그인 필요)으로 `/auth/return`까지 이어지는 전체 흐름과 방문 행 수 변화, 운영(https)에서 `cl_return_to` Secure 부착, `next build`.
- 2026-10-08: 통합 검토 반영(Main). 위 판단 (1)의 `/auth/return?to=`는 누구나 만들 수 있는 공개 주소라, 외부에 공유하면 랜딩이 같은 출처 이동으로 열려 단축 주소를 거치지 않음(PRD R7 우회, 방문 미기록). 돌아갈 주소를 쿼리 없이 `cl_return_to` 쿠키로만 넘기도록 바꿈. 이 항목이 위 (1)과 로그인 복귀 확인 중 `/auth/return?to=` 부분을 대체함.
  - 콜백: 성공하고 쿠키 값이 `LOGIN_RETURN_TO_PATTERN`에 맞으면 쿠키를 그대로 두고 `/auth/return`(쿼리 없음)으로 302, 아니면 쿠키를 지우고 `/me`. 실패 경로는 그대로 쿠키 삭제 + `/notice`.
  - `/auth/return`(화면)은 주소를 모르고 `location.replace('/auth/return/go')`로 같은 출처 이동만 새로 시작. `/auth/return/go`(새 route handler)가 쿠키를 읽어 늘 지우고, 허용 형식이면 그 랜딩, 없거나 형식 밖이면 `/me`로 302. 서버 컴포넌트는 쿠키를 지울 수 없어서 지우기를 route handler에 둠(인라인 스크립트 없음). 체인 `/auth/return/go` → 랜딩이 모두 같은 출처라 랜딩 요청은 `same-origin`.
  - `AUTH_RETURN_PARAM`·`signedInLocation`을 지우고 `AUTH_RETURN_CONTINUE_PATH`를 더함. 주석·README·웹 변경 기록을 맞춤.
  - 검증: typecheck·`npx eslint apps/web`·`npx prettier --check apps/web` 통과. curl: `/auth/return/go` 쿠키 없음 → 302 `/me` + 쿠키 삭제, 유효 쿠키(`%2Fp%2F{A}%23guestbook`) → 302 `/p/{A}#guestbook` + 쿠키 삭제, 형식 밖(`//evil.example/p/x`) → `/me`. 잘못된 state 콜백 → `/notice?reason=oauth_state_invalid` + 쿠키 삭제. `/auth/return?to=…`는 쿼리를 무시함(`바로 가기` → `/auth/return/go`). 브라우저(개발 DB 사용자 A, 끝나고 지움): 다른 사이트(`localhost:5193`)에서 `/auth/return`(`cross-site`)으로 이동하면, 유효 쿠키가 있을 때 `/auth/return/go`·`/p/{A}` 요청이 모두 `same-origin`이고 단축 주소 리디렉트 없이 `/p/{A}#guestbook` 방명록 탭이 열리며 쿠키가 지워짐. 쿠키가 없으면 `/auth/return/go` → `/me`로 감.
- 2026-10-08: 통합 검증 반영(Main, 0050). 편집 모드 방명록 스위치가 랜딩 미리보기 위에 있어 390px에서 링크 편집이 화면 아래로 밀리고 `creator.spec.ts` 모바일 터치 끌기 E2E가 실패함. 스위치 구역을 미리보기 아래로 옮기고(`LandingEditor.tsx`, `.guestbook-setting` 위 여백) 위 판단 (4)의 "미리보기 위"를 대체함. `pnpm e2e` 8건 통과.
