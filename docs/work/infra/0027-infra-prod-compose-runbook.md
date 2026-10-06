# 0027 prod Compose·Caddy·서버 부트스트랩·런북

- 단계: 티켓
- 역할: infra
- 상위: 0024
- 선행: 0025
- 상태: 준비
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

OCI 서버에서 API와 Caddy를 Compose로 운영하는 설정, 배포·롤백 스크립트, 부트스트랩과 사람이 따라 할 런북을 만듭니다.

## 수용 기준

- [ ] `infra/prod/compose.yaml`(API 이미지 `${API_IMAGE}` + Caddy + 볼륨 uploads·geoip·caddy 데이터, API 포트는 내부 네트워크만), `infra/prod/Caddyfile`(설계의 공개 정책: 단축 경로 공개, `/api/*`는 `X-Crelink-Internal` 일치 시만, 그 외 404, TLS 자동), `infra/prod/.env.example`. `docker compose config --quiet`가 통과한다.
- [ ] Caddy 라우팅을 로컬 컨테이너로 실행해 curl로 확인한다: 단축 경로 통과, 토큰 없는 `/api/health` 404, 토큰 있는 `/api/health` 200, 그 밖 경로 404, `X-Forwarded-For` 전달.
- [ ] `infra/prod/deploy.sh`(인자 SHA: GHCR 로그인·pull·이전 태그 기록·`up -d`·헬스 대기·실패 시 이전 태그 복구)와 `rollback`(이전/지정 태그), `geoip` 갱신. 셸 검사(`shellcheck` 가능하면)와 로컬 Docker로 정상·실패 경로를 시뮬레이션한다.
- [ ] `infra/prod/bootstrap.sh`(Ubuntu ARM: Docker 설치, `deploy` 사용자·`/opt/crelink`, 방화벽) 와 런북 `infra/docs/prod-runbook.md`(OCI 인스턴스·보안 목록, DNS, Supabase 프로젝트·세션 풀러·CA, Vercel 프로젝트·환경변수, Google 콘솔 리디렉션 URI, GitHub secrets 목록, 최초 배포, 백업·복구, 롤백, 키 교체)를 적는다.
- [ ] `infra/prod/README.md`·`infra/README.md`·`infra/AGENTS.md`(필요 시)·`infra/CHANGELOGS.md` 갱신, 비밀값은 저장소에 없다.

## 범위

- 포함: `infra/**`.
- 제외: API 코드·Dockerfile(0025), 워크플로(0028).

## 위험·복구

원격 자원을 만들지 않습니다. 스크립트는 파괴적 명령을 호출하지 않고 로컬에서만 시험합니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
