# ADR 0004: ESLint + Prettier로 lint·format 통일

- 날짜: 2026-10-01
- 상태: 승인
- 범위: 저장소 전체 (`apps/*`, `packages/*`, `scripts/`, 루트 설정)

## 배경

- lint·format 설정이 없으면 영역마다 코드 스타일을 각자 판단하게 됩니다.
- 한 모노레포에 NestJS API, Next.js 웹, Expo 앱이 있습니다.
- 후보는 Biome(도구 하나로 lint·format, 빠르고 단순하지만 Next.js·Expo 전용 규칙 없음)와 ESLint + Prettier(업계 표준, Next.js·Expo 공식 규칙 사용 가능, 설정과 의존성이 늘어남)였고, 사용자가 ESLint + Prettier를 선택했습니다.

## 결정

1. 루트 `eslint.config.mjs` 하나에서 `files` 범위로 영역별 규칙을 나눕니다.
   - 공통(앱 제외): `@eslint/js` 권장 + `typescript-eslint` 권장.
   - 웹: `@next/eslint-plugin-next`의 recommended·core-web-vitals 규칙과 `eslint-plugin-react-hooks`.
   - 앱: Expo 공식 `eslint-config-expo/flat`. 이 설정이 자체 TypeScript·React 규칙을 포함해 공통 규칙과 겹치지 않게 앱을 공통에서 뺍니다.
   - 마지막에 `eslint-config-prettier`로 서식 규칙을 끕니다.
2. 서식은 Prettier(`.prettierrc.json`: 작은따옴표, 줄 길이 120)가 맡습니다. Markdown 문서, 생성물, `design/` 산출물, lockfile은 `.prettierignore`로 제외합니다. 문서의 표와 줄바꿈은 사람이 관리합니다.
3. 루트 `pnpm lint`(ESLint + Prettier 검사)와 `pnpm format`(Prettier 적용 후 ESLint 자동 수정)을 제공하고, CI에서 `pnpm lint`를 실행합니다.
4. 플러그인 버전은 프레임워크 버전에 맞춥니다: `@next/eslint-plugin-next`는 Next 15, `eslint-config-expo`는 Expo SDK 54(`~10.0.0`).
5. ESLint는 9를 씁니다. ESLint 10에서는 Expo 설정이 쓰는 `eslint-plugin-react`가 삭제된 API(`context.getFilename`)를 호출해 실패했고(2026-10-01 확인), 최신 `eslint-plugin-react` 7.37.5와 `eslint-plugin-import` 2.32.0의 지원 범위도 ESLint 9까지입니다.

## 결과와 트레이드오프

- Next.js·Expo의 공식 규칙을 그대로 쓰고, 영역마다 다른 설정 파일 없이 한곳에서 관리합니다.
- 개발 의존성이 늘고 lint가 Biome보다 느립니다. 타입 정보를 쓰는 규칙(typed linting)은 속도를 위해 아직 켜지 않았습니다.
- ESLint 9는 지원 종료(deprecated) 상태입니다. 개발 도구이고 배포물에 포함되지 않아 운영 위험은 작지만, `eslint-plugin-react`·`eslint-plugin-import`가 ESLint 10을 지원하면 올립니다.
- Prettier 도입 시 기존 코드 25개 파일의 서식을 한 번에 바꿨습니다(동작 변경 없음, 빌드·타입 검사·테스트 통과로 확인).
