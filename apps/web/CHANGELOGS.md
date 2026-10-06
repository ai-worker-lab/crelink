# 웹 변경 기록

내부 참고용으로 웹 클라이언트의 모든 변경을 공개 여부와 관계없이 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../../docs/development/repository-policy.md#변경-기록)을 따르며, 공개 릴리스 노트는 [RELEASES](../../RELEASES.md)에 있습니다.

## 2026-10-01

- 개발 서버 포트 기본값 숫자를 없앰: `start`는 `WEB_PORT`가 없으면 `pnpm instance --get WEB_PORT`로 이 checkout 인스턴스 포트를 씀(worktree 직접 실행도 그 슬롯 포트). `.env.example`의 `API_INTERNAL_URL`은 빈 값과 형식 주석, README는 포트 자리표시자와 `pnpm instance` 안내로 바꿈. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- `apps/web/README.md`의 `.env.local` 수동 복사 안내를 `make up`/`pnpm instance` 자동 생성과 인스턴스 값 우선 규칙으로 바꿈. 근거: `docs/work/0004-agents-map-and-policy-docs.md`.
- 개발 서버 포트를 `WEB_PORT` 환경변수로 받도록 변경(`next dev --port ${WEB_PORT:-5193}`, 없으면 5193). `make web-up`은 checkout 인스턴스의 `WEB_PORT`·`API_INTERNAL_URL`을 넘깁니다. 근거: `docs/work/0001-worktree-local-instances.md`.
- Next.js App Router 뼈대: 레이아웃·오류·로딩·404, 디자인 토큰 기반 공통 스타일, same-origin BFF(`/api/backend`, `GET api/health`만 허용)와 API 클라이언트, 서비스 이름과 API·DB 준비 상태를 보여 주는 시작 화면, Pretendard 글꼴과 OFL 라이선스 고지, 작업 규칙. 개발 서버 포트 5193.
