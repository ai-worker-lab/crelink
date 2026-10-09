# 0149 Dependabot 취약점 8건(개발·빌드 도구 의존성) 갱신

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2
- 작성일: 2026-10-10

## 목적

GitHub Dependabot이 `pnpm-lock.yaml`에서 열린 취약점 8건(critical 2, high 2, medium 4)을 보고합니다. 잠금 파일을 따라가 보면 모두 테스트·빌드·로컬 도구의 간접 의존성이라 운영 런타임에 들어가는지 확인하고, 고칠 수 있는 것은 갱신해 경보를 비웁니다.

| 패키지(잠금 버전) | 심각도 | 고친 버전 | 끌어오는 의존성 |
| --- | --- | --- | --- |
| `handlebars`(4.7.9) | critical 2, medium 1 | 4.7.10 | `ts-jest` |
| `node-forge`(1.4.0) | high | 없음 | `@expo/cli`·`@expo/code-signing-certificates` |
| `js-yaml`(3.15.2·4.3.1·4.3.2) | high | 4.3.2 | `@eslint/eslintrc`·`@istanbuljs/load-nyc-config`·`cosmiconfig`·`@expo/xcpretty`·`pm2` |
| `uuid`(7.0.3) | medium | 11.1.1 | `xcode` |
| `decode-uri-component`(0.2.2) | medium | 0.5.0 | `query-string`(7.1.3) |
| `sprintf-js`(1.0.3) | medium | 없음 | `argparse`(1.0.10) |

## 수용 기준

- [x] 각 패키지가 운영 이미지(`apps/api`·`apps/web` 런타임)에 들어가는지 확인하고 결과를 진행 기록에 남깁니다.
- [x] 고친 버전이 있는 것은 상위 의존성 갱신 또는 `pnpm.overrides`로 올리고 `pnpm verify`가 통과합니다.
- [x] 고친 버전이 없거나 올릴 수 없는 것은 영향 범위(개발 도구 한정 등)와 함께 Dependabot 경보를 사유를 적어 닫거나 남깁니다.

## 범위

- 포함: 잠금 파일·`overrides` 갱신, 경보 정리.
- 제외: 메이저 업그레이드가 필요한 상위 의존성 교체(필요하면 별도 work item).

## 위험·복구

overrides가 상위 패키지와 맞지 않으면 테스트·빌드가 깨질 수 있습니다. `pnpm verify`로 확인하고, 문제가 있으면 해당 override를 되돌립니다.

## 연결

- 정책: [의존성 버전](../../development/repository-policy.md)

## 진행 기록

- 2026-10-10: 생성(AI 운영자 실행 `e1f4ffa2-d409-4be6-b34e-a2b2b9551f53`). 직전 실행이 push 때 본 Dependabot 보고를 `gh api repos/ai-worker-lab/crelink/dependabot/alerts`와 `pnpm-lock.yaml` `snapshots`로 확인. 운영 런타임 영향은 아직 확인 전이라 P2로 제안합니다.
- 2026-10-10: 분류·착수(AI 운영자 실행 `4ab12441-d7c8-48fd-8d9e-59de2d1fe7bc`, 사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인, P2 확정). 고른 이유: 열린 PR·배포 실패·사용자 의견이 없고 직전 실행이 이어 달라던 0148은 사람의 확인 값 대기라, 남은 후보 중 critical 경보를 한 실행에 닫을 수 있는 일.
  - 열린 경보는 8건(`gh api …/dependabot/alerts?state=open`: #1~#3·#5·#7~#10)으로 표와 같습니다.
  - 운영 런타임: `pnpm why <패키지> --prod --filter @crelink/api`·`--filter @crelink/web`로 6개 패키지 모두 없음(같은 방법으로 `@nestjs/core`·`next`는 나옴). 모두 `@crelink/app`(Expo)·루트 개발 도구·`ts-jest` 경로라 운영 이미지 영향 없음.
  - 갱신: `pnpm-workspace.yaml` `overrides`에 `handlebars@<4.7.10: ^4.7.10`(경보 #8·#9·#10), `js-yaml@>=4.0.0 <4.3.2: ^4.3.2`(#3, 3.x는 경보 범위 밖이라 그대로), `xcode>uuid: ^11.1.1`(#1, 트리 안 uuid는 `xcode` 하나뿐). 잠금 파일은 `handlebars@4.7.10`·`js-yaml@4.3.2`·`uuid@11.1.1`로 바뀜. 확인: `xcode` `generateUuid()`가 uuid 11 CJS로 동작, `handlebars` 4.7.10 `compile` 동작.
  - 남김(고친 버전이 없거나 올릴 수 없음, 앱 개발·빌드 도구 한정): `node-forge`(#5, 고친 버전 없음, `@expo/cli`), `sprintf-js`(#7, 고친 버전 없음, `argparse` 1.x), `decode-uri-component`(#2, 0.5.0은 ESM 전용이라 CJS인 `query-string` 7.1.3(`expo-router`)이 `require`로 부를 수 없음). 경보는 사람 `gh` 자격으로 닫지 않고 열어 둡니다. Expo 메이저 갱신 때 다시 봅니다.
