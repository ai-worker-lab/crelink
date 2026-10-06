# 0009 기술 설계와 티켓 분해 보강

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

확정된 PRD와 디자인 인계를 구현 티켓으로 바로 쪼개면 계약·데이터·화면 상태의 빈틈이 구현 중에 드러나 여러 역할이 되돌아갑니다. 그 사이에 `orchestrator`가 맡는 기술 설계 단계와 역할별 검토·승인·분해 규칙을 둡니다.

## 수용 기준

- [x] `docs/specs/README.md`가 설계가 필요한 경우, 흐름(디자인 기술 검토 → 설계 → 역할별 검토 → 사용자 승인 → 티켓 분해), 역할, 분해 규칙, 문서 상태를 설명하고 `docs/specs/TEMPLATE.md`가 있다.
- [x] `orchestrator`가 `technical-design` 스킬을 자동으로 읽는다.
- [x] 디자인 흐름(`opendesign` 스킬, `designer`, 인계 문서 항목)에 디자인 기술 검토가 들어 있다.
- [x] ALM 2단계, 제품 탐색, 작업 관리, 병렬 개발, `WORKFLOW.md` 프롬프트, `AGENTS.md`, 문서 색인이 설계 단계를 가리킨다.

## 범위

- 포함: `docs/specs/`, `.omp/skills/technical-design/`, `.omp/agents/orchestrator.md`·`designer.md`, `.omp/skills/opendesign/SKILL.md`, 관련 문서.
- 제외: 요구 대응·설계 승인 여부의 기계 검사(`work:check` 확장), `검증 → 완료` 병합 관문, E2E 테스트 기반. 필요하면 별도 티켓으로 다룹니다.

## 위험·복구

해당 없음.

## 연결

- [기술 설계와 티켓 분해](../../specs/README.md), [제품 탐색과 PRD](../../product/README.md), [OpenDesign 사용 기준](../../../design/docs/opendesign.md)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 검증. `pnpm verify --fast` 6단계 통과(`docs:check`가 새 문서의 링크·anchor·고아 여부 확인), 루트 `AGENTS.md` 49줄·2473자(예산 안). 새 OMP 세션에서 `skill://technical-design`이 읽히고 `orchestrator: technical-design`, `designer: opendesign` 자동 로드 확인. 실제 기능으로 설계·분해를 해 보지는 않음(서비스 미정).
- 2026-10-01: 완료.
