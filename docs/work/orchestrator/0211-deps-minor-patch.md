# 0211 Dependabot #139 나머지 minor·patch 갱신과 고위험 경보 정리

- 단계: 티켓
- 역할: orchestrator
- 선행: 0207
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-10

## 목적

Dependabot PR #139(22개 묶음, CI 실패)를 나눠 처리하는 2단계입니다. Nest 네 패키지는 [0207](0207-nest-security-update.md)에서 끝났으므로 나머지 17개 패키지를 #139의 대상 버전으로 올리고, #139에 없는 고위험 경보를 minor·patch 범위에서 줄입니다. `@playwright/test`는 #139 smoke의 Firefox `Page crashed` 원인을 분리하기 위해 1.64에 둡니다.

## 수용 기준

- [x] #139의 나머지 17개 패키지가 #139의 대상 버전이고, `@playwright/test`·Nest 네 패키지·Expo 고정 패키지의 해석 버전은 그대로입니다.
- [x] 범위 안에서 올릴 수 있는 고위험 전이 의존성을 올리고, major 또는 정책 밖 변경이 필요한 경보는 이유와 함께 남깁니다.
- [x] `pnpm verify`, `pnpm --filter @crelink/api test`, `pnpm work:scope 0211`, `pnpm work:check`가 통과합니다.
- [x] `pnpm audit --prod`의 high·critical 수를 올리기 전후로 기록합니다.
- [ ] PR CI가 `CI 통과`이고 smoke의 Firefox 결과를 따로 확인합니다. 결과는 PR에서 확인합니다.

## 범위

- 포함: 루트·`apps/api`·`apps/web`의 `package.json`, `pnpm-lock.yaml`, 변경 기록.
- 제외: `@playwright/test` 1.65, Nest 12.4.1·12.4.2, Expo 고정 패키지(`expo`·`expo-*`·`@expo/*`), major 올림, `pnpm-workspace.yaml`의 override 추가, #139 닫기, main 병합·배포.

## 위험·복구

런타임에 닿는 변경은 `next` 16.4.5, Sentry SDK 11.11, `google-auth-library` 11.3.3(전이 `gaxios` 7.3.1→8.3.2), `@aws-sdk/client-s3`, `body-parser` 2.4.0, `marked`, `maxmind`, `bowser`입니다. 데이터·migration 변경은 없습니다. 복구는 이 변경의 revert입니다.

## 연결

- 정책: [의존성 버전](../../development/repository-policy.md#의존성-버전)
- 선행: [0207](0207-nest-security-update.md)
- 코드: `apps/api/src/auth/google-oauth.ts`, `apps/api/src/instrument.ts`, `apps/web/next.config.ts`

## 진행 기록

- 2026-11-10: 생성·착수. 17개 패키지와 대상 버전은 #139 diff에서 확인했습니다. `package.json`의 범위는 #139와 같게 두되 `next`만 `^16.4.5`로 올렸습니다. 16.4.5가 Next 보안 수정 릴리스여서 0207처럼 수정 버전 밑으로 내려가지 않게 하려는 것입니다.
- 2026-11-10 잠금 파일: `pnpm update -r --depth Infinity <전이 패키지>`는 이름 필터와 관계없이 전체를 갱신해 Playwright 1.65·Nest 12.4.2·Expo 57.0.32까지 끌어올렸으므로 버렸습니다. 대신 직접 패키지는 대상 버전으로 해석하고, 전이 5종은 저장소 밖 임시 사본에서 일회성 override로 해석한 잠금 파일을 가져온 뒤 그 override 줄을 지웠습니다. `pnpm-workspace.yaml`은 바꾸지 않았습니다. `pnpm install --frozen-lockfile`이 통과하고 다시 해석해도 잠금 파일이 바뀌지 않습니다.
- 2026-11-10 전이 의존성: `node-forge` 1.4.0→1.4.3(`^1.3.3`), `undici` 6.29.0→6.29.1(`^6.22.0`), `follow-redirects` 1.16.1→1.16.3, `body-parser` 2.3.0→2.4.0(`^2.3.0`), `zod` 4.6.5→4.6.7(`^3.25.0 || ^4.0.0`). 모두 의존하는 쪽의 선언 범위 안입니다.
- 2026-11-10 `pnpm audit --prod`: 올리기 전 critical 0·high 9·moderate 9·low 6, 올린 뒤 critical 0·high 2·moderate 6·low 3. Dependabot 경보는 main 병합 뒤 다시 계산되므로 아래 분류는 취약 범위와 잠금 파일을 대조한 판단입니다.
  - 닫힐 것으로 판단: `node-forge` #5·#31·#32·#33·#34·#38, `undici` #12·#27·#28, `follow-redirects` #24, `body-parser` #16 (11건).
  - 남는 고위험 2건은 아래 "남은 일"에 적었습니다.
- 2026-11-10 전이 major: #139의 `google-auth-library` 11.3.3이 `gaxios` `^8.3.1`을 요구해 `gaxios`가 7.3.1→8.3.2로 올라갑니다. API 시험은 `GoogleAuthLibraryOAuth`를 경계 뒤에서 대체하므로(`apps/api/test/test-app.ts`), 임시 시험(저장소에 넣지 않음)으로 로컬 가짜 Google 서버에 실제 `OAuth2Client`를 연결해 `generateAuthUrl`, `getToken`, `verifyIdToken`과 `invalid_grant`·다른 audience·위조 서명 거절을 확인했습니다. 실제 Google 호출과 운영 로그인은 확인하지 않았습니다.
- 2026-11-10 검증: `pnpm verify` 8단계 통과, `pnpm --filter @crelink/api test` 스위트 32개·테스트 263개 통과, `pnpm work:scope 0211`과 `pnpm work:check` 통과. `pnpm smoke`는 로컬에서 돌리지 않았고 PR CI의 smoke로 확인합니다.
- 2026-11-10 남은 일:
  - `zod` #23: `zod` 3.25.76이 `@expo/cli` 57.0.28(`^3.25.76`)에 남습니다. 수정판은 4.6.6 이상뿐이라 override는 major 올림입니다. `@expo/cli` 57.0.33에는 `zod` 의존이 없지만 저장소 정책상 `@expo/*`는 Expo SDK 단위로만 올립니다.
  - `decode-uri-component` #30: 0.2.2가 `query-string` 7.1.3(`expo-router` 57.0.25의 `^7.1.3`)에 남습니다. 수정판 0.5.1은 0.2.x 호환 범위 밖이고 0.4부터 ESM 전용이어서, `require`하는 `query-string` 7에 override하면 동작이 달라질 수 있습니다. 현재 최신 `expo-router` 57.0.30도 같은 범위입니다.
  - 이번 위임의 소유 경로 밖이라 고치지 않았습니다: `apps/api/docs/README.md`의 "`@sentry/nestjs` 11.4" 문구, `apps/api/CHANGELOGS.md`·`apps/web/CHANGELOGS.md` 영역 로그.
