# 0008 PRD 전 탐색 조사 절차

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

새 서비스를 시작할 때 유사 서비스 벤치마킹과 라이브러리·오픈소스·SaaS 기술 조사를 PRD 확정 전에 끝내, 구현 중 방향이 바뀌는 일을 줄입니다.

## 수용 기준

- [x] 탐색 → PRD → 확정 → 구현 티켓 흐름, 문서 위치, 조사 품질 기준을 `docs/product/README.md`가 설명하고 ALM 2단계·`AGENTS.md`·README 템플릿 안내가 이를 가리킨다.
- [x] PRD·벤치마킹·기술 조사 템플릿이 있다.
- [x] `product`가 `product-discovery` 스킬을 자동으로 읽고, `orchestrator`가 기술 조사를 맡으며 웹 검색 도구를 쓸 수 있다.
- [x] `pnpm docs:check`가 조사 문서(`docs/references/`, `docs/product/research/`)의 `확인일`과 출처 링크 누락을 실패로 보고한다.

## 범위

- 포함: `docs/product/`, `docs/references/TEMPLATE.md`, `.omp/skills/product-discovery/`, `.omp/agents/product.md`·`orchestrator.md`, `scripts/docs-check.mjs`, 관련 문서.
- 제외: 실제 서비스의 조사(서비스가 정해진 뒤 별도 티켓).

## 위험·복구

해당 없음.

## 연결

- [제품 탐색과 PRD](../../product/README.md), [ALM 운영 기준](../../alm/workflow.md)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 구현. 스킬의 데이터 수집 경로를 실제로 호출해 확인: npm 주간 다운로드 API(`expo-notifications` 5,525,430), `npm view`(버전·라이선스·수정일), OSV 질의(`next@15.0.0` 권고 반환), React Native Directory API(`expoGo`·플랫폼 지원), `gh api repos/expo/expo`(`pushed_at`·라이선스). 기존 `docs/references/redis-vs-valkey.md`에 `확인일` 필드 추가.
- 2026-10-01: 검증. `pnpm docs:check` 통과(Markdown 71개). 확인일·출처 없는 시험 조사 문서가 두 오류(확인일, 출처)와 고아 문서로 실패하고 지운 뒤 통과. 새 OMP 세션에서 `skill://product-discovery`가 읽히고 `product`의 `autoloadSkills: product-discovery` 확인. `pnpm verify --fast` 6단계 통과. 실제 서비스 조사는 하지 않음(서비스 미정).
- 2026-10-01: 완료.
