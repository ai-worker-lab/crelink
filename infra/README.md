# 인프라

앱 소스와 분리해 실행 환경 설정을 관리합니다. 각 환경의 폴더는 책임 경계이며 동일한 Compose 구성을 세 벌 복사하지 않습니다.

| 위치 | 내용 |
| --- | --- |
| `local/compose.yaml` | 개발자 PC의 PostgreSQL·Valkey. [로컬 실행 안내](../docs/development/local-environment.md) 참조 |
| [dev/](dev/README.md) | 원격 통합 개발 환경의 자원 격리 기준과 구성 전 필요한 정보 |
| [prod/](prod/README.md) | 운영 환경의 구성 전 필요한 정보와 운영 경계 |

루트 `Makefile`은 현재 local만 실행합니다. 애플리케이션 빌드 설정은 각 `apps/`에, 환경·비밀값 소유권은 [환경과 비밀값 관리](../docs/development/environment-secrets.md)에 둡니다. 인프라 변경 시 [영역 규칙](AGENTS.md)을 함께 따릅니다.
