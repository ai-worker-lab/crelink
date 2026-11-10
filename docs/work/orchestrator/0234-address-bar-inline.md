# 0234 관리 화면 주소 막대 입력형·프로필 메뉴·`주소 설정` 메뉴 제거

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 기능
- 우선순위: P2
- 작성일: 2026-11-10

## 목적

관리 화면에서 주소는 막대에 보이는데 고치려면 다른 메뉴로 옮겨야 하고, 복사 버튼과 `주소 변경`이 막대의 자리를 차지합니다. 계정 정보도 `주소 설정` 패널 아래에 있어 찾기 어렵습니다. 2026-11-10 사용자 검토사항 4건(복사 아이콘, 주소 입력란 노출, 프로필 드롭다운, `주소 설정` 제거)을 [디자인 인계](../../../design/manager-address-bar/handoff.md)대로 구현합니다.

## 수용 기준

- [ ] 1024px 이상 주소 막대: 도메인 글자 + 저장된 주소가 채워진 입력란 + 바로 옆 복사 아이콘 + 공개 페이지 열기. `주소 변경` 링크와 글자 `복사` 버튼이 없습니다.
- [ ] 입력값이 저장값과 다르면 복사·열기 대신 `취소`·`변경`이 보이고, 사용 가능 확인과 이유별 문구가 막대 아래에 보입니다. 막대 높이는 60px입니다.
- [ ] 저장은 `변경` → 확인 대화상자 → `이 주소로 바꾸기` 두 단계입니다. 초점이 나가거나 Enter만으로는 저장되지 않고, 넓은 화면 Enter 두 번과 390px `주소 바꾸기` 두 번 탭·Enter 두 번에 `PUT`이 나가지 않습니다.
- [ ] 복사하는 값은 입력 중에도 항상 저장된 주소(`state.shortLink.url`)입니다.
- [ ] 30일 제한 중에는 입력란 대신 주소 글자와 다음 변경 가능일을 보여 줍니다.
- [ ] 1023px 이하: 복사 아이콘, 연필 아이콘 → 하단 시트에서 주소 변경, 잠금이면 자물쇠 → 다음 변경 가능일. 가로 넘침이 없습니다.
- [ ] 관리 화면 머리글의 프로필 버튼을 누르면 이메일, (운영자만) `운영자 화면`, `로그아웃`이 보입니다. Esc·바깥 누름으로 닫히고 Esc면 초점이 버튼으로 돌아옵니다. 로그아웃하면 세션이 끊기고 홈으로 갑니다. 머리글에 로그아웃 버튼이 따로 없습니다.
- [ ] 프로필 사진을 저장하면 새로고침 없이 머리글 사진이 바뀝니다.
- [ ] 왼쪽 메뉴·가로 탭에 `주소 설정`이 없고, `/me/landings/{publicId}/settings`로 들어가면 `페이지 편집`에 도착합니다.
- [ ] 공개 문서, PRD R18 ⑦, 기술 설계, E2E, 웹·루트 변경 기록이 새 화면과 맞습니다.
- [ ] `pnpm work:scope 0234`, `pnpm verify`, `make up` 후 `pnpm smoke`가 통과합니다. E2E(`creator.spec.ts`, `operator.spec.ts`)는 PR CI에서 통과합니다.
- [ ] 1024·1280·390·320px 실제 화면에서 상태별 배치, 가로 넘침 0, 콘솔 오류 0을 확인하고 측정값을 `진행 기록`에 남깁니다.

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
