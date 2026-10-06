# 인프라 변경 기록

내부 참고용으로 인프라의 모든 변경을 적용 여부와 관계없이 기록합니다. 환경별 적용 시각·결과·복구 정보는 운영 work item이나 배포 플랫폼에 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../docs/development/repository-policy.md#변경-기록)을 따릅니다.

## 2026-10-01

- 슬롯 0 포트 원본을 `local/.env.example` 하나로 모음: `API_PORT`·`WEB_PORT`·`EXPO_PORT`를 추가하고 원본이라는 주석을 달았으며, `local/compose.yaml`의 `POSTGRES_PORT`·`VALKEY_PORT` 기본값을 없애고 값이 없으면 `make`·`--env-file` 경로를 안내하는 `:?` 오류로 바꿈. 인프라 작업 규칙에 포트 원본 기준 추가. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- worktree별 로컬 인스턴스: 루트 `Makefile`이 `.local/instance.env`의 Compose project(주 checkout `crelink` 유지, 연결된 worktree `crelink-<worktree>`)와 PostgreSQL·Valkey 호스트 포트(슬롯 k마다 +100×k)를 쓰고, 연결된 worktree 인스턴스의 컨테이너·볼륨·PM2를 지우는 `make instance-destroy CONFIRM=1`(주 checkout 거부)을 추가. 인프라 작업 규칙에 인스턴스별 project·볼륨 기준 추가. 근거: `docs/work/0001-worktree-local-instances.md`, `docs/adr/0008-worktree-local-instances.md`.
- 로컬 PostgreSQL 17·Valkey 8 Compose 구성(`local/`, 호스트 포트 5452·6399), `dev/`·`prod/` 환경 안내, 인프라 작업 규칙.
