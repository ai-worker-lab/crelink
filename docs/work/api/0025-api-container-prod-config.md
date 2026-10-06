# 0025 API 컨테이너 이미지와 운영 설정

- 단계: 티켓
- 역할: api
- 상위: 0024
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

API를 OCI ARM 서버에서 컨테이너로 운영할 수 있게 이미지, 프록시 뒤 클라이언트 IP, Supabase TLS 접속, 운영 설정 검증을 만듭니다.

## 수용 기준

- [x] `apps/api/Dockerfile`이 `linux/arm64` 런타임 이미지를 만든다(빌드는 빌더 플랫폼에서 하고 순수 JS 의존성만 옮겨 QEMU 없이). 이미지에서 `node apps/api/dist/main.js`가 기동하고 `HEALTHCHECK`가 `/api/health/ready`를 쓴다. 로컬 PostgreSQL에 붙여 기동·헬스를 확인한다.
- [x] `TRUSTED_PROXY_HOPS`(기본 0): 0이면 소켓 주소, N이면 `X-Forwarded-For`에서 신뢰할 프록시 N단 뒤의 주소를 방문·클릭 IP로 쓴다. 통합 테스트로 위조 헤더가 무시됨을 확인한다.
- [x] `DATABASE_SSL`(`disable`|`require`|`verify-full`)과 `DATABASE_SSL_CA_PATH`로 Supabase TLS 접속을 지원한다. 테스트로 설정 해석을 확인한다.
- [x] `NODE_ENV=production`이면 `DATABASE_URL`·`PORT`·`WEB_URL`·`SHORT_LINK_BASE_URL`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`OPERATOR_EMAILS`·`UPLOAD_DIR` 누락, `WEB_URL`·`SHORT_LINK_BASE_URL`이 https가 아님을 기동 단계에서 거부한다(로컬·테스트는 영향 없음).
- [x] `.dockerignore`, 이미지 크기·구성 설명 문서(`apps/api/docs/`), `apps/api/CHANGELOGS.md`, `.env.example`, `pnpm verify` 통과.

## 범위

- 포함: `apps/api/**`.
- 제외: 루트 워크플로·`infra/prod/`(다른 티켓).

## 위험·복구

이미지·설정만 추가합니다. 운영 필수 검증은 `NODE_ENV=production`에서만 켜져 기존 동작을 바꾸지 않습니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 구현. `apps/api/Dockerfile`(빌드 `--platform=$BUILDPLATFORM` `node:22-slim`에서 corepack pnpm 10.10.0으로 `install --frozen-lockfile --filter @crelink/api...`, shared·api 빌드, `pnpm --filter @crelink/api deploy --prod --legacy /out` → 런타임 `node:22-slim`에 `/app/apps/api/{package.json,dist,migrations,node_modules}`만 복사, `USER node`, `NODE_ENV=production`, node `fetch` `HEALTHCHECK`, `/data/uploads`·`/data/geoip`를 node 소유로 생성), 루트 `.dockerignore`(허용 목록). `src/short-link/tracking.service.ts`의 `clientIp`(hops=0 소켓, N이면 XFF 오른쪽 N번째, IPv4-mapped·IPv6 정규화, 모자라거나 IP가 아니면 소켓), `src/config.service.ts`의 `TRUSTED_PROXY_HOPS` 해석·`productionConfigProblems`/`assertProductionConfig`(main.ts가 Nest 모듈보다 먼저 호출, 키 이름만 출력), `src/database.ts`의 `databaseConnectionConfig`(pg 8.23·pg-connection-string 2.14가 URL `sslmode`로 Pool `ssl`을 덮어쓰는 것을 `node_modules/pg/lib/connection-parameters.js`·`pg-connection-string/index.js`에서 확인해, `DATABASE_SSL`이 있으면 URL TLS 파라미터 제거). Supabase 세션 모드·트랜잭션 풀러 경고와 SSL 근거(supabase.com/docs/guides/database/connecting-to-postgres, /docs/guides/platform/ssl-enforcement)를 `apps/api/docs/README.md`에 기록. 단위 테스트 `src/{config.service,database}.spec.ts`·`src/short-link/tracking.service.spec.ts`, 통합 테스트 `test/short-link.e2e-spec.ts`(hops=0 위조 XFF 무시, hops=1 마지막 값·앞쪽 위조 무시·`::ffff:` 정규화·잘못된 값과 값 부족은 소켓 주소, 클릭 IPv6 소문자).
- 2026-10-06: 검증. `pnpm --filter @crelink/api test` 10 suites 63 tests 통과, `pnpm --filter @crelink/api typecheck`·`eslint apps/api` 통과. `docker buildx build --platform linux/arm64 -f apps/api/Dockerfile -t crelink-api:local --load .` 통과(38초, 이 Mac은 arm64 빌더). 이미지 388MB(`docker image ls`), `docker save | gzip` 약 80MB, 앱 레이어 `node_modules` 36.9MB·`dist` 0.8MB. 이미지 안 `node_modules` 127개에 `*.node`·`binding.gyp`·install 스크립트 없음(순수 JS). 로컬 PostgreSQL에 일회용 DB `crelink_img_check`를 만들어 `host.docker.internal`로 붙이고 `-p 3920:3000`, `NODE_ENV=production`·https 주소·`TRUSTED_PROXY_HOPS=1`·`DATABASE_SSL=disable`로 기동: 약 4초 뒤 health `healthy`, `GET /api/health/ready` 200 `{"status":"ready"}`, `GET /zzzz` 302 `https://links.example.test/notice?reason=link_not_found`(`@crelink/shared` ESM을 require(esm)로 해석), `schema_migrations`에 `0001_crelink_mvp`, 실행 사용자 uid 1000(node), `/data/uploads` node 소유. 운영 필수 키 없이 기동하면 종료 코드 1과 `비어 있음: DATABASE_URL, PORT, …, UPLOAD_DIR`, 일부만 빼고 `GOOGLE_CLIENT_SECRET`에 값을 넣은 경우 `비어 있음: DATABASE_URL, GOOGLE_CLIENT_ID, OPERATOR_EMAILS, UPLOAD_DIR / https URL이 아님: WEB_URL`(비밀값 미출력). `DATABASE_SSL=require`+URL `sslmode=disable`이면 URL 값이 무시되어 `The server does not support SSL connections`, 없는 CA 경로는 `DATABASE_SSL_CA_PATH(/nope.crt)를 읽지 못했습니다`로 기동 거부. 확인 뒤 컨테이너·일회용 DB·`crelink-api:local` 이미지 삭제. 실제 Supabase TLS(verify-full·세션 풀러) 접속은 계정이 없어 0029에서 확인. 마지막 수용 기준의 `pnpm verify`는 세 티켓 통합 뒤 통합 담당이 실행(현재 `pnpm docs:check`의 실패 8건은 0027이 만들 `infra/docs/prod-runbook.md` 링크이고 이 티켓 문서는 통과).
- 2026-10-06: 통합 확인(브랜치 `work/0024-prod-deploy`). 이미지 한도를 4MB로 맞춤(shared·API 메시지·테스트·문서). `pnpm verify` 8단계 통과(API 테스트 포함), `make api-restart` 뒤 `pnpm e2e` 6 passed, `pnpm smoke` 5 passed, `infra/prod/tests/caddy-routing.sh` 전 요청 일치. 상태 `완료`. 실서버 적용은 0029.
