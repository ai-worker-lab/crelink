# ADR 0010: 운영(prod) 배포 구성과 CD

- 날짜: 2026-10-06
- 상태: 제안 (사용자가 호스팅·DB·도메인·배포 트리거를 선택했고, 이 문서 자체의 `승인`은 사용자 확인 후)
- 범위: 웹 호스팅, API 서버, 운영 DB, 도메인, GitHub Actions CD (`infra/prod/`, `.github/workflows/`, 루트 설정)

## 배경

- MVP는 localhost에서만 동작합니다. 운영 환경과 배포 자동화가 없고, [배포 대상 아키텍처](../architecture/deployment-target.md)는 템플릿에서 온 "계획"(Vercel 웹, OCI ARM API, Supabase DB)입니다.
- 사용자가 2026-10-06에 선택했습니다: 템플릿 계획대로 분리, DB는 Supabase, 도메인은 `shaul.kr` 아래 임시 `links.shaul.kr`, 배포는 main 병합 시 자동 + 수동 롤백. 이후 prod를 운영하며 바이브 코딩·자동화를 고도화합니다.
- 저장소는 GitHub 무료 개인 플랜의 private 저장소라 브랜치 보호·환경 승인자를 쓸 수 없습니다.

## 결정

1. **웹**: Vercel(`https://links.shaul.kr`). 배포는 Vercel Git 연동이 아니라 GitHub Actions가 CI 통과 뒤 `vercel` CLI로 합니다(CI와 배포를 한 파이프라인에서 제어하고 롤백 기준을 하나로 둠).
2. **API·단축 도메인**: OCI ARM 서버 1대에서 Docker Compose(API 컨테이너 + Caddy). 공개 호스트 `https://go.shaul.kr`(임시, `SHORT_LINK_BASE_URL`). Caddy가 TLS를 맡고 공개하는 경로는 단축 주소(`/{slug}`, `/c/{id}`)와 내부 토큰 헤더가 있는 `/api/*`뿐입니다.
3. **DB**: Supabase PostgreSQL. API는 TLS로 Supavisor 세션 풀러(IPv4, advisory lock 지원)에 연결하고 migration은 기존대로 API 기동 시 실행합니다.
4. **이미지**: GitHub Actions가 API 이미지를 빌드해 GHCR에 푸시하고 서버가 태그(커밋 SHA)로 pull합니다. 서버에는 `.env`가 있고 Git에는 비밀값이 없습니다.
5. **CD**: main에서 `CI` 워크플로가 성공하면 `Deploy` 워크플로가 실행됩니다(API → 웹 순서). 변경된 영역만 배포하고, 배포 직후 헬스체크가 실패하면 자동 롤백, 수동 롤백은 `workflow_dispatch`(태그 지정)입니다.
6. 도메인 구성(웹 `links.shaul.kr`, API·단축 `go.shaul.kr`)은 설정값이며 정식 도메인이 정해지면 값만 바꿉니다.

## 검토한 대안

- **서버 1대에 전부(OCI + Compose)**: 비용·단순성이 좋고 BFF 구간이 짧지만 사용자가 템플릿 계획대로 분리하기로 했습니다.
- **PaaS(Render·Fly 등)**: 운영 부담이 적지만 사용자가 선택하지 않았습니다.
- **Vercel Git 연동 자동 배포**: 설정이 가장 쉽지만 CI 실패와 무관하게 배포됩니다. 탈락.
- **DB 같은 서버의 컨테이너**: 비용은 낮으나 백업·복구를 직접 운영해야 합니다. 사용자가 Supabase를 선택했습니다.

## 결과와 트레이드오프

- 계정 3곳(OCI·Supabase·Vercel)과 DNS를 관리합니다. Vercel Hobby는 비상업용이라 수익 서비스는 Pro가 필요합니다.
- 웹(Vercel)→API(OCI) 구간이 인터넷을 지나므로 API 공개 호스트에 내부 토큰 헤더 검사를 둡니다(방어 심층, 비밀값 유출 시 교체).
- 업로드 이미지는 서버 디스크(볼륨)에 저장되어 서버 교체·장애에 약합니다. `FileStorage` 뒤에서 Supabase Storage로 옮기는 후속 작업이 필요합니다.
- 무료 Supabase는 자동 일시정지·백업 제한이 있어 출시 전 유료 전환이나 백업 절차 확정이 필요합니다.
- 배포 승인자가 없어 안전장치는 CI·헬스체크·자동 롤백에 있습니다. 운영 중 DB migration은 expand/contract(호환되는 변경 먼저, 제거는 다음 배포)로 씁니다.
