# 로그인 전 홈 소개 화면 인계

로그인 전 홈 `/`를 처음 온 사람이 "크리링 랜딩이 어떻게 생겼고, 무엇을 무료로 받는지" 알고 가입을 정할 수 있는 소개 화면으로 늘리는 시안입니다. 검색 가이드 글, 공개 랜딩 바닥글 `나도 크리링 만들기`, 커뮤니티 소개 글이 모두 이 화면으로 옵니다. 실사용자 100명 목표([PRD 목표](../../docs/product/crelink.md#목표))의 공통 도착지입니다. 상태: **디자인 승인**(사용자 위임(2026-10-10, [ADR 0015](../../docs/adr/0015-ai-operator.md))에 따른 AI 승인, [0142 진행 기록](../../docs/work/designer/0142-home-intro-redesign.md#진행-기록)).

## 대상

- work item: [0142 홈 소개 화면 보강 디자인](../../docs/work/designer/0142-home-intro-redesign.md), 구현 티켓 [0154](../../docs/work/orchestrator/0154-home-intro-web.md)
- 제품 요구: [PRD](../../docs/product/crelink.md) `목표`, R1(인스타그램 프로필 링크), R6(무료 단축 주소 1개), R8(주소 변경), R13(무료 외부 링크 5개), R15(구글 로그인), R16(390·1280px), R24 ④(홈 이벤트 안내). 근거: [초기 사용자 모집 조사](../../docs/product/research/initial-user-acquisition.md#결론)(무료 단축 주소·무료 주소 변경을 홈에서 알림)
- 이어 쓰는 디자인: [링크 슬롯 이벤트](../slot-event/handoff.md#홈-)(홈 이벤트 카드 C1~C4), [공개 랜딩 바닥글 가입 유도](../landing-footer-cta/handoff.md)(이 화면으로 들어오는 입구, 예시 안 바닥글 모양), [첫 사용 안내](../first-run-guide/handoff.md)(3단계 문구의 짝)
- OpenDesign 프로젝트: 쓰지 않았습니다. 지금 홈의 제목·설명·버튼·이벤트 카드를 그대로 두고 기존 구성 요소(카드·주요 버튼·휴대폰 틀·공개 랜딩 모양)만 조합하는 화면이라, 새 생성 run 없이 기존 산출물 패턴과 `design/system/DESIGN.md`·`tokens.css`로 정적 HTML을 직접 썼습니다([바닥글 가입 유도](../landing-footer-cta/handoff.md#대상)와 같은 방식).
- 대표 파일: [index.html](index.html) — 상태 A~E를 1280px·390px(상태 C는 320px)로 그렸습니다. 구현 대상은 **로그인 전 홈의 소개 구획**(`.home-intro` 이하)입니다. 이벤트 카드·로그인한 홈·공개 랜딩 모양은 지금 구현을 옮겨 그린 것입니다.

## 화면 구성

위에서 아래로 이 순서입니다. 로그인 전(`session.kind = 'signed-out'`)과 로그인 확인 오류(`'error'`)에서만 그립니다.

| 순서 | 구획 | 내용 | 지금과 비교 |
| --- | --- | --- | --- |
| 1 | 첫 화면(`.home-hero`) | 왼쪽(1023px 이하는 위): `크리링` 글자 표시, 제목(h1), 설명 한 줄, [이벤트 카드], `구글로 시작하기`. 오른쪽(1023px 이하는 아래): 예시 랜딩 | 글·버튼·이벤트 카드는 지금 그대로. 예시 랜딩과 두 열 배치가 새로 생김 |
| 2 | 예시 랜딩(`.home-example`) | 휴대폰 틀 안의 가상 크리에이터 랜딩 + `예시 화면` 표시 + 설명 캡션 | 새로 생김 |
| 3 | 사용 3단계(`.home-section`) | h2 `이렇게 시작해요`, 단계 카드 3개, 글자 링크 `사용 안내 자세히 보기` | 새로 생김 |
| 4 | 무료로 쓸 수 있는 것(`.home-section`) | h2 `무료로 쓸 수 있어요`, 카드 3개, 광고 안내 한 줄 | 새로 생김 |
| 5 | 마지막 가입(`.home-final`) | h2, 한 줄, `구글로 시작하기` | 새로 생김 |
| 6 | 바닥글(`.site-footer`) | `문서` · `개인정보 처리방침` | 바꾸지 않음 |

- 예시 랜딩은 첫 화면 구획 안(두 번째 열)에 있습니다. 1023px 이하에서는 첫 버튼 바로 아래로 내려옵니다.
- 화면 위쪽 머리글·떠 있는 버튼·고정 띠는 두지 않습니다.

## 상태와 전이

[index.html](index.html)의 상태입니다. 상태는 서버 렌더 한 번에 정해지고 화면 안에서 바뀌지 않습니다(지금 `page.tsx`의 `readSession`·`readOpenSlotEvent` 그대로).

| 상태 | 언제 | 보이는 것 |
| --- | --- | --- |
| A · 이벤트 없음 | 로그인 전, `slotEvent = null`(이벤트 없음·시작 전·끝남·조회 실패) | 구성 1~6. 이벤트 카드 자리를 비워 두지 않고 설명 다음에 바로 버튼 줄 |
| B · 이벤트 진행 중 | 로그인 전, `slotEvent.status = 'open'` | A + 첫 화면 설명 아래·첫 버튼 위에 이벤트 카드(지금 `HomeSlotEvent signedIn={false}`, 카드 안 버튼 없음) |
| C · 320px | A·B의 최소 폭 | 같은 구성. 가로 넘침 없음(아래 [검증](#검증)) |
| D · 로그인함 | `session.kind = 'signed-in'` | **지금 화면 그대로**(아래 [로그인한 홈](#로그인한-홈)) |
| E · 로그인 확인 오류 | `session.kind = 'error'` | A 또는 B와 같고, 첫 버튼 줄 바로 위에 지금 오류 줄 `로그인 상태를 확인하지 못했어요. {message}`(`role="alert"`). 마지막 버튼 위에는 되풀이하지 않음 |

- 로딩 상태: 홈은 서버 렌더이고 `loading.tsx`를 두지 않으므로 소개 구획만의 로딩 모양은 없습니다. 새로 불러오는 데이터가 없습니다.
- 빈 상태·오류 상태: 소개 구획은 고정 문구라 비거나 실패하지 않습니다. 이벤트 조회 실패는 지금처럼 카드만 빠집니다(A).
- 시안 E의 오류 문장 뒤 `잠시 뒤 다시 시도해 주세요.`는 표시용 예시이고 실제로는 지금처럼 `session.message`를 붙입니다.

## 문구 원문

| 자리 | 문구 |
| --- | --- |
| 글자 표시 | `크리링`(지금 그대로) |
| 제목 h1 | `인스타그램 프로필 링크 하나로 나를 소개하세요.`(지금 그대로) |
| 설명 | `크리링은 SNS 채널·포트폴리오·외부 링크를 한 페이지에 모아 짧은 주소로 전하는 크리에이터 랜딩페이지예요.`(지금 그대로) |
| 첫 버튼 | `구글로 시작하기`(지금 그대로) |
| 예시 표시(휴대폰 틀 왼쪽 위) | `예시 화면` |
| 예시 캡션(`figcaption`) | `가상의 크리에이터로 만든 예시 화면이에요.` |
| 예시 안 이름 / 소개 | `예시 크리에이터` / `그림과 짧은 영상을 올려요.` |
| 예시 안 링크 카드 | `작업물 모음` · `유튜브 채널` · `굿즈 판매` · `작업 문의` |
| 예시 안 바닥글 | `나도 크리링 만들기` · `개인정보 처리방침`(지금 공개 랜딩 바닥글과 같은 모양, 누를 수 없음) |
| 단계 구획 h2 | `이렇게 시작해요` |
| 단계 1 h3 / 설명 | `구글로 가입하기` / `구글 계정으로 가입하면 내 페이지와 짧은 크리링 링크가 바로 만들어져요.` |
| 단계 2 h3 / 설명 | `링크 추가하기` / `페이지 편집에서 표시 이름과 주소를 넣어 링크를 추가해요. 포트폴리오도 넣을 수 있어요.` |
| 단계 3 h3 / 설명 | `인스타그램 프로필에 넣기` / `내 크리링 링크를 복사해 인스타그램 앱의 프로필 편집 > 링크에 붙여 넣어요.` |
| 단계 아래 글자 링크 | `사용 안내 자세히 보기` → `CRELINK_WEB_PATHS.docsGuide`(`/docs/guide`) |
| 무료 구획 h2 | `무료로 쓸 수 있어요` |
| 무료 1 h3 / 설명 | `단축 주소 1개` / `인스타그램 프로필에 넣을 짧은 주소예요. 가입하면 자동으로 만들어져요.` |
| 무료 2 h3 / 설명 | `주소 바꾸기` / `주소를 내 이름에 맞게 바꿀 수 있어요. 처음 한 번은 바로, 그 뒤로는 {slugChangeIntervalDays}일에 한 번이에요. 옛 주소는 {retiredSlugGraceDays}일 동안 새 주소로 연결돼요.` |
| 무료 3 h3 / 설명 | `외부 링크 {freeVisibleLinks}개` / `방문자에게 보이는 외부 링크를 {freeVisibleLinks}개까지 둘 수 있어요. 숨긴 링크는 이 수에 들어가지 않아요.` |
| 무료 구획 아래 한 줄 | `무료 랜딩에는 링크 사이에 크리링 광고가 한 칸 보일 수 있어요.` |
| 마지막 h2 / 한 줄 / 버튼 | `내 크리링을 만들어 보세요` / `구글 계정으로 가입해요.` / `구글로 시작하기` |
| 이벤트 카드 | 지금 `HomeSlotEvent` 문구 그대로(바꾸지 않음) |

- 말투는 제품 안 말(`내 크리링`, `크리링 링크`, `페이지 편집`)과 사용 안내 문서에 맞췄습니다. 인스타그램 메뉴 이름 `프로필 편집 > 링크`는 사용 안내(`apps/web/src/app/(public)/docs/guide/page.tsx` `4. 크리링 링크 공유하기`)·검색 가이드 글(`apps/web/src/app/(public)/docs/instagram-profile-links/page.tsx`)·[첫 사용 안내](../first-run-guide/handoff.md#문구-원문)와 같은 말입니다. 메뉴 이름이 바뀌면 이 곳들을 같은 변경에서 고칩니다. 인스타그램 화면은 그리지 않았습니다.
- 넣지 않은 것: 가입자 수·후기·별점, 다른 서비스와의 비교, `1분`·`가장` 같은 과장, 실제 단축 주소 예시(예시 주소가 실제 다른 크리에이터의 주소가 될 수 있어서), 유료 계획 예고.

## 숫자와 사실 근거

숫자는 코드에서 읽고 문구에 직접 쓰지 않습니다(사용 안내 문서와 같은 방식).

| 문구의 값 | 지금 값 | 원본 |
| --- | --- | --- |
| 외부 링크 `5개` | 5 | `packages/shared/src/crelink.ts` `CRELINK_LIMITS.freeVisibleLinks`(R13) |
| 주소 바꾸기 `30일` | 30 | `CRELINK_LIMITS.slugChangeIntervalDays`(R8) |
| 옛 주소 연결 `90일` | 90 | `CRELINK_LIMITS.retiredSlugGraceDays`(R8) |
| 처음 한 번은 바로 | — | [PRD R8](../../docs/product/crelink.md#요구사항) "자동 발급 주소에서 처음 바꿀 때는 바로 가능" |
| 단축 주소 `1개`, 가입하면 자동으로 | 1 | PRD R6(이번 버전 무료 1개), R8 ①(가입하면 자동 발급). 공유 상수가 없어 문구에 씁니다 |
| 숨긴 링크는 수에 안 들어감 | — | PRD R13, `freeVisibleLinks` 주석 |
| 광고가 한 칸 보일 수 있음 | — | PRD R20(배너 슬롯 없는 무료 랜딩에 광고 블록 1개, 게시 중인 배너가 없으면 숨음) |
| 가입하면 페이지와 링크가 바로 만들어짐 | — | 검색 가이드 글 `apps/web/src/app/(public)/docs/instagram-profile-links/page.tsx` 같은 문장, R8 ① |

- 숨긴 링크 포함 전체 상한(`totalLinks` 50)은 홈에 쓰지 않았습니다. 처음 온 사람의 판단에 필요 없고 사용 안내에 있습니다.
- `무료로 쓸 수 있어요`는 지금 결제가 없어(PRD `범위` 제외: 유료 서비스와 결제) 모두에게 맞습니다. 유료 계획이 생기면 이 구획을 함께 봅니다([미결정](#미결정) 3).

## 이벤트 안내와 함께 놓기

결정: **이벤트 카드는 지금 자리(설명 아래·첫 `구글로 시작하기` 위) 한 곳에만** 둡니다.

- 근거:
  1. 카드 문장(`가입하고 이벤트를 신청하면 …`)의 행동이 바로 아래 버튼입니다. [링크 슬롯 이벤트 C1](../slot-event/handoff.md#홈-)의 "카드 안 버튼 없음, 바로 아래 기존 버튼" 결정과 이미 있는 구현·E2E(`tests/e2e/slot-event.spec.ts` 홈 region `외부 링크 +5 이벤트`)를 그대로 지킵니다.
  2. 기간 한정 안내라 첫 화면에서 보여야 합니다. 390px에서 카드가 있어도 첫 버튼 아래 끝이 위에서 503px로 첫 화면 안입니다(시안 측정).
  3. 무료 구획은 모두에게 늘 맞는 기본 범위만 적습니다. 보너스는 신청한 계정만 받으므로(R24 ①) `외부 링크 5개`를 `10개`로 바꾸거나 무료 카드에 이벤트를 다시 쓰지 않습니다. 같은 안내가 두 곳에 나오지도 않습니다.
- 공존 규칙:
  - 카드는 첫 화면 글 열 안, 설명 문단 다음입니다. 위 간격 20(`--ds-space-20`), 카드 아래 버튼 줄 위 간격 24(`--ds-space-24`). 카드 폭은 글 열 폭(최대 540)입니다.
  - 카드가 없으면 자리를 비우지 않고 버튼 줄이 설명 아래 24로 붙습니다.
  - 1024px 이상에서 카드가 있으면 글 열이 길어지고, 예시 휴대폰은 세로 가운데 정렬이라 그대로 옆에 있습니다(1024px에서 글 열 폭 544 ≥ 카드 최대 540).
  - 예시 휴대폰·단계·무료·마지막 버튼은 이벤트 유무로 바뀌지 않습니다. 마지막 버튼 구획에 이벤트를 다시 쓰지 않습니다.
  - 이벤트 카드 문구·모양·조건은 바꾸지 않습니다(`HomeSlotEvent` 그대로).

## 로그인한 홈

**바꾸지 않습니다**(상태 D). 로그인한 사람에게는 소개 구획(예시·3단계·무료·마지막 버튼)을 그리지 않고 지금 `.landing` 한 열 화면(글자 표시·제목·설명·이벤트 카드 `내 크리링에서 신청하기`·`{email}으로 로그인했어요.`·`내 크리링 편집`·`운영자 화면`(운영자만)·`로그아웃`)을 그대로 씁니다. 근거: 로그인한 사람은 이미 가입을 정했고, 지금 홈은 관리 화면으로 가는 입구입니다. 두 열 배치·새 CSS가 로그인한 홈에 새지 않도록 구현에서 분기를 나눕니다(아래 [구현 대상 파일](#구현-대상-파일추정)).

## 반응형

| 폭 | 첫 화면 | 단계·무료 카드 | 구획 사이 / 구획 제목 |
| --- | --- | --- | --- |
| 1024px 이상 | 두 열: 글 `minmax(0, 1fr)` · 예시 384px, 간격 48, 세로 가운데 정렬, 위 여백 40 | 3열(`repeat(3, minmax(0, 1fr))`), 간격 16 | 48 / 27px |
| 701~1023px | 한 열: 글 → 예시(가운데, 최대 384) | 1열, 간격 12 | 48 / 27px |
| 700px 이하 | 한 열(위와 같음), 예시 폭은 내용 폭에 맞춤(390px에서 358) | 1열, 간격 12 | 40 / 22px |
| 320px | 위와 같음. 예시 288px, 제목 38px이 어절 단위로 3줄 | 1열 | 40 / 22px |

- 페이지 바깥 여백·최대 폭은 지금 `.public-page` 그대로(1060px, 데스크톱 32·24·80, 700px 이하 16·16·60)입니다.
- 제목 크기는 지금 `.landing h1`과 같은 `clamp(var(--ds-font-size-38), 7vw, var(--ds-font-size-64))`입니다(1280px 64, 390px 38).
- 시안 측정(1280px): 첫 버튼은 위에서 537~586px, 마지막 버튼은 1449px부터라 한 화면 높이에 함께 보이지 않습니다. 390px: 첫 버튼 아래 끝 338px(이벤트 있음 503px), 320px 이벤트 있음 554px.
- 카드 3열 경계를 701px이 아니라 1024px로 둔 이유: 701px에서 3열이면 카드 안 글 폭이 120px 안팎이라 단계 제목 `인스타그램 프로필에 넣기`가 세 줄로 깨집니다. 1024px은 관리 화면이 이미 쓰는 경계입니다.

## 컴포넌트와 토큰

- **새 토큰 없음, `tokens.json` 변경 없음.** 색·간격·모서리·글자는 모두 기존 토큰이고, 글자·배경 쌍도 지금 쓰는 쌍입니다(`--ds-color-text-secondary`/흰 카드, `--ds-color-text-subtle`/페이지 바탕, 주요 버튼).
- `DESIGN.md` 보강: `컴포넌트` 절에 로그인 전 홈 소개 규칙(순서, 같은 행동 주요 버튼 두 곳 허용, 예시 랜딩 규칙, 숫자 원본)을 한 줄 더했고, `주요 버튼 화면당 하나` 규칙에 이 예외를 적었습니다. `pnpm tokens:generate`·`pnpm design:sync`를 실행했습니다([검증](#검증)).
- 새 CSS(시안 `<style>`의 `구현 대상` 부분, 이름은 제안. `.w1280` 선택자는 실제로는 위 반응형의 미디어 쿼리):

| 클래스 | 규칙 |
| --- | --- |
| `.home-intro` | 세로 flex, `gap: var(--ds-space-40)`(701px 이상 `--ds-space-48`), 아래 여백 `--ds-space-48` 뒤에 지금 `.site-footer` |
| `.home-hero` | grid 한 열, `gap: var(--ds-space-32)`. 1024px 이상 `grid-template-columns: minmax(0, 1fr) 384px; gap: var(--ds-space-48); align-items: center; padding-top: var(--ds-space-40)` |
| `.home-hero-text` | 세로 flex, `align-items: flex-start`, `min-width: 0`. 안의 `.brand-mark` 아래 16, `h1` 아래 20(지금 `.landing`과 같음) |
| `.home-hero-lead` | 지금 `.landing > p`와 같음: 최대 540, 16px, `--ds-color-text-secondary` |
| `.home-hero-text > .home-event` | `width: 100%; margin-top: var(--ds-space-20)`(카드 자체 규칙은 지금 그대로, 최대 540) |
| `.home-hero-text > .home-actions` | `margin-top: var(--ds-space-24)`(로그인한 홈의 `.home-actions` 16은 그대로) |
| `.home-example` | `figure`, grid `justify-items: center`, `gap: var(--ds-space-12)`, `margin: 0` |
| 휴대폰 틀 | 지금 관리 화면 `.preview-device`와 같은 규칙(폭 `min(100%, 384px)`, 여백 12, 모서리 `calc(var(--ds-corner-lg) * 2)`, `--ds-color-background-device`). 재사용하거나 같은 값의 `.home-example-device`. 관리 화면의 `.preview-screen`(높이 제한·스크롤)은 쓰지 않음 |
| `.home-example-screen` | 모서리 `--ds-corner-lg`, `overflow: hidden`, 바탕 `--ds-color-background-stage`, 높이는 내용대로(안쪽 스크롤 없음) |
| `.home-example-chip` | 틀 위 모서리에 걸친 표시: `position: absolute; top: calc(var(--ds-space-12) * -1); left: var(--ds-space-20)`, 1px `--ds-color-border-strong`, `--ds-corner-sm`, 바탕 `--ds-color-surface-default`, 12px 굵게 `--ds-color-text-secondary`(관리 화면 `.device-chip` 자리와 같은 방식, 광고 배지와 같은 모양) |
| 예시 안 랜딩 | 지금 공개 랜딩 클래스 그대로: `.profile-main`(여백 24·16)·`.profile`·`.profile-head`·`DefaultAvatar`(96px)·`.profile-name`·`.profile-bio`·`.link-list`·`.link-card`·`.profile-footer`. 링크 카드는 글자만(사이트 아이콘·썸네일 없음) |
| `figcaption` | 13px, `--ds-color-text-subtle`, 가운데 |
| `.home-section` | 세로 flex, `gap: var(--ds-space-20)`. `h2` 22px(701px 이상 27px) extrabold, 줄 간격 1.15 |
| `.home-cards` | `ol`/`ul`, 목록 표시 없음, grid 한 열 `gap: var(--ds-space-12)`, 1024px 이상 3열 `gap: var(--ds-space-16)` |
| `.home-card` | DESIGN.md 일반 카드: 흰 면, 1px `--ds-color-border-default`, `--ds-corner-lg`, `--card-shadow`, 여백 20, 안 간격 6. `h3` 18px extrabold 줄 간격 1.3, `p` `--ds-color-text-secondary`. hover 효과 없음(누를 수 없는 카드) |
| `.home-step` | `.home-card` + `grid-template-columns: 32px minmax(0, 1fr); column-gap: var(--ds-space-12)`. 번호는 두 줄에 걸침 |
| `.home-step-num` | 32px 원, 면 `--ds-color-text-primary`, 글자 `--ds-color-surface-default` 15px extrabold(켜진 스위치·고른 탭과 같은 짝, 강조색 쓰지 않음) |
| `.home-more` | 글자 링크, `inline-flex; align-items: center; min-height: 44px; align-self: flex-start`, 14px, 지금 전역 링크 밑줄 |
| `.home-free-note` | 14px, `--ds-color-text-subtle` |
| `.home-final` | 흰 카드(위와 같음), 여백 32·20, 세로 flex 가운데 정렬, `gap: var(--ds-space-8)`, 글 가운데. `h2` 22px(701px 이상 27px), `p` `--ds-color-text-secondary`, 버튼 위 12 |

- 버튼: 두 `구글로 시작하기` 모두 지금 `<a className="primary" href="/auth/google">`(route handler로 가는 전체 이동이라 `next/link`가 아님). 쿼리를 붙이지 않습니다.
- 쓰지 않는 것: 강조색 면·글자(주요 버튼과 `크리링` 글자 표시 외), 그라디언트, 아이콘·일러스트, 움직임, 실제 크리에이터 사진, SNS 브랜드 아이콘(예시에 SNS 줄을 두지 않음).

### 구현 마크업 예(요약)

```tsx
<main className="public-page">
  {session.kind === 'signed-in' ? (
    <section className="landing" aria-labelledby="home-title">{/* 지금 그대로 */}</section>
  ) : (
    <div className="home-intro">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-text">
          <p className="brand-mark">크리링</p>
          <h1 id="home-title">인스타그램 프로필 링크 하나로 나를 소개하세요.</h1>
          <p className="home-hero-lead">…</p>
          {slotEvent ? <HomeSlotEvent event={slotEvent} signedIn={false} /> : null}
          <div className="home-actions">
            {session.kind === 'error' ? <p className="form-error" role="alert">…</p> : null}
            <div className="button-row">
              <a className="primary" href="/auth/google">구글로 시작하기</a>
            </div>
          </div>
        </div>
        <HomeExampleLanding />
      </section>
      <section className="home-section" aria-labelledby="home-steps-title">…</section>
      <section className="home-section" aria-labelledby="home-free-title">…</section>
      <section className="home-final" aria-labelledby="home-final-title">…</section>
    </div>
  )}
  <footer className="site-footer">{/* 지금 그대로 */}</footer>
</main>
```

```tsx
// HomeExampleLanding: 고정 문구만, 데이터·API 없음
<figure className="home-example">
  <div className="preview-device home-example-device" aria-hidden="true" inert>
    <span className="home-example-chip">예시 화면</span>
    <div className="home-example-screen">
      {/* .profile-main > .profile > .profile-head(DefaultAvatar, p.profile-name, p.profile-bio) + ul.link-list > li > span.link-card */}
      {/* p.profile-footer > span.footer-cta … (footer 요소·a·h1을 쓰지 않음) */}
    </div>
  </div>
  <figcaption>가상의 크리에이터로 만든 예시 화면이에요.</figcaption>
</figure>
```

- 예시는 공개 랜딩 구성 요소 `Landing`을 쓰지 않고 고정 마크업으로 그리기를 권합니다. `Landing`은 `PublicLandingView`(사이트 아이콘 주소·광고 슬롯·탭 등)를 요구하고 `h1`·링크를 만들어, 홈에 두 번째 `h1`·누를 수 있는 링크·`contentinfo`가 생깁니다.

## 상호작용·접근성

- 제목 단계: h1 제목 → h2 이벤트 카드(있을 때, 지금 그대로) → h2 `이렇게 시작해요` → h3 단계 셋 → h2 `무료로 쓸 수 있어요` → h3 셋 → h2 `내 크리링을 만들어 보세요`. 각 구획은 `section` + `aria-labelledby`(구획 h2). 랜드마크는 지금처럼 `main`과 바닥글 `contentinfo` 하나입니다.
- 예시 랜딩: 내용 설명은 보이는 캡션(`figcaption`)이 맡고, 휴대폰 틀 안은 `aria-hidden="true"` + `inert`로 보조 기술·키보드·누르기에서 뺍니다. 틀 안에는 `a`·`button`·`h1`~`h6`·`footer`를 두지 않습니다(바닥글 모양은 `p`·`span`). `예시 화면` 표시는 틀 안이라 낭독되지 않지만 캡션이 같은 뜻을 전합니다. 손가락 커서를 두지 않습니다.
- 단계 목록은 `ol`(번호 원은 `aria-hidden`, 순서는 목록이 전함), 무료 목록은 `ul`. 목록 표시를 없앴으므로 Safari가 목록 의미를 지우지 않게 `role="list"`를 둡니다.
- 버튼: 두 `구글로 시작하기`는 같은 행동이라 같은 이름입니다. 높이 44px 이상(시안 49px), `.home-more` 44px. 키보드 순서: (이벤트 카드는 링크 없음) 첫 버튼 → `사용 안내 자세히 보기` → 마지막 버튼 → `문서` → `개인정보 처리방침`.
- 초점: 지금 전역 규칙(바깥 3px `--ds-color-text-primary`, 간격 2px). hover: 주요 버튼 배경 `--ds-color-action-primary-pressed`(150ms, 지금 그대로), 글자 링크는 밑줄만 짙어짐. 새 움직임 없음.
- 대비: 새 글자·배경 쌍이 없습니다. 번호 원(`--ds-color-surface-default` 글자 / `--ds-color-text-primary` 면)은 고른 탭과 같은 쌍입니다. 이번에 수치를 따로 재지 않았습니다.

## 구현 대상 파일(추정)

- `apps/web/src/app/(public)/page.tsx`: 로그인 전·오류 분기에 소개 구획, 로그인 분기는 지금 그대로. `CRELINK_LIMITS`·`CRELINK_WEB_PATHS.docsGuide` 가져오기.
- `apps/web/src/components/HomeExampleLanding.tsx`(이름 제안): 예시 랜딩 고정 마크업. `DefaultAvatar` 사용.
- `apps/web/src/styles.css`: `.home-*` 새 규칙(공개 화면 절, 홈 이벤트 안내 규칙 근처), 1024px 이상·701px 이상 미디어 쿼리. `.landing`·`.home-event`·`.home-actions`·`.site-footer` 기존 규칙은 바꾸지 않음.
- `apps/web/src/components/HomeSlotEvent.tsx`: 바꾸지 않음.
- E2E `tests/e2e/slot-event.spec.ts` 72행 `getByRole('link', { name: '구글로 시작하기' })`는 같은 이름 링크가 둘이 되어 Playwright strict 모드에서 실패합니다. 첫 화면 것(`.first()` 또는 `main` 안 첫 구획으로 좁힘)을 보도록 같은 변경에서 고칩니다. 204행 `getByRole('heading', { level: 1 })`은 h1이 그대로 하나라 통과합니다.
- 바꾸지 않는 것: API·공유 계약·DB, 로그인 흐름(`/auth/google`), 홈 메타데이터(`SITE_DESCRIPTION`·OpenGraph).

## 유입 경로(0087)

- 두 버튼과 `사용 안내 자세히 보기`에 쿼리를 붙이지 않습니다. 0087(가입 유입 경로 기록)은 결정 전입니다.
- 0087 이후 제안: 홈은 도착지이므로 기록할 값은 들어온 주소의 `from`(예: [바닥글의 `landing-footer`](../landing-footer-cta/handoff.md#0087이-생기면-쓸-주소-규칙제안))이고, 홈 안 두 버튼을 구분하는 값은 더하지 않습니다. 버튼 위치별 비교가 필요하면 그때 0087이 수집 범위와 처리방침 고지를 함께 정합니다.

## 위험·복구

- 위험: 홈이 길어져 첫 버튼까지의 거리가 늘면 가입이 줄 수 있습니다. 줄인 방법: 제목·설명·버튼은 지금 위치 그대로 첫 화면 위쪽에 있고(1280px 537px, 390px 290px), 새 구획은 모두 첫 버튼 아래입니다.
- 위험: 예시를 실제 크리에이터로 오해할 수 있습니다. 줄인 방법: 이름 자체가 `예시 크리에이터`, 늘 보이는 `예시 화면` 표시와 캡션, 기본 프로필 그림(사진 없음).
- 복구: 소개 구획을 빼면 지금 홈과 같습니다(PR revert, 서버 상태 없음).

## 기술 검토

- **새 API·공유 계약·DB·개인정보 수집 없음으로 판단**(디자인 담당 판단). 고정 문구와 이미 있는 상수만 쓰는 웹 화면 변경이라 `docs/specs/README.md`의 `orchestrator` 디자인 기술 검토 대상(여러 역할이 구현하는 기능)이 아닙니다. 구현 티켓 0154는 E2E 단언 수정 때문에 orchestrator 역할입니다.

## 미결정

모두 AI 판단으로 정했고, 사람 결정이 꼭 필요한 항목은 없습니다.

1. **예시 안 광고 블록**(사람 결정 불필요): 예시 랜딩에는 광고 블록을 그리지 않고, 무료 구획 아래 한 줄로 광고가 보일 수 있음을 알립니다. 배너 이미지를 홈에 다시 두지 않으면서 무료 랜딩의 실제 모습을 감추지 않으려는 선택입니다. 효과를 잴 수 있게 되면(0087) 다시 봅니다.
2. **문구 시험**(0087 이후): 제목·버튼 문구 변형, 무료 구획 위치 바꾸기는 가입 유입을 잴 수 있을 때 합니다.
3. **유료 계획이 생길 때**(PRD 결정 필요 시점에): `무료로 쓸 수 있어요` 구획과 숫자를 함께 고칩니다.
4. **인스타그램 메뉴 이름**(사람 결정 불필요): 실제 인스타그램 앱에서 `프로필 편집 > 링크` 이름을 이번에 확인하지 않았습니다. 기존 문서 세 곳과 같은 말을 썼습니다.

## 검증

- `pnpm tokens:generate`·`pnpm design:sync`(2026-10-10, `DESIGN.md` 변경 뒤): 생성물 변경 없음, `user:crelink`(published)로 설치.
- `pnpm design:check --require-lint`(2026-10-10): 통과 — `디자인 산출물 검사 통과: 파일 29개, 산출물 HTML 11개`. `od lint`가 실행되어 이 `index.html`에는 알림이 없고(P1·P2 모두 없음), 다른 산출물의 기존 P2 `missing-section-anchor` 알림 6건만 있습니다. 1회차는 `handoff.md`가 아직 없어 실패했고, 시안 안 `section`에 `data-od-id`가 없어 P2 알림이 있어 함께 고쳤습니다.
- 브라우저(Playwright Chromium, 저장소 `design/`을 로컬 정적 서버 `127.0.0.1`로 열어 `../system/tokens.css` 적용을 `--ds-color-text-primary` 값으로 확인):
  - 창 폭 1280px과 390px에서 문서 `scrollWidth = clientWidth`(1280/1280, 390/390).
  - 시안 틀 8개(상태 A 1280·390, B 1280·390, C 320, D 1280·390, E 390) 모두 안쪽 폭이 틀 폭과 같고(`main` scrollWidth = clientWidth: 1060/1060, 390/390, 320/320), 틀 밖으로 나간 요소 0개.
  - 주요 버튼 높이 49px, 글자 링크·보조 버튼 최소 44px. 1280px 제목 64px(221px 높이, 3줄), 390·320px 38px(3줄).
  - 1회차에 상태 B 390px 잘라 보인 예시에서 `예시 화면` 표시가 잘려 자르는 곳을 화면 안쪽으로 옮겼습니다.
  - 상태 A 1280·390, B 1280·390, C 320, D 1280 스크린숏을 눈으로 확인했습니다.
- 확인하지 못한 것: 실제 웹 구현 화면, 701~1023px 중간 폭(시안 틀 없음, 규칙만), 실제 기기·인스타그램 인앱 브라우저, 화면 낭독기 낭독, 대비 수치 측정, 실제 인스타그램 앱 메뉴 이름.
