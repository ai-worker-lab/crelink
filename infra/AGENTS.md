# 인프라 작업 규칙

적용 범위: `infra/`와 그 하위 파일. [루트 공통 규칙](../AGENTS.md)을 함께 따르며 여기서는 인프라에 필요한 규칙만 정의합니다. 루트 Makefile에서 인프라 호출을 변경할 때도 이 규칙을 참고합니다.

- `local/`은 개발자 PC, `dev/`는 원격 통합 환경, `prod/`는 운영 환경입니다. 환경 이름만 다른 동일 자원이나 운영 비밀값을 공유하지 않습니다.
- 실행 설정은 local과 prod(`prod/`: 서버 API Compose, 공용 edge Caddy, 배포·롤백 스크립트)가 있고 dev는 없습니다. prod는 로컬 Docker 시험만 거쳤으므로 실제 서버 적용·배포 성공은 운영 work item이나 워크플로 실행 기록으로만 판단하고 가정하지 않습니다.
- prod 설정·스크립트를 바꾸면 `config --quiet`(`--env-file`로 `.env.example`), `bash -n`·`shellcheck`, `prod/tests/*.sh`를 실행합니다. 서버 `/opt/edge`의 edge Caddy는 다른 프로젝트 사이트도 맡으므로 edge 컨테이너 재생성·중지처럼 모든 사이트에 영향을 주는 변경은 영향을 설명하고 승인받습니다.
- 비밀값의 위치·주입 방식은 [환경과 비밀값 관리](../docs/development/environment-secrets.md)를 따릅니다. 값이 포함되는 환경 덤프·Compose 전체 설정을 로그에 출력하지 않습니다.
- 경로 이동 시 Compose 프로젝트명·볼륨·네트워크·환경 파일·상대 경로 기준을 확인합니다. Compose project와 호스트 포트는 checkout 인스턴스 설정(`.local/instance.env`, [ADR 0008](../docs/adr/0008-worktree-local-instances.md))에서 옵니다. 주 checkout은 `crelink` project와 그 데이터 볼륨을 그대로 쓰며, 이를 새 빈 볼륨으로 바꾸거나 `instance-destroy`로 지우지 않습니다. 연결된 worktree는 `crelink-<worktree>` project의 별도 볼륨만 쓰고 지웁니다.
- 슬롯 0 포트(`API_PORT`·`WEB_PORT`·`EXPO_PORT`·`POSTGRES_PORT`·`VALKEY_PORT`)의 유일한 원본은 추적 파일 `local/.env.example`입니다. 포트를 바꿀 때는 이 파일만 고치고 다른 파일에 포트 숫자를 다시 적지 않습니다. `local/compose.yaml`의 포트 변수는 기본값 없이 `:?` 오류로 `make`·`--env-file` 경로를 안내합니다.
- local의 PostgreSQL·Valkey 호스트 포트는 loopback 바인딩을 유지합니다. 원격 서비스를 위해 이 설정을 공개 바인딩으로 단순 복사하지 않습니다.
- `down`과 `restart`는 데이터 볼륨을 보존합니다. 볼륨 삭제·데이터 초기화·운영 서비스 중단 등 파괴적 변경은 영향을 설명하고 명시적으로 승인받습니다. 연결된 worktree 인스턴스의 볼륨은 `make instance-destroy CONFIRM=1`로만 지웁니다.
- 변경한 설정은 `config --quiet`로 확인하고 실제 서비스 기동·접속·종료 경로를 검증합니다. 데이터 경로를 바꾸는 경우 재기동 전후 데이터 보존도 확인합니다.
- 인프라 전용 상세 가이드는 `infra/docs/`, 전용 결정은 `infra/docs/adr/`에 필요할 때 추가합니다. 여러 서비스의 환경·비밀값 정책은 루트 문서를 참조합니다.
- 인프라 변경은 적용 여부와 관계없이 이 영역의 `CHANGELOGS.md`에 기록합니다. 환경별 적용 시각·결과는 운영 work item이나 배포 플랫폼에 기록합니다. 기록 형식은 [공통 변경 기록 규칙](../docs/development/repository-policy.md#변경-기록)을 따릅니다.
