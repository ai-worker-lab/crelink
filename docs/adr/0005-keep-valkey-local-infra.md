# ADR 0005: 로컬 인프라에 Valkey 유지

- 날짜: 2026-10-01
- 상태: 승인
- 범위: `infra/local/`, 루트 `Makefile` (인프라)

## 배경

- 로컬 Compose(`infra/local/compose.yaml`)는 PostgreSQL과 함께 Valkey 8을 띄웁니다. 2026-10-01 기준 API 소스(`apps/api/src`)에는 Valkey를 쓰는 코드가 없습니다.
- 용도가 정해질 때 연결하는 방법과, 용도가 없으면 제거하는 방법을 검토했습니다.
- 사용자는 Valkey 인프라를 유지하기로 정했습니다.

## 결정

1. 로컬 인프라의 표준 구성으로 PostgreSQL과 Valkey를 함께 유지합니다. `make infra-up`은 두 서비스를 함께 띄우고, 호스트 포트는 `infra/local/.env.example`이 기준입니다.
2. API 연결(클라이언트, 환경변수, readiness 포함 여부)은 캐시·세션·큐 같은 구체적 용도가 생길 때 해당 work item에서 추가합니다. 그 전까지 API는 Valkey를 사용하지 않습니다.
3. 운영 캐시 제품과 실행 위치는 이 결정의 범위가 아니며 [배포 대상 아키텍처](../architecture/deployment-target.md)에서 미정으로 둡니다. 제품 비교는 [Redis와 Valkey 비교](../references/redis-vs-valkey.md)를 참고합니다.

## 결과와 트레이드오프

- 용도가 생겼을 때 로컬 인프라를 다시 구성하지 않고 API 연결만 추가하면 됩니다. 이 저장소를 바탕으로 만드는 저장소도 같은 구성을 갖습니다.
- 쓰지 않는 동안에도 로컬에서 컨테이너 하나, 호스트 포트 하나, 볼륨 하나를 차지합니다.
- 문서는 "Compose가 Valkey를 제공하지만 API는 아직 사용하지 않는다"는 현재 상태를 계속 정확히 적어야 합니다.
