# 0165 단일 orchestrator 에이전트와 최상위 모델 고정

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-11

## 목적

크리링 20분 자동화의 담당자를 하나의 `orchestrator` 에이전트로 고정하고, 사용자 지정 상위 모델인 `openai-codex/gpt-6.1-sol`을 사용합니다. 전문 역할은 별도 실행 에이전트가 아니라 단일 운영자가 확인할 책임 영역으로 유지합니다. 기존 `GPT-5.6-Luna`를 최상위라고 표현한 것은 잘못된 판단이므로 정정합니다.

## 수용 기준

- [x] Orca 자동화 `crelink-ai-operator-2`가 `omp` provider와 단일 운영 프롬프트를 사용합니다.
- [x] 자동화의 extra agent argument가 `--model openai-codex/gpt-6.1-sol`로 고정되어 있습니다.
- [x] 제2 운영자 환경에 `CRELINK_AI_MODEL=openai-codex/gpt-6.1-sol`이 설정되어 실행 기록 모델 값이 실제 실행 설정과 일치합니다.
- [x] 저장소 운영 헌장·팀 헌장·실행 프롬프트가 별도 전문 agent spawn/dispatch를 금지합니다.
- [x] 지정 모델의 실제 연결 요청이 `SOL_SMOKE_OK`를 반환했습니다. 단일 운영자 정책과 기존 20분 주기를 유지합니다.
- [x] 비용·광고·외부 홍보·사람 계정·법률/개인정보 위험은 기존 사람 승인 게이트를 유지합니다.

## 범위

- 포함: Orca 자동화 prompt/provider/model 설정, 제2 운영자 모델 환경값, 운영 헌장·프롬프트·팀 계약.
- 제외: 결제·유료 모델 추가 구매·외부 계정 변경·전문 agent별 별도 스케줄러.

## 연결

- [AI 운영자 헌장](../../ops/ai-operator.md)
- [AI 운영자 실행 프롬프트](../../ops/ai-operator-prompt.md)
- [AI 운영팀 헌장](../../ops/ai-operations-team.md)
- [단일 운영자 agent 정의](../../../.omp/agents/orchestrator.md)

## 진행 기록

- 2026-10-11: 생성·검증. Orca automation `crelink-ai-operator-2`에 단일 `orchestrator` 담당 정책과 `--model GPT-5.6-Luna`를 설정했습니다. 제2 운영자 환경에는 `CRELINK_AI_MODEL=GPT-5.6-Luna`를 추가했습니다. 고정 후 실행 화면에서 `GPT-5.6-Luna`가 표시되었고, 단일 실행이 0164 활성화 실험을 이어 갔습니다.
- 2026-10-11: 사용자 지적에 따라 Luna 최상위 설명을 정정했습니다. `omp models find sol --json`에서 `openai-codex/gpt-6.1-sol`을 확인하고 자동화 provider `omp`·정확한 model selector·프롬프트·프리체크·제2 운영자 환경값을 일치시켰습니다. 도구 없는 실제 모델 요청이 `SOL_SMOKE_OK`를 반환했습니다. 전환 전에 시작한 실행의 과거 모델 기록은 변경하지 않습니다.
