# 0010 역할 정의 정비

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

`api`·`web`·`app`·`infra` 역할 정의는 초기 뼈대 그대로라, 이후에 생긴 기술 설계 문서·디자인 인계·검증 명령·worktree 인스턴스를 모르고 `infra`에는 사실과 다른 서술(공용 포트·DB 공유)이 남아 있었습니다. 모든 역할이 같은 틀(입력, 작업 방식, 설계 검토, 끝내는 조건)로 현재 흐름을 따르게 합니다.

## 수용 기준

- [x] `api`·`web`·`app`·`infra` 정의가 입력(티켓·`docs/specs` 절·`design/<기능>/handoff.md`·`packages/shared`), 작업 방식, 설계 검토 요청에 대한 의견 범위, 끝내는 조건(`pnpm work:scope`·`pnpm verify`·영역별 확인·변경 기록·`진행 기록`)을 담는다.
- [x] `infra`가 worktree별 인스턴스(ADR 0008)와 맞고, 루트 `Makefile`·`ecosystem.config.cjs`·`scripts/` 변경을 `orchestrator` 몫으로 둔다.
- [x] `product`·`designer`가 기술 설계 검토에서 맡는 확인 범위를 담는다.
- [x] 루트 `CHANGELOGS.md`를 모든 역할이 고칠 수 있어 `packages/`·`design/` 변경을 정책대로 기록해도 `pnpm work:scope`가 실패하지 않는다.

## 범위

- 포함: `.omp/agents/*.md`, `scripts/work-scope.mjs`, `docs/development/parallel-work.md`.
- 제외: 영역 `AGENTS.md`(영역 규칙은 그대로 유효).

## 위험·복구

해당 없음.

## 연결

- [영역별 병렬 개발](../../development/parallel-work.md#역할과-에이전트별-소유-경계), [기술 설계와 티켓 분해](../../specs/README.md)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 검증. `pnpm verify --fast` 6단계 통과. 임시 clone의 `work/0099` 브랜치(역할 `api`)에서 `packages/shared`·루트 `CHANGELOGS.md` 변경은 `pnpm work:scope` 통과, `Makefile` 변경은 "전용 역할 없음(orchestrator 범위)"으로 실패. 새 OMP 세션의 task 목록에 7개 역할이 새 설명으로 나타남.
- 2026-10-01: 완료.
