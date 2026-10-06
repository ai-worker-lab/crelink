# NestJS API 구조와 구현 기준

**상태: 구현 기준.** 이 문서는 crelink의 NestJS 11 + TypeScript API 구조, 계층 경계, 데이터 규칙을 정의한다. 배포 위치와 환경 상태는 [배포 대상 아키텍처](deployment-target.md)를 참고한다.

## 책임 경계

NestJS는 유일한 도메인 API다. 권한, PostgreSQL 변경, 업무 규칙을 소유한다. Next.js는 표현·SSR, Expo는 네이티브 UI만 담당한다. `packages/shared`에는 직렬화 가능한 DTO와 경로 상수만 둔다. 데이터베이스 접근·도메인 service·비밀값은 공유 패키지에 두지 않는다.

## 권장 소스 구조

```text
apps/api/src/
  main.ts                         # 앱 생성, 공통 HTTP 정책, listen
  app.module.ts                   # 의존성 composition root
  config/
    configuration.ts              # 환경변수 스키마·검증
  common/
    filters/                       # 공통 ApiError 응답 변환
    validation/                    # 공통 DTO/schema helpers
  database/
    database.module.ts
    database.service.ts            # pg pool, query, transaction
    migrations/                    # 순서가 있는 SQL migrations
  <feature>/                       # 기능 모듈: module, controller, service, dto
  health/                          # health/readiness endpoint
```

기능 모듈은 제품 범위가 정해진 뒤 실제 기능 단위로 추가한다. 각 기능 모듈은 해당 기능의 controller와 service를 함께 소유한다. Controller는 HTTP 입력·상태 코드·응답에 집중하고, service는 유스케이스와 transaction을 수행한다. SQL 접근은 DatabaseService를 주입받은 service에서만 수행한다. 다른 모듈에는 필요한 provider만 `exports`로 공개한다. 모든 provider를 전역 등록하거나, 모든 경로를 단일 controller/service에 넣지 않는다.

## 애플리케이션 경계

- `main.ts`: `/api` prefix, CORS allowlist, 공통 `ValidationPipe`, 예외 필터, shutdown lifecycle을 설정한다. 비즈니스 로직을 넣지 않는다.
- `app.module.ts`: `ConfigModule`, `DatabaseModule`, feature module을 조합한다.
- 설정: Nest `ConfigModule`에서 환경을 읽고 시작 시 필수 값·형식을 검증한다. 비밀값은 `.env.example`에 예시 이름만 제공하고 안전한 실제 비밀값을 기본값으로 넣지 않는다.
- 입력 검증: NestJS 11에서는 요청 경계의 DTO class를 `class-validator`/`class-transformer`와 전역 `ValidationPipe`로 검증한다. 다른 runtime schema library를 선택하면 명시적인 custom pipe를 연결한다. TypeScript interface와 공유 DTO만으로 입력 검증을 대체하지 않는다. 알 수 없는 필드는 거부하고 문자열 길이·열거형·페이지 경계를 제한한다.
- 데이터: `pg` 쿼리는 bind parameter를 사용한다. 여러 행을 함께 바꾸는 변경은 원자적 transaction으로 처리한다. Migration 실행은 다중 API 인스턴스에서도 중복 적용되지 않게 잠근다.
- 권한: 인증·권한 검사가 필요해지면 guard와 service의 리소스 소유권 검사를 분리한다. 방식은 해당 요구가 생길 때 결정한다.
- 비동기 작업: 예약·반복 작업이 필요해지면 모듈의 job/provider로 격리하고, 여러 인스턴스에서 중복 실행되지 않도록 DB lock/unique key를 사용한다.
- 오류: API 전체에서 `{code, message}` 형태(`@crelink/shared`의 `ApiError`)를 일관되게 반환하고 비밀·SQL 내용을 오류 응답에 포함하지 않는다.

## 검증 기준

기능별 transaction에는 동시 요청, duplicate request, 소유권, 경계값 테스트를 둔다. 브라우저·앱에서 전달한 DTO가 아닌 실제 PostgreSQL 상태로 결과를 확인한다. 외부 제공자는 실제 자격 증명과 테스트 계정이 없으면 production 성공으로 간주하지 않는다.

## 조사 근거

- [NestJS Modules](https://docs.nestjs.com/modules): 기능 모듈, 명시적 import/export, 모듈 encapsulation을 권장한다. 모든 기능을 global module로 만드는 것은 권장하지 않는다.
- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration): `ConfigModule`/`ConfigService`를 통한 환경별 설정 로딩을 설명한다.
- [NestJS Validation](https://docs.nestjs.com/techniques/validation): DTO class decorators와 `ValidationPipe`를 이용해 요청 데이터를 런타임 검증하는 패턴을 설명한다.
- [NestJS Guards](https://docs.nestjs.com/guards): 접근 제어를 guard로 분리하는 패턴을 설명한다.

## 현재 저장소와의 차이

`apps/api/src`는 초기 골격이다. `main.ts`가 `apps/api/.env`를 로드하고 `app.setup.ts`의 `configureApp`으로 `/api` prefix를 적용한 뒤 `PORT`에서 listen한다. `PORT`는 기본값 없이 필수이며 없으면 `PORT is required` 오류로 종료한다(로컬 값은 `pnpm instance`가 `apps/api/.env`에 채운다). 통합 테스트도 같은 `configureApp`을 쓴다. `AppModule`은 `DatabaseModule`과 `HealthModule`만 조합하며, 파일은 디렉터리별 계층이 아니라 평탄하게 배치되어 있다. `Database`(`database.ts`)는 `pg` pool을 만들고 시작 시 `runMigrations`로 advisory lock 아래에서 `apps/api/migrations/*.sql`을 이름 순으로 한 번씩 적용한다(디렉터리가 없으면 건너뜀). `AppConfig`(`config.service.ts`)는 `DATABASE_URL`만 검사하며 `ConfigModule`, 전역 `ValidationPipe`, 예외 필터, CORS 설정은 아직 없다. 경로는 프로세스 응답만 보는 liveness `GET /api/health`(`{ status: 'ok' }`)와 DB에 `SELECT 1`을 질의하는 readiness `GET /api/health/ready`(`{ status: 'ready' }`, DB를 쓸 수 없으면 503과 `ApiError` `database_unavailable`)뿐이며 도메인 기능 모듈은 없다. pool은 연결 대기 제한(5초)을 두고, DB가 idle 연결을 끊을 때의 pool `error` 이벤트를 로그로 처리해 프로세스가 종료되지 않게 한다. 통합 테스트는 `apps/api/test/`에 있으며 일회용 PostgreSQL 데이터베이스에서 기동·liveness·readiness(실행 중 DB 제거 포함)·migration 적용을 확인한다.
