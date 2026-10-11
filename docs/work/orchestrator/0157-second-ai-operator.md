# 0157 제2 AI 운영자 계정과 20분 자동화

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-11

## 목적

AI 운영자 실행 기록이 실제로 `links.shaul.kr`에 남도록 제2 AI 전용 운영자 계정과 20분 Orca 자동화를 설치하고 첫 자동 실행을 확인합니다.

## 수용 기준

- [x] 제2 AI 계정과 토큰을 운영 API CLI로 만들고 토큰 원문을 저장소·로그·작업 기록에 남기지 않습니다.
- [x] 토큰 파일 권한이 600이고 `precheck`가 실서버 API에 성공합니다.
- [x] 제2 계정으로 수동 실행을 열고 닫아 `succeeded` 실행 기록이 `agent_runs`에 남습니다.
- [x] `crelink-ai-operator-2` Orca 자동화가 `*/20 * * * *`·`Asia/Seoul`·활성 상태로 등록됩니다.
- [x] 자동화 첫 실행이 precheck와 AI 실행 기록 종료까지 성공합니다.

## 범위

- 포함: 운영 API AI 계정·토큰 CLI 실행, 운영자 Mac의 별도 env 파일, Orca 자동화 등록·첫 실행 확인, 실행 기록 확인.
- 제외: 기존 제1 AI 계정 토큰 폐기·교체, 운영 DB 데이터 파기, 사람 Google 운영자 계정 추가, 제품 코드 변경.

## 위험·복구

두 AI 계정은 `agent_runs`의 진행 중 실행 전역 유일 제약을 공유합니다. 제2 자동화가 실행 중일 때 제1 자동화가 동시에 시작하면 409로 건너뜁니다. 이상 시 Orca에서 `crelink-ai-operator-2`를 비활성화하거나 사람 운영자가 `/admin/agent-runs`의 멈춤 스위치를 켭니다. 토큰 유출 의심 시 운영 API CLI로 해당 토큰만 폐기합니다.

## 연결

- [AI 운영자 헌장](../../ops/ai-operator.md)
- [AI 운영자 토큰 런북](../../../infra/docs/prod-runbook.md#17-ai-운영자-토큰)
- [AI 운영자 작업 기록](0156-ai-operator-cadence-deploy.md)
- `apps/api/src/cli/ai-operator.ts`
- `scripts/ai-operator.mjs`

## 진행 기록

- 2026-10-11: `ai-operator-2@crelink.invalid` AI 계정과 `operator-mac-2-2026-10` 토큰을 운영 API 활성 컨테이너 CLI로 생성했습니다. 토큰 원문은 운영자 Mac의 `~/.config/crelink/ai-operator-2.env`에만 저장했고 파일 권한은 600입니다.
- 2026-10-11: 제2 토큰 `precheck`가 실서버 API에 성공했습니다. 기존 제1 계정의 90분 초과 `running` 실행은 새 실행 시작 시 `abandoned`로 정리됐습니다.
- 2026-10-11: 제2 계정으로 수동 실행 `5d95c13a-eecf-43f2-95e3-74b4c896fd0c`를 시작·API 조회·종료했고 `succeeded` 기록이 실서버 `agent_runs`에 남는 것을 `context`로 확인했습니다.
- 2026-10-11: Orca 저장소에 Crelink를 등록하고 `crelink-ai-operator-2` 자동화(id `5e45d3d1-05e7-4051-ab77-71b3d78e9f30`)를 `*/20 * * * *`, `Asia/Seoul`, 활성 상태로 만들었습니다.
- 2026-10-11: Orca 자동화 수동 실행과 첫 예약 주기 실행이 모두 완료됐습니다. precheck exit 0을 확인했고, 제2 계정 실행 기록 `31ded615-c14f-43e8-b652-c7bd55b2d53d`·`90ec3a13-c077-4e0a-8dd6-2962470fc016`이 `succeeded`로 저장됐습니다. 두 기록의 행위자는 `ai-operator-2@crelink.invalid`입니다. 첫 예약 실행은 0149 작업 기록을 근거와 함께 완료 처리했습니다.
