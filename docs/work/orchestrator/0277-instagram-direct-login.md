# 0277 Instagram 직접 로그인 전환

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 결함
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-11

## 목적

운영 Instagram 연동에서 Instagram 계정으로 로그인하고 공유할 계정을 선택할 수 있게 한다. 신규 앱 콘솔에서 지원하지 않는 old Instagram Login R1은 취소하고, 실제 콘솔의 Instagram 로그인 호환 Unified Login과 CTO R2를 구현한다. Facebook 페이지 연결은 요구하지 않는다.

## 수용 기준

- [x] 공식 `https://www.facebook.com/dialog/oauth`에 기존 Meta config·state·redirect_uri와 콘솔 확인 `override_default_response_type=true`, `prompt=login`, `response_type=code`, `display=popup`을 전달한다.
- [x] BISU `/me?fields=id,client_business_id`를 확인하고 assigned IG 계정만 사용한다. 페이지/accounts/debug_token 대체 경로를 제거하며 필수값·pagination·10계정/10쪽 상한을 검사하고 0개·복수개는 거부한다.
- [x] 기존 Meta 설정·암호키·null 만료·사용자 권한·state/revision·콜백/암호화 경로를 보존하고 새 설정·migration·refresh를 추가하지 않는다. 소스 변경과 fetch mock 근거이며 DB/HTTP 실행 검증은 아래 한계 참고.
- [x] 연결 문구, SSoT `r2-unified-2026-11-11`, API 운영 안내·영역/루트 변경 기록에 현재 흐름과 삭제 콜백 식별자 미실측을 반영한다.
- [ ] 지정 API 시험·관련 typecheck/lint 결과를 남기고 Coordinator가 CI·브라우저·실제 Meta 확인·최종 검수·PR/배포를 완료한다.

## 범위

- 포함(CTO R2 구현): authorize URL·BISU/assigned 계정 조회·연결 문구·현재 인증 설명·관련 시험. 실제 콘솔/SOPS config 값 변경은 Coordinator가 처리했다.
- 제외(이번 구현): 새 설정·migration·60일 refresh, 운영 secrets 열람/수정/복호화, CI·브라우저·외부 Meta·commit/push/PR·최종 review, 공개 범위 확대·Meta 앱 검수·디자인 재설계·인프라 전체 회귀·실제 DM 발송. 후속 통합 검증·출시는 Coordinator 소관이다.

## 위험·복구

기존 `META_APP_ID/SECRET/LOGIN_CONFIG_ID/WEBHOOK_VERIFY_TOKEN`과 암호키를 유지한다. Coordinator가 기존 SOPS 설정의 config id만 Instagram 로그인 호환 구성 `1767663210968198`로 바꿨으며 구현 담당은 운영 secrets를 열거나 수정·복호화하지 않는다. BISU id를 `meta_user_id`에 저장하지만 실제 삭제 콜백의 user_id와 일치하는지는 미실측이다. client_business_id는 응답 확인에만 사용하며 관리 API·저장 구조는 도입하지 않는다. 실제 필수 응답이 없으면 오류로 막고 임의 Facebook 페이지 연결로 우회하지 않는다. 기존 연결·대기 영향 및 운영 배포는 Coordinator가 확인하며 기존 Blue/Green 롤백을 따른다.

## 연결

- [CTO 계약 R2](../../../contracts/0277-instagram-direct-login/1-cto-interface.contract.md#r2-현재-채택-흐름--실제-콘솔과-최신-unified-login-기준)

- [현재 Instagram 설계](../../specs/instagram-comment-dm.md)
- [기존 R1 공식 Instagram 비즈니스 로그인(취소 이력)](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [기존 R1 공식 자기 계정 조회(취소 이력)](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started)
- [공식 Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)

## 진행 기록

- 2026-11-11: 사용자 요구와 현재 Facebook 기반 코드 확인. task `task-c7c34040700441b0afed513d08e93464`에 CTO flow 판정을 먼저 요청했다. 공식 로그인 문서 Updated 2026-03-13, 자기 조회 Updated 2024-12-02, Webhooks Updated 2026-10-20을 오늘 ego-browser에서 열람했다. Meta 개발자 콘솔은 로그아웃 상태라 동일 TaskSpace 577을 사용자에게 인계하고 코드와 독립적인 로그인/자격 증명 준비를 비동기 안내했다.
- 2026-11-11 R2 정정: 실제 신규 앱 콘솔은 기존 Instagram Login 설정을 지원하지 않으며 대신 Instagram 로그인 호환 통합 구성을 제공한다. 이 항목이 앞선 직접 OAuth·새 전용 키·graph.instagram 전환 기준을 대체한다. R1은 이력으로 보존하며 그 중간 tracked 변경은 Git 밖 patch에 보관하고 HEAD로 복구했다. 현재 수용 기준은 Meta 공식 통합 선택창의 Instagram 인증, Meta 앱 키 유지·구성 ID 교체, BISU와 assigned 계정 조회, 기존 권한/state 보존이다. Coordinator가 SOPS 구성 ID만 교체하고 dev R2를 같은 task에 연결했다.

- 2026-11-11 CTO R2 구현: Coordinator가 HEAD로 복구한 상태에서 `graph.ts` authorize URL과 BISU/assigned 조회만 수정했다. 기존 Meta 코드 교환·null 만료·설정·암호화·state/revision·삭제 콜백 로직은 유지하고 페이지/accounts/debug_token 대체 경로를 제거했다. assigned는 고정 Graph 호스트에 cursor로 최대 10쪽·계정 10개까지 확인하며 불완전 목록·필수값 누락·cursor 누락/반복·중복·어느 페이지의 오류도 전체 실패로 처리한다. 0개·복수개 거부는 기존 connection service를 유지했다. 연결 안내와 현재 SSoT·운영 안내·변경 로그를 갱신했다.
- 2026-11-11 CTO R2 시험 범위: 기존 연결 E2E의 Graph 대역(spy)을 유지해 소유자/AI/편집자 권한·state 위조/만료/타인/재사용·revision 경합·콜백·암호화/null 만료 회귀를 보존하고 authorize 파라미터와 저장 식별자 대응표 검사를 보강했다. `instagram-crypto.spec.ts`의 실제 FetchInstagramGraph/fetch mock은 authorize 호스트/파라미터/state 보존·BISU 필수값·assigned 결과/오류/부분목록/페이지 순회·상한을 확인한다.

- 2026-11-11 CTO R2 실행 결과: `TEST_DATABASE_URL`을 이 checkout의 `.local/instance.env`와 같은 로컬 `127.0.0.1:5452`로 지정하여 `pnpm --filter @crelink/api test -- "instagram-connection|instagram-contract|instagram-crypto|instagram-graph"`를 실행했다. 최종 결과는 **1 suite·51건 통과, 2 suite·64건 실패**다. `instagram-crypto.spec.ts`의 암호화·실제 FetchInstagramGraph/fetch mock은 통과했다. connection·contract E2E는 모두 DB 연결 `connect EPERM 127.0.0.1:5452`로 실패하여 권한/state/revision/콜백의 HTTP·DB 실행 결과를 검증하지 못했다. 로그: `/tmp/crelink-0276-r2-api-test.log`.
- 2026-11-11 CTO R2 정적 검사: `pnpm --filter @crelink/api typecheck`, `pnpm --filter @crelink/web typecheck`, 변경 TypeScript 4개(`graph.ts`, `instagram-crypto.spec.ts`, `instagram-connection.e2e-spec.ts`, `ConnectionPanel.tsx`)를 지정한 `pnpm exec eslint ...`, `git diff --check` 통과. 검증 명령은 지정 API 시험과 관련 typecheck/lint로 제한했으며 CI·브라우저·외부 Meta·commit/push/PR·최종 review는 실행하지 않았다.
- 2026-11-11 CTO R2 로컬 자원: 허용된 `make infra-up`만 시도했으나 Docker API 소켓 `/Users/atms/.docker/run/docker.sock` 접근이 `permission denied`로 거부됐다. 직접 띄운 컨테이너·서비스가 없어 정리할 자원도 없고 볼륨 삭제는 하지 않았다. 운영 secrets는 열거나 수정·복호화하지 않았다.
- 2026-11-11 CTO R2 미확인 한계/인계: 실제 Meta code 교환의 기존 폼 POST·Bearer 인증, BISU id/client_business_id·assigned 응답과 연결 완료, 실제 삭제 콜백 user_id와 BISU id의 대응, Facebook 계정 없이 포트폴리오를 만드는 경로·webhook 수신은 이 작업에서 실측하지 않았다. 필수값 누락은 오류로 막으며 Facebook 페이지 연결을 우회 요구하지 않는다. DB 접근 가능한 환경에서 지정 E2E 재실행과 CI·브라우저·외부 Meta·최종 검수·PR/배포는 Coordinator가 이어서 확인한다. 티켓은 통합 검증 전이므로 `진행`을 유지한다.
- 2026-11-11 Coordinator 통합: Node 24 환경의 로컬 CI 12단계 통과(109.4초). API 47 suite·755건, 웹 162건 통과로 개발 격리환경의 DB EPERM 실패를 해소했다. 실제 Meta 콘솔의 callback은 운영 주소로 검증·저장 후 새로고침 유지, comments 구독 확인. Instagram 인증 진입은 미리보기로만 확인했고 최종 실제 연결은 배포 후 확인한다.
- 2026-11-11: 다른 작업 PR #161이 main에 병합되며 0276 번호를 사용해 이 작업을 0277로 재번호 부여한다. 같은 task를 유지하고 첫 검증 당시 번호·로그는 과거 이력으로 보존한다. 최신 main 통합 후 최종 CI status·검수는 새 최종 커밋을 대상으로 수행한다.
