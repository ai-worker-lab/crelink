# 0004 AGENTS.md 지도화와 정책 문서 이동

- 단계: 티켓
- 역할: orchestrator
- 선행: 0001, 0002, 0003, 0005
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

매 세션 컨텍스트에 들어가는 루트 `AGENTS.md`를 정책 원문 대신 짧은 지도(목차)로 바꿔, 에이전트가 작업에 필요한 문서만 찾아 읽게 합니다(점진적 공개). 0001~0003·0005에서 생긴 명령과 문서를 진입점·색인에 연결합니다.

## 수용 기준

- [x] 루트 `AGENTS.md`가 `docs:check` 예산(100줄·3500자) 안에서 저장소 소개, 핵심 명령, 반드시 지킬 규칙, 문서 지도를 담는다.
- [x] 언어·기준 정보·문서 배치·ADR·진입점·변경 기록 정책 원문이 `docs/` 아래 정책 문서로 옮겨지고, 모든 참조(영역 `AGENTS.md`, `docs/README.md`, `CHANGELOGS.md`, `docs/alm/workflow.md` 등)가 새 위치를 가리킨다.
- [x] ADR 0006이 정책 원본 위치 변경과 트레이드오프를 기록한다.
- [x] `docs/README.md`, 루트 `README.md`, [영역별 병렬 개발](../../development/parallel-work.md), [로컬 개발 환경](../../development/local-environment.md)이 0001~0003·0005 결과(인스턴스, 검증 명령, `owns`, 실행기, 브랜치 규칙)와 일치한다.
- [x] `pnpm docs:check`와 `pnpm verify --fast`가 통과한다.

## 범위

- 포함: 루트·영역 `AGENTS.md`, `docs/` 정책·색인, 루트 `README.md`, 변경 기록.
- 제외: 기존 정책 내용의 변경. 위치와 표현만 바꾸고, 지도화 원칙과 반복 규칙을 검사로 옮기는 원칙만 [ADR 0006](../../adr/0006-agents-md-as-map.md) 결정으로 추가합니다.

## 위험·복구

해당 없음.

## 연결

- [Harness engineering](https://openai.com/index/harness-engineering/) — `AGENTS.md`를 목차로 쓰는 근거

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 정책 원문을 `docs/development/repository-policy.md`로 옮기고 루트 `AGENTS.md`를 지도로 다시 씀(47줄·2159자, 이전 79줄·5592자). 영역 `AGENTS.md`·영역/루트 `CHANGELOGS.md`·`RELEASES.md`·`docs/faq.md`의 `AGENTS.md#변경-기록`·`#영역별-적용` 링크를 새 위치로 바꿈. 위임 원칙은 `parallel-work.md`로 옮김. `docs/README.md`·`README.md`·`parallel-work.md`·`local-environment.md`·`environment-secrets.md`·`docs/alm/workflow.md`·`docs/architecture/nextjs-web.md`·`expo-mobile.md`·`apps/app/docs/device-testing.md`를 0001~0003·0005 결과에 맞춤. 실행기 `workspace.branch_prefix` 설정을 없애고 `WORK_BRANCH_PREFIX` 상수로 고정, 주기 작업은 기록이 없으면 기준 시각만 남기도록 바꿈.
- 2026-10-01: 검증. 주 checkout에서 `pnpm verify --fast` 통과(5단계), `make up` 후 `pnpm verify` 통과(7단계, API 테스트 포함), `pnpm smoke` 5 passed, `pnpm logs api --lines 5` 출력 확인.
- 2026-10-01: 완료. 선행 0001·0002·0003·0005 완료와 함께 `main`에 통합.
