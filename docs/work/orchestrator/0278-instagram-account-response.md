# 0278 Instagram 계정 응답 검증 보완

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 결함
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-11

## 목적

운영 실연결에서 Instagram으로 계속하기 → badajjack 로그인 → 짹짹이 포트폴리오/badajjack 1개 → 프로필·댓글·메시지 3권한 저장 후 callback이 `instagram_upstream_failed`로 끝났다(사용자 제공 사실). 서버 로그 `Graph fetchAccounts kind=indeterminate status=null code=null subcode=null`은 200 응답 guard 실패를 가리킨다. 저장·사용하지 않는 `client_business_id`의 필수 검사를 제거한다. 실제 응답 본문·누락 여부는 조회하지 않는다.

## 수용 기준

- [x] BISU id가 없거나 유효한 문자열이 아니면 assigned 조회 전에 거부한다.
- [x] `client_business_id` 생략 시에도 assigned의 정상 IG 목록을 반환한다. IG 필수값·페이지 오류·상한 검사와 서비스의 0개·복수개 409 거부는 유지한다.
- [x] 관련 fetch mock unit 시험과 API typecheck 결과를 기록하고 현재 필수 필드 설명·API/루트 변경 기록만 정정한다.

## 범위

- 포함: `apps/api/src/instagram/graph.ts`의 `fetchAccounts`, `instagram-crypto.spec.ts`, 현재 SSoT·API 안내의 필수 필드 설명, 변경 기록. [0277](0277-instagram-direct-login.md)의 후속 결함이며 기존 CTO 계약 이력은 보존한다.
- 제외: 전체 설계·새 계약·migration·리팩터링·문구 디자인·설정/OAuth/보안/범위/상한/Graph 호스트 변경. CI·commit·push·PR·브라우저·운영 접속·시크릿 조회·외부 API 호출은 Coordinator 담당이며 구현 담당은 실행하지 않는다. DB/네트워크 E2E는 재시도하지 않는다.

## 위험·복구

BISU id와 assigned IG 검증을 유지하고 진단 로그를 추가하지 않는다. 응답 본문·토큰·시크릿을 출력하지 않는다. 복구는 이번 guard 변경을 되돌린다.

## 연결

- [현재 SSoT](../../specs/instagram-comment-dm.md#oauth토큰삭제)
- [API 안내](../../../apps/api/docs/README.md#instagram-공개-답글과-unified-login-보강)

## 진행 기록

- 2026-11-11: `work/0278-instagram-account-response`에서 범위를 확인했다. 최종 코드 CI 원문은 Coordinator가 `/tmp/crelink-0278-ci.log`, `/tmp/crelink-0278-ci-report.log`에 남기며 코드 검수자는 해당 로그를 현재 HEAD와 대조한다. 구현 담당은 CI를 실행하지 않았으며 통과를 주장하지 않는다.
- 2026-11-11 구현·검증: `fetchAccounts`의 `client_business_id` 필수 조건만 제거하고 추가 로그는 넣지 않았다. fetch mock은 해당 필드 생략/null/비문자열/존재 시 정상 assigned 목록 반환, BISU id 누락·빈 문자열·비문자열 거부, IG id/username 누락·페이지 오류·상한을 확인한다. 0개·복수개는 실제 Graph 구현 결과를 서비스에 전달해 DB 대역의 조회 1회만 수행하고 구독·저장 전에 409 `instagram_account_selection_required`로 거부함을 확인했다.
- 2026-11-11 실행 결과: `pnpm --filter @crelink/api test --runInBand --runTestsByPath src/instagram/instagram-crypto.spec.ts` **1 suite·55건 통과**(기존 51건에 4건 추가), `pnpm --filter @crelink/api typecheck` **통과**. 최초 실행은 새 시험의 잘못된 사용자 역할 `user`로 타입 오류가 발생해 `creator`로 정정한 뒤 재실행했다. `pnpm work:scope 0278`, `pnpm work:check`, `git diff --check`도 통과했다. E2E·외부 API·운영 접속·시크릿 조회·CI·commit/push/PR은 실행하지 않았고 Coordinator 검증으로 넘긴다.
