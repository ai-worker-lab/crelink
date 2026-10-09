# 0091 AI 운영자 ADR·기술 설계·티켓 분해와 통합

- 단계: 티켓
- 역할: orchestrator
- 상위: 0088
- 상태: 준비
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

에픽 0088의 ADR, 기술 설계(`docs/specs/crelink-ai-operator.md`), 역할별 티켓 분해(번호 0100~0119), 구현 통합을 맡습니다.

## 수용 기준

- [ ] ADR 0015(AI 운영자 권한 위임·전용 계정·행동 기록)가 `승인`이고, `AGENTS.md`·`docs/development/repository-policy.md`가 반영합니다.
- [ ] 기술 설계가 `승인`이고(사용자 위임에 따른 AI 승인, 근거 기록), 티켓이 분해되어 있습니다.
- [ ] 통합 브랜치에서 `pnpm verify`·`pnpm smoke`·관련 E2E가 통과하고 PR이 열려 있습니다.

## 범위

- 포함: 에픽 0088 수용 기준 전부의 설계·구현·통합.
- 제외: main 머지와 운영 토큰 발급·Orca 자동화 설정(부모 세션이 함).

## 위험·복구

에픽 0088 `위험·복구`를 따릅니다.

## 연결

- 에픽: [0088](../epics/0088-ai-operator.md)
- 절차: [기술 설계와 티켓 분해](../../specs/README.md), [위임과 반복 작업](../../development/parallel-work.md#위임과-반복-작업)

## 진행 기록

- 2026-10-10: 생성. migration 번호는 `0004_ai_operator.sql`로 미리 정했습니다(0089는 `0005_slot_event.sql`).
