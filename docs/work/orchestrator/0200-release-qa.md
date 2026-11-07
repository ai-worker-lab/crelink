# 0200 출시 QA 연결과 카드2열

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-11-06

## 목적

첫 링크 저장부터 본인 통계까지 실제 localhost 경로를 검증하고 PR 필수 CI에 핵심 E2E와 3엔진 검사를 연결한다. 최신 사용자 지시대로 카드2열을 적용한다.

## 수용 기준

- [x] 320px 이상 카드2열, 기본 리스트·콘텐츠·선택 저장·새로고침·공개/미리보기 일치를 실제로 확인한다.
- [x] 실제 localhost API/PostgreSQL에서 첫 저장→공개→방문/클릭→본인 통계, 타 계정 권한·만료 세션·실패/재시도·Instabio 보존을 확인한다.
- [x] Chromium/WebKit/Firefox의 analytics-responsive/link-layout 및 핵심 E2E가 PR CI 필수 gate에 연결되고 실패 report/trace/PNG가 보관된다.
- [ ] 격리된 음성 CI에서 실제 gate 실패를 관측하고 정상 복원 SHA의 성공을 확인한다.
- [ ] 최소 시각 회귀·접근성 검사와 viewport320/390/768/1280·회전/확대 증거를 남긴다.
- [x] verify/smoke/scope/비밀값 검토 후 draft PR과 실제 CI URL을 남긴다. main 병합·배포는 하지 않는다.

## 범위

- 포함: 현재 요구의 결함 수정, QA/CI 연결, 기준 문서 정합화와 후속 후보 우선순위 제안.
- 제외: 신규 기능 구현, 주기 자동화 변경, 운영 자격 접근·운영 데이터 시험·외부 공개·유료 구독·배포.

## 위험·복구

테스트는 이 checkout 전용 localhost 인스턴스와 합성 계정만 사용한다. fixture OAuth와 외부 목적지 mock·에뮬레이션의 한계를 구분하고 실제 Google OAuth·Instagram 인앱·실물 iPhone/Android는 미실행이면 not-run으로 기록한다. 회귀 시 해당 코드 커밋을 revert하며 사용자 데이터는 지우지 않는다.

## 연결

- [PRD](../../product/crelink.md)
- [링크 표시 방식](../../specs/link-grid-layout.md)
- [검증 루프](../../development/verification.md)
- [E2E](../../../tests/e2e/README.md)
- [디자인 기준](../../../design/system/DESIGN.md)

## 진행 기록

- 2026-11-06: 사용자 명시 로컬 개발 요청으로 착수. 기준 HEAD·origin/main은 `19d75af40a10338babb4145cd201558763cc4015`, 기존 Deploy `42230194580` success를 GitHub에서 조회했다. 이 작업공간은 clean이며 원본 작업공간의 미커밋 파일은 접근·변경하지 않는다. 열린 PR은 별개 의존성 PR139 하나이며 중복 기능 PR은 없다. branch `work/0200-release-qa`를 새로 만들었다.
- 2026-11-06: 감독 Run `run_70499bf44220`, parent Task `task_ad083e9a1c53`, Dispatch `ctx_08594edcf659`. API/shared는 기존 `list/grid` 계약을 유지하며 변경하지 않는다. PM은 CI/runner·제품/설계/디자인·루트 기록, web은 `apps/web/**`, QA는 `tests/e2e/**`·`docs/reviews/**`의 단일 편집자다. QA 설계/구현과 web 구현은 계약 확정 뒤 독립 착수하며 최종 통합 검증은 양쪽 변경 이후 수행한다.
- 2026-11-06: Orca의 `worker_cannot_coordinate_own_run` 제한으로 PM의 동일 Run 하위 생성은 효과 없이 거부됐다. 부모 coordinator가 같은 Run에서 Web `task_a45f7369b38f`/`ctx_985644eabcba`, QA `task_cf726d8a781a`/`ctx_40e8b3069475`를 생성했다. 둘 다 provider `omp`, 명시 모델 `openai-codex/gpt-6.1-sol`, 현재 checkout이다. 실제 계약은 독립 구현/시험 준비 → 양쪽 변경을 인수한 localhost 통합 → PR CI 순서이며 QA가 인계 전 런타임을 단독 소유한다.
- 2026-11-06: Web succeeded를 부모가 인수했다. `apps/web/src/styles.css`의 공통 카드2열, `apps/web/README.md`, 영역 로그3파일을 변경했다. 당시 node_modules 부재로 lint/런타임은 미검증이며 QA 및 최종 통합에서 확인한다.
- 2026-11-06: Node `v24.18.0`/pnpm `10.10.0`에서 `pnpm add -Dw --save-exact @axe-core/playwright@4.14.0`, `pnpm install --frozen-lockfile` 성공. 실제 Playwright CLI `1.64.0`, 설치 axe manifest `4.14.0`. lockfile은 axe 및 axe-core 추가만 유지하고 무관한 registry metadata 변경은 제거했다. 패키지의 비공개 package.json require 조회는 exports 제한으로 실패하여 파일 읽기로 확인했다.
- 2026-11-06: CI의 기존 smoke 의존성을 유지한 채 핵심/페르소나/분석3엔진/배치3엔진을 순차 연결하고 고정 `ubuntu-24.04`·suite별 report·artifact14일을 설정했다. GitHub에서 upload-artifact 최신 release `v7.0.2` 및 Node24 action runtime을 확인하고 `actions/upload-artifact@v7`을 사용했다. API 프로세스에만 localhost 검증된 Instabio 합성 외부 원본 preload를 주입한다. 아직 Actions 실행 성공 근거는 아니다.
- 2026-11-06: 런타임 비점유 상태에서 YAML parse 및 smoke required dependency 검사, `pnpm work:check`(170개), `pnpm docs:check`(296개), `pnpm design:check`(30파일/11 HTML) 통과. 기존 산출물의 od lint P2 missing-section-anchor 경고는 출력됐으며 P1 이상 실패 기준에는 걸리지 않았다. actionlint는 로컬에 없어 실행하지 않았다. 실제 제품/3엔진/CI 결과는 QA 인수 및 PR 실행 뒤 기록한다.
- 2026-11-06: QA가 관측한 Playwright1.64 JSON 상대 경로 기준(configDir) 때문에 suite별 JSON/HTML 경로를 `${{ github.workspace }}` 절대 경로로 고쳤다. 별도 release-qa spec을 만들지 않고 기존 personas/layout에 요구를 통합하므로 CI core 선택은 실제6개 파일만 대상으로 고정했다. 부모의 중간 결과는 core9/personas4/analytics12/layout3 총28 passed이며 최종 settlement·런타임 인수와 CI 검증은 아직 대기한다.
- 2026-11-06: QA succeeded를 부모와 PM이 인수했다. [QA 보고](../../reviews/0200-release-qa.md)와 `tests/e2e/.local/e2e/{core,personas,analytics,layout}-accepted/report.json` 원본에서 expected9/4/12/3·skipped0·unexpected0·flaky0·errors0을 직접 대조했다. 28 passed, suite 소요25.3/4.2/52.5/13.0초. localhost 웹5293/API3120/PostgreSQL5552·macOS25.6 arm64·Node24.18.0·Playwright1.64.0이다. Instabio 집중3회와 Ego390px 검토는 QA 근거를 인수했다. PM도 최종 Chromium390px PNG를 직접 열어2열·긴 제목·이미지/아이콘·배너 전체 열을 검토했다.
- 2026-11-06: QA에서 발견한1023↔1024 반응형 전환 시 Instabio 초안 유실을 web이 안정된 PageEditor 상태 소유로 수정했고 실제 반복 회귀를 통과했다. fixture의 늦은 beacon cleanup 교착은 소유 이벤트 선잠금·동일 transaction 삭제로 고쳤다. visitor 토큰 내부 형식 고정 검사는 삭제하고 실제 redirect·방문 DB 검사는 유지했다. 과거 실패와 복구는 QA 보고에 보존한다.
- 2026-11-06: PM에 런타임 소유권이 이전됐다. CI core9/6파일·personas4·analytics12·layout3 선택을 `--list`로 직접 확인했으며 이는 시험 실행 통과 증거가 아니다. 변경 코드의 private key/GitHub·서비스 credential 패턴 검사에서 일치 없음. 실제 Google OAuth·Instagram 인앱·실물 iOS/Android·OS/페이지 배율·외부 Instabio live는 not-run이다.
- 2026-11-06: 변경 소스 scoped Prettier 후 `pnpm verify` 전체8단계가52.2초에 통과했다(실패/건너뜀0). API261 tests 및 localhost guard18 tests 포함. 전체 출력은 실행 artifact35에 보존했다. Linux baseline·PR CI는 아직 미실행이다.
- 2026-11-06: `pnpm smoke`5 passed(1.9초), `pnpm work:scope 0200 --base origin/main`26파일 통과, `git diff --check` 통과. 시험 뒤 `env -u CRELINK_E2E_INSTABIO -u NODE_OPTIONS make api-up`으로 일반 API를 재시작했다. PM2 선택 필드 조회에서 API/웹 모두 fixture=false·preloadPresent=false·online, API readiness200을 확인했다. checkout 전용 web/API/PostgreSQL/Valkey는 계속 실행 중이며 운영/원본 인스턴스는 변경하지 않았다.
- 2026-11-07: 초기 변경을 `746dfc7945985ddcad1b0053253a340c0b62117a`로 commit/push하고 [draft PR148](https://github.com/ai-worker-lab/crelink/pull/148)을 생성했다. 첫 [CI42238979823](https://github.com/ai-worker-lab/crelink/actions/runs/42238979823)은 Linux baseline 부재를 의도된 중간 실패로 관측할 실행이며 아직 성공으로 처리하지 않았다.
- 2026-11-07: 부모가 settled QA의 최종 `tests/e2e/playwright.config.ts` 통합 편집 소유권을 PM에게 명시 이전했다. 기본 `screenshot: 'only-on-failure'`를 추가하고 실제 `data.session()` custom context의 명시 screenshot 전 의도 assertion 실패를 일회성 spec으로 실행했다(exit1, 예상 실패). `.local/ci/negative-capture/failure-capture-isolated-n-531c0-m-session-failure-artifacts-main/`에 `test-failed-1.png`·`trace.zip` 생성이 확인됐다. 일회성 실패 spec은 즉시 삭제했고 기존 SIM-01 정상1개가2.9초에 통과했다. 이 설정은 초기 SHA에 없으므로 첫 CI의 캡처를 새 옵션 적용 증거로 사용하지 않는다.
- 2026-11-07: 첫 [CI42238979823](https://github.com/ai-worker-lab/crelink/actions/runs/42238979823) 종료는 failure다. 실제 원격 JSON은 core9/personas4/analytics12 passed, layout1 passed/2 failed·flaky0이다. Chromium은 의도한 missing-baseline, WebKit은 별개의 rollback 동작과 `check()` 최종조건 모순 때문에 실패했다. smoke job `127964048679`와 required `CI 통과` job `127966278537`가 failure여서 실제 gate 차단을 확인했다. 업로드 단계는 success이며 artifact `13514631232`(`browser-qa-42238979823-1`,34,047,410bytes)를 다운로드했다. 의도된 실패와 별도 결함을 섞어 제품 성공으로 보고하지 않는다.
- 2026-11-07: Linux actual `.local/ci/remote-42238979823/ci/e2e/layout/results/link-layout-생성자-표시-설정-저장·미리보기·공개-그리드·모바일·실패-복구-chromium/public-two-column-actual.png`를 PM과 부모가 직접 열어2열·긴 제목·이미지/아이콘·배너 전체 열을 검토했다. Ubuntu24.04/Playwright1.64.0 Chromium·390×844에서 캡처한358×935 grid 영역이며 승인본만 `tests/e2e/link-layout.spec.ts-snapshots/public-two-column-chromium-linux.png`에 등록했다(SHA256 `7db6c3333d6738bfbb322a486ef333d0470ab6bd628fe602ee0749cf7d485a42`). 픽셀 허용치0과 실패 판정은 유지한다.
- 2026-11-07: 실패 rollback 구간은 사용자 클릭 뒤 grid로 즉시 복원되어야 하므로 최종 list.checked=true를 요구하는 `.check()`를 `.click()`으로 바꾸고 기존 오류 안내·grid 복원·키보드 재시도·저장/새로고침 assertions는 유지했다. 변경 후 layout3엔진3 passed(13.2초), scoped Prettier·scope28파일·diff check 통과. 부모가 이 회귀 spec·baseline의 최종 통합 소유권을 PM에게 이전했다. 최종 정상 PR CI에서 Linux baseline 비교와 전체 gate 복원을 확인해야 음성→정상 시험이 완료된다.
- 2026-11-07: 복원 [CI42240186746](https://github.com/ai-worker-lab/crelink/actions/runs/42240186746)(`f12b538df92bd6d7814a72e300445903dd4d780f`)은 core9/personas4 passed 뒤 analytics11 passed/1 failed(WebKit operator metrics), layout not-run으로 종료했다. smoke와 required gate failure, Node24/26 verify·이미지 빌드 success다. 새 only-on-failure 옵션의 원격 `test-failed-1~4.png`와 trace가 artifact `13513937447`(16,851,401bytes)에 실제 보관돼 `.local/ci/remote-42240186746/`로 다운로드했다.
- 2026-11-07: 부모가 `tests/e2e/**`·`docs/reviews/**`의 출시 QA 최종 통합 소유권을 PM에게 이전했다. 전용 웹을 기존 검증 빌드의 production `next start`로 바꾸고 실제 API/PostgreSQL에서 WebKit operator metrics만3회 실행해3 failed를 재현했다. 일회성 requestfailed/response/pageerror/navigation 계측은 `before-invalid-goto=1793978144642`→동일출처 RSC `cancelled=1793978144647`→`access control checks` pageerror4648~4649→잘못된기간문서 탐색4655 순서를 보였다. 이전 prefetch 응답은200이며401/403/서버실패가 아니라 독립 오류 URL 검사로 직접 강제 이동하며 이전 문서 요청을 취소한 시험 경합이다.
- 2026-11-07: 빈기간 assertion 뒤 다음 독립 `page.goto` 직전 한 경계에만 `waitForLoadState('networkidle')`를 추가했다. 제품/권한·console/error 수집·기존 assertions·retries·skip은 변경하지 않았다. 진단 리스너/로그는 삭제했고 동일 production WebKit targeted3회가21.7초에3 passed로 복원됐다. 실패/정상 원본은 `.local/ci/webkit-{diagnosis,pageerror-timeline,navigation-fixed}/`에 보존한다.
- 2026-11-07: 첫 경계 수정 뒤 production analytics 전체 영향 검증은11 passed/1 failed(WebKit creator metrics)였다. 잘못된기간 화면→초기화 클릭에서도 진행 중 settings RSC가 취소되는 같은 유형의 경계가 남아 있어, 해당 오류 화면의 assertion 뒤 초기화 클릭 전에도 완료 대기를 한정했다. creator metrics WebKit targeted3회가20.2초에3 passed로 복원됐다. 앞선 영향 검증 실패는 `.local/ci/analytics-navigation-fixed/`, 수정 후 targeted는 `.local/ci/webkit-reset-fixed/`에 보존한다.
- 2026-11-07: 두 탐색 경계 동기화 후 production analytics Chromium/WebKit/Firefox12개가43.5초에12 passed·failed/flaky0으로 통과했고 scoped Prettier·ESLint도 통과했다. 원본 JSON/HTML/PNG는 `.local/ci/analytics-production-final/`이다. 임시 production 서비스는 종료하고 `make web-up`으로 원래 checkout 전용 Next dev를 복원했다. localhost 웹/API readiness 모두200, E2E 합성 사용자 잔여0, scope29파일·diff check 통과를 확인했다. API preload는 제거 상태이며 추가 진단 계측은 남기지 않았다.
- 2026-11-07: [정상 CI42242157268](https://github.com/ai-worker-lab/crelink/actions/runs/42242157268)(`f49109f27d65f3f88ee1330afc0038e6e02a1271`)에서 Node24/26 verify·이미지2종·smoke·scope·required `CI 통과`가 모두 success다(문서전용 job만 조건상 skipped). 원격 JSON을 다운로드해 core9/personas4/analytics12/layout3, 총28 passed·failed/flaky/skipped/errors0을 직접 확인했다. Linux Chromium의 승인 기준선 픽셀비교0허용·axe·WebKit/Firefox까지 정상이다. 초기 음성 gate failure→별도시험결함수정→정상 gate 복원을 실제 관측해 이번 개발·QA 연결 수용 기준을 완료했다. main 병합·배포는 하지 않았다.
- 2026-11-07: 정상 artifact `13515772035`(`browser-qa-42242157268-1`,17,109,146bytes), 원본 `.local/ci/remote-42242157268/ci/e2e/{core,personas,analytics,layout}/results.json`, suite별 `report/index.html` 및 `results/`의 PNG/axe/환경 attachment를 보존한다. 실패 trace/PNG는 이전 음성/복원 실패 artifact에 남아 있다. 이번 기록 반영 후 최종 문서 SHA의 required gate와 원격 head 일치는 PR148의 최종 검사 결과/본문에서 확인한다.
- 2026-11-07: 최종 문서 SHA `08a667e44a84be4a0f02c8c855cb48122c467a9c`의 [CI42243215258](https://github.com/ai-worker-lab/crelink/actions/runs/42243215258)은 analytics11 passed/1 failed(WebKit creator stats의 잘못된기간 화면에서 동일 RSC access-control pageerror), layout not-run이다. 직전 코드 SHA의 전체 성공을 최종 head 성공으로 대체하지 않고 완료 상태와 gate 체크를 다시 진행으로 돌렸다. 증거는 `.local/ci/remote-42243215258/`에 다운로드했다.
- 2026-11-07: 부모가 Creator400/404 초기화의 최소 제품 수정과 영역 문서 소유권을 PM에게 이전했고 QA 읽기전용 교차 검토 Task `task_53b71a53feb6`/Dispatch `ctx_b02bae91783f`를 시작했다. 코드상 Creator는400/404까지 `reload:true` 고정이지만 AdminShell은400/404를 내부 Link로 처리했다. `CreatorAnalyticsPage`의 reload를400/404에서만 false로 맞추고500/네트워크 다시 시도의 full reload는 보존했다.
- 2026-11-07: production WebKit의 별도 안정화된 초기화 probe에서 mouse click/touch tap 각3회씩 수정 전6회 모두 문서 요청·timeOrigin 변경(reload=true), 수정 후6회 모두 같은 문서의 내부 이동(reload=false)을 관측했다. 이 단독 probe 자체는 수정 전에도6 passed였으므로 console 실패 재현으로 과장하지 않는다. 오류 자체의 수정 전 근거는 위 원격 전체 흐름과 취소 시각 계측이다. 초기화 직전 임시 networkidle은 제거하고, 다른 독립 invalid URL로 강제 이동하기 전 대기1개만 유지했다. 영구 시나리오는 초기화 URL·기본 시작/종료일을 실제 화면에서 확인한다.
- 2026-11-07: 일회성 루프백 proxy가 특정 미래기간 analytics 요청만 HTTP500 또는 연결 종료로 만들고 그 밖의 내부 요청은 실제 API/DB로 전달하게 해 오류→다시 시도를 검증했다. 복구 뒤 mouse/touch 재시도 모두 문서 reload 유지·기존 기간값 보존·실제 API200/pageViews0으로2 passed(3.4초)였다. 이것은 서버/네트워크 오류 주입·복구 시험이며 운영 오류나 외부 서비스 시험이 아니다. 관련 임시spec2개·proxy source·프로세스는 삭제/종료했다.
- 2026-11-07: 수정된 production 실제 API 직결에서 WebKit4화면×3회12 passed(49.8초), 이어 Chromium/WebKit/Firefox12 passed(39.9초)를 확인했다. 원본 `.local/ci/reset-{before,after}/`, `.local/ci/analytics-retry-preserved/`, `.local/ci/creator-recovery-{webkit-repeat,three-engine}/`에 보존한다. production 빌드도 통과했고 전용 진단 웹은 종료 후 Next dev로 복원했다. console/error 필터·retry·skip·기준선 픽셀 허용치는 바꾸지 않았다.
- 2026-11-07: 독립 QA 읽기전용 교차 검토를 인수했다.400/404 내부 이동·나머지 문서 재조회는 기존 AdminShell/ErrorPanel 의미와 일치하는 최소 수정이며 실제 click·기본 URL/기간 assertion과 별도 tap 관측은 상호 보완적이라고 검토했다. 과거 마지막 원격 실패에서는 두 networkidle이 실제 완료되고 복구 UI assertion도 통과했으므로 대기 미실행/UI복구 실패 또는 CORS정책 결함으로 단정하지 않는다. 해당 마지막 원격 trace에는 요청/오류 시각이 없어 이전 계측의 취소 인과를 그대로 확정 적용하지 않으며, 재발 해소는 새 Linux 최종 전체 gate 결과로 판단한다. 검토자는 artifact/code 읽기만 했고 런타임/파일을 변경하지 않았다.
