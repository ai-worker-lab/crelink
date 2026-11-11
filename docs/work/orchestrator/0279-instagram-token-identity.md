# 0279 Instagram 토큰 principal 식별 수정

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 결함
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-11

## 목적

0278 후속 실응답 확인에서 token exchange는 200 `access_token/token_type`, `/me?fields=id,client_business_id`는 200 `client_business_id`만, `fields=id`는 빈 객체였다(Coordinator 제공 사실). 원인은 실제 `/me.id` 누락이며 0278의 당시 추정·검증 이력은 보존한다. assigned 목록은 badajjack 1개로 정상이었다. 앱 Bearer로 조회한 `debug_token.data`는 현재 app_id·SYSTEM_USER·is_valid=true·문자열 user_id를 반환했다. 이번 CTO 승인 범위에서 검증한 user_id를 principal로 사용한다.

## 수용 기준

- [x] `/me` 호출을 제거하고 앱 Bearer의 `GET /debug_token?input_token=<SUAT>`에서 app_id 일치·type=SYSTEM_USER·is_valid=true·비어 있지 않은 문자열 user_id를 엄격히 검증한다. 각 실패는 assigned 조회 전에 거부한다.
- [x] config 시그니처·호출 시험을 일치시키고 정상 principal과 assigned 결과, `/me` 미호출·secret query 부재·raw body 비기록을 확인한다. assigned 필드·페이지·상한 및 0개·복수개 409는 유지한다.
- [x] Sentry `input_token` query 가림과 EAA 정규식에 해당하지 않는 opaque 토큰의 URL·span·query 회귀를 확인한다.
- [x] 관련 단위 시험·API typecheck를 실행하고 SSoT identity revision·API 안내·API/루트 변경 기록을 정정한다. 기존 0278/계약 이력은 보존한다.

## 범위

- 포함: `apps/api/src/instagram/graph.ts`, 관련 단위 시험, `monitoring/sentry.ts`·시험, 현재 identity 문서와 변경 기록, 기존 CTO 계약에 R3 변경 이력 추가.
- 제외: 전체 설계·프론트·infra·새 migration·새 키·토큰 갱신. OAuth state/cookie/revision/소유자/암호화/삭제 경로/권한 scope/기존 8개 env/DB schema는 유지한다. CI·commit·push·PR·리뷰·브라우저·시크릿 조회·운영/API 외부 호출은 Coordinator 담당이며 구현 담당은 실행하지 않는다.

## 위험·복구

debug_token은 토큰 principal 검증용이며 IG 계정 선택 fallback으로 사용하지 않는다. appId|appSecret은 Authorization Bearer에만 넣는다. 응답 원문·토큰·시크릿을 로그에 남기지 않는다. 복구는 이번 코드 변경을 되돌리며 설정·DB 변경은 없다.

## 연결

- [현재 SSoT](../../specs/instagram-comment-dm.md#oauth토큰삭제)
- [API 안내](../../../apps/api/docs/README.md#instagram-공개-답글과-unified-login-보강)
- [기존 CTO 계약](../../../contracts/0277-instagram-direct-login/1-cto-interface.contract.md)
- [0278 이력](0278-instagram-account-response.md)

## 진행 기록

- 2026-11-11: `work/0279-instagram-token-identity`, task `task-f2423d6f068b424c90d41ca0f21d3f9b`에서 Coordinator 전달 CTO 승인·실응답에 따른 좁은 수정을 착수했다. 최종 CI 원문은 Coordinator가 `/tmp/crelink-0279-ci.log`, `/tmp/crelink-0279-ci-report.log`에 HEAD와 함께 남긴다. 구현 담당은 CI를 실행하지 않으며 통과를 주장하지 않는다.
- 2026-11-11 구현: `fetchAccounts(token, config)`의 추상·구현 시그니처를 필수 config로 맞췄다. 실제 호출자 `connection.service.ts`는 이미 settings를 전달하므로 변경하지 않았다. `/debug_token`의 네 조건 검증 뒤 user_id를 metaUserId로 반환하며 assigned 조회 코드는 그대로 유지했다. IG 대체 조회·추가 로그는 넣지 않았다. Sentry는 `input_token` deny와 키 기반 URL/query/span 가림을 보강해 EAA 형식이 아닌 토큰도 가린다. SSoT는 `r3-token-identity-2026-11-11`로 identity 설명을 정정하고 API 안내·API/루트 변경 기록·기존 계약의 R3 이력을 갱신했다. 0278 파일과 R2 원문 판단은 보존했다.
- 2026-11-11 단위 검증: `pnpm --filter @crelink/api test --runInBand --runTestsByPath src/instagram/instagram-crypto.spec.ts src/monitoring/sentry.spec.ts` **2 suites·81건 통과**. 각 principal 조건의 누락·잘못된 값/타입 거부, 불완전 data, 정상 principal/assigned, secret query 부재, `/me` 미호출, 200/400 응답 원문·opaque 토큰·secret 비기록을 확인했다. 기존 assigned 필드·페이지 실패·반복/누락 cursor·10쪽/10계정 제한과 실제 Graph 결과를 받은 서비스의 0개/복수개 409도 통과했다. Sentry는 opaque 토큰의 중복·인코딩 query, 요청 URL·문자열/tuple query, span 이름·URL/query 속성을 확인했다. 실제 Meta 호출은 fetch 대역으로 대체했다.
- 2026-11-11 타입 검증: `pnpm --filter @crelink/api typecheck` **통과**. 최초 실행은 Sentry query 배열 map의 `string[][]` 추론으로 실패했고 반환 타입을 `[string, string]`로 명시한 뒤 관련 unit·typecheck를 다시 실행해 통과했다. `pnpm work:scope 0279`, `pnpm work:check`, `git diff --check`도 통과했다. E2E·full CI·commit/push/PR·리뷰·브라우저·시크릿 조회·운영/API 외부 호출은 실행하지 않았다. 최종 CI 및 실연결 검증은 Coordinator에 인계한다.
