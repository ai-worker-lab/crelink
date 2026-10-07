# 0043 웹 공개 문서 페이지(/docs)

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P2
- 작성일: 2026-10-07

## 목적

서비스 밖으로 공개해도 되는 문서(사용 안내·릴리스 노트·디자인 토큰 견본·개인정보 처리방침)를 웹 한 곳(`/docs`)에서 볼 수 있게 합니다. 내부 기록(`CHANGELOGS.md`, 운영 설계·런북)은 공개하지 않습니다.

## 수용 기준

- [x] `/docs` 목록에서 사용 안내·릴리스 노트·브랜드와 디자인·개인정보 처리방침으로 이동할 수 있고, 홈 바닥글에 `/docs` 링크가 있습니다.
- [x] `/docs/releases`는 루트 `RELEASES.md`의 첫 `## ` 제목부터 끝까지만 보여 주고, 릴리스가 없으면 빈 상태를 보여 줍니다. `CHANGELOGS.md`는 공개하지 않습니다(사용자 결정).
- [x] `/docs/brand`는 `@crelink/design-tokens` 값(색·글꼴·간격·모서리)으로 견본을 만들며 값을 따로 적지 않습니다(사용자 결정).
- [x] `/docs/guide`는 크리에이터가 가입부터 공유까지 쓰는 방법을 실제 구현된 기능과 화면 문구로 안내합니다.
- [x] `RELEASES.md`만 바뀌어도 운영 웹 이미지가 다시 빌드되고, 이미지 빌드 컨텍스트에 `RELEASES.md`가 들어갑니다.
- [x] 단축 주소 예약어에 `docs`가 있습니다.
- [x] 1280px·390px에서 가로 넘침·콘솔 오류가 없습니다.

## 범위

- 포함: `apps/web/src/app/(public)/docs/**`, 홈 바닥글, `RELEASES.md` 공개 규칙, `.dockerignore`·`apps/web/Dockerfile`·`.github/workflows/deploy.yml`의 `RELEASES.md` 반영, `packages/shared` 예약어·웹 경로.
- 제외: `CHANGELOGS.md`·내부 문서 공개, 로고·브랜드 가이드 제작, 첫 릴리스 노트 작성(공개 릴리스가 생길 때 작성).

## 위험·복구

- 공개 범위: 릴리스 노트는 `RELEASES.md` 그대로 공개되므로 내부 구현·비밀값을 넣지 않습니다(저장소 정책). 되돌리려면 `/docs/releases`를 지우거나 해당 항목을 고친 뒤 재배포합니다.
- 예약어 `docs` 추가는 이미 `docs` 단축 주소를 쓰는 크리에이터에게 영향이 없습니다(예약어 검사는 새로 바꿀 때만).

## 연결

- 정책: [저장소 공통 정책의 변경 기록](../../development/repository-policy.md#변경-기록)
- 디자인: `design/system/DESIGN.md`, 토큰 원본 `packages/design-tokens/src/tokens.json`
- 예약어: [MVP 기술 설계](../../specs/crelink-mvp.md)

## 진행 기록

- 2026-10-07: 생성. 사용자 결정: 변경 기록은 `RELEASES.md`만 공개, 디자인은 토큰 자동 견본, 개인정보 처리방침 링크와 크리에이터 사용 안내 포함.
- 2026-10-07: 구현. 화면 문구는 `components/me`·`components/manage`·`app/me`에서 확인해 인용하고 숫자는 `CRELINK_LIMITS`에서 읽음. 크리에이터용 방문·클릭 통계 화면은 없으므로 안내에 "지금은 볼 수 없음"으로 적음.
- 2026-10-07: 검증(로컬, Node 24.20.0).
  - `pnpm verify --keep-going`: tokens·work·docs·design 검사, typecheck, build(`/docs` 4개 경로 모두 ○ 정적), test(API 101건) 통과. lint는 이 checkout에 남은 Next 15 시절 개발 출력 `apps/web/.next-dev/`(Git 추적 밖, 2026-10-07 12:15 생성) 2개 파일의 Prettier 경고로만 실패. 바꾼 파일은 Prettier·ESLint 통과. `pnpm work:scope 0043`·`actionlint .github/workflows/deploy.yml` 통과.
  - 브라우저(Playwright Chromium, 개발 서버 `127.0.0.1:5193`): 홈 바닥글 `문서` → `/docs`, 문서 사이 이동의 `aria-current`가 지금 문서에만 붙음. `/docs`·`/docs/guide`·`/docs/releases`·`/docs/brand`·`/`를 320·390·1280px에서 `scrollWidth`=`clientWidth`, 콘솔 오류 0건(기존 `/favicon.ico` 404 제외).
  - 릴리스 노트: 빈 상태 "아직 공개한 릴리스가 없어요." 확인. `RELEASES.md` 끝에 시험용 `## 0.1.0 (2026-10-07)` 항목을 잠시 붙이자 그 제목과 목록만 렌더링되고 첫머리 안내는 나오지 않음(확인 뒤 되돌림).
  - 이미지: `docker build -f apps/web/Dockerfile .` 성공(`COPY RELEASES.md ./`, 빌드 경로 표에 `/docs*` ○). 읽기 전용 루트로 띄워 `/docs`·`/docs/guide`·`/docs/releases`·`/docs/brand` 200, 실행 이미지에 `RELEASES.md` 없이 빈 상태 표시. 시험 이미지는 지움.
  - 발견: 웹 글꼴이 ExtraBold 한 면만 선언돼 400·700도 같은 글리프로 그려짐(`/docs/brand` 굵기 견본이 모두 같음) → 0044(web, 분류 대기).
