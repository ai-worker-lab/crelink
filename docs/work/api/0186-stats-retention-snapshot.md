# 0186 보존 전환 중 통계 스냅샷 일관성 확인

- 단계: 티켓
- 역할: api
- 상태: 완료
- 종류: 결함
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-05

## 목적

운영자 통계가 원본과 보존 집계를 별도 pool 병렬 쿼리로 읽는 중 보존 트랜잭션이 커밋하면, 같은 기록을 양쪽에서 읽거나 양쪽에서 놓칠 수 있는지 재현한다. 최초 등록 시 코드상 가능성이었으며, 아래 후속 작업에서 실제 보존 커밋과 읽기를 교차하는 회귀로 확인했다.

## 수용 기준

- [x] 격리된 DB에서 보존 커밋과 통계 읽기를 교차해 중복/누락 가능성을 확인한다.
- [x] 재현되면 원본·집계를 같은 스냅샷으로 읽는 최소 수정과 동시성 회귀를 추가한다.

## 범위

- 포함: 운영자 StatsService와 RetentionService의 읽기 일관성.
- 제외: 운영 DB 시험, 새 통계 UI, 수집 필드 추가.

## 위험·복구

집계와 원본 의미를 바꾸지 않고 읽기 일관성을 확인한다. 운영 데이터는 변경하지 않는다.

## 연결

- `apps/api/src/admin/stats.service.ts`
- `apps/api/src/retention/retention.service.ts`
- [PRD R10·R11](../../product/crelink.md)

## 진행 기록

- 2026-11-05: 코드 읽기에서 발견. 사용자 수집 확대 작업과 분리해 분류 대기로 등록.
- 2026-11-06: [지표·통계 통합](../orchestrator/0188-analytics.md)에서 기존 StatsService와 새 AnalyticsService를 Database.snapshot의 REPEATABLE READ READ ONLY 단일 client로 전환했다. 같은 client의 쿼리는 순차 실행한다. analytics.e2e-spec.ts에서 원본 조회가 끝난 직후 실제 RetentionService 트랜잭션을 커밋한 다음 합계를 읽도록 교차해 두 서비스 모두 중복·누락 없이 같은 값을 반환하는 회귀를 확인했다. API 집중 검사와 전체 pnpm verify의 API247개가 통과했다. 운영 DB는 사용하지 않았다.
