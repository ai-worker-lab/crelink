# 0024 운영(prod) 배포와 GitHub Actions CD

- 단계: 에픽
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

크리링 MVP를 운영 환경(배포 대상 서버 1대의 웹·API Compose 스택 + Supabase DB, 임시 도메인 `links.shaul.kr`·`go.shaul.kr`)에 배포하고, main 병합 시 자동 배포·자동/수동 롤백이 되는 GitHub Actions CD를 갖춥니다. 1차 대상은 `home-server`이고 나중에 OCI·AWS로 옮기거나 대상을 더할 수 있게 합니다. 이후 운영하며 자동화를 고도화하는 기반입니다.

## 수용 기준

- [x] 저장소 쪽 구현(API·웹 이미지, 프록시 IP·DB TLS, `infra/prod/` 스택·스크립트·암호문, CD 워크플로)이 로컬에서 검증된다(0025~0028).
- [x] 사용자 준비물(서버·Tailscale·Cloudflare Tunnel·Supabase·Google·GitHub variables/secret)을 넣은 뒤 최초 배포가 성공하고 운영 주소에서 로그인·단축 URL·랜딩이 동작한다(0029).
- [x] main 병합이 CI 통과 뒤 자동 배포되고, 배포 후 헬스체크 실패 시 자동 롤백, 수동 롤백 워크플로가 동작한다(0029에서 실행 확인).

## 범위

- 포함: 설계 문서의 변경 범위 표.
- 제외: dev(스테이징) 환경, 속도 제한·WAF, 업로드 S3 호환 저장소 이전(0030), OCI 등 두 번째 배포 대상 추가, 모니터링·알림 고도화(후속).

## 위험·복구

운영 데이터·외부 계정이 걸립니다. 자원 생성·DNS·Tunnel 변경·시크릿 등록은 사용자가 실행하거나 승인합니다. 자세한 위험은 설계 문서 `보안 경계와 한계`·`위험·후속`.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성. 사용자 선택: 템플릿 계획대로 분리(Vercel·OCI·Supabase), 도메인 `shaul.kr`(임시 `links.shaul.kr`), main 병합 시 자동 배포 + 수동 롤백.
- 2026-10-06: 범위 변경(사용자 결정, 호스팅 전환). 운영 대상을 Vercel 웹 + OCI API(서버 공용 edge Caddy, 웹→API 내부 토큰, GitHub secrets `OCI_*`·`VERCEL_*`, 서버 `.env`)에서 `home-server` 단일 서버 + Tailscale OIDC SSH + SOPS/age + 스택 안 Caddy + Cloudflare Tunnel로 바꿈. 목적·수용 기준의 호스팅 표현(Vercel·OCI·DNS·`vercel.json`·웹 내부 토큰)을 새 설계로 고침. 설계·ADR 0010을 다시 쓰고, 0025~0028은 각 파일에 범위 변경을 기록, 0026은 웹 컨테이너 이미지로 범위 갱신, 업로드 S3 이전은 0030(분류 대기)으로 분리.
- 2026-10-06: CI `work scope`가 에픽 브랜치 `work/0024-prod-deploy`(에픽은 `역할` 없음)에서 실패하는 문제: 에픽에 역할을 넣으면 `pnpm work:check`가 실패하므로 문서 쪽에서 고칠 수 없음. 여러 역할을 묶은 통합 PR은 통합 티켓 0029(`orchestrator`) 브랜치 `work/0029-first-prod-provision-verify`로 옮기기로 하고, `docs/work/README.md` "착수와 점유"에 규칙을 추가.
- 2026-10-07: 완료(사용자 지시 "0024 처리"). 하위 0025~0029 모두 완료. 운영 `home-server`에서 main 병합 자동 배포(Deploy 성공 17회), 워크플로 자동 롤백·수동 롤백(Rollback 성공 6회), 헬스 실패 배포 무변경(0036)을 실행했고, 0029 실서비스 확인(구글 로그인·업로드·링크·단축 URL·방문자 IP 기록)을 마침. 단일 스택(`crelink-prod`·스택 안 Caddy)과 헬스 실패 복구 방식은 이후 에픽 0031(ADR 0011, Blue/Green)이 대체.
