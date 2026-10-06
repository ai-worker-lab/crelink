# 모바일 앱 변경 기록

내부 참고용으로 모바일 앱의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-01

- Expo 개발 서버 포트 기본값 숫자를 없앰: `start`·`android`·`ios`는 `EXPO_PORT`가 없으면 `pnpm instance --get EXPO_PORT`로 이 checkout 인스턴스 포트를 씀. `.env.example`의 `EXPO_PUBLIC_API_BASE_URL`은 빈 값과 형식 주석, 런타임 설정·기기 검증 문서는 `<API 포트>`·`<Expo 포트>` 자리표시자와 `pnpm instance` 안내로 바꿈. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- 런타임 설정·기기 검증 문서를 로컬 인스턴스에 맞춤: `make up`이 `apps/app/.env`를 만들고 `make app-up`의 인스턴스 값이 파일 값보다 우선함, worktree에서는 `pnpm instance`의 포트 사용(`apps/app/docs/runtime-configuration.md`, `apps/app/docs/device-testing.md`). 근거: `docs/work/0004-agents-map-and-policy-docs.md`.
- Expo 개발 서버 포트를 `EXPO_PORT` 환경변수로 받도록 변경(`start`·`android`·`ios`가 `--port ${EXPO_PORT:-8101}`, 없으면 8101). `make app-up`은 checkout 인스턴스의 `EXPO_PORT`·`EXPO_PUBLIC_API_BASE_URL`을 넘깁니다. 근거: `docs/work/0001-worktree-local-instances.md`.
- Expo + React Native + Expo Router 뼈대: 루트 레이아웃, 서비스 이름과 API·DB 준비 상태를 보여 주는 시작 화면, API 클라이언트, 공통 UI, 작업 규칙, 런타임 설정·기기 검증 문서. Expo 개발 서버 포트 8101.
