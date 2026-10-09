# 0108 AI 운영자 헌장·실행 도구·30분 트리거

- 단계: 티켓
- 역할: orchestrator
- 상위: 0088
- 선행: 0100
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

AI 운영자가 30분마다 겹치지 않게 실행되고, 실행마다 같은 순서(기록 열기 → 읽기 → 일 1개 → 기록 닫기)로 일하며, 법·약관과 위임 범위를 지키게 합니다. 요구는 R23 ②④⑤⑥⑦입니다.

## 수용 기준

- [x] 헌장 `docs/ops/ai-operator.md`(목표·권한·지킬 규칙·한 실행의 순서·긴 작업·배포와 롤백·상한·알리기·설치·멈추기)와 프롬프트 `docs/ops/ai-operator-prompt.md`가 있고 프롬프트가 헌장을 읽게 합니다.
- [x] `scripts/ai-operator.mjs`의 `precheck`·`start`·`context`·`api`·`finish`·`automation-command`를 로컬 인스턴스에서 실제로 실행해, 멈춤이면 precheck 종료 1과 paused 기록, 진행 중이면 종료 1, 아니면 0임을 확인합니다.

## 범위

- 포함: 위 수용 기준.
- 제외: Orca 자동화 실제 생성(머지 뒤 부모).

## 위험·복구

해당 없음(실행 호스트 도구). 자동화는 `orca automations edit --disabled`로 끕니다.

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `실행 호스트 도구`, `티켓 분해` 0108
- 결정: [ADR 0015](../../adr/0015-ai-operator.md)
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ②④⑤⑥⑦

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해). 통합 브랜치 `work/0091-ai-operator-design`에서 진행합니다.
- 2026-10-10: 구현과 확인(orchestrator, 통합 브랜치, Node 24.20.0, 슬롯 5 인스턴스 API 3520·웹 5693).
  - 헌장·프롬프트·`scripts/ai-operator.mjs`(Node 내장 모듈만, 설정 파일 권한 600 확인, User-Agent `crelink-ai-operator/1`, Cloudflare 차단 구분, `file=@` multipart 업로드). 프리체크는 기준 checkout의 작업 트리를 건드리지 않고 `git -C <기준> fetch` 뒤 `git show origin/main:scripts/ai-operator.mjs`를 임시 파일로 꺼내 실행합니다(Orca 프리체크의 작업 디렉터리에 기대지 않음).
  - 로컬 실제 실행: CLI `issue-token`으로 발급한 토큰을 권한 600 임시 env 파일에 넣고 `CRELINK_AI_BASE_URL=http://127.0.0.1:5693/api/agent`로 `precheck` 0 → `start` 0(실행 id·트레일러 출력) → 두 번째 `start` 1(`409 agent_run_in_progress`) → `precheck` 1(진행 중) → `context` 0(멈춤·지표·직전 실행) → `api GET /api/admin/metrics` 0 → `finish` 0 → `precheck` 0. 멈춤(DB에서 켬): `precheck` 1(멈춤 기록 남김) → `start` 1 → 같은 멈춤의 `paused` 한 행 `paused_count` 2 → 끄면 `precheck` 0. 권한 644 설정 파일은 `precheck` 1과 `chmod 600` 안내. `automation-command`는 Orca 생성 명령을 출력.
  - 고친 결함: 두 번째 `start`가 409인데 "이전 실행 id 파일을 바꿉니다"라고 먼저 알리던 문구, 멈춤 응답 때 진행 중 실행 id 파일을 지우던 동작(멈춤 중에도 진행 중 실행은 `finish`로 닫아야 함).
  - E2E `tests/e2e/ai-operator.spec.ts`가 이 도구를 실제로 실행합니다(0091 진행 기록). 상태 `완료`.
