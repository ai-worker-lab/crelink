# 인프라

앱 소스와 분리해 실행 환경 설정을 관리합니다. 각 환경의 폴더는 책임 경계이며 동일한 Compose 구성을 세 벌 복사하지 않습니다.

| 위치 | 내용 |
| --- | --- |
| `local/compose.yaml` | 개발자 PC의 PostgreSQL·Valkey. [로컬 실행 안내](../docs/development/local-environment.md) 참조 |
| [dev/](dev/README.md) | 원격 통합 개발 환경의 자원 격리 기준과 구성 전 필요한 정보 |
| [prod/](prod/README.md) | 운영 스택(Compose: caddy·api·web, 공개 정책 `Caddyfile`), 배포 대상 목록, 대상별 SOPS 암호문, 배포·롤백·GeoIP·부트스트랩 스크립트, 로컬 시험 |
| [docs/prod-runbook.md](docs/prod-runbook.md) | 서버 준비, CI 접속(Tailscale) 설정, Cloudflare Tunnel, 비밀값 편집·회전, 최초 배포, 롤백·백업·대상 추가·장애 대응 절차 |

루트 `Makefile`은 local만 실행합니다. 운영 배포는 GitHub Actions(`.github/workflows/deploy.yml`)가 Tailscale을 거쳐 서버 `deploy` 사용자의 forced command(`infra/prod/ssh-entry.sh`)로 릴리스를 올리면 서버의 `deploy.sh`가 실행합니다. 애플리케이션 빌드 설정은 각 `apps/`에, 환경·비밀값 소유권은 [환경과 비밀값 관리](../docs/development/environment-secrets.md)에 둡니다. 인프라 변경 시 [영역 규칙](AGENTS.md)을 함께 따릅니다.
