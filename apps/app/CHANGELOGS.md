# 모바일 앱 변경 기록

내부 참고용으로 모바일 앱의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-07

- Expo SDK 54 → 57 업그레이드(`expo` ~57.0.27, React Native 0.86.3, React·React DOM 19.2.3, `expo-router` ~57.0.25, `expo-status-bar` ~57.0.1, `react-native-safe-area-context` ~5.7.0, `react-native-screens` ~4.26.2, `@types/react` ~19.2.0). `npx expo install expo@^57.0.0 --fix`와 SDK 55·56·57 릴리스 노트의 breaking changes를 따름. 근거: work item 0039(의존성 LTS 메이저 업그레이드), `apps/app/package.json`.
  - `expo-router` 57이 의존하는 `react-native-drawer-layout`의 필수 peer(`react-native-reanimated`·`react-native-gesture-handler`)와 `react-native-worklets`의 peer(`@react-native/metro-config`)를 pnpm이 SDK와 맞지 않는 최신 버전(reanimated 4.7·worklets 0.13·metro-config 0.87)으로 자동 설치해, SDK 57 값(`react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, `react-native-gesture-handler` ~2.32.0, `@react-native/metro-config` 0.86.3)으로 명시함. `expo-router`의 필수 peer `expo-linking`·`expo-constants`·`@expo/metro-runtime`도 SDK 57 값(~57.0.12·~57.0.21·~57.0.16)으로 명시(명시하지 않으면 기존 락파일의 SDK 54용 `expo-linking` 8.0.12·`@expo/metro-runtime` 6.1.2가 남음).
  - TypeScript는 `~5.9.3` 유지: SDK 56부터 `expo install --fix`가 TypeScript 6.0.3을 넣지만 SDK가 요구하지 않으므로 `package.json`의 `expo.install.exclude`에 `typescript`를 둠.
  - `app.json` `plugins`에 `expo-status-bar` 추가(SDK 56 config plugin, `--fix`가 추가). SDK 55부터 edge-to-edge 필수라 no-op이 된 `<StatusBar backgroundColor>` 제거(`app/_layout.tsx`).
  - 루트 `eslint-config-expo`를 `~57.0.2`로 올림. 새 규칙(`react-hooks/set-state-in-effect`)에 맞춰 시작 화면의 API·DB 상태 확인이 effect 본문에서 상태를 동기로 바꾸지 않고 응답 콜백에서만 바꾸도록 고침. 첫 확인은 초기 상태가 loading, "다시 시도"만 loading으로 되돌림(동작 같음, `app/index.tsx`).
  - SDK 56부터 `expo/fetch`가 전역 `fetch` 기본 구현이라 `src/lib/api/client.ts`의 요청도 이를 씀(코드 변경 없음, 되돌리려면 `EXPO_PUBLIC_USE_RN_FETCH=1`).
  - 기기 검증 문서에 SDK 57용 Expo Go 재설치·스토어 미배포 안내, 런타임 설정 문서에 Xcode 26.4·iOS 16.4·Xcode 27 scene 생명주기(`ios.enableSceneSupport`) 안내 추가.

## 2026-10-01

- Expo 개발 서버 포트 기본값 숫자를 없앰: `start`·`android`·`ios`는 `EXPO_PORT`가 없으면 `pnpm instance --get EXPO_PORT`로 이 checkout 인스턴스 포트를 씀. `.env.example`의 `EXPO_PUBLIC_API_BASE_URL`은 빈 값과 형식 주석, 런타임 설정·기기 검증 문서는 `<API 포트>`·`<Expo 포트>` 자리표시자와 `pnpm instance` 안내로 바꿈. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- 런타임 설정·기기 검증 문서를 로컬 인스턴스에 맞춤: `make up`이 `apps/app/.env`를 만들고 `make app-up`의 인스턴스 값이 파일 값보다 우선함, worktree에서는 `pnpm instance`의 포트 사용(`apps/app/docs/runtime-configuration.md`, `apps/app/docs/device-testing.md`). 근거: `docs/work/0004-agents-map-and-policy-docs.md`.
- Expo 개발 서버 포트를 `EXPO_PORT` 환경변수로 받도록 변경(`start`·`android`·`ios`가 `--port ${EXPO_PORT:-8101}`, 없으면 8101). `make app-up`은 checkout 인스턴스의 `EXPO_PORT`·`EXPO_PUBLIC_API_BASE_URL`을 넘깁니다. 근거: `docs/work/0001-worktree-local-instances.md`.
- Expo + React Native + Expo Router 뼈대: 루트 레이아웃, 서비스 이름과 API·DB 준비 상태를 보여 주는 시작 화면, API 클라이언트, 공통 UI, 작업 규칙, 런타임 설정·기기 검증 문서. Expo 개발 서버 포트 8101.
