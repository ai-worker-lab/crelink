# 0029 최초 prod 프로비저닝과 실서비스 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0024
- 선행: 0028
- 상태: 진행
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

사용자가 준비한 계정·시크릿으로 최초 배포를 실행하고 운영 주소에서 end-to-end로 동작함을 확인합니다.

## 수용 기준

- [ ] 사용자 준비물 완료: OCI 서버(공인 IP·SSH 키), Supabase 프로젝트(세션 풀러 URL·CA), Vercel 프로젝트·토큰, DNS(`links`·`go`), Google OAuth 운영 리디렉션 URI, GitHub secrets.
- [ ] 서버 부트스트랩·최초 `deploy.sh`·Vercel 최초 배포가 성공하고 `https://links.shaul.kr`에서 구글 로그인, 링크 관리, 랜딩, 단축 URL 클릭 기록(IP가 클라이언트 IP)이 동작한다.
- [ ] `deploy.yml` 자동 배포 1회, 의도적 실패(헬스 실패) 자동 롤백 1회, `rollback.yml` 수동 롤백 1회를 실제로 실행해 결과를 기록한다.

## 범위

- 포함: 운영 실행·검증 기록.
- 제외: 새 기능.

## 위험·복구

운영 데이터·DNS·계정 작업입니다. 파괴적 명령 없이 단계별로 사용자 확인을 받습니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 서버 준비(사용자 승인). 기존 `oci-server`(193.122.104.153, Ubuntu 26.04 ARM)를 씀. 배포 전용 사용자 `deploy`·ed25519 키 생성, 호스트 키를 기존 신뢰 지문과 대조해 GitHub secrets `OCI_HOST`·`OCI_USER`·`OCI_SSH_KEY`·`OCI_KNOWN_HOSTS` 등록(로컬 키 사본 삭제). `bootstrap.sh` 실행(Docker 기존 설치 유지). Supabase CA(`Supabase Root 2021 CA`, 2031-04-26 만료)를 `/opt/crelink/certs/supabase-ca.crt`에 둠. 서버에서 `verify-full`로 Supabase 세션 풀러 접속 확인(PostgreSQL 17.11, TLSv1.3). `/opt/crelink/.env`(사용자 `apps/api/.env.prod`의 DB·구글 값 + 운영 주소)·`/opt/edge/.env`(내부 토큰 새로 생성) 작성, 값은 출력하지 않음.
- 2026-10-06: edge 전환. `/opt/edge` 배치·`caddy validate` 통과 → 기존 aichat Caddy 인증서 볼륨을 `edge_data`로 복사 → aichat Caddy 중지 → `edge-caddy-1` 기동(80·443). `aichat-api.shaul.kr`은 edge를 거쳐 aichat API로 전달되며, 응답 503은 aichat API 자체 헬스 응답(호스트 `127.0.0.1:3000`에서도 503)이라 전환과 무관. 확인 중 aichat Caddy 재시작 명령을 한 번 잘못 실행했으나 포트 충돌로 시작되지 않았고 edge에는 영향 없음(현재 `Exited`).
- 2026-10-06: PR #1 CI: check 3종·smoke·`API 이미지 빌드`(amd64 러너에서 arm64 교차 빌드 3분 20초) 통과. `work scope`는 에픽 브랜치(역할 없음)라 실패(여러 역할 변경을 한 브랜치에 묶은 결과).
- 2026-10-06: 사용자 결정: Cloudflare 프록시 사용, 서비스는 비상업적(Vercel Hobby, 저장소는 GitHub 조직·Vercel은 개인 계정), Google 콘솔에 운영 리디렉션 URI·클라이언트 값 입력 완료(서버 `.env`의 OAuth·DB 값이 현재 `apps/api/.env.prod`와 같은지 해시로 확인). edge Caddy를 Cloudflare 대역 신뢰 설정으로 바꿔 서버에 적용(reload, 기존 사이트 응답 변화 없음). 로컬 Caddy 시험 통과(위조 XFF 무시, 신뢰 프록시의 CF-Connecting-IP 사용).
- 남은 사용자 준비물: Cloudflare DNS(`go` A → 193.122.104.153 프록시 켬, `links` → Vercel CNAME DNS only 권장, SSL/TLS Full (strict)), Vercel 프로젝트·토큰(`VERCEL_TOKEN`·`VERCEL_ORG_ID`·`VERCEL_PROJECT_ID`).
