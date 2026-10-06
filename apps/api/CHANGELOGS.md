# 백엔드 API 변경 기록

내부 참고용으로 백엔드 API의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-06

- 운영 컨테이너 이미지 `apps/api/Dockerfile`(멀티 스테이지, 빌더 플랫폼에서 빌드·`pnpm deploy --prod --legacy`, `node:22-slim` arm64 런타임, `node` 사용자, `NODE_ENV=production`, `migrations/` 포함, node `fetch`로 `/api/health/ready`를 보는 `HEALTHCHECK`)와 루트 `.dockerignore`(허용 목록, `.env*`·`.local`·`node_modules` 제외). 빌드·크기·구성: `apps/api/docs/README.md#컨테이너-이미지`. 근거: `docs/work/api/0025-api-container-prod-config.md`.
- 환경변수 추가: `TRUSTED_PROXY_HOPS`(기본 0. N이면 방문·클릭 IP를 `X-Forwarded-For` 오른쪽에서 N번째 값으로, 앞쪽 위조 값 무시, 잘못된 값은 소켓 주소), `DATABASE_SSL`(`disable`·`require`·`verify-full`, 설정하면 URL의 `sslmode` 등 TLS 파라미터를 지우고 이 값만 따름)·`DATABASE_SSL_CA_PATH`(verify-full CA). 잘못된 값이면 기동 거부. 비어 있으면 기존 동작과 같음.
- `NODE_ENV=production`이면 기동 전에 `DATABASE_URL`·`PORT`·`WEB_URL`·`SHORT_LINK_BASE_URL`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`OPERATOR_EMAILS`·`UPLOAD_DIR` 누락과 https가 아닌 `WEB_URL`·`SHORT_LINK_BASE_URL`을 한 번에 모아 거부(키 이름만 출력). 로컬·테스트는 영향 없음.
- 운영 DB는 Supavisor 세션 모드(5432)만 사용: migration이 세션 advisory lock을 써서 트랜잭션 풀러(6543)에서는 안전하지 않음(문서 경고).
- 크리링 MVP API: migration `0001_crelink_mvp`(사용자·세션·랜딩·링크·SNS·포트폴리오·단축 URL·주소·파일·방문·클릭·집계 3종·차단 도메인), 구글 로그인(`google-auth-library`)과 첫 로그인 가입 트랜잭션·세션 쿠키, 크리에이터 편집(`/api/me/*`: 프로필, 단축 주소 규칙, 링크 한도·차단 도메인·순서, SNS, 포트폴리오, 이미지 업로드), 공개 랜딩, 단축 도메인 `GET /{slug}`·`GET /c/{linkPublicId}`(`/api` 밖, 방문·클릭 비동기 기록, `cl_vid`), 운영자 API(목록·상세·통계·슬롯·정지·링크 차단·차단 도메인), 접근 로그 보존 작업(기동 시·24시간마다 365일 넘은 원본을 집계로 옮김). 의존성 `google-auth-library`(Apache-2.0)·`bowser`(MIT)·`maxmind`(MIT), 개발 의존성 `@nestjs/testing`·`@types/express`·`@types/multer`(MIT). 근거: `docs/work/api/0016-crelink-mvp-api.md`.
- 환경변수 추가: `WEB_URL`·`SHORT_LINK_BASE_URL`(필수, 없으면 기동 실패), `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`OPERATOR_EMAILS`·`UPLOAD_DIR`·`GEOIP_MMDB_PATH`(선택). 설명은 `apps/api/docs/README.md`.
- 모든 오류 응답을 `{ code, message }`로 통일(`ApiExceptionFilter`). 접두사 없는 `/health`는 이제 404가 아니라 단축 도메인이 받아 302 안내로 보냄.
- Jest가 ESM인 `@crelink/shared`를 TypeScript 원본으로 읽도록 `moduleNameMapper` 추가.

## 2026-10-01

- `PORT` 기본값을 없애고 필수로 바꿈: 없으면 `PORT is required` 오류와 해결 방법(`pnpm instance`로 `apps/api/.env` 생성 또는 `PORT` 지정)을 보이고 종료. `apps/api/.env.example`의 `DATABASE_URL`·`PORT`는 숫자 없이 빈 값과 형식 주석으로 두고 `pnpm instance`가 인스턴스 값으로 채움. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- NestJS API 뼈대: 로컬 `.env` 로딩, `DATABASE_URL` 검증, PostgreSQL 연결(연결 대기 5초, idle 연결 오류 처리)과 migration 실행기, liveness `GET /api/health`와 readiness `GET /api/health/ready`, Jest 통합 테스트(일회용 DB), 백엔드 작업 규칙.
