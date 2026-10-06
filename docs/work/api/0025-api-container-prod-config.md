# 0025 API 컨테이너 이미지와 운영 설정

- 단계: 티켓
- 역할: api
- 상위: 0024
- 상태: 준비
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

API를 OCI ARM 서버에서 컨테이너로 운영할 수 있게 이미지, 프록시 뒤 클라이언트 IP, Supabase TLS 접속, 운영 설정 검증을 만듭니다.

## 수용 기준

- [ ] `apps/api/Dockerfile`이 `linux/arm64` 런타임 이미지를 만든다(빌드는 빌더 플랫폼에서 하고 순수 JS 의존성만 옮겨 QEMU 없이). 이미지에서 `node apps/api/dist/main.js`가 기동하고 `HEALTHCHECK`가 `/api/health/ready`를 쓴다. 로컬 PostgreSQL에 붙여 기동·헬스를 확인한다.
- [ ] `TRUSTED_PROXY_HOPS`(기본 0): 0이면 소켓 주소, N이면 `X-Forwarded-For`에서 신뢰할 프록시 N단 뒤의 주소를 방문·클릭 IP로 쓴다. 통합 테스트로 위조 헤더가 무시됨을 확인한다.
- [ ] `DATABASE_SSL`(`disable`|`require`|`verify-full`)과 `DATABASE_SSL_CA_PATH`로 Supabase TLS 접속을 지원한다. 테스트로 설정 해석을 확인한다.
- [ ] `NODE_ENV=production`이면 `DATABASE_URL`·`PORT`·`WEB_URL`·`SHORT_LINK_BASE_URL`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`OPERATOR_EMAILS`·`UPLOAD_DIR` 누락, `WEB_URL`·`SHORT_LINK_BASE_URL`이 https가 아님을 기동 단계에서 거부한다(로컬·테스트는 영향 없음).
- [ ] `.dockerignore`, 이미지 크기·구성 설명 문서(`apps/api/docs/`), `apps/api/CHANGELOGS.md`, `.env.example`, `pnpm verify` 통과.

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
