# 0170 Crelink 전담 PM·실행팀 구성

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-11

## 목적

사용자는 회사 중앙 오케스트레이터와 프로젝트별 PM·실행팀을 분리하고, 새 팀의 범위로 **Crelink 전담 PM·실행팀**을 선택했습니다. 사용자 위임에 따라 기존 20분 실행의 프로젝트 책임자를 `crelink-pm`으로 전환합니다. 중앙 오케스트레이터는 회사/프로젝트 간 우선순위·승인·충돌 조정, PM은 Crelink 과제 선택·팀 배정·검증·출시·실행 보고를 책임집니다. 별도 신규 서비스나 중복 20분 스케줄러는 만들지 않습니다.

## 수용 기준

- [x] 전담 PM과 8개 팀의 실제 agent 정의/기존 역할 매핑·소유권·권한을 구성합니다.
- [x] 단일 orchestrator의 spawn 금지 대신 PM의 Orca 감독·Task/Dispatch·질문/결과·정리 계약으로 현재 운영 문서·프롬프트를 전환합니다.
- [x] CLI 실행 담당자와 자동화 생성 명령의 PM·Sol 모델·20분·기록 계약을 맞춥니다. 기존 실행 기록은 바꾸지 않습니다.
- [x] 실제 Orca 감독 Run에서 독립 실행팀 작업을 배정·settlement·통합하고 근거를 남깁니다. 요청 인자만으로 모델/실행 성공을 주장하지 않습니다.
- [x] 실제 localhost API/DB에서 PM 실행 시작·결과 기록과 기존 멈춤/중복 경계를 확인합니다. 운영 시험 계정/DB 쓰기·유료 구매·외부 홍보는 하지 않습니다.
- [x] 기존 20분 자동화의 이름/PM 프롬프트/agent 기록/precheck를 갱신하고 저장 상태를 확인합니다. 이미 시작한 실행은 새 PM 실행으로 재분류하지 않습니다.
- [x] 실제 검증·문서/변경 기록·PR CI와 팀 과제 인계를 완료합니다. 진행 중/미병합 작업과 실행 이력은 보존합니다.

## 경계

- 모든 실행팀은 PM의 파일 범위·완료 조건·승인 조건이 있는 과제로만 호출합니다. 불필요한 상시 8팀 실행, PM을 우회하는 운영 쓰기/머지/토큰 배포, 비용이 드는 임의 모델 대체를 금지합니다.
- 기존 Sol 모델을 명시하고 추가 지출·유료 API·광고·외부 게시·보상·사람 계정·법률/개인정보 위험은 사람 승인 전 보류합니다.
- 정상 실행은 기존 0168/0169 등 실행 가능한 그로스 과제의 실제 산출물을 우선합니다. 팀 구성은 스타터 키트/챌린지 출시가 아닙니다.
- 팀별 수정은 구분한 범위에서 수행하고 build/lint/tests/formatter는 통합 후 한 번 실행합니다. Worker settlement 전 삭제/재시작/중복 실행하지 않습니다.

## 연결

- [운영팀 헌장](../../ops/ai-operations-team.md)
- [실행 프롬프트](../../ops/ai-operator-prompt.md)
- [팀별 로드맵](../../ops/crelink-growth-roadmap.md)
- [가상 사용자 검증](../../development/user-simulation.md)

## 진행 기록

- 2026-10-11: 범위 선택 결과는 Crelink 전담 PM·실행팀입니다. 기존 자동화 id와 모델/20분/계정·이력·안전 gate를 재사용하는 전환으로 결정했습니다. 생성할 PM은 `crelink-pm`, 신규 실행 역할은 `crelink-research`, `crelink-growth`, `crelink-events`, `crelink-qa`이며 Product/Web/API/SRE는 기존 agent를 재사용합니다.
- 2026-10-11: Orca 감독 Run `run_79f7da401e6d`에서 독립 소유의 역할 구성(`task_6360d29939cb`, `ctx_a6d584e574ec`)과 운영 계약 전환(`task_ffb90308fed8`, `ctx_996c57464866`)을 병렬 배정했습니다. 두 launcher의 요청/실효 모델은 `openai-codex/gpt-6.1-sol`, provider `omp`로 확인했습니다. 접수 receipt의 turnStart는 unsupported였으므로 접수만으로 실행 완료를 주장하지 않았습니다.
- 2026-10-11T14:53:06Z/14:54:37Z: 두 worker가 정확한 Task/Dispatch와 `outcome: succeeded`, 실제 수정 파일을 보낸 settlement를 수신했습니다. 역할 5개와 현행 운영 계약 6개가 생성/수정됐으며 결과를 통합했습니다. 두 terminal은 accepted settlement 뒤 `worker-release`로 closed_agent_terminal/captured를 확인하고 Delivery를 ack했습니다. coordinator shell·주 checkout·진행 중 기능 작업은 건드리지 않았습니다. 팀별 비용/토큰 수는 미확인입니다.
- 2026-10-12: 통합에서 실제 CLI 기본 PM 담당자와 생성자의 PM/Sol prefix를 맞췄고, 중앙 역할의 Crelink PM 위임 경계를 추가했습니다. 새 팀만으로 OS credential 격리가 됐다고 주장하지 않으며 기존 ADR 0015의 지침 기반 위험 수용·OS 계정 분리 권장 절차를 유지합니다.
- 2026-10-12: checkpoint `13d1c79`에서 분리한 `sim17`(슬롯 2, Web `http://127.0.0.1:5393`, API `http://127.0.0.1:3220`, 전용 Compose/DB)에서 실제 CLI→BFF→API→DB를 실행했습니다. `CRELINK_AI_AGENT`를 생략하고 로컬 전용 토큰/상태 폴더로 시작한 실행 `16507fe4-f69d-4530-9f88-187e89124819`의 DB 담당자 `crelink-pm`, 모델 `openai-codex/gpt-6.1-sol`, running→succeeded·actions/refs 보존을 확인했습니다. 중복 start·진행 중 precheck·finish 후 guard는 차단됐고, 사람 화면의 멈춤 뒤 precheck/start는 paused_count 2로 합쳐졌습니다. 390px 실제 기록 카드에 PM·모델·Task/Dispatch·다음 미출시 과제·work item이 표시됐습니다. 이 모델 필드는 로컬 설정 기록 검증이며 실제 모델 요청의 증거는 위 Orca worker receipt입니다.
- 2026-10-12: 위 로컬 smoke의 전용 `.test` 합성 사용자 두 명은 fixture.dispose 뒤 0명임을 DB로 확인했습니다. 운영 시험 계정/운영 DB 쓰기는 없었습니다. Orca reclaimable worker 목록은 빈 배열, released 2명이며 이번 설정용 coordinator shell도 닫았습니다. 기존 실행·다른 작업의 터미널은 보존했습니다.
- 2026-10-12: 기존 캐시 pnpm 실행 경로를 임시 로컬 wrapper로 연결한 뒤 `verify --fast` 6단계(tokens/work/docs/design/lint/typecheck)가 통과했습니다. OpenDesign 미설치로 `od lint` 하위 검사만 건너뜀이며 디자인 산출물 검사는 통과했습니다. `work-scope 0170`은 변경 16개 통과, 지원하는 `automation-command --repo <checkout 경로>` 출력에서 PM·Sol·20분·origin/main·precheck를 확인했습니다. 출력만 확인했으며 두 번째 자동화를 생성하지 않았습니다.
- 2026-10-12: [PR #108](https://github.com/ai-worker-lab/crelink/pull/108)을 게시했습니다. `Asia/Seoul` 2026-10-12 시작(2026-10-11T15:00:00Z) 이후 병합 목록은 0건을 확인했습니다. 정상 한 실행 1건·하루 8건 한도를 유지하며 CI 통과와 main 역할 파일 반영 뒤 기존 자동화 ID를 전환합니다.
- 2026-10-12: 같은 기존 자동화 ID `5e45d3d1-05e7-4051-ab77-71b3d78e9f30`에 이름 `crelink-pm`·현행 canonical prompt·PM/Sol/기존 계정 환경파일 prefix·precheck를 저장하고 exact match를 확인했습니다. provider `omp`, Sol extra args, Asia/Seoul 20분, origin/main, new_per_run, reuseSession false를 유지했습니다. main에 없는 역할을 실행하지 않도록 rollout 중만 비활성화했으며 main 반영 뒤 같은 ID를 활성화하는 배포 단계입니다. 이미 실행 중이던 기존 세션이나 운영 기록을 수정/종료하지 않았습니다.
- 2026-10-12: 실제 팀 활성화·최종 통합/병합 작업을 위한 운영 PM 수동 실행 `55e2a9e0-c9f7-4b0f-b9eb-0250ac5f8890`을 기존 계정으로 열었습니다. 운영 시험 사용자가 아니라 사용자가 요청한 실제 구성 작업의 기록이며 서버 guard를 통과한 경우만 main 반영/활성화합니다. 최종 main·Deploy·활성 설정·finish 결과는 PR #108에 연결합니다.
- 2026-10-12: `sim17` 기존 E2E 19개가 모두 통과했습니다(1.3분). AI token/중복/행동/pause/revoke, creator·visitor·operator·배너·슬롯 이벤트와 SIM-01~04를 실제 API/DB/Chromium으로 실행했습니다. 전용 Compose 컨테이너/볼륨/네트워크는 `make instance-destroy CONFIRM=1`로 제거됐으며 새 기능/이벤트 출시나 사용자 성장 결과가 아닙니다.
- 2026-10-12: source `13d1c79`의 [CI 38150087462](https://github.com/ai-worker-lab/crelink/actions/runs/38150087462)는 Node 24/26 check·smoke·API/Web image build·work scope·최종 CI gate가 통과했습니다. standalone docs job은 코드 검사에 포함되어 skipped입니다. 초기 과제는 팀 헌장의 0168/0169 미완료 기준으로 인계했으며 이전 계획을 완료나 출시로 재분류하지 않았습니다.
