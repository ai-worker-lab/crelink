# 0207 Nest 12.4.0 보안 갱신(multer 2.5.0)

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-09

## 목적

잠금 파일의 `multer` 2.4.0을 고위험 취약점(Dependabot 경보 #11, GHSA-q7qp-rjg7-q26m, 영향 `>= 2.0.0, < 2.5.0`, 고친 버전 2.5.0)이 고쳐진 버전으로 올립니다. `multer`는 `apps/api/src/files/files.controller.ts`의 `FileInterceptor`가 쓰는 운영 런타임 의존성입니다. Dependabot PR #139(22개 묶음, CI 실패)를 나눠 처리하는 첫 단계로, `multer`가 달려 있는 Nest 패키지 묶음만 #139의 대상 버전으로 올립니다.

## 수용 기준

- [x] `@nestjs/common`·`@nestjs/core`·`@nestjs/platform-express`·`@nestjs/testing`이 12.4.0이고 잠금 파일의 `multer`가 2.4.0보다 높습니다.
- [x] 올리기 전후로 영향 경로의 응답을 메서드·인증별로 비교해 차이를 그대로 기록합니다.
- [x] `pnpm verify`, `pnpm --filter @crelink/api test`, `pnpm work:scope 0207`, `pnpm work:check`가 통과합니다.

## 범위

- 포함: `apps/api/package.json`의 Nest 네 패키지 버전, `pnpm-lock.yaml`의 해당 패키지와 전이 의존성, `apps/api/test/health.e2e-spec.ts`의 라우트 비교, 변경 기록.
- 제외: #139의 나머지 항목(Sentry·Playwright·pm2 등)과 그 smoke Firefox `Page crashed`, Nest 12.4.1·12.4.2, #139 닫기.

## 위험·복구

Nest 12.2부터 제외 경로마다 404 전용 핸들러가 붙어 글자 그대로 `:`가 든 주소 네 개의 응답이 바뀝니다(진행 기록의 비교). 데이터·migration 변경은 없습니다. 복구는 이 변경의 revert이며, 그러면 `multer`도 2.4.0으로 돌아갑니다.

## 연결

- 정책: [의존성 버전](../../development/repository-policy.md#의존성-버전)
- 코드: `apps/api/src/app.setup.ts`, `apps/api/src/short-link/short-link.controller.ts`(`SHORT_DOMAIN_ROUTES`), `infra/prod/Caddyfile`

## 진행 기록

- 2026-11-09: 생성·착수. #139 diff에서 대상 버전 12.4.0을 확인했습니다. #139는 Nest specifier를 `^12.1.2`로 뒀지만 수정 버전 밑으로 내려가지 않도록 `^12.4.0`으로 올렸습니다. `^12.4.0`을 그대로 풀면 12.4.2가 되므로 잠금 파일을 12.4.0으로 맞췄고 `pnpm install --frozen-lockfile`이 통과합니다. 전이 변경은 `express` 5.2.1→5.3.0, `multer` 2.4.0→2.5.0, `content-disposition` 1.1.0→2.0.1, `file-type` 22.1.1→22.3.0, `strtok3` 10.3.5→10.7.0, `@tokenizer/inflate` 0.4.1→0.6.0, `tslib` 2.9.1 추가입니다.
- 2026-11-09 응답 비교: 임시 시험(저장소에 넣지 않음)으로 `createTestApp`·`configureApp`, 실제 PostgreSQL과 HTTP 요청에서 메서드 35개 × 경로 53개 × 인증 5종(비로그인·크리에이터·운영자·잘못된 Bearer·AI 토큰) 9,275건을 올리기 전후로 비교했습니다. `main.ts` 빌드본으로는 돌리지 않았습니다. 차이는 644건이고 그중 4건은 운영자·AI 계정의 무작위 ID가 마스킹되지 않아 생긴 것이라 실제 차이는 640건입니다.
  - `/:slug`, `/c/:linkPublicId`, `/a/:bannerPublicId/:landingPublicId`, `/b/:bannerPublicId`를 글자 그대로 요청한 경우만 달라졌습니다. 31개 메서드의 620건은 404 Express HTML이 404 JSON `not_found`로, `OPTIONS` 20건은 200 `Allow: GET, HEAD`가 404 JSON `not_found`로 바뀌었습니다. 네 주소의 `GET`·`HEAD`는 302 `link_not_found`로 같습니다.
  - 실제 단축 주소 형식 8종과 `/api/*`의 차이는 0건, 새로 2xx·3xx가 된 요청 0건, 401·403이 다른 상태로 바뀐 요청 0건입니다.
  - 원인: `@nestjs/core`·`@nestjs/platform-express` 배포본을 비교해 12.1.2에는 없고 12.2.0부터 12.4.2까지 있는 코드임을 확인했습니다. `express-adapter.js`의 `setNotFoundHandler`가 제외 경로마다 `this.instance.all(...)`로 `NotFoundException`만 던지는 핸들러를 답니다. `SHORT_DOMAIN_ROUTES`가 `\:`로 이스케이프되어 글자 그대로의 `:` 주소에만 걸리며, 이 때문에 Express 라우트 표가 35개 메서드 × 4경로 140개 늘었습니다. express 5.3.0 단독 영향은 따로 시험하지 않았습니다.
  - 운영 노출: `infra/prod/Caddyfile`의 단축 호스트는 `GET`과 영숫자 정규식에 맞는 경로만 API로 넘기므로 네 주소는 도달하지 못합니다. 운영에서 직접 확인하지는 않았고 웹 BFF 경로는 확인하지 않았습니다.
- 2026-11-09 결정: 개발실 조정자가 before/after를 다시 집계해 위 차이를 수용했습니다. `pnpm-lock.yaml`이 `api`의 `owns`에 없어 0149 선례대로 역할을 `orchestrator`로 두고, 라우트 비교에서는 `\:`가 든 항목만 빼며 기존 `GET` 단축 라우트 네 개 단언은 유지합니다. 버전은 12.4.0을 유지합니다.
- 2026-11-09 검증: `pnpm verify` 8단계 통과, `pnpm --filter @crelink/api test` 스위트 32개·테스트 263개 통과, `pnpm work:scope 0207`과 `pnpm work:check` 통과. 잠금 파일의 `multer`는 2.5.0입니다. 업로드 경로는 `test/file-storage.e2e-spec.ts`·`test/upload-animated.e2e-spec.ts`가 2.5.0에서 통과했습니다. `pnpm smoke`는 로컬에서 돌리지 않았고 PR CI의 smoke로 확인합니다.
- 2026-11-09 남은 일: `apps/api/docs/README.md`의 단축 도메인 설명("`/api` 밖 라우트가 정확히 이 네 정의뿐")은 이번 위임의 소유 경로 밖이라 고치지 않았습니다. `\:` 항목을 뺀다는 내용을 반영해야 합니다.
