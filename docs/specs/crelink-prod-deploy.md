# 크리링 운영(prod) 배포와 CD 기술 설계

- 상태: 승인 (2026-10-06, 사용자가 호스팅·DB·도메인·배포 트리거를 선택. 세부 `[임시값]`은 운영하며 조정)
- 작성일: 2026-10-06
- 에픽: `docs/work/epics/0024-prod-deploy.md`
- 입력: [ADR 0010](../adr/0010-prod-deployment-topology.md)(제안), [배포 대상 아키텍처](../architecture/deployment-target.md), [환경과 비밀값 관리](../development/environment-secrets.md), 기존 [CI](../development/verification.md#ci), [MVP 기술 설계](crelink-mvp.md)

`[사용자 준비]`는 저장소가 아니라 사용자가 계정·콘솔에서 해야 하는 일입니다.

## 구성

```text
방문자 ──https──▶ links.shaul.kr (Vercel, Next.js)
                     │ BFF·서버 컴포넌트: https://go.shaul.kr/api/... + X-Crelink-Internal 토큰
                     ▼
인스타 링크 ─https─▶ go.shaul.kr (OCI ARM 1대: Caddy ─▶ API 컨테이너 :3000) ──TLS──▶ Supabase(세션 풀러)
```

| 항목 | 값 |
| --- | --- |
| 웹 | `https://links.shaul.kr` = `WEB_URL`. Google 리디렉션 URI `https://links.shaul.kr/auth/google/callback` |
| API·단축 | `https://go.shaul.kr` = `SHORT_LINK_BASE_URL`, 웹의 `API_INTERNAL_URL` `[임시값, 정식 도메인이 정해지면 교체]` |
| DNS(`shaul.kr` 영역) | `links` CNAME → Vercel이 안내하는 값, `go` A → OCI 공인 IP `[사용자 준비]` |
| 서버 | OCI ARM(Ampere) Ubuntu, 열린 포트 22(키 인증만)·80·443, 앱은 Docker Compose |
| DB | Supabase 프로젝트 1개(prod 전용). `DATABASE_URL` = 세션 풀러 주소 + TLS |

## Caddy 공개 정책 (`go.shaul.kr`)

- 공개: `GET /{slug}`(3~30자 `[a-z0-9-]`), `GET /c/{id}` → API.
- `/api/*`: 요청 헤더 `X-Crelink-Internal`이 서버 환경변수 `INTERNAL_TOKEN`과 같을 때만 API로 전달, 아니면 404. 웹(Vercel)이 서버 측 호출마다 이 헤더를 붙입니다. 브라우저는 `go.shaul.kr/api`를 직접 부르지 않습니다.
- 그 밖의 경로는 404. API 컨테이너 포트는 호스트에 공개하지 않고 Compose 내부 네트워크에서만 Caddy가 접근합니다.
- 클라이언트 IP: Caddy가 `X-Forwarded-For`를 덧붙이고 API는 `TRUSTED_PROXY_HOPS=1`일 때만 그 값을 신뢰합니다(기본 0=소켓 주소, 로컬·테스트와 같음). 방문 기록의 IP·위치(R9)가 Caddy 주소가 되지 않게 합니다.

## 환경변수

| 위치 | 키 | 설명 |
| --- | --- | --- |
| 서버 `/opt/crelink/.env`(Git 제외, 권한 600) | `API_IMAGE`(GHCR 이미지·태그, 배포가 갱신), `DATABASE_URL`, `DATABASE_SSL`·`DATABASE_SSL_CA_PATH`(Supabase TLS), `PORT=3000`, `WEB_URL`, `SHORT_LINK_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPERATOR_EMAILS`, `UPLOAD_DIR=/data/uploads`, `GEOIP_MMDB_PATH=/data/geoip/dbip-city-lite.mmdb`, `TRUSTED_PROXY_HOPS=1`, `INTERNAL_TOKEN`, `API_DOMAIN=go.shaul.kr` | API·Caddy가 읽음 |
| Vercel(production) | `API_INTERNAL_URL=https://go.shaul.kr`, `API_INTERNAL_TOKEN`(=서버 `INTERNAL_TOKEN`) | 서버 전용 변수, `NEXT_PUBLIC_*` 아님 |
| GitHub Actions secrets | `OCI_HOST`, `OCI_USER`, `OCI_SSH_KEY`(배포 전용 키), `OCI_KNOWN_HOSTS`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `GHCR_PULL_USER`·`GHCR_PULL_TOKEN`(서버가 이미지를 받을 읽기 전용 토큰, 배포 때 서버에 로그인) | 이미지 푸시는 `GITHUB_TOKEN`(`packages: write`) |

## 변경 범위

| 티켓 | 역할 | 내용 |
| --- | --- | --- |
| 0025 | api | `apps/api/Dockerfile`(arm64 런타임, 빌드는 빌더 플랫폼에서 해 QEMU 없이), 컨테이너 헬스체크, `TRUSTED_PROXY_HOPS`, Supabase TLS 접속(`DATABASE_SSL`·CA), 운영 필수 설정 검증(`NODE_ENV=production`에서 필수 키 누락 시 기동 거부), 통합 테스트 |
| 0026 | web | 서버 측 API 호출·BFF에 `X-Crelink-Internal` 헤더(`API_INTERNAL_TOKEN`), Vercel 배포 설정(`vercel.json`·모노레포 빌드), 환경변수 문서 |
| 0027 | infra | `infra/prod/`: `compose.yaml`(API + Caddy + 볼륨), `Caddyfile`, `.env.example`, 서버 부트스트랩 스크립트, 배포·롤백 스크립트(`deploy.sh`), 런북(OCI·Supabase·Vercel·DNS·Google 콘솔 설정, 백업·복구, 롤백), `infra/CHANGELOGS.md` |
| 0028 | orchestrator | `.github/workflows/deploy.yml`(이미지 빌드 → API 배포 → 웹 배포 → 배포 후 검사, 자동 롤백), `rollback.yml`(수동), CI에 이미지 빌드 검증, `dependabot.yml`, 문서 |
| 0029 | orchestrator | 사용자 계정·시크릿이 준비된 뒤 최초 prod 프로비저닝 실행과 실서비스 검증(사용자 준비물 필요) |

## CD 흐름 (`deploy.yml`)

1. 트리거: `workflow_run`(`CI` 성공, `main`) 또는 `workflow_dispatch`. 동시 실행 그룹 `deploy-prod`(취소 안 함).
2. `changes`: 직전 배포 커밋(없으면 직전 커밋)과 비교해 `apps/api/**`·`packages/shared/**`·`infra/prod/**` 변경 시 API 배포, `apps/web/**`·`packages/shared/**`·`packages/design-tokens/**` 변경 시 웹 배포. 문서만 바뀌면 배포 안 함.
3. `api-image`: buildx로 `linux/arm64` 이미지를 빌드해 `ghcr.io/ai-worker-lab/crelink-api:<SHA>`로 푸시.
4. `deploy-api`: SSH로 서버의 `deploy.sh <SHA>` 실행: GHCR 로그인 → pull → 이전 태그 기록 → `docker compose up -d` → `http://127.0.0.1` 컨테이너 헬스(`/api/health/ready`)를 최대 60초 확인 → 실패하면 이전 태그로 되돌리고 워크플로를 실패 처리.
5. `deploy-web`: `vercel pull`·`vercel build --prod`·`vercel deploy --prebuilt --prod`. 배포 URL이 아니라 운영 도메인으로 `/`·`/api/backend/api/health`를 확인하고 실패하면 이전 배포로 `vercel rollback`.
6. `verify-prod`: 운영 주소 smoke(`GET https://links.shaul.kr/` 200, `GET https://go.shaul.kr/zzzz` 302 notice, `GET https://go.shaul.kr/api/health` 404 — 토큰 없이 닫혀 있음).
7. 수동 롤백 `rollback.yml`: 입력 `target`(api|web|both), `api_tag`(기본 서버가 기록한 이전 태그), 웹은 `vercel rollback`.

## DB migration 운영 규칙

API 기동 시 migration이 돌고(advisory lock) 새 컨테이너가 헬스체크에 실패하면 이전 이미지로 돌아갑니다. 롤백된 이전 코드가 새 스키마에서도 동작해야 하므로 컬럼·테이블 삭제는 쓰는 코드를 먼저 배포한 다음 배포에서 합니다(expand/contract).

## 위험·미정 `[임시값]`

- Vercel Hobby는 상업적 사용 불가. 수익 서비스 전환 전 Pro 필요.
- Supabase 무료 플랜: 자동 일시정지·백업 제한. 출시 전 유료 전환 또는 백업 절차 필요.
- 업로드 이미지는 서버 볼륨. 서버 교체 대비 `FileStorage`를 Supabase Storage로 옮기는 후속 작업과 볼륨 백업 필요.
- GeoIP 파일은 서버에서 월 1회 갱신(`deploy.sh geoip` 또는 크론). 없으면 위치만 비어 있음.
- 단축 도메인(`go.shaul.kr`)은 임시. 정식 도메인이 정해지면 `SHORT_LINK_BASE_URL`·Caddy 도메인·Vercel `API_INTERNAL_URL`·DNS를 함께 바꿉니다. 이미 인스타그램에 걸린 링크는 옛 도메인이 유지되어야 합니다.
- 속도 제한(rate limit)·WAF 없음. 공개 단축 주소가 남용되면 Caddy 또는 Cloudflare 앞단을 추가합니다(후속).
- SSH 키 방식 배포는 서버 접근 권한을 CI에 위임합니다. 배포 전용 키와 사용자를 쓰고 키는 정기 교체합니다.

## 검증 계획

- 로컬: API 이미지를 빌드해(`linux/arm64`) 로컬 PostgreSQL에 붙여 기동·헬스체크, `TRUSTED_PROXY_HOPS`와 DB TLS 옵션 단위·통합 테스트, `infra/prod/compose.yaml`을 `docker compose config`로 검사, Caddy 라우팅(내부 토큰 유무·단축 경로)을 로컬 컨테이너로 실행해 curl 확인, `pnpm verify`·`pnpm e2e`.
- 워크플로: `actionlint`(가능하면)로 문법 검사, 로컬에서 실행할 수 없는 단계는 사용자 준비 후 0029에서 실제 실행.
- 실서비스(0029): 사용자가 준비한 뒤 최초 배포, 헬스·smoke·구글 로그인·단축 URL 클릭 기록(IP가 클라이언트 IP인지)을 확인.

## 검토 기록

- 2026-10-06: 빠른 진행을 위해 역할별 설계 검토를 생략하고 사용자 선택(호스팅·DB·도메인·배포 트리거)을 승인 근거로 둠.
