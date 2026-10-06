# 배포 대상 아키텍처

**상태: 1차 대상(`home-server`) 구성, 운영 적용은 work item 진행 기록 기준.** 결정은 [ADR 0010](../adr/0010-prod-deployment-topology.md)(제안), 세부 설계는 [운영 배포·CD 기술 설계](../specs/crelink-prod-deploy.md), 절차는 [prod 런북](../../infra/docs/prod-runbook.md)입니다. 코드·서비스 설정과 달라지면 구현을 기준으로 이 문서를 같은 변경에서 갱신합니다.

환경별 구성 상태는 [infra/dev](../../infra/dev/README.md), [infra/prod](../../infra/prod/README.md)에, 설정·비밀값 소유권은 [환경과 비밀값 관리](../development/environment-secrets.md)에 기록합니다. 실행 가능한 로컬 설정은 [infra/local/compose.yaml](../../infra/local/compose.yaml)이며 원격 배포 명령이 아닙니다.

## 목표 배치

- **웹·API·단축 도메인:** 배포 대상 서버 1대의 Docker Compose에서 함께 실행합니다(`https://links.shaul.kr`·`https://go.shaul.kr`, 임시). 공개 정책 Caddy는 배포와 무관하게 계속 떠 있는 edge 스택(`infra/prod/edge/compose.yaml`, project `crelink-edge`)이고, NestJS API·Next.js 웹은 같은 `infra/prod/compose.yaml`을 색(blue·green)별 스택으로 띄워 배포·롤백 때 비활성 색에 올린 뒤 Caddy reload로 전환합니다(Blue/Green 무중단, [ADR 0011](../adr/0011-zero-downtime-deploy.md)). 1차 대상은 집 서버 `home-server`(x86_64)이고, 대상 목록은 `infra/prod/targets.json`입니다. 공개는 Cloudflare Tunnel → edge Caddy → 활성 색, 관리·배포 접속은 Tailscale이며 서버에 공인 인바운드 포트를 열지 않습니다. 이미지는 GHCR(amd64·arm64 가능)이라 OCI(ARM)·AWS로 옮기거나 대상을 더할 수 있습니다([이식 규칙](../specs/crelink-prod-deploy.md#이식-규칙)).
- **캐시:** 프로덕션 캐시 제품과 실행 위치는 미정입니다. 로컬 Compose의 Valkey 설정은 프로덕션 배포 결정을 의미하지 않습니다. 제품별 비교는 [Redis와 Valkey 레퍼런스](../references/redis-vs-valkey.md)를 참고하세요.
- **관계형 데이터베이스:** Supabase 관리형 PostgreSQL 사용. API에서 TLS로 세션 풀러에 연결하며 데이터베이스 포트를 공개 인터넷에 열지 않습니다.
- **모바일:** Expo + React Native 앱은 Apple App Store와 Google Play를 대상으로 한다.
- **공개 시점·순서:** 웹·API를 먼저 운영합니다(사용자 결정 2026-10-06). 모바일은 미정입니다.

## 운영상 경계

- Supabase는 PostgreSQL 관리 서비스입니다. 저장소의 local Compose PostgreSQL은 로컬 개발 전용이며, Supabase 프로젝트나 schema를 자동으로 생성하지 않습니다.
- 저장소에 컨테이너 이미지(`apps/api/Dockerfile`·`apps/web/Dockerfile`), 운영 스택과 스크립트(`infra/prod/`), 대상별 비밀값 암호문(`infra/prod/secrets/`), CD 워크플로(`.github/workflows/deploy.yml`·`rollback.yml`)가 있습니다. 서버·Supabase 프로젝트·Cloudflare Tunnel·Tailscale 설정은 사용자 계정에서 준비합니다([prod 런북](../../infra/docs/prod-runbook.md)).
- `infra/local/.env.example`의 자격 증명은 개발 전용입니다. 운영 비밀값은 대상별 SOPS 암호문으로 관리하고 서버만 복호화합니다([환경과 비밀값 관리](../development/environment-secrets.md#원격-비밀값-주입)).
- 서버 1대에 웹·API가 함께 있으므로 서버 자원과 장애가 두 서비스에 같이 영향을 줍니다. 캐시를 함께 운영하기로 하면 제품·메모리 제한·eviction 정책·백업·복구·가용성을 함께 결정해야 합니다.
- API는 Supabase PostgreSQL에 대해 TLS를 요구합니다. 연결 수 제한·pooling 설정은 배포 구성 때 검증합니다.

## 프레임워크별 구현 구조

프레임워크 best practice와 권장 디렉터리 구조는 각각 별도 문서로 관리한다. 각 문서는 공식 framework 문서를 근거로 하며, 현재 골격과의 차이를 추적한다.

- [NestJS API 구조와 구현 기준](nestjs-api.md) — 기능 모듈, configuration, DTO validation, database 경계.
- [Next.js 웹 구조와 구현 기준](nextjs-web.md) — App Router, Server/Client Component 경계, same-origin BFF.
- [Expo 모바일 구조와 구현 기준](expo-mobile.md) — Expo Router, route와 기능 폴더 경계, API client.

이 문서들은 권장 구조다. 코드·외부 credentials가 해당 기준을 충족하기 전에는 framework 사용만으로 기능 완료나 출시 준비를 선언하지 않는다.

## 공유 계약과 배포 경계

`packages/shared`는 API route와 직렬화 가능한 DTO/type만 제공한다. 데이터베이스 접근, 비밀값, UI state, 도메인 service는 공유 패키지에 넣지 않는다. NestJS API가 단일 도메인 경계이며 Next.js와 Expo는 같은 계약을 소비한다. 웹과 API는 이미지가 따로이고 바뀐 쪽만 새 이미지로 바뀌지만 같은 릴리스로 함께 배포·롤백한다. iOS/Android 앱은 독립 배포한다.
