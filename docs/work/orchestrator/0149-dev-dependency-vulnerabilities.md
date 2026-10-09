# 0149 Dependabot 취약점 8건(개발·빌드 도구 의존성) 갱신

- 단계: 티켓
- 역할: orchestrator
- 상태: 분류 대기
- 종류: 유지보수
- 우선순위: P2 (AI 제안)
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

- [ ] 각 패키지가 운영 이미지(`apps/api`·`apps/web` 런타임)에 들어가는지 확인하고 결과를 진행 기록에 남깁니다.
- [ ] 고친 버전이 있는 것은 상위 의존성 갱신 또는 `pnpm.overrides`로 올리고 `pnpm verify`가 통과합니다.
- [ ] 고친 버전이 없거나 올릴 수 없는 것은 영향 범위(개발 도구 한정 등)와 함께 Dependabot 경보를 사유를 적어 닫거나 남깁니다.

## 범위

- 포함: 잠금 파일·`overrides` 갱신, 경보 정리.
- 제외: 메이저 업그레이드가 필요한 상위 의존성 교체(필요하면 별도 work item).

## 위험·복구

overrides가 상위 패키지와 맞지 않으면 테스트·빌드가 깨질 수 있습니다. `pnpm verify`로 확인하고, 문제가 있으면 해당 override를 되돌립니다.

## 연결

- 정책: [의존성 버전](../../development/repository-policy.md)

## 진행 기록

- 2026-10-10: 생성(AI 운영자 실행 `e1f4ffa2-d409-4be6-b34e-a2b2b9551f53`). 직전 실행이 push 때 본 Dependabot 보고를 `gh api repos/ai-worker-lab/crelink/dependabot/alerts`와 `pnpm-lock.yaml` `snapshots`로 확인. 운영 런타임 영향은 아직 확인 전이라 P2로 제안합니다.
