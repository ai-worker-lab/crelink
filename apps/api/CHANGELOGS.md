# 백엔드 API 변경 기록

내부 참고용으로 백엔드 API의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-07

- 런타임 Node 24 LTS: 운영 이미지 `Dockerfile` 빌드·런타임 단계 `node:22-slim` → `node:24-slim`, `@types/node` `^22` → `^24`(설치 24.19). `docs/README.md` "컨테이너 이미지"의 베이스·크기(arm64 약 414MB). 로컬 이미지 기동 헬스 `healthy`·`/api/health/ready` 200·단축 주소 302·`docker stop` 종료 코드 0 확인. 기준: [의존성 버전 정책](../../docs/development/repository-policy.md#의존성-버전).
- 단축 주소 302(`GET /{slug}`, 옛 주소 포함)에 랜딩 통과 표시 `?pass=<만료 초>.<HMAC 앞 16바이트 base64url>`(publicId에 묶임, 60초, 프로세스 시작 때 만든 무작위 키, 새 비밀값 없음)를 붙임(`src/short-link/landing-pass.service.ts`, `LandingPassModule`). `GET /api/public/landings/{publicId}`가 `pass` 쿼리를 받아 `passAccepted`와 현재 단축 주소 `shortUrl`을 줌. 시험: `landing-pass.service.spec.ts`, `test/short-link.e2e-spec.ts`(302 Location의 pass, 다른 랜딩·변조·만료·형식 오류는 false, 주소 변경 뒤 새 `shortUrl`). 문서 `docs/README.md` "랜딩 통과 표시". 근거 `docs/work/orchestrator/0038-landing-entry-via-short-link.md`.
- 결함 수정: JSON 본문 한도(100KB) 초과·지원하지 않는 문자셋 요청이 500 `internal_error`(오류 로그)였던 것을 413·415 `validation_failed`로 응답(`ApiExceptionFilter`가 4xx `expose` http-errors의 상태를 씀). 다른 예상하지 못한 오류는 그대로 500. 회귀 시험 `test/error-response.e2e-spec.ts`. 근거 `docs/work/api/0037-api-body-parser-error-status.md`.
- 문서(코드 변경 없음): `docs/README.md`의 운영 접근 경로를 Blue/Green 구조로 고침(공용 네트워크 `crelink-edge`에서 edge Caddy와 같은 색 웹만 `api-<색>`을 부름, edge Caddy 본문 한도). 근거 `docs/work/orchestrator/0036-zero-downtime-cutover-verify.md`.
- graceful shutdown(`src/shutdown.ts`, `main.ts`): SIGTERM·SIGINT를 받으면 새 연결을 받지 않고(idle keep-alive 연결은 바로 끊고 진행 중·종료 중 응답은 `Connection: close`), 진행 중 요청을 끝낸 뒤 `app.close()`로 `onModuleDestroy`(pg pool `end`, 보존 작업 timer 정리)를 부르고 종료 코드 0으로 끝냄. 이전에는 신호에 바로 죽어 진행 중 요청이 끊김(컨테이너 143). Nest 11의 `enableShutdownHooks()`는 HTTP 서버보다 pool을 먼저 닫아 진행 중 업로드가 500이 되므로 쓰지 않음. `Database.onModuleDestroy`는 pool 종료를 로그로 남기고 두 번 불려도 안전. 근거 `docs/work/api/0032-api-graceful-shutdown-pool-max.md`.
- 환경변수 추가: `DATABASE_POOL_MAX`(pg Pool `max`, 기본 15라 비우면 기존 동작과 같음). 1 이상의 정수가 아니면 기동 거부(오류에 키 이름만). 운영값 산정 기준(`2 × DATABASE_POOL_MAX ≤ Supabase Pool Size − 2`)은 `apps/api/docs/README.md#db-연결-수`.
- 시험: `DATABASE_POOL_MAX` 해석 단위 시험, `test/shutdown.e2e-spec.ts`(Pool `max` 반영·잘못된 값 기동 거부 / 느린 업로드 중 SIGTERM → 201, 새 연결 거부, idle keep-alive 연결이 종료를 막지 않음, 응답 뒤 1초 안에 pool·timer 정리와 종료 코드 0).
- 업로드 저장소 선택: 환경변수 `FILE_STORAGE`(`disk` 기본, `s3`), `S3_ENDPOINT`·`S3_REGION`(기본 `us-east-1`)·`S3_BUCKET`·`S3_ACCESS_KEY_ID`·`S3_SECRET_ACCESS_KEY`. 잘못된 값·`s3`인데 빠진 키면 기동 거부. 운영 필수 검사는 `disk`면 `UPLOAD_DIR`, `s3`면 `S3_*` 4개와 https `S3_ENDPOINT`. `FilesModule`이 설정으로 구현을 고름.
- `S3FileStorage`(`src/files/s3-file-storage.ts`, 의존성 `@aws-sdk/client-s3`, 순수 JS): path-style, 설정 자격 증명만 사용, put은 `If-None-Match: *`(같은 key면 412로 실패), get은 `NoSuchKey`·404면 null, 연결 3초·시도당 15초·최대 3번(SDK standard 재시도), 기동 시 HeadBucket을 5초 안에 한 번 확인해 로그만 남김(readiness 제외). `LocalDiskFileStorage`의 ENOENT 판별을 realm과 무관하게 바꿈.
- 시험: 설정 파싱 단위 시험, `test/file-storage.e2e-spec.ts`(disk·s3 공통 계약: 같은 바이트, 없는 key null, 재put 실패, 동시 put 하나만 성공 / 자격 증명·버킷 확인 / `FILE_STORAGE=s3` API 업로드·조회·객체 삭제 시 404). s3는 `test/test-s3.ts`가 Docker로 `chrislusf/seaweedfs:4.47`을 띄움. `createTestApp({ env })`. 근거 `docs/work/orchestrator/0030-uploads-s3-storage.md`.

## 2026-10-06

- 운영 컨테이너 이미지 `apps/api/Dockerfile`(멀티 스테이지, 빌더 플랫폼에서 빌드·`pnpm deploy --prod --legacy`, 대상 플랫폼(amd64·arm64) `node:22-slim` 런타임, `node` 사용자, `NODE_ENV=production`, `migrations/` 포함, node `fetch`로 `/api/health/ready`를 보는 `HEALTHCHECK`)와 루트 `.dockerignore`(허용 목록, `.env*`·`.local`·`node_modules` 제외). 운영은 배포 대상 서버의 Compose 스택에서 스택 Caddy 뒤(`TRUSTED_PROXY_HOPS=1`). 빌드·크기·구성: `apps/api/docs/README.md#컨테이너-이미지`. 근거: `docs/work/api/0025-api-container-prod-config.md`.
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
