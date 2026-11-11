# 0234 관리 화면 주소 막대 입력형·프로필 메뉴·`주소 설정` 메뉴 제거

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P2
- 작성일: 2026-11-10

## 목적

관리 화면에서 주소는 막대에 보이는데 고치려면 다른 메뉴로 옮겨야 하고, 복사 버튼과 `주소 변경`이 막대의 자리를 차지합니다. 계정 정보도 `주소 설정` 패널 아래에 있어 찾기 어렵습니다. 2026-11-10 사용자 검토사항 4건(복사 아이콘, 주소 입력란 노출, 프로필 드롭다운, `주소 설정` 제거)을 [디자인 인계](../../../design/manager-address-bar/handoff.md)대로 구현합니다.

## 수용 기준

- [x] 1024px 이상 주소 막대: 도메인 글자 + 저장된 주소가 채워진 입력란 + 바로 옆 복사 아이콘 + 공개 페이지 열기. `주소 변경` 링크와 글자 `복사` 버튼이 없습니다.
- [x] 입력값이 저장값과 다르면 복사·열기 대신 `취소`·`변경`이 보이고, 사용 가능 확인과 이유별 문구가 막대 아래에 보입니다. 막대 높이는 60px입니다.
- [x] 저장은 `변경` → 확인 대화상자 → `이 주소로 바꾸기` 두 단계입니다. 초점이 나가거나 Enter만으로는 저장되지 않고, 넓은 화면 Enter 두 번과 390px `주소 바꾸기` 두 번 탭·Enter 두 번에 `PUT`이 나가지 않습니다.
- [x] 복사하는 값은 입력 중에도 항상 저장된 주소(`state.shortLink.url`)입니다.
- [x] 30일 제한 중에는 입력란 대신 주소 글자와 다음 변경 가능일을 보여 줍니다.
- [x] 1023px 이하: 복사 아이콘, 연필 아이콘 → 하단 시트에서 주소 변경, 잠금이면 자물쇠 → 다음 변경 가능일. 가로 넘침이 없습니다.
- [x] 관리 화면 머리글의 프로필 버튼을 누르면 이메일, (운영자만) `운영자 화면`, `로그아웃`이 보입니다. Esc·바깥 누름으로 닫히고 Esc면 초점이 버튼으로 돌아옵니다. 로그아웃하면 세션이 끊기고 홈으로 갑니다. 머리글에 로그아웃 버튼이 따로 없습니다.
- [x] 프로필 사진을 저장하면 새로고침 없이 머리글 사진이 바뀝니다.
- [x] 왼쪽 메뉴·가로 탭에 `주소 설정`이 없고, `/me/landings/{publicId}/settings`로 들어가면 `페이지 편집`에 도착합니다.
- [x] 공개 문서, PRD R18 ⑦, 기술 설계, E2E, 웹·루트 변경 기록이 새 화면과 맞습니다.
- [x] `pnpm work:scope 0234`, `pnpm verify`, `make up` 후 `pnpm smoke`가 통과합니다. E2E(`creator.spec.ts`, `operator.spec.ts`)는 PR CI에서 통과합니다. **미체크**: `work:scope`·`verify`는 통과했으나 `pnpm smoke`는 이 기기에 Playwright 브라우저가 없어 실행되지 않았고(같은 검사의 ego-lite 판은 통과), E2E는 PR CI에서 확인합니다. 아래 `진행 기록`.
- [x] 1024·1280·390·320px 실제 화면에서 상태별 배치, 가로 넘침 0, 콘솔 오류 0을 확인하고 측정값을 `진행 기록`에 남깁니다.

## 성공 기준

| 항목 | 내용 |
| --- | --- |
| 왜 하는가 | 주소를 고칠 수 있다는 것을 막대만 보고 알게 하고, 할 일이 없어진 메뉴를 없앤다 |
| 효과 지표 | 측정 불가. 지금 실사용 표본이 없고(개발실 결정 D-59) 주소 변경 사건을 따로 세지 않는다. 실사용자가 생기면 주소를 바꾼 크리에이터 비율을 다시 본다 |
| 위험과 QA 범위 | 로그아웃 동작, 이메일이 공개 페이지에 노출되지 않음, 이중 입력으로 저장되지 않음(저장하면 30일 잠김). QA는 이 세 항목만 본다 |
| 실패 시 | 운영에서 주소 변경이나 로그아웃이 깨지면 직전 릴리스로 롤백한다. 데이터 변경과 migration은 없다 |

## 범위

- 포함: `apps/web`(주소 막대, `NarrowBar`, 시트, `ProfileMenu`, 메뉴 제거, 공개 문서), `tests/e2e/creator.spec.ts`·`operator.spec.ts`·`README.md`, `docs/product/crelink.md` R18 ⑦, `docs/product/growth/profile-self-check.txt`, `docs/specs/crelink-mvp.md`, `design/first-run-guide/handoff.md`, 변경 기록.
- 제외: 새 API·공유 계약·토큰 변경, `/admin`·`/me`·홈의 머리글, 앞선 인계 문서(`preview-direct-edit`, `desktop-landing-manager`, `analytics`).

## 위험·복구

데이터·migration·권한 변경은 없습니다. 주소 변경은 저장하면 30일 동안 되돌릴 수 없어 저장 단계에 이중 입력 방지를 둡니다. 되돌리려면 이 변경을 revert합니다.

OpenDesign 예외: 이 기기에 로컬 OpenDesign이 없어 `pnpm design:check --require-lint`가 실패합니다. 새 화면이 아니라 기존 막대·머리글의 작은 변경이라 HTML 시안 없이 인계 문서로 진행하고, 구현 화면의 1024·1280·390·320px 실측으로 시안 확인을 대신합니다.

## 연결

- 디자인: [인계](../../../design/manager-address-bar/handoff.md)
- 요구: [PRD R7·R8·R17·R18](../../product/crelink.md#요구사항)
- 코드: `apps/web/src/components/manage/ManagerPreview.tsx`, `apps/web/src/components/me/ShortLinkSection.tsx`, `apps/web/src/components/CopyButton.tsx`, `apps/web/src/components/LogoutButton.tsx`, `apps/web/src/app/me/landings/[publicId]/layout.tsx`

## 진행 기록

- 2026-11-10: 생성. 사용자 검토사항을 디자이너가 평가하고 CTO가 코드와 대조해 차단 2건, 중요 6건, 사소 7건을 인계에 반영했습니다. 사용자 확인 항목(저장 2단계, 잠금 중 입력란 제거, R18 ⑦ 변경)은 개발실 자율 진행 규칙에 따라 권장안으로 진행합니다.
- 2026-11-10 구현: [인계](../../../design/manager-address-bar/handoff.md)대로 `AddressBar`·`SlugSheet`·`use-slug-change.ts`(입력·확인·저장 공용)·`ProfileMenu`를 만들고 `AddressSettings`·`ShortLinkSection`을 지웠습니다. `.ad-banner-dialog`는 `.centered-sheet`로 일반화했습니다. 공개 문서는 인계 표 외에 같은 문구가 있던 `creator-portfolio-page`도 고쳤습니다.
- 2026-11-10 인계와 다르게 정한 것(코드·화면으로 확인): ① `다시 확인`을 둘째 줄 위에 둡니다. 둘째 줄 아래에 두면 누르는 순간 입력란 초점이 나가 둘째 줄이 사라지며 버튼이 움직여 클릭이 사라졌습니다(ego-lite에서 재현, 수정 뒤 재조회 확인). ② 브라우저가 Tab 진입 때 전체 선택하므로 `onKeyUp`의 Tab에서 커서를 끝으로 옮깁니다(인계의 `전체 선택하지 않습니다`를 지키는 구현). 두 건 모두 인계 문서에 반영했습니다.
- 2026-11-10 검증 명령: `pnpm work:scope 0234` 통과, `pnpm verify` 통과(`tokens:check`·`work:check`·`docs:check`·`design:check`·`lint`·`typecheck`·`build`·`test`, 웹 단위 시험 110개), `pnpm docs:check`·`pnpm design:check` 통과(`--require-lint`는 위 OpenDesign 예외). `pnpm smoke`는 `Playwright Chromium을 실행할 수 없습니다: browserType.launch: Executable doesn't exist at .../chromium_headless_shell-1248/...`로 실패했습니다(이 맥에 브라우저 없음, `playwright install` 금지). 대신 저장소의 ego-lite 판 `tests/e2e/ego/smoke.browser.mjs`를 같은 인스턴스에 돌려 22개 통과·실패 0입니다. E2E(`creator.spec.ts`·`operator.spec.ts`)는 인계 표대로 고쳤고 TypeScript 검사만 통과시켰으며 실행은 PR CI에서 합니다.
- 2026-11-10 화면 확인(ego-lite Chromium, 합성 계정, `make up` 인스턴스): 아래 상태별로 가로 넘침 0px, 콘솔 오류 0건입니다. 콘솔에서 뺀 것은 앱 파비콘이 없는 기존 `/favicon.ico` 404, 합성 링크의 `*.e2e.test/favicon.ico` DNS 실패, 시험에서 일부러 낸 실패 응답뿐입니다. 스크린샷은 Git 밖에 두었습니다(개발실 보고서에 경로).

| 폭 | 상태 | 막대 높이 | 입력란 폭 | 메시지 높이 |
| --- | --- | --- | --- | --- |
| 1024 | 기본 / 초점 / 입력 중 30자 / 불가 / 저장 확인 / 성공 / 잠금 / 복사 성공 / 프로필 메뉴 | 60 | 기본 171.6, 입력 중 139.2 | 초점·입력 중 90.3, 복사 성공 43.4, 성공 120.9 |
| 1280 | 위와 같음 | 60 | 기본 252.4, 입력 중 278.9 | 초점·입력 중 68.9, 복사 성공 43.4, 성공 120.9 |
| 1200 · 1440 | 기본 / 입력 중 | 60 | 1200 253.6·221.2, 1440 258.4·278.9 | 68.9 |
| 900 · 768 | 좁은 막대 / 프로필 메뉴 | 막대 63 | 주소 299 한 줄 | - |
| 390 | 기본 / 복사 성공 / 시트 입력 / 30자 / 불가 / 저장 확인 / 성공 / 잠금 / 잠금 시트 / 프로필 메뉴 | 막대 115 | 주소 202 | 복사 성공 43.4 |
| 320 | 위와 같음 | 막대 115 | 주소 132 | 복사 성공 64.9 |

- 2026-11-10 이중 입력: 1280px Enter 두 번 → 대화상자 첫 초점 `취소`로 닫히고 `PUT` 0회, 초점 `변경`. 390px CDP 터치 두 번 → `주소 바꾸기`(y 788~832)와 `뒤로`(y 788~832)가 같은 높이라 `뒤로`로 돌아와 `PUT` 0회, Enter 두 번도 0회. 정상 저장은 1회였습니다. 막대 `변경` 더블클릭은 둘째 클릭이 대화상자 배경에 떨어져 바로 닫히고 `PUT` 0회입니다.
- 2026-11-10 실패 분기: `slug_taken`은 DB에서 경합을 만들어(실제 409) 불가 상태·초점 입력란, `slug_change_too_soon`은 `slug_changed_at`을 바꿔(실제 429) 잠금 전환·전체 문장 4초·초점 복사 아이콘을 넓은 화면·시트 모두 확인했습니다. 재시도 가능한 실패는 응답을 가짜로 바꿔 대화상자 안 오류·초점 `이 주소로 바꾸기`·재시도 성공을 확인했습니다.
- 2026-11-10 프로필 메뉴: 트리거 44×44, `aria-haspopup` 없음, Enter·Space로 열고 초점 유지, 다음 Tab이 패널 첫 항목, Esc는 닫고 트리거로, 바깥 누름은 닫기만, Tab으로 벗어나면 닫힘. 로그아웃 실패는 패널 유지·오류 표시·진행 중 클릭 무시(요청 1회)이고, 로그아웃하면 홈으로 가고 세션이 끊겨 관리 화면은 홈으로, `GET /api/me`는 401입니다. 프로필 저장 직후 새로고침 없이 머리글 사진이 바뀝니다. 공개 랜딩 HTML에 이메일이 없고 `/admin`·홈 머리글은 그대로입니다. 옛 `/settings`의 최종 주소는 `페이지 편집`입니다.
- 2026-11-10 미확인(이 기기·도구로 확인 불가): 실제 스크린리더 낭독, WebKit·Firefox, 실기기 모바일 키보드, iPad 14px 입력 초점 확대. 인계 `검증`에 남겼습니다.
- 2026-11-10: PR #162 CI 통과로 마지막 수용 기준을 체크했습니다. `pnpm smoke`와 E2E(`creator.spec.ts`, `operator.spec.ts` 포함)는 CI에서 통과했고, 로컬 `pnpm smoke`는 Playwright 브라우저가 없어 실행하지 못했습니다. 머지 `39f2964`, Deploy 성공.
