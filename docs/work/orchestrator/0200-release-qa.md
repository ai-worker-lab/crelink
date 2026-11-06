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
- [ ] Chromium/WebKit/Firefox의 analytics-responsive/link-layout 및 핵심 E2E가 PR CI 필수 gate에 연결되고 실패 report/trace/PNG가 보관된다.
- [ ] 격리된 음성 CI에서 실제 gate 실패를 관측하고 정상 복원 SHA의 성공을 확인한다.
- [ ] 최소 시각 회귀·접근성 검사와 viewport320/390/768/1280·회전/확대 증거를 남긴다.
- [ ] verify/smoke/scope/비밀값 검토 후 draft PR과 실제 CI URL을 남긴다. main 병합·배포는 하지 않는다.

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
