# [CTO Contract] Instagram 직접 로그인 전환

- 작업: 0277. task: task-c7c34040700441b0afed513d08e93464.
- 현재 기준: docs/specs/instagram-comment-dm.md `r2-unified-2026-11-11`. R1 원문은 취소 이력이며 현재 구현은 R2만 따른다.
- 사용자 권한: Instagram 직접 연동으로 수정·배포·완수 요구. 코드 변경·필요한 설정 적용은 승인 범위이며 결제·일반공개·DM 발송은 제외.
- 검증 담당: R2 구현 담당은 지정 API 시험·관련 typecheck/lint만 실행한다. CI·브라우저·실제 Meta·commit/push/PR·최종 검수는 Coordinator 소관이며 이번 구현에서 수행하지 않는다.
- Coordinator 보완(R1 취소 이력, 현재 키 교체 지시 아님): 추가 공식 Webhooks 문서(2026-10-20)는 앱 기본 설정의 App Secret으로 서명을 검증한다고 설명한다. /tmp/crelink-instagram-webhooks-official.txt 참고. OAuth 전용 Instagram secret과 부모 Meta App Secret을 무조건 같다고 가정하지 않는다. 기존 META_APP_SECRET을 웹훅/삭제 검증용으로 보존하고 선택 규칙을 명시·시험한다. 불일치 때 양쪽 서명을 무조건 허용하는 처리는 하지 않는다. 실제 서명은 대시보드 시험에서 확인한다.
- 실행 격리: 단일 개발 역할만 이 작업 브랜치에서 수정하며 다른 작업트리는 건드리지 않는다.

## CTO 원문 판단 (당시 이력)

**결론:** 0276은 인증 소스 전체를 바꾸는 작업입니다. Instagram 로그인 토큰은 graph.facebook.com에서 쓸 수 없어 로그인 URL만 바꾸면 안 되고, graph.ts·config·토큰 갱신을 함께 바꿔야 합니다. 마이그레이션과 인프라 구조 변경은 필요 없습니다.

**흐름**
1. **Coordinator, 배포 전:** 운영 DB의 연결·규칙·대기 건수를 다시 봅니다. 0이 아니면 멈추고 보고합니다. 기존 로그인 세션으로 앱 대시보드(Instagram > Instagram 로그인으로 API 설정 > Instagram 비즈니스 로그인)에서 다음을 처리합니다.
   - Instagram app ID/secret 확인
   - 리디렉션 URI `{WEB}/me/integrations/instagram/callback` 등록
   - Instagram 제품 웹훅 등록: 콜백 주소, 기존 verify token, `comments` 구독
   - 데이터 삭제 콜백 등록
   - 시크릿은 사용자가 SOPS에 직접 넣습니다.
2. **3-dev(api), worktree:**
   - `graph.ts`
     - 로그인 주소: instagram.com/oauth/authorize, `enable_fb_login=false`, scope 3개, state
     - code 교환: api.instagram.com POST 폼, `grant_type=authorization_code`
     - 바로 이어서 graph.instagram.com `ig_exchange_token`으로 장기 토큰(60일)을 받고, expiresAt을 저장합니다.
     - `refreshToken()`을 새로 만듭니다(`ig_refresh_token`).
     - 계정 조회는 `/me?fields=id,user_id,username,account_type` 한 번으로 끝내고, 페이지·assigned·debug_token 경로(171-276)는 지웁니다.
     - 구독(`/me/subscribed_apps`)·media·messages·replies·checkToken도 graph.instagram.com으로 옮깁니다.
   - `config.service.ts:68-71,127-129`: `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`으로 바꾸고 `LOGIN_CONFIG_ID`는 지워 필수 키를 7개로 줄입니다.
   - `token-health.service.ts`: 만료 7일 이내이고 발급 후 24시간이 지난 토큰을 갱신합니다. `token_revision`이 같을 때만 저장합니다.
   - `connection.service.ts`: igUserId는 `/me` `user_id`, metaUserId는 교환 응답 `user_id`, isProfessional은 account_type으로 정합니다.
   - `sentry.ts:41`: `IGAA` 토큰 패턴을 추가합니다.
   - `.env.example`, `apps/api/docs`를 고칩니다.
   - web은 `ConnectionPanel.tsx:126`에서 "(페이스북)" 한 줄만 지웁니다. 콜백 route는 `#_`가 서버로 오지 않으므로 그대로 둡니다.
3. **통합 담당:** SSoT `docs/specs/instagram-comment-dm.md`의 64-67, 74, 330-355, S7·A1, 변경 기록을 고칩니다. 지금은 rN 표기가 없어 새로 넣고, 기준이 바뀌므로 rN을 올립니다.
4. **CI와 최종 양측 검수 1회**
5. **5-infra:**
   - SOPS에 새 키 2개를 넣고 Blue/Green으로 배포합니다.
   - 옛 `META_APP_ID/SECRET/LOGIN_CONFIG_ID`는 롤백할 때 필요하므로 배포가 안정된 뒤 지웁니다. 새 릴리스는 남은 옛 키를 무시합니다.
   - 롤백은 이전 릴리스를 옛 키로 되돌리는 것이고, DB는 되돌리지 않습니다.
6. **배포 후:** 테스터 계정으로 실제 연결 1회와 웹훅 서명 1회를 확인합니다. 규칙 생성과 DM 발송은 하지 않습니다.

**배포 전 조건:** 건수 0 재확인, 대시보드 등록, SOPS 반영, CI 통과, 검수 PASS.

**검증**
- **포함:**
  - `pnpm --filter @crelink/api test -- "instagram|config.service|sentry|health"`. 기존 mock 17곳을 고치고 다음을 시험합니다: 부분 설정이면 기동 거부, 갱신 경합.
  - 새 `graph.spec.ts`: fetch를 대신해 호스트·폼·파라미터 값을 확인합니다.
  - web 해당 테스트와 필수 CI
- **제외:**
  - 인프라 전체 회귀: 포트·네트워크·compose가 그대로입니다.
  - 시각 QA·디자인: 바뀌는 건 문구 한 줄입니다.
  - migration 시험: 컬럼(0016:16,21)을 그대로 씁니다.
  - 브라우저 E2E: 실제 Meta가 필요해 배포 후 실연결 1회로 대신합니다.

**위험**
- **웹훅 서명 키(미확인):** 기본안은 Instagram app secret 하나로 OAuth state, 웹훅(`webhook.service.ts:130`), 삭제 콜백(`:215`)을 모두 처리하는 것입니다. 받아 둔 문서에는 서명 키가 나오지 않습니다. 배포 후 대시보드 테스트 이벤트에서 실패하면 META secret을 함께 검증하는 쪽으로 바꿉니다.
- 삭제 콜백의 `user_id` 체계, graph.instagram.com의 v27.0 경로·Bearer 헤더 지원도 확인하지 못했습니다.
- 실제로 연결할 수 있는 계정은 테스터 계정뿐인 것으로 보입니다(추정).
- 60일 동안 갱신하지 못하면 재연결해야 합니다.

**이사회 승인 필요:** 대시보드 설정 변경, SOPS 등록, 운영 배포.

**다음 행동:** Coordinator가 1단계를 진행합니다.

**판단**
- **토큰 경로 전체 교체:** 두 토큰은 서로 다른 호스트에서만 쓸 수 있습니다. URL만 바꾸는 안은 버렸습니다(graph.ts:5-6, 197-306).
- **시크릿 하나로 통일:** 두 시크릿을 같이 두면 설정과 부분 설정 판정이 복잡해져 버렸습니다(connection.service.ts:44).
- **migration 없음:** 기존 컬럼과 revision 규칙으로 갱신까지 할 수 있습니다.
- **최소 QA:** 변경 범위가 API 인증 경계와 문구 한 줄뿐입니다.


## R2 현재 채택 흐름 — 실제 콘솔과 최신 Unified Login 기준

- R1은 당시 이력이며 현재 구현 지시로 사용하지 않는다. 실제 신규 앱은 기존 Instagram Login 설정을 지원하지 않는다.
- 선택된 Instagram 로그인 호환 구성: 1767663210968198, SUAT·만료 없음. Meta App ID/Secret은 유지하고 새 Instagram 전용 키는 받지 않는다.
- 콘솔 생성 로그인 URL의 override_default_response_type=true, prompt=login을 확인했다. 실제 선택창에서 Instagram으로 계속하기를 누르면 instagram.com/accounts/login 및 저장된 Instagram 계정 목록으로 이동했다. 미리보기 state로 권한 승인·콜백 완료는 수행하지 않았다.
- 현재 공식 근거: /tmp/crelink-unified-login-official.txt, /tmp/crelink-unified-get-started-official.txt, /tmp/crelink-unified-authentication-official.txt.
- 범위: 공식 authorize 파라미터·BISU/assigned 계정 조회·안내 문구·현재 SSoT·관련 API 시험과 필수 CI·최종 양측 검수. 인프라 전체회귀·디자인·새 migration·60일 토큰 갱신은 제외.

### CTO R2 원문
**결론:** r2는 HEAD(7d7b2db)로 되돌린 뒤 config 값을 바꾸고 `graph.ts`의 계정 조회만 줄이면 됩니다. HEAD에 이미 `dialog/oauth`·config_id·`prompt=login`·state·Meta 코드 교환이 있습니다(graph.ts:182-212).

**흐름 r2 (r1은 이력으로 보존)**
1. 3-dev: 수정된 파일 19개를 HEAD로 되돌립니다. 완료 조건은 graph.instagram·IG 키·60일 갱신이 0건인 것입니다.
2. Coordinator: `META_LOGIN_CONFIG_ID`를 1767663210968198로 바꿉니다. 기존 설정값 주입으로 처리합니다.
3. 3-dev: `fetchAccounts`(graph.ts:214-317)를 두 번의 조회로 바꿉니다.
   - `/me?fields=id,client_business_id`: 결과가 없으면 잘못된 구성으로 보고 막습니다.
   - `/me/assigned_instagram_accounts`
   - 페이지·debug_token 대체 경로는 지웁니다. 계정 1개 조건은 기존 코드(connection.service:244)를 그대로 씁니다.
   - `override_default_response_type`은 받은 공식 문서 3개에 없습니다. 콘솔에서 복사한 로그인 URL에 있을 때만 넣습니다.
   - 안내 문구 "인스타그램(페이스북)"(ConnectionPanel:126)은 "Instagram 또는 Facebook"으로 한 줄만 고칩니다.
4. 검증: connection·contract e2e와 필수 CI, PR 전 양측 검수 1회만 합니다. 마이그레이션·인프라 회귀·전체 E2E·시각 QA는 하지 않습니다.
5. 7단계 실측: IG 선택지 표시, FB 계정 없이 포트폴리오·IG 계정 1개 표시, code 교환, 테스트 webhook 수신을 확인합니다.
6. 배포 전: 운영 연결·규칙·대기가 0인지 다시 확인합니다. 배포 후 authorize URL의 config_id를 한 번 확인합니다.

**위험(미확인):** 삭제 콜백의 user_id와 BISU `/me` id(opt_out_owners:355)가 일치하는지 모릅니다. FB 계정 없이 포트폴리오를 만드는 경로도 확인하지 못했습니다.

**판단**
- `client_business_id`는 저장하지 않고 확인용으로만 씁니다. 만료 없는 토큰이라 관리 API로 갱신할 필요가 없고, 저장하려면 마이그레이션이 필요합니다. 만료 있는 구성을 쓰게 되면 그때 다시 판단합니다.
- 기존 경로를 남기는 안은 버렸습니다. BISU의 `/me`가 사용자가 아니라서 실패를 가립니다.

### R2 구현 인계 범위 (2026-11-11 사용자 지시 반영)

- 콘솔 생성 URL에서 override 값이 확인되었으므로 authorize는 공식 `https://www.facebook.com/dialog/oauth`에 `override_default_response_type=true`·`prompt=login`·`response_type=code`·`display=popup`과 기존 config_id/client_id/state/redirect_uri를 보낸다.
- `graph.ts`는 BISU id·client_business_id를 필수 확인한 뒤 assigned 계정 id·username만 사용한다. 최대 10계정·10쪽 및 불완전 응답/페이지 오류를 검사하고 0개·복수개 거부는 기존 서비스를 유지한다. metaUserId는 BISU id로 저장하고 실제 삭제 콜백 식별자 일치는 미확인으로 남긴다. 기존 Meta 키·verify token·암호키·null 만료를 유지한다.
- ConnectionPanel 안내는 “Instagram 계정으로 로그인하고 연결할 계정을 선택해요.”로 정정한다. R1의 graph.instagram·전용 Instagram 키·60일 refresh는 재사용하지 않는다.
- 기존 SOPS config 값은 Coordinator가 변경했다. 구현 담당은 `infra/prod/secrets`를 열거나 수정·복호화하지 않는다.
- 구현 담당의 실행 검증은 `pnpm --filter @crelink/api test -- "instagram-connection|instagram-contract|instagram-crypto|instagram-graph"`와 관련 typecheck/lint뿐이다. DB 필요 시 이 checkout의 `make infra-up`만 사용하고 직접 띄운 자원만 볼륨 삭제 없이 정리한다. CI·브라우저·외부 Meta·commit/push/PR·최종 review는 Coordinator가 담당한다. 실행 결과와 미확인 한계는 0276 티켓 진행 기록에 남긴다.
