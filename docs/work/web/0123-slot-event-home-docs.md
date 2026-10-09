# 0123 홈 이벤트 안내·이용 안내·개인정보 처리방침

- 단계: 티켓
- 역할: web
- 상위: 0089
- 선행: 0120
- 상태: 검증
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

링크 슬롯 +5 이벤트 기술 설계의 티켓 분해 0123입니다. 로그인 전 방문자가 홈에서 이벤트를 알고 가입하게 하고, 안내 문서를 맞춥니다.

## 수용 기준

- [x] 홈 `/`은 `GET /api/public/slot-event`가 `open`일 때만 이벤트 구역을 그립니다(로그인 전 `구글로 시작하기`, 로그인 후 `내 크리링에서 신청하기` → `/me`). 없음·시작 전·끝남·요청 실패면 구역이 없고 홈 나머지는 그대로입니다. 확인: 0125 E2E, 로컬 화면.
- [x] `/docs/guide` 외부 링크 한도 설명에 이벤트 보너스, `/privacy` 크리에이터 수집 항목·이용 목적·보관에 이벤트 신청 기록이 있습니다.
- [x] 390·1280px 가로 넘침 없음. `pnpm --filter @crelink/web lint`·`typecheck` 통과.

## 범위

- 포함: 위 수용 기준.
- 제외: 관리 화면(0122), 운영자 화면(0124).

## 위험·복구

해당 없음(화면·문구만).

## 연결

- 설계: [링크 슬롯 +5 이벤트 기술 설계](../../specs/crelink-slot-event.md) `화면 상태와 API 대응`·`권한·보안·개인정보`
- 디자인: `design/slot-event/handoff.md`
- 요구: [PRD](../../product/crelink.md) R24 ④⑥⑦

## 진행 기록

- 2026-10-10: 생성(0092 설계 분해).
- 2026-10-10: 구현(web, worktree `0092-slot-event-design`, 0124와 함께). 계약 `packages/shared` R24 절 그대로, mock 없이 로컬 인스턴스의 실제 API(`apps/api/src/slot-event/`)로 확인.
  - 홈: `app/(public)/page.tsx`가 세션 확인과 `serverApi<PublicSlotEventResponse>(publicSlotEvent)`를 함께 읽고 `status = 'open'`일 때만 새 `components/HomeSlotEvent.tsx`(C1~C3 문구 원문, `section`+`h2`, 기간 `<time>`·`formatDateTime`)를 대표 설명 아래·`home-actions` 위에 그림. `ServerApiError`(네트워크·5xx 등)는 조용히 카드만 뺌. 로그인 확인 오류(`session.kind = 'error'`)는 로그인 전 카드(C1). 로그인 후는 신청 여부와 관계없이 C3(설계 `디자인 검토 의견` 1).
  - 문서: `/docs/guide` `3. 외부 링크 관리`에 이벤트 항목(신청한 계정만 +5, 계정당 한 번, 기간 안, 끝나도 보너스 유지). handoff에 없는 덧붙임: 보너스를 더해도 숨긴 링크 포함 전체는 `CRELINK_LIMITS.totalLinks`개까지(한도 계산 `min(…, 50)`과 맞춤). `/privacy` 수집 항목·이용 목적·보관 기간에 각 한 줄, 머리 주석 근거에 설계 문서. 두 문서에 시행일·변경 이력 줄이 없어 고칠 것 없음.
  - BFF 허용(통합 요청): `POST api/me/slot-event/entry`, `GET·PUT api/admin/slot-event`(쿼리는 기존처럼 그대로 전달). BFF 단위 테스트 파일은 없음.
  - CSS: `styles.css` 끝 `링크 슬롯 이벤트 — 홈·운영자 (0123·0124)` 블록에 `.home-event*`(handoff `slot-event.css` 2부 그대로, `.home-event time` nowrap). 새 토큰 없음. README 화면 표·`CHANGELOGS.md` 갱신.
  - 검증(Node 22.23 기본, `pnpm verify`는 Node 24.20): `pnpm exec eslint apps/web` 오류 0, `pnpm exec prettier --check apps/web` 통과, `pnpm --filter @crelink/web typecheck`·`test`(48/48) 통과. `pnpm work:scope 0123 --base HEAD`: 내 변경은 모두 허용 경로이고 범위 밖 2개는 통합 담당의 `tests/e2e/playwright.config.ts`·`tests/e2e/slot-event.spec.ts`(통합 브랜치 기준 비교는 다른 역할 커밋 때문에 실패하므로 작업 트리만 확인, 0083 선례). `pnpm smoke` 5/5. `pnpm verify --keep-going`: tokens·work·docs·design·typecheck·build·test 통과, lint는 통합 담당이 쓰는 중인 `tests/e2e/slot-event.spec.ts`의 Prettier 서식만 실패.
  - 화면(Playwright Chromium, 실제 API, 저장소 밖 임시 스크립트로 개발 DB에 사용자·세션·신청 행을 만들고 끝에 지움): 1280·390px에서 C1·C2(끝 없음 `…부터`, 카드 안 버튼 없음, 아래 `구글로 시작하기`), C3(`내 크리링에서 신청하기` `href=/me` 보조 버튼, `내 크리링 편집` 그대로), C4(기간을 시작 전·끝남으로 바꾼 동안, 그리고 이벤트 code를 잠깐 바꿔 API 404인 동안 카드 없음·홈 그대로), `/docs/guide`·`/privacy` 문구. 모든 화면 `scrollWidth = clientWidth`, 앱 콘솔 오류 0. 기간과 code는 시드 값(`starts_at` 원래 값, `ends_at` null)으로 되돌림을 조회로 확인.
  - 확인하지 못한 것: 로그인 확인 오류(`/api/me`가 401 아닌 오류) 화면은 실제 API로 만들 수 없어 보지 않음(코드 경로는 로그인 전 카드와 같음).
