# 0016 크리링 MVP API 구현

- 단계: 티켓
- 역할: api
- 상위: 0014
- 선행: 0015
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

확정 계약대로 인증, 크리에이터 편집, 공개 랜딩, 단축 도메인 리디렉트·기록, 운영자, 보존 작업을 구현합니다.

## 수용 기준

- [x] migration이 빈 DB에 적용되고 설계 `데이터 모델`의 테이블이 생긴다.
- [x] 설계 `API 계약 초안`의 경로가 성공·오류 응답을 통합 테스트로 확인된다(`pnpm verify`).
- [x] 통합 테스트: 가입 트랜잭션, 주소 규칙(예약어·중복·30일·90일 연결), 한도, 도메인 차단, 방문·클릭 기록 항목, 보존 작업, 권한(타인 리소스 404, 크리에이터의 admin 403).
- [x] `make up` 후 `curl`로 `GET {SHORT}/{slug}`가 302와 `cl_vid` 쿠키를 주고 `visits` 행이 생긴다.

## 범위

- 포함: `apps/api/**`, `packages/shared/**`(계약 보정 시).
- 제외: 웹, 루트 스크립트.

## 위험·복구

새 테이블만 추가합니다. 구글 키가 없으면 로그인 API는 503 `auth_not_configured`.

## 연결

- 설계: [docs/specs/crelink-mvp.md](../../specs/crelink-mvp.md)
- 요구: R1~R15

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 구현. migration `apps/api/migrations/0001_crelink_mvp.sql`, 모듈 `auth`·`files`·`creator`(편집·공개 랜딩)·`admin`(운영자·통계)·`short-link`(단축 도메인, `/api` 밖)·`retention`(보존 작업). 의존성 `google-auth-library` 11.1.0(Apache-2.0), `bowser` 2.14.1(MIT), `maxmind` 5.0.7(MIT), 개발 `@nestjs/testing`·`@types/express`·`@types/multer`(MIT), 각각 `npm view <pkg> license`로 확인. 방문자 IP는 소켓 주소만 씀(`X-Forwarded-For` 불신, 근거 `apps/api/docs/README.md#방문자-ip`). 통합 테스트 `apps/api/test/{auth,creator,short-link,admin}.e2e-spec.ts`(구글 code 교환은 `GoogleOAuth` provider 교체).
- 2026-10-06: 검증. `make infra-up` 후 `pnpm verify` 통과(tokens·work·docs·design check, lint, typecheck, build, test — API 7 suites 48 tests). 이 checkout의 슬롯 0 포트(API 3020·웹 5193)를 주 checkout의 실행 중인 서비스가 쓰고 있어 `make up` 대신 빌드한 API(`node apps/api/dist/main.js`)를 `PORT=3320`·별도 DB로 띄워 확인: `GET /api/health/ready` 200, `GET /nosuchslug` 302 `http://127.0.0.1:5193/notice?reason=link_not_found`, DB에 넣은 크리에이터의 `GET /curlslg` 302 `…/p/curlland01` + `Set-Cookie: cl_vid=<UUID>; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`, `visits` 행(slug·visitor_id·ip 127.0.0.1·referrer_host·mobile/Safari/iOS) 생성. `make up` 기준 마지막 수용 기준은 통합 checkout에서 확인 필요.
- 2026-10-06: 계약 차이(packages/shared 변경 없음): `OperatorCreatorStats.linkClicks[].linkId`는 링크 공개 ID(클릭 주소의 값), 같은 주소로 바꾸는 `PUT /api/me/short-link/slug`는 200 무변경, 목록에 없는 `/api` 경로는 404 `not_found`, 예상하지 못한 오류는 500 `internal_error`.
- 2026-10-06: 통합(0018). 주 checkout `make up` 인스턴스에서 `curl` `GET /nosuch` 302 `…/notice?reason=link_not_found`, `GET /api/auth/google/start` 503 `auth_not_configured`(키 없음), `pnpm e2e` 방문자 시나리오가 단축 URL 302·`cl_vid`·`visits` 행 항목을 확인. GeoIP 파일이 있을 때 PM2가 `GEOIP_MMDB_PATH`를 넘겨 경고 없이 기동. 상태 `완료`.
