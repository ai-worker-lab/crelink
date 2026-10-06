# 백엔드 API 변경 기록

내부 참고용으로 백엔드 API의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-01

- `PORT` 기본값을 없애고 필수로 바꿈: 없으면 `PORT is required` 오류와 해결 방법(`pnpm instance`로 `apps/api/.env` 생성 또는 `PORT` 지정)을 보이고 종료. `apps/api/.env.example`의 `DATABASE_URL`·`PORT`는 숫자 없이 빈 값과 형식 주석으로 두고 `pnpm instance`가 인스턴스 값으로 채움. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- NestJS API 뼈대: 로컬 `.env` 로딩, `DATABASE_URL` 검증, PostgreSQL 연결(연결 대기 5초, idle 연결 오류 처리)과 migration 실행기, liveness `GET /api/health`와 readiness `GET /api/health/ready`, Jest 통합 테스트(일회용 DB), 백엔드 작업 규칙.
