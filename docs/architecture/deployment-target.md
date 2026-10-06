# 배포 대상 아키텍처

**상태: 계획 중.** 다음은 프로덕션 배포 목표이지, 현재 배포되었거나 자동화된 구성이라는 뜻은 아닙니다. 코드·서비스 설정과 달라지면 구현을 기준으로 이 문서를 같은 변경에서 갱신합니다.

환경별 구성 상태는 [infra/dev](../../infra/dev/README.md), [infra/prod](../../infra/prod/README.md)에, 설정·비밀값 소유권은 [환경과 비밀값 관리](../development/environment-secrets.md)에 기록합니다. 실행 가능한 로컬 설정은 [infra/local/compose.yaml](../../infra/local/compose.yaml)이며 원격 배포 명령이 아닙니다.

## 목표 배치

- **웹 클라이언트:** Next.js 앱을 Vercel에서 제공. 도메인 API는 NestJS에 둔다.
- **API:** Oracle Cloud Infrastructure의 ARM 서버(목표 사양 2 OCPU, 12 GB RAM)에 NestJS API 실행.
- **캐시:** 프로덕션 캐시 제품과 실행 위치는 미정입니다. 로컬 Compose의 Valkey 설정은 프로덕션 배포 결정을 의미하지 않습니다. 제품별 비교는 [Redis와 Valkey 레퍼런스](../references/redis-vs-valkey.md)를 참고하세요.
- **관계형 데이터베이스:** Supabase 관리형 PostgreSQL 사용. API에서 TLS 연결을 사용하며 데이터베이스 포트를 공개 인터넷에 열지 않습니다.
- **모바일:** Expo + React Native 앱은 Apple App Store와 Google Play를 대상으로 한다.
- **공개 시점·순서:** 미정입니다. MVP 범위가 정해진 뒤 결정합니다.

## 운영상 경계

- Supabase는 PostgreSQL 관리 서비스입니다. 저장소의 local Compose PostgreSQL은 로컬 개발 전용이며, Supabase 프로젝트나 schema를 자동으로 생성하지 않습니다.
- Next.js용 Vercel 배포 설정, API 컨테이너 이미지, Oracle 서버 프로비저닝, TLS·비밀 관리, Supabase migrations 및 백업은 아직 저장소에서 구성되지 않았습니다.
- `infra/local/.env.example`의 자격 증명은 개발 전용입니다. 원격 비밀값은 환경·서비스별로 분리해 주입하고 Git에 커밋하지 않습니다. 실제 주입 수단은 배포 구성 시 정합니다.
- Oracle 서버의 2 OCPU/12 GB 제한을 고려해 API 자원 사용량을 확인합니다. 캐시를 함께 운영하기로 하면 제품·메모리 제한·eviction 정책·백업·복구·가용성을 함께 결정해야 합니다.
- API는 Supabase PostgreSQL에 대해 TLS를 요구합니다. 연결 수 제한·pooling 설정은 배포 구성 때 검증합니다.

## 프레임워크별 구현 구조

프레임워크 best practice와 권장 디렉터리 구조는 각각 별도 문서로 관리한다. 각 문서는 공식 framework 문서를 근거로 하며, 현재 골격과의 차이를 추적한다.

- [NestJS API 구조와 구현 기준](nestjs-api.md) — 기능 모듈, configuration, DTO validation, database 경계.
- [Next.js 웹 구조와 구현 기준](nextjs-web.md) — App Router, Server/Client Component 경계, same-origin BFF.
- [Expo 모바일 구조와 구현 기준](expo-mobile.md) — Expo Router, route와 기능 폴더 경계, API client.

이 문서들은 권장 구조다. 코드·외부 credentials가 해당 기준을 충족하기 전에는 framework 사용만으로 기능 완료나 출시 준비를 선언하지 않는다.

## 공유 계약과 배포 경계

`packages/shared`는 API route와 직렬화 가능한 DTO/type만 제공한다. 데이터베이스 접근, 비밀값, UI state, 도메인 service는 공유 패키지에 넣지 않는다. NestJS API가 단일 도메인 경계이며 Next.js와 Expo는 같은 계약을 소비한다. 웹과 API, iOS/Android 앱은 각각 독립 배포한다.
