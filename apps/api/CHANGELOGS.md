# 백엔드 API 변경 기록

내부 참고용으로 백엔드 API의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-06

- 크리링 MVP API: migration `0001_crelink_mvp`(사용자·세션·랜딩·링크·SNS·포트폴리오·단축 URL·주소·파일·방문·클릭·집계 3종·차단 도메인), 구글 로그인(`google-auth-library`)과 첫 로그인 가입 트랜잭션·세션 쿠키, 크리에이터 편집(`/api/me/*`: 프로필, 단축 주소 규칙, 링크 한도·차단 도메인·순서, SNS, 포트폴리오, 이미지 업로드), 공개 랜딩, 단축 도메인 `GET /{slug}`·`GET /c/{linkPublicId}`(`/api` 밖, 방문·클릭 비동기 기록, `cl_vid`), 운영자 API(목록·상세·통계·슬롯·정지·링크 차단·차단 도메인), 접근 로그 보존 작업(기동 시·24시간마다 365일 넘은 원본을 집계로 옮김). 의존성 `google-auth-library`(Apache-2.0)·`bowser`(MIT)·`maxmind`(MIT), 개발 의존성 `@nestjs/testing`·`@types/express`·`@types/multer`(MIT). 근거: `docs/work/api/0016-crelink-mvp-api.md`.
- 환경변수 추가: `WEB_URL`·`SHORT_LINK_BASE_URL`(필수, 없으면 기동 실패), `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`OPERATOR_EMAILS`·`UPLOAD_DIR`·`GEOIP_MMDB_PATH`(선택). 설명은 `apps/api/docs/README.md`.
- 모든 오류 응답을 `{ code, message }`로 통일(`ApiExceptionFilter`). 접두사 없는 `/health`는 이제 404가 아니라 단축 도메인이 받아 302 안내로 보냄.
- Jest가 ESM인 `@crelink/shared`를 TypeScript 원본으로 읽도록 `moduleNameMapper` 추가.

## 2026-10-01

- `PORT` 기본값을 없애고 필수로 바꿈: 없으면 `PORT is required` 오류와 해결 방법(`pnpm instance`로 `apps/api/.env` 생성 또는 `PORT` 지정)을 보이고 종료. `apps/api/.env.example`의 `DATABASE_URL`·`PORT`는 숫자 없이 빈 값과 형식 주석으로 두고 `pnpm instance`가 인스턴스 값으로 채움. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- NestJS API 뼈대: 로컬 `.env` 로딩, `DATABASE_URL` 검증, PostgreSQL 연결(연결 대기 5초, idle 연결 오류 처리)과 migration 실행기, liveness `GET /api/health`와 readiness `GET /api/health/ready`, Jest 통합 테스트(일회용 DB), 백엔드 작업 규칙.
