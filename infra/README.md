# 인프라

앱 소스와 분리해 실행 환경 설정을 관리합니다. 각 환경의 폴더는 책임 경계이며 동일한 Compose 구성을 세 벌 복사하지 않습니다.

| 위치 | 내용 |
| --- | --- |
| `local/compose.yaml` | 개발자 PC의 PostgreSQL·Valkey. [로컬 실행 안내](../docs/development/local-environment.md) 참조 |
| [dev/](dev/README.md) | 원격 통합 개발 환경의 자원 격리 기준과 구성 전 필요한 정보 |
| [prod/](prod/README.md) | 운영 서버 구성(API Compose, 공용 edge Caddy, 크리링 사이트 정책), 배포·롤백·GeoIP·부트스트랩 스크립트, 로컬 시험. 코드 준비 완료, 원격 자원 미생성 |
| [docs/prod-runbook.md](docs/prod-runbook.md) | 운영 서버·외부 서비스 준비, 최초 배포, 롤백·백업·키 교체·장애 대응 절차 |

루트 `Makefile`은 local만 실행합니다. 운영 배포는 GitHub Actions(`.github/workflows/deploy.yml`)가 서버의 `infra/prod/deploy.sh`를 실행합니다. 애플리케이션 빌드 설정은 각 `apps/`에, 환경·비밀값 소유권은 [환경과 비밀값 관리](../docs/development/environment-secrets.md)에 둡니다. 인프라 변경 시 [영역 규칙](AGENTS.md)을 함께 따릅니다.
