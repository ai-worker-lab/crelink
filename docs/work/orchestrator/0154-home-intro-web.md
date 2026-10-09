# 0154 홈 소개 화면 보강 구현

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-10

## 목적

[0142](../designer/0142-home-intro-redesign.md) 시안대로 로그인 전 홈(`apps/web/src/app/(public)/page.tsx`)에 예시 랜딩 모습·사용 3단계·무료로 주는 것·가입 버튼을 넣어, 검색 가이드 글·공개 랜딩 바닥글·커뮤니티에서 온 방문자가 홈에서 가입을 정할 수 있게 합니다. 실사용자 100명 목표의 모든 모집 채널이 도착하는 화면입니다.

## 수용 기준

- [x] [인계 문서](../../../design/home-intro/handoff.md)의 구성·문구 원문·상태·반응형(1280px·390px·320px)·접근성대로 로그인 전 홈이 보이고, 가입 버튼은 지금 구글 로그인 흐름(`/auth/google`) 그대로입니다(쿼리 없음).
- [x] R24 링크 슬롯 이벤트 홈 안내(`HomeSlotEvent`)가 있을 때와 없을 때 모두 인계의 배치대로 보이고, `tests/e2e/slot-event.spec.ts` 홈 단언이 통과합니다(바뀌면 같은 변경에서 고침).
- [x] 로그인한 사람의 홈과 로그인 확인 오류 화면은 인계에 적힌 대로입니다.
- [x] 무료 범위 숫자는 `CRELINK_LIMITS` 등 코드 원본에서 읽습니다. 예시 랜딩에 실제 크리에이터 데이터를 쓰지 않습니다. 새 API·DB·개인정보 수집이 없습니다.
- [x] 로컬 인스턴스에서 390px·1280px·320px 가로 넘침 0을 확인하고, 웹 변경 기록을 남깁니다.

## 범위

- 포함: `apps/web` 홈 화면·스타일, 관련 E2E 단언, 웹 변경 기록.
- 제외: 유입 경로 기록(0087), API 변경, 로그인한 홈 개편.

## 위험·복구

서버 상태가 없는 화면 변경입니다. 가입 전환이 나빠지면 PR revert로 지금 홈으로 되돌립니다.

## 연결

- 요구: [PRD](../../product/crelink.md) `목표`, R24 ④
- 디자인: [0142](../designer/0142-home-intro-redesign.md), [`design/home-intro/`](../../../design/home-intro/handoff.md)
- 관련: [0087](../product/0087-signup-source-attribution.md), 에픽 [0089](../epics/0089-slot-event.md)

## 진행 기록

- 2026-10-10: 생성·분류(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인, AI 운영자 실행 `a5b8316a-a04a-44f5-b862-0060d613d60f`). 0142 인계에서 나눈 구현 티켓입니다. 홈 E2E 단언(`tests/e2e/slot-event.spec.ts`)이 web 소유 밖이라 0151과 같이 orchestrator 역할로 둡니다. 다음 실행이 착수합니다.
- 2026-10-10: 착수·구현(AI 운영자 실행 `a55c29dc-5122-4664-b7de-2a548d5cddd5`, 브랜치 `work/0154-home-intro-web`). `page.tsx`를 로그인한 홈(`SignedInHome`, 지금 화면 그대로)과 로그인 전·오류 소개(`HomeIntro`)로 나누고, 새 `components/HomeExampleLanding.tsx`, `styles.css` `.home-*` 규칙(701px·1024px 경계), E2E 홈 `구글로 시작하기` 단언을 `.first()`로 좁힘. 웹 README `/` 행과 웹 변경 기록 갱신.
- 2026-10-10: 로컬 확인(슬롯 74, Playwright Chromium, 로그인 전). 이벤트 열림(B)·끝남(A, 로컬 DB에서 기간만 잠시 바꾸고 원래 값으로 되돌림) 모두 1280·1024·800·390·320px에서 문서 `scrollWidth = clientWidth`, `main` 넘침 0, 화면 밖 요소 0개. 1024px 이상 두 열(1280: 580px·384px)·카드 3열, 1023px 이하 한 열·카드 1열, 예시 폭 384/358/288. 제목 64(1280)·38(390·320), 구획 제목 27/22. 첫 버튼 위치 1280px A 537px(시안 측정과 같음)·B 618px, 390px A 아래 끝 296px·B 458px. 버튼 높이 50px, `사용 안내 자세히 보기` 44px·`/docs/guide`. 제목 단계 h1 → (이벤트 h2) → h2·h3×3 → h2·h3×3 → h2. 접근성 트리에 예시 틀 안 내용 없음(figure 이름 = 캡션), 키보드 순서 첫 버튼 → 사용 안내 → 마지막 버튼 → 문서 → 개인정보 처리방침. 1280·390px 스크린숏 눈으로 확인(예시 이름 굵기 맞춤 1회 수정).
- 2026-10-10: 검증(Node 24.20.0, 슬롯 74). `pnpm verify` 8개 통과, `pnpm smoke` 5개 통과, E2E `slot-event` 2개(`--project slot-event --no-deps`, 로그인 전 홈 첫 `구글로 시작하기`·로그인한 홈 `내 크리링에서 신청하기`·기간 끝 홈 안내 숨김 포함)·`notices` 2개 통과, `pnpm work:scope 0154` 통과. 의존 프로젝트 `ad-banner` 2개는 `/admin/ad-banners`의 hydration 콘솔 오류(서버 렌더 글자와 브라우저 글자가 다름)로 실패했습니다. 홈을 지나지 않는 화면이고, 분류 대기 [0126](../web/0126-format-datetime-server-locale.md)(서버 렌더 날짜 표기 차이)과 같은 원인으로 보입니다(원인 확인은 하지 않음). 이 셸 기본 Node 22에서는 API jest가 ESM require 오류로 돌지 않아 Node 24로 실행했습니다. 로그인 확인 오류 상태(E)는 화면으로 띄우지 않았고 분기 코드만 확인했습니다(지금과 같은 `form-error role="alert"`가 첫 버튼 줄 위).
- 2026-10-10: 완료(AI 운영자 실행 `d9c7ae80-fdbd-40be-9150-735983b583b4`). PR #81 squash 머지(main `7b3a796`), Deploy 37997082044 success(운영 주소 검사 포함, 실행 `d75996d3-6850-4927-aa66-a9edfba5f558` 기록).
