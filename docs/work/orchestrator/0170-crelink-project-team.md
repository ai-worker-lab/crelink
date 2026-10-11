# 0170 Crelink 전담 PM·실행팀 구성

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
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
- [ ] 실제 localhost API/DB에서 PM 실행 시작·결과 기록과 기존 멈춤/중복 경계를 확인합니다. 운영 시험 계정/DB 쓰기·유료 구매·외부 홍보는 하지 않습니다.
- [ ] 기존 20분 자동화의 이름/PM 프롬프트/agent 기록/precheck를 갱신하고 저장 상태를 확인합니다. 이미 시작한 실행은 새 PM 실행으로 재분류하지 않습니다.
- [ ] 실제 검증·문서/변경 기록·PR CI와 팀 과제 인계를 완료합니다. 진행 중/미병합 작업과 실행 이력은 보존합니다.

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
