# 웹 컴포넌트 카탈로그 (1차)

크리링 웹에 어떤 공통 부품이 있고 상태·접근성에서 무엇이 빠졌는지 한곳에 정리한 현황 문서입니다. 규칙의 원본은 [DESIGN.md](../system/DESIGN.md), 값의 원본은 `packages/design-tokens/src/tokens.json`이며 이 문서는 규칙을 새로 정하지 않습니다.

- 작성: designer, 2026-11-10, work item [0240](../../docs/work/designer/0240-component-catalog.md).
- 근거 표시: 따로 적지 않은 동작은 모두 `코드 기준`입니다. 소스만 읽었고 실제 화면·기기·보조기술에서 확인하지 않았습니다.
- `추정`: 소스로 확정할 수 없어 브라우저·보조기술 동작을 짐작한 내용입니다. 구현 전에 실측합니다.
- 경로: 파일은 `apps/web/src/components/` 아래 상대 경로로 적습니다. 다른 위치는 전체 경로로 적습니다.
- CSS: 전역 스타일은 `apps/web/src/styles.css` 한 파일(4031줄)입니다. `apps/web/src/app/` 아래에는 CSS 파일이 없습니다.

## 1. 공통 부품 목록 (웹 전체)

공통 부품 대부분은 React 컴포넌트가 아니라 전역 CSS 클래스입니다. 공통 React 컴포넌트는 `ActionStatus.tsx`, `CopyButton.tsx`, `ErrorPanel.tsx`, `PageLoading.tsx`, `DefaultAvatar.tsx`, `RemoteImage.tsx`, `manage/EditSheet.tsx`, `me/ImageField.tsx` 정도입니다. 사용 횟수는 `components/` 안 정적 `className` 문자열 기준입니다.

| 종류 | 지금 구현 | 중복·불일치 |
| --- | --- | --- |
| 주요 버튼 | `.primary` (`button`·`a`에 직접, 20곳) | 컴포넌트 없음. 저장 중 글자·`disabled`를 화면마다 씀 |
| 보조·위험 버튼 | `.secondary` 51곳, `.secondary.danger` 8곳 | `.secondary`에 `:active` 없음. `.primary`만 있음 |
| 분류 없는 버튼 | `manage/InstabioImport.tsx:305` `선택 항목 저장` | 클래스가 없어 44px·알약 규칙이 적용되지 않음 |
| 아이콘 버튼 | `.icon-button`, `.secondary.icon-only`, `.guide-close`, `.profile-trigger`, `.banner-button` | 44px 아이콘 버튼 규칙이 `.icon-button`·`.icon-only` 두 벌 |
| 글자 버튼 | `.back-button`, `.address-text-button` | `.back-button` 높이 36px(DESIGN.md 44px) |
| 떠 있는 버튼 | `FeedbackButton.tsx`, `.feedback-fab` | 없음 |
| 복사 | `CopyButton.tsx`, `.copy-control`, `.copy-feedback`, `apps/web/src/lib/use-copy-result.ts`, `manage/AddressParts.tsx` `CopyResultLine` | 결과 문장을 버튼이 그리는 경우와 부모가 그리는 경우 둘(`onResult`로 구분) |
| 입력 | `.input`, `.field`, `.field-help`, `.form-stack`, `.inline-fields`, `.subform` | `.input:disabled` 불투명도 0.6(DESIGN.md 0.48) |
| 선택 상자 | 네이티브 `select` + `.input`: `manage/LinkForm.tsx`, `me/SocialsSection.tsx`, `analytics/AnalyticsDashboard.tsx` | 없음 |
| 파일 | `me/ImageField.tsx`, `.image-field-body`, `.image-preview`, `.image-empty` | 없음 |
| 체크·라디오 | `.check-field`, `.link-layout-picker`, `.guestbook-secret` | `aria-disabled` 시각 스타일 없음(`manage/LinkLayoutPicker.tsx`) |
| 스위치 | `role="switch"` + `.hide-switch` 마크업 5벌: `manage/AdBlockSwitch.tsx`, `manage/GuestbookSwitch.tsx`, `manage/EditableLinkCard.tsx`, `manage/BannerSlotSection.tsx`, `admin/AdBlockSetting.tsx` | 같은 마크업 복사. 이름 `hide-`인데 켜기·끄기에도 씀 |
| 시트·대화상자 | `manage/EditSheet.tsx`(`.sheet`, `.centered-sheet`). 쓰는 곳: `manage/PageEditor.tsx`, `manage/SlugSheet.tsx`, `manage/AddressBar.tsx`, `admin/AdBannerDialog.tsx`, `SignInLink.tsx` | 하나로 통일됨 |
| 확인 | `window.confirm` 11곳(`manage/LinkForm.tsx`, `manage/BannerForm.tsx`, `me/PortfolioSection.tsx`, `landing/GuestbookPanel.tsx`, `admin/` 7곳). 시트 2단계 확인 2곳(`manage/AddressBar.tsx`, `manage/SlugSheet.tsx`) | 같은 역할 두 방식 |
| 메뉴(공개/숨김) | `manage/ProfileMenu.tsx`(`.profile-menu`, `.profile-panel`, `.profile-item`) | 하나뿐 |
| 탐색 | `SiteHeader.tsx`(`.site-header`, `.site-nav`), `manage/ManagerShell.tsx`(`.manager-menu`), `docs/DocsNav.tsx`(`.docs-nav`), `admin/AdminShell.tsx` | 현재 위치 표시는 `aria-current="page"`로 일치 |
| 탭 | `landing/LandingTabs.tsx`(`.landing-tabs`, `.landing-tab`, `role="tablist"`) | 실제 탭은 여기뿐 |
| 단일 선택 묶음 | `.view-toggle`(`manage/ManagerPreview.tsx`), `.filter-chip`(`admin/AdBanners.tsx`) | 둘 다 `aria-pressed`. `.filter-chip` 선택면은 강조색이라 DESIGN.md 강조색 규칙과 대조 필요 |
| 배지 | `.badge`, `.badge-danger`, `.badge-positive`, `.badge-warning`, `.badge-muted`, `.badges`, `.dirty-chip`, `.limit-badge`, `.limit-full`, `.banner-ad-badge`, `admin/CreatorStatusBadges.tsx` | `.limit-badge`는 별도 모양(알약·고정폭 글꼴) |
| 카드 | `.card`, `.card-head`, `.card-title`, `.link-card`, `.portfolio-card`, `.first-run-guide`, `.run-card`, `.section-picker` | 같은 면·테두리를 클래스마다 다시 선언 |
| 패널 머리 | `manage/PanelHead.tsx`, `.panel-head`, `.panel-title`, `.panel-help` | `manage/PageEditor.tsx`는 컴포넌트 없이 같은 마크업 2곳 |
| 상태 메시지 | `ActionStatus.tsx`, `.action-status`, `.form-error`, `.form-success`, `.form-error-inline`, `.notice-box`, `.check-available`, `.check-unavailable`, `.check-error`, `.address-message`, `.guide-status` | `.error` 클래스는 정의만 있고 쓰는 곳 없음. `.notice-box`는 경고색인데 일반 안내에도 씀 |
| 로딩 | `PageLoading.tsx`, `manage/ManagerLoading.tsx`, `analytics/AnalyticsLoading.tsx`, `.loading-indicator`, `.skeleton-bar`, `.skeleton-card`, `.skeleton-menu`, `.skeleton-address`, `.skeleton-screen`, `.skeleton-banner`, `.ad-banners-skeleton-row` | 전체 로딩 두 종류(글자·뼈대). 부분 로딩은 `.empty-text` + `role="status"` |
| 빈 상태 | `.empty-state`, `.empty-text` | `.empty-state`를 오류 화면에도 씀 |
| 오류 화면 | `ErrorPanel.tsx`, `.error-badge`, `apps/web/src/app/error.tsx`, `apps/web/src/app/global-error.tsx`, `apps/web/src/app/not-found.tsx` | 앱 라우트 세 곳은 `ErrorPanel.tsx` 없이 같은 틀을 직접 씀 |
| 표 | `.data-table`, `.table-scroll`, `.stacked-label`, `.pagination` | `analytics/AnalyticsDashboard.tsx`만 스크롤 영역에 `tabIndex`·이름. `admin/`과 `apps/web/src/app/admin/`의 나머지 7곳은 없음(DESIGN.md `표와 차트`) |
| 펼침 | 네이티브 `details`: `.instabio-import`, `.run-card`, `.analytics-table-details` | 없음 |
| 이미지·아이콘 | `RemoteImage.tsx`, `DefaultAvatar.tsx`, `Favicon.tsx`, `SocialIcon.tsx` | SNS 아이콘은 DESIGN.md 적용 제외 |
| 눈에 안 보이는 글 | `.visually-hidden` | 없음 |
| 앱(Expo) | `apps/app/src/components/ui/index.tsx`: `Text`, `ActionButton`, `Card`, `Screen` | 목록만. 이번 비교 범위 밖 |

## 2. 관리 화면 재사용 패턴 상세 비교 (`manage/`)

`manage/` 안에서 두 곳 이상이 쓰거나 다음 관리 화면에서 다시 쓸 가능성이 큰 패턴만 다룹니다. 초점은 전역 규칙 `:is(button, a, input, select, textarea, summary):focus-visible`(3px 실선 링, 간격 2px)이 맡습니다. 아래 표의 `전역 링`은 이 규칙을 뜻합니다.

### 상태 대조표

| 부품 | 기본 | hover | 초점 | 비활성 | 로딩 | 오류 |
| --- | --- | --- | --- | --- | --- | --- |
| 버튼 | 강조면 / 흰 면 테두리 / 위험 테두리 | 눌림색 / 테두리 진하게 | 전역 링 | `disabled` 0.48 | 글자 교체 + `disabled` | 버튼 밖 `ActionStatus` |
| 아이콘 버튼 | 44px 원형 테두리 | 테두리 진하게 | 전역 링 | `disabled` 0.48 | 없음 | 없음 |
| 스위치 | 트랙·손잡이·글자 | 테두리 진하게 | 전역 링 | `aria-disabled` 0.48, 초점 유지 | 비활성과 같은 모양 | 값을 되돌리고 `ActionStatus` |
| 시트 | 아래 붙은 흰 면 + 덮개 | 닫기 버튼만 | 전역 링, 시트 안에 가둠 | 저장 중 닫기 막음 | 내용의 폼이 표시 | 내용의 폼이 표시 |
| 입력 | 강한 테두리 | `--ds-color-text-subtle` 테두리 | 테두리 진하게 + 전역 링 | 0.6 | 없음 | `aria-invalid` 위험 테두리 + 문장 |
| 체크·라디오 | 20px, 본문색 | 없음 | 전역 링 | 체크: `disabled`, 라디오: `aria-disabled`(시각 변화 없음) | 없음 | 없음 |
| 상태 메시지 | 위험·성공·경고 면 | 해당 없음 | 해당 없음 | 해당 없음 | 해당 없음 | `.form-error` |
| 프로필 메뉴 | 원형 버튼 + 패널 | 테두리 / 항목 면 | 전역 링 | `aria-disabled`(시각 변화 없음) | `로그아웃 중…` | 패널 안 `.form-error-inline` |
| 보기 전환 | 알약 묶음, 고른 쪽 흰 면 | 없음 | 전역 링 | 없음 | 없음 | 없음 |
| 정렬 손잡이 | 40×44px 테두리 | 테두리·글자 진하게 | 전역 링 | `aria-disabled`, 커서만 변함 | 목록 저장 중 잠김 | 순서를 되돌리고 `ActionStatus` |

### 2.1 버튼 — Astryx `Button`

- 현재: `button`·`a`에 클래스를 직접 붙이고 화면마다 `pending`이면 글자를 `저장 중…`, `바꾸는 중…`으로 바꿉니다(`manage/LinkForm.tsx`, `manage/BannerForm.tsx`, `manage/AddressBar.tsx`, `manage/SlugSheet.tsx`).
- 접근성: 네이티브 버튼. 반복 항목은 `aria-label`로 대상을 붙입니다(`수정` → `<제목> 수정`, `manage/EditableLinkCard.tsx`).
- 빠진 것: 저장 중 네이티브 `disabled`라 누른 버튼의 초점이 빠질 수 있습니다(`추정`). 스위치와 `manage/ProfileMenu.tsx`는 이 문제로 이미 `aria-disabled`를 쓰고 있어 코드 안에 규칙이 둘입니다. Astryx `Button`은 로딩 중에도 초점을 유지합니다(`aria-busy` + `aria-disabled`).
- 빠진 것: 폼 저장 실패 뒤 초점 위치가 정해져 있지 않습니다(`manage/LinkForm.tsx`). `manage/AddressBar.tsx`는 실패하면 `이 주소로 바꾸기`로 초점을 돌립니다.

### 2.2 아이콘 버튼 — Astryx `IconButton`

- 현재: `manage/EditSheet.tsx` 닫기와 `manage/FirstRunGuide.tsx` 닫기는 `.icon-button`, `CopyButton.tsx` 아이콘 모드와 `manage/ManagerPreview.tsx`는 `.secondary.icon-only`입니다.
- 접근성: 모두 `aria-label`이 있고 svg는 `aria-hidden`입니다. 사라지는 버튼은 부모가 초점을 옮깁니다(`manage/ManagerShell.tsx`의 시작 안내 닫기).
- 빠진 것: 규칙 통일. Astryx는 보이는 사람용 tooltip을 권하지만 크리링은 터치 중심이라 hover 힌트에 기대지 않습니다. `title`은 `CopyButton.tsx` 아이콘 모드에만 있습니다.

### 2.3 스위치 — Astryx `Switch`

- 현재: 네이티브 버튼에 `role="switch"`입니다. 누르면 값을 먼저 바꾸고 바로 저장하며 실패하면 되돌립니다(`manage/LinksSection.tsx`, `manage/BannerSlotSection.tsx`, `manage/ManagerContext.tsx`).
- 접근성: `aria-checked`, 항목별 `aria-label`(`<제목> 숨기기`), 차단 사유는 `aria-describedby`. 보이는 글자(`켜짐`, `꺼짐`, `숨김`)는 `aria-hidden`입니다. Enter·Space는 네이티브 버튼 동작입니다.
- 일치: 즉시 적용 값에 스위치를 쓰고 비활성 중 초점을 유지하는 점은 Astryx와 같습니다.
- 빠진 것: 저장 중과 잠김(차단)이 같은 모양입니다. Astryx는 손잡이 안 로딩 표시를 둡니다.
- 빠진 것: 실패 문장이 스위치에서 멉니다. `manage/LinksSection.tsx`의 `ActionStatus`는 목록 위에 있어 긴 목록 아래쪽 행을 누르면 화면 밖일 수 있습니다(`추정`, 실측 항목).
- 빠진 것: 목록 저장 중에는 모든 행의 스위치가 함께 잠깁니다. 의도는 코드 주석에 있으나 눌린 행을 구분해 보여 주지 않습니다.

### 2.4 시트·대화상자 — Astryx `BottomSheet`

- 현재: 네이티브 `dialog`의 `showModal()`입니다. Esc·배경 누름·닫기 버튼이 `onDismiss`를 부르고 저장 중에는 닫지 않습니다. 저장 줄은 `.sheet .edit-form-actions`로 아래에 붙습니다. 넓은 화면은 `.centered-sheet`로 가운데에 둡니다.
- 접근성: `aria-labelledby`로 제목 연결, 초점 가둠과 바깥 비활성은 네이티브. 첫 초점은 `[data-autofocus]`이고 없으면 브라우저 기본입니다.
- 일치: `dialog` 기반, 저장 중 닫기 방지, 첫 초점 지정.
- 빠진 것: 닫을 때 초점 복귀를 여는 쪽이 각자 구현합니다(`manage/PageEditor.tsx`, `manage/ManagerPreview.tsx`, `manage/AddressBar.tsx`, `SignInLink.tsx`). Astryx는 여는 요소로 기본 복귀합니다.
- 빠진 것: 입력을 지키는 닫기 규칙이 없습니다. 링크·배너 폼은 초안이 남아 괜찮지만 `manage/SlugSheet.tsx`와 `admin/AdBannerDialog.tsx`는 배경을 누르면 입력이 사라집니다. Astryx는 `purpose="form"`에서 배경 누름·스와이프를 막고 Esc만 허용합니다.
- 빠진 것: `canShowModalDialog` 검사는 `SignInLink.tsx`만 합니다. `dialog`를 지원하지 않는 웹뷰에서 나머지 시트가 어떻게 되는지는 미확인입니다(`추정`).
- 미채택: 끌어 닫기 손잡이. DESIGN.md에 없고 지금 문제로 드러나지 않았습니다.

### 2.5 되돌릴 수 없는 행동의 확인 — Astryx `AlertDialog`

- 현재: 주소 변경은 시트로 두 단계입니다. `manage/AddressBar.tsx`는 첫 초점을 `취소`에 두어 Enter 두 번으로 저장되지 않고, `manage/SlugSheet.tsx`는 단계마다 DOM을 나누고 초점을 `뒤로`에 둡니다. 삭제는 `window.confirm`입니다(`manage/LinkForm.tsx:64`, `manage/BannerForm.tsx:162`).
- 접근성: 주소 변경 시트는 `role`이 `dialog`이고 영향 문장은 `aria-describedby`로 연결되어 있지 않습니다. 네이티브 확인창은 브라우저 몫입니다.
- 일치: 취소에 첫 초점, 좁은 폭에서 실행을 위·취소를 아래(`.is-stacked`). Astryx와 같습니다.
- 빠진 것: `window.confirm`은 기본 초점이 확인 쪽이라 Enter 두 번으로 삭제될 수 있습니다(`추정`). 모양이 시스템 것이고 앱 내 브라우저 동작도 미확인입니다.
- 미채택: `role="alertdialog"` 전환은 주소 변경 시트에서 실제 낭독을 들어 본 뒤 판단합니다. 배경 누름으로 닫는 동작도 취소와 결과가 같아 지금은 유지해도 됩니다.

### 2.6 입력·필드 — Astryx `Field`

- 현재: `.field` 안에 `label`, `.input`, `.field-help`, 오류 문장을 둡니다. 필수는 라벨 글자 `(필수)`입니다.
- 접근성: `label`의 `htmlFor` 연결은 모두 있습니다. 검증 방식은 셋입니다. `manage/LinkForm.tsx`는 네이티브(`required`, `type="url"`), `manage/BannerForm.tsx`는 `noValidate`로 칸마다 `aria-invalid`와 `aria-describedby`를 두고 첫 오류 칸으로 초점을 옮기며, `manage/AddressBar.tsx`·`manage/SlugSheet.tsx`는 입력 중 확인을 `aria-live` 줄로 읽습니다.
- 빠진 것: 서버 주소 오류(`link_url_invalid`, `link_domain_blocked`)가 `manage/BannerForm.tsx`는 칸 아래, `manage/LinkForm.tsx`는 폼 아래 `ActionStatus`로 갑니다.
- 빠진 것: `manage/LinkForm.tsx`의 주소·설명 도움말에 `id`와 `aria-describedby` 연결이 없습니다. Astryx `Field`는 설명과 상태를 입력에 연결하는 ID를 둡니다.
- 빠진 것: 비활성 불투명도 불일치(0.6, DESIGN.md 0.48).

### 2.7 상태 메시지 — Astryx `Banner`

- 현재: `ActionStatus.tsx`는 오류가 있으면 오류, 없으면 안내 하나만 보입니다. 글은 다음 요청이나 대상 변경 때 지워지고 닫기 버튼은 없습니다.
- 접근성: 바깥에 `aria-live="polite"`, 오류 안쪽에 `role="alert"`입니다.
- 빠진 것: `.action-status:empty`가 `display: none`입니다. 코드 주석과 `.address-copy-result:empty`는 낭독 영역을 숨기지 말라고 정하고 있어 어긋납니다. 성공 문장은 `role`이 없어 읽히지 않을 수 있습니다(`추정`, 보조기술 실측 항목).
- 빠진 것: `aria-live`와 `role="alert"`가 겹쳐 오류가 두 번 읽힐 수 있습니다(`추정`). Astryx `Banner` 문서는 같은 내용을 이중으로 알리지 말라고 합니다.
- 빠진 것: 메시지가 겹칠 때의 우선순위는 `manage/AddressBar.tsx`에만 있습니다(저장 성공 > 복사 결과 > 입력 상태). `manage/LinksSection.tsx`는 `ActionStatus` 두 개를 나란히 둡니다.
- 빠진 것: `.notice-box`가 경고색인데 일반 안내에도 씁니다(`manage/GuestbookManager.tsx`의 꺼짐 안내). Astryx는 `info`와 `warning`을 나눕니다. 크리링 토큰에는 정보 전용 색이 없으므로 새 색 없이 `--ds-color-surface-raised`와 보조 글자색으로 나누는 안이 후보입니다.
- 미채택: 안내 닫기 버튼. 다음 행동에서 지워지므로 지금 필요가 드러나지 않았습니다.

### 2.8 복사 — Astryx 대응 문서 읽지 않음

- 현재: `CopyButton.tsx`가 복사하고 실패하면 임시 입력란으로 다시 시도합니다. 글자 버튼은 2초, 아이콘 버튼은 4초 결과를 유지합니다. `onResult`를 주면 결과 문장은 부모가 그립니다(`manage/AddressBar.tsx`, `manage/ManagerPreview.tsx`).
- 접근성: `.copy-feedback`은 `role="status"`이고 `manage/AddressParts.tsx`의 결과 줄은 `aria-live` 묶음을 늘 DOM에 둡니다.
- 빠진 것: 없음. 실패하면 주소를 직접 선택해 복사하도록 보여 주는 복구 경로까지 있어 다른 부품의 기준으로 쓸 만합니다.

### 2.9 프로필 메뉴 — Astryx `DropdownMenu`

- 현재: `manage/ProfileMenu.tsx`는 `menu` 역할이 아니라 공개/숨김입니다. 패널에 메뉴 항목이 아닌 이메일 글자가 있기 때문입니다.
- 접근성: `aria-expanded`, `aria-controls`, `aria-label="계정 메뉴"`. Esc로 닫고 버튼에 초점, 바깥 누름은 닫기만, Tab으로 벗어나면 닫힘. 열어도 초점은 버튼에 남습니다.
- 판단: Astryx `DropdownMenu`는 행동 목록용이고 이동에 쓰지 말라고 합니다. 지금 구조를 유지합니다.
- 빠진 것: `.profile-item`의 `aria-disabled` 시각 스타일이 없습니다. 로그아웃 중임은 글자로만 보입니다.

### 2.10 보기 전환 — Astryx `SegmentedControl`

- 현재: `manage/ManagerPreview.tsx` `.view-toggle`의 `편집 | 미리보기`입니다.
- 접근성: `role="group"`, `aria-label="미리보기 모드"`, 버튼마다 `aria-pressed`. Tab으로 두 버튼을 각각 지납니다.
- 빠진 것: 항상 하나만 선택되는 값인데 독립 토글 두 개로 읽힐 수 있습니다(`추정`). Astryx는 라디오 의미를 씁니다.
- 빠진 것: 버튼 높이 40px(DESIGN.md 44px)이고 hover 상태가 없습니다.

### 2.11 배지 — Astryx `Badge`

- 현재: 읽기 전용 글자 표시입니다. `숨김`, `차단됨`, `저장 안 함`을 `manage/EditableLinkCard.tsx`, `manage/BannerSlotSection.tsx`, `manage/PageEditor.tsx`, `manage/ManagerPreview.tsx`가 씁니다. 글자로 상태를 전하므로 색에만 의존하지 않습니다.
- 일치: 누를 수 없음, 상태에만 사용.
- 차이: `.limit-badge`는 `링크 7/50` 같은 개수입니다. Astryx는 개수에 배지를 쓰지 말라고 하지만 한도 표시는 크리링의 정해진 모양이라 유지합니다.
- 빠진 것: 없음.

### 2.12 로딩 — Astryx `Skeleton`

- 현재: `manage/ManagerLoading.tsx`는 움직이지 않는 뼈대입니다. 부분 로딩은 문장입니다(`manage/GuestbookManager.tsx`). 파일 올리기는 도움말 글자가 `올리는 중…`으로 바뀝니다(`me/ImageField.tsx`).
- 접근성: 바깥에 `aria-busy`, 뼈대는 `aria-hidden`, 숨긴 글 `role="status"`.
- 차이: Astryx는 반짝이는 애니메이션이지만 DESIGN.md가 장식 반복 애니메이션을 금지하므로 크리링 방식을 유지합니다.
- 빠진 것: `me/ImageField.tsx`의 `올리는 중…`은 낭독 영역이 아닙니다. 로딩이 길어질 때의 안내는 어느 화면에도 없습니다.

### 2.13 빈 상태 — Astryx `EmptyState`

- 현재: `manage/LinksSection.tsx`는 `.empty-text` 한 줄 뒤에 `링크 추가`가 옵니다. `manage/BannerSlotSection.tsx`는 빈 목록 문장 없이 추가 버튼과 `.notice-box`를 둡니다.
- 일치: 빈 곳에 다음 행동을 함께 둡니다.
- 빠진 것: 작은 패널에 맞는 짧은 빈 상태 규칙이 없어 화면마다 다릅니다. Astryx는 오류에 빈 상태를 쓰지 말라고 하지만 크리링은 `.empty-state` 틀을 공유합니다. `role="alert"`와 `.error-badge`로 구분되어 있어 지금은 문제로 보지 않습니다.

### 2.14 정렬 행 — Astryx 대응 없음

- 현재: dnd-kit으로 `manage/LinksSection.tsx`와 `manage/BannerSlotSection.tsx`가 각각 정렬합니다. 행은 `manage/EditableLinkCard.tsx`, `manage/SlotOrderRow.tsx`, `manage/BannerSlotSection.tsx`의 `BannerRow`입니다(`.link-edit-item`, `.link-edit-row`, `.drag-handle`).
- 접근성: Space·Enter로 들고 화살표로 옮기며 Esc로 취소합니다. 한국어 안내와 위치 낭독이 있고 `.drag-handle`만 `touch-action: none`입니다. 카드 누르기의 키보드 대체로 `수정` 버튼을 둡니다.
- 빠진 것: 센서·`verticalOnly`·안내 문구·손잡이 svg가 두 파일에 복사되어 있습니다. `me/PortfolioSection.tsx`는 `위로`·`아래로` 버튼이라 같은 관리 화면에서 정렬 방식이 둘입니다.
- Astryx 검색에 정렬 목록 부품은 없었습니다. 크리링 쪽 구현이 기준입니다.

## 3. 개선 후보

구현은 별도 티켓입니다. 새 토큰이나 외부 패키지 없이 기존 부품 안에서 해결하는 안만 적었습니다.

### 이번에 필요 (다음 관리 화면을 설계하기 전에 정할 것)

| # | 후보 | 근거 파일 |
| --- | --- | --- |
| 1 | 삭제 확인을 `manage/EditSheet.tsx` 기반 시트로 바꾸고 첫 초점을 취소에 둡니다. 관리 화면 3곳부터 합니다. | `manage/LinkForm.tsx:64`, `manage/BannerForm.tsx:162`, `me/PortfolioSection.tsx:162`, 기준 `manage/AddressBar.tsx:296` |
| 2 | 스위치를 컴포넌트 하나로 묶고 저장 중 표시와 잠김 표시를 나눕니다. | `manage/AdBlockSwitch.tsx`, `manage/GuestbookSwitch.tsx`, `manage/EditableLinkCard.tsx`, `manage/BannerSlotSection.tsx`, `admin/AdBlockSetting.tsx` |
| 3 | 저장 버튼의 진행 규칙을 정합니다: `aria-disabled`로 초점 유지, 실패 뒤 초점 위치 지정. | `manage/LinkForm.tsx:165`, `manage/BannerForm.tsx:274`, `me/PortfolioSection.tsx:227` |
| 4 | 필드 오류 규칙을 `manage/BannerForm.tsx` 기준으로 맞춥니다: 서버 주소 오류는 칸 아래, 도움말은 `aria-describedby`로 연결. | `manage/LinkForm.tsx`, `manage/BannerForm.tsx`, `me/PortfolioSection.tsx` |
| 5 | `ActionStatus.tsx`의 낭독 구조를 고칩니다: `.action-status:empty` 숨김 방식, `role="alert"` 중첩, 성공 문장 낭독. 고치기 전에 보조기술로 실측합니다. | `ActionStatus.tsx`, `apps/web/src/styles.css:309`, 기준 `.address-copy-result` |
| 6 | DESIGN.md 규칙 위반을 정리합니다: 클래스 없는 저장 버튼, `.back-button` 36px, `.view-toggle` 40px, `.input:disabled` 0.6. | `manage/InstabioImport.tsx:305`, `manage/PageEditor.tsx:303`, `manage/ManagerPreview.tsx:119`, `apps/web/src/styles.css:227` |

### 나중

| # | 후보 | 근거 파일 |
| --- | --- | --- |
| 7 | 아이콘 버튼 규칙을 하나로 합치고 쓰지 않는 `.error`를 지웁니다. | `apps/web/src/styles.css:157`, `apps/web/src/styles.css:2576`, `apps/web/src/styles.css:2760` |
| 8 | `.notice-box`를 경고와 일반 안내로 나눕니다(새 색 없이). | `manage/GuestbookManager.tsx`, `manage/BannerSlotSection.tsx`, `manage/InstabioImport.tsx` |
| 9 | 정렬 목록의 센서·안내·손잡이를 공통화하고 포트폴리오 정렬 방식을 통일할지 결정합니다. | `manage/LinksSection.tsx`, `manage/BannerSlotSection.tsx`, `me/PortfolioSection.tsx` |
| 10 | 운영자 표의 스크롤 영역에 이름과 초점을 줍니다. | `admin/BlockedDomains.tsx:92`, `admin/OperatorActions.tsx:77`, `admin/AdBanners.tsx:230`, `apps/web/src/app/admin/page.tsx:71`, 기준 `analytics/AnalyticsDashboard.tsx:405` |

## 4. 참고 기록

Astryx 공개 문서를 상태·접근성 해법 참고로만 읽었습니다(MCP `get`, 2026-11-10). 도입 제안이 아니며 충돌하면 DESIGN.md와 토큰이 우선입니다.

| 문서 | 쓴 판단 |
| --- | --- |
| `Button` | 저장 중 초점 유지(`aria-busy` + `aria-disabled`), 실행 전 확인 권고 → 2.1, 후보 3 |
| `IconButton` | 항목을 드러내는 `aria-label`. tooltip 권고는 터치 중심이라 미채택 → 2.2 |
| `Switch` | 즉시 적용에만 스위치, 손잡이 로딩, 실패 상태 위치 → 2.3, 후보 2 |
| `BottomSheet` | 목적별 닫기(`form`은 배경 누름 차단), 여는 요소로 초점 복귀. 끌어 닫기 미채택 → 2.4 |
| `AlertDialog` | 첫 초점 취소, 좁은 폭 버튼 순서, 실행 중 대화상자 유지 → 2.5, 후보 1 |
| `Field` | 설명·상태를 입력에 ID로 연결 → 2.6, 후보 4 |
| `Banner` | `info`·`warning` 구분, 이중 낭독 금지. 닫기 버튼 미채택 → 2.7, 후보 5·8 |
| `DropdownMenu` | 이동·비항목이 섞인 패널에는 맞지 않음 → 2.9 (현행 유지) |
| `SegmentedControl` | 항상 하나 선택되는 값의 의미 → 2.10 |
| `Badge` | 읽기 전용·상태 한정. 개수 배지 권고는 미채택 → 2.11 |
| `Skeleton` | 뼈대 형태·장시간 안내. 반짝임은 DESIGN.md 때문에 미채택 → 2.12 |
| `EmptyState` | 제목과 다음 행동, 오류와 구분 → 2.13 |

검색(`search`)에 쓴 일반 용어: switch toggle, confirmation dialog destructive, bottom sheet modal, segmented control toggle button group, form field label error helper text input, inline alert banner message status, drag reorder sortable list, popover dropdown menu disclosure, skeleton loading spinner empty state.
