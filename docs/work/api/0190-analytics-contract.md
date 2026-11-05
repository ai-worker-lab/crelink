# 0190 지표·통계 공유 조회 계약

- 단계: 티켓
- 역할: api
- 상위: 0189
- 상태: 완료
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-06

## 목적

사용자가 명시한 관리자 통합·크리에이터 본인 지표/통계의 사용자 흐름을 완성한다.

## 수용 기준

- [x] 역할별 두 GET의 AnalyticsReport·query·nullable/coverage·계산 기준과 경로를 공유한다.
- [x] 기존 admin/metrics와302 통계 계약을 유지하고 웹 소비자와 타입을 맞춘다.

## 범위

- 포함: [설계](../../specs/crelink-analytics.md)의 해당 역할과 기존 수집 변경의 통합.
- 제외: 운영 데이터 조회·운영 배포·로그인 방식 변경·외부 분석SDK·방문자 원본 공개.

## 위험·복구

일반 사용자는 서버에서 본인 범위를 고정한다. 추가 집계 필드는 기존 자료를 지우지 않고 복원 불가 값을 null로 보존한다. 문제 시 새 조회 화면/경로를 제거해도 기존 수집과 기존 관리자 통계를 유지할 수 있다. 적용 전후 기존 미커밋 작업을 보존한다.

## 연결

- [기술 설계](../../specs/crelink-analytics.md)
- [디자인 인계](../../../design/analytics/handoff.md)
- [PRD R10·R11·R27·R28](../../product/crelink.md)

## 진행 기록

- 2026-11-06: 사용자 명시 구현 요청으로 착수. 기존 work/0181의 미커밋 수집 확장을 보존해 work/0188-analytics에서 통합한다. 새 계약을 먼저 맞추고 API·웹을 소유 파일별로 나눠 구현한다.

- 2026-11-06: packages/shared/src/analytics.ts·crelink.ts의 GET2개/AnalyticsReport/query/coverage/nullable/상위대상100·분포20개 계약을 API와 웹 소비자에 적용했다. 기존 admin/metrics 계약은 유지했다. 전체 타입/빌드·shared59·API247·web95검사와 실제 HTTP/화면 대조가 통과했다. [통합 근거](../orchestrator/0188-analytics.md).
