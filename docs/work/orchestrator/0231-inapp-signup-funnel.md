# 0231 앱 내 브라우저 안내와 가입 경로 계측

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

크리링 가입은 구글 로그인뿐인데 구글은 앱 내 웹뷰의 OAuth를 막습니다. 최근 유입의 약 3분의 1이 Facebook·Instagram 앱 안 브라우저이고, 가입 경로 계측이 없어 모집 실험 결과를 읽을 수 없습니다. 근거는 설정 기록 저장소의 2026-11-10 크리링 실사용자 모집 진단 `실험 1`입니다.

## 수용 기준

- [x] User-Agent로 Instagram·Facebook·카카오톡·네이버·라인 앱 내 브라우저를 판별하고 단위 시험이 앱별·일반 브라우저를 구분합니다.
- [x] 앱 내 브라우저에서 가입·로그인 버튼을 누르면 Google로 가지 않고 외부 브라우저 안내가 뜹니다. Android는 `intent://`로 Chrome 열기, iOS는 주소 복사와 `Safari로 열기` 안내, 모두 `그래도 계속`이 있고 `returnTo`를 유지합니다.
- [x] 일반 브라우저의 가입 동선은 그대로 `/auth/google`로 갑니다.
- [x] 홈 방문·가입 버튼 클릭·OAuth 시작·콜백 도달·신규 가입 완료·첫 링크 생성을 유입값·앱 종류별 일별 합계로 남기고 보존 작업 대상에 넣습니다.
- [x] 이메일·이름·IP 원문·전체 URL·전체 User-Agent를 저장하지 않고 새 쿠키를 만들지 않습니다.
- [ ] iOS·Android × Instagram·Facebook·카카오톡 실기기 6조합에서 구글 차단 여부와 외부 브라우저 열기를 확인합니다(사람 기기 필요, 미실행).

## 설계 요약

- 계약: `packages/shared/src/signup-funnel.ts`. 판별 함수와 유입값 정규화는 웹·API가 함께 씁니다.
- 저장: migration `0013`의 `signup_funnel_daily`(일, 단계, 유입값 4개, 앱 종류, 수). 식별자 열이 없습니다. OAuth 왕복 동안만 `signup_funnel_oauth_contexts`에 state 해시로 유입값을 묶고 콜백에서 지웁니다.
- 유입값 전달: 브라우저 단계(홈·버튼)는 요청 본문, `/auth/google`은 같은 출처 Referer의 UTM과 User-Agent를 웹 서버가 읽어 내부 헤더로 API에 넘깁니다.
- 안내: `apps/web/src/components/SignInLink.tsx`가 클릭 시 판별해 기존 하단 시트(`EditSheet`)로 안내합니다. 링크의 `href`는 바뀌지 않아 JS 전이나 판별 실패 때도 그대로 동작합니다.
- 조회: 새 화면 없이 SQL로 봅니다([백엔드 안내](../../../apps/api/docs/README.md#가입-경로-계측)).

## 처리방침 판단

- 합계는 개인을 알아볼 수 없는 값이라 기존 `크리링 광고 노출·클릭 수` 고지와 같은 성격이고, 처리방침 수집 항목을 늘리지 않습니다. 처리방침은 고치지 않았습니다.
- **구현하지 않은 것:** 유입값을 계정·세션에 묶는 일. 그러면 `어디서 와서 가입했는지`가 개인 단위가 되어 0087 `위험·복구`와 처리방침 고지 범위를 넘습니다. 그래서 `first_link`에는 유입값이 없고 앱 종류만 남습니다. 유입별 가입→첫 링크 전환이 필요하면 처리방침과 0087의 사용자 결정이 먼저입니다.
- **구현하지 않은 것:** 랜딩 바닥글 버튼과 `/auth/google`에 유입 쿼리 붙이기. 요청 주소는 IP·사용자 ID와 함께 Sentry에 가므로 개인 단위 기록이 됩니다([바닥글 인계](../../../design/landing-footer-cta/handoff.md#링크-대상과-주소-규칙)). 유입값을 OAuth `state`에도 넣지 않았습니다(구글로 전달됨).

## 범위

- 포함: `packages/shared`, `apps/api`(계측·migration·보존), `apps/web`(안내·보고·BFF), `tests/e2e/ego/signup-funnel*`, `scripts/ci-local.mjs` 목록, 변경 기록, 이 문서와 0087 상태.
- 제외: 관리자 화면, PRD 개정, 처리방침 변경, 바닥글 유입 쿼리, 카카오톡·라인 전용 외부 열기 스킴, 실기기 확인, 실제 Google 로그인, 새 Playwright 테스트.

## 위험·복구

- 데이터: 추가 migration 하나입니다. 되돌리려면 다음 migration에서 두 테이블을 지웁니다.
- 인증 없는 쓰기: 서버 단계 기록은 응답과 분리하고 동시 5개까지만 진행합니다(넘으면 버림). OAuth 유입 기록은 살아 있는 행 5,000개까지입니다. 그래서 대량 요청이 오는 동안 `oauth_start` 수는 실제보다 적을 수 있고 유입값을 잃을 수 있습니다. 기록 실패는 로그인·링크 저장을 막지 않습니다.
- 합계의 한계: 브라우저 보고는 위조할 수 있고 재로그인도 `oauth_start`·`oauth_callback`에 섞입니다. 첫 링크는 모든 링크를 지운 뒤 다시 만들면 다시 셉니다. 외부 브라우저로 나간 뒤의 단계는 유입값 없이 `none`으로 집계됩니다.
- 안내 문구는 디자인 인계 없이 기존 시트와 버튼을 재사용했습니다.

## 연결

- 관련: [0087](../product/0087-signup-source-attribution.md), [바닥글 인계](../../../design/landing-footer-cta/handoff.md)
- 코드: `apps/api/src/telemetry/signup-funnel.service.ts`, `apps/web/src/lib/signup-funnel.ts`, `tests/e2e/ego/signup-funnel.mjs`

## 진행 기록

- 2026-11-10: 생성·구현. `pnpm verify` 8단계, `pnpm work:scope 0231`, `pnpm work:check`, API 통합 시험(`test/signup-funnel.e2e-spec.ts`, 실제 PostgreSQL·가짜 구글로 여섯 단계)을 통과했습니다.
- 2026-11-10: `node tests/e2e/ego/signup-funnel.mjs` 통과(Instagram UA 안내, `returnTo` 유지, `그래도 계속`, 일반 UA는 `/auth/google`, 콘솔 오류 0, 390px 가로 넘침 0). `EGO_TEST_FAULT=always-notice`로 일반 UA에 안내가 뜨게 하면 종료 코드 1입니다. 로컬에는 구글 키가 없어 일반 UA 경로는 `/auth/google` 다음 `/notice?reason=auth_not_configured`로 끝나며 실제 Google에는 가지 않습니다.
- 2026-11-10: 실제 웹 경로 확인. 로컬 API를 임시 더미 구글 값으로 띄워 Instagram UA·같은 출처 Referer로 `/auth/google`을 호출하면 302 Location과 state 쿠키에 유입값이 없고 `oauth_start` 행(`source=realstack`, `campaign=c0231`, `in_app_kind=instagram`)이 생겼습니다. 콜백 이후 단계는 실제 Google이 필요해 API 통합 시험으로만 봤습니다.
- 2026-11-10: QA 합격 후 머지 전 수정. CEO가 처리방침은 고치지 않기로 정했습니다(개인을 알아볼 값이 없는 합계). 서버 단계 기록을 응답과 분리하고 동시 기록·OAuth 유입 행에 상한을 뒀습니다. 하루 행 상한이 차도 이미 있는 행에는 더합니다. `showModal`이 없는 웹뷰는 안내 대신 기본 링크로 이동합니다(`EditSheet`는 그대로).
