# 0079 미리보기·광고 블록 패널·구역 목록

- 단계: 티켓
- 역할: web
- 상위: 0063
- 선행: 0077, 0078
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T11입니다. 요구는 R20 ②⑥, R18입니다.

## 수용 기준

- [x] 미리보기·광고 블록 패널·구역 목록: `toLandingPreview`가 `resolveBannerSlot`을 씀, 점선 자리, `EditRegion` 이름표, 새 `LandingEditTarget`, 구역 목록 행, 좁은 화면 칩·시트, `끌어 옮기기` 초점. 390·1280px.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T11
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ②⑥, R18
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(0077·0078과 한 작업공간).
  - `lib/landing-preview.ts`: 새 `previewBannerSlot(state, drafts)`가 `resolveBannerSlot`(packages/shared)을 씀. `linkVisible`은 저장 상태(숨김·차단) + 표시 이름 있는 새 링크 초안을 맨 끝에(슬롯이 맨 뒤면 초안도 슬롯 앞), 포트폴리오는 저장 항목이나 제목 있는 새 초안, 크리에이터 배너는 숨김·차단을 빼고 저장된 URL·정지 이미지. `toLandingPreview`는 숨김이 아니면 `blocks[0].slot`, 숨김이면 null.
  - 미리보기(`Landing`의 `edit`): 광고 블록은 `EditRegion`(이름표 `광고 블록 · 위치 이동`, 1023px 이하 칩 `광고 블록 · 위치`, 고르기 버튼 `광고 블록 위치 안내`), 이전·다음·멈춤은 고르기 없이 동작, `<a>`를 그리지 않음. 배너 슬롯은 `EditRegion`(`배너 슬롯 · 편집`)과 장마다 `EditItem`(`<대체 문구> 배너 편집` → `배너 · <대체 문구>`), 장별 이름표는 트랙 밖(`EditItemTag`). `no_banners`면 그 위치에 점선 자리(handoff 문구, 누르면 해당 패널), `no_content`면 그리지 않음.
  - `LandingEdit.tsx`: `EditRegion`에 `tail`·`narrowTail` prop, `EditItem`에 `tagOutside`, 이름표를 `EditItemTag`로 분리, `LandingEditControl.slotPlaceholder`. `lib/landing-edit.ts`: `LandingEditTarget`에 `ad-slot`·`banner-slot`·`banner(id | null)`, `targetKey` `banner:<id|new>`, `sectionOfKey`를 여기로 옮겨 배너 → `banner-slot`.
  - `PageEditor.tsx`: 구역 목록 외부 링크 다음 줄 `광고 블록`(보조 줄 `링크 목록 맨 뒤`·`링크 목록 맨 앞`·`n번째 링크 다음`) 또는 `배너 슬롯`(`보이는 배너 a/n장 · 전체 b장`). 광고 블록 패널(안내·지금 위치·`외부 링크 목록에서 끌어 옮기기`·한도 안내·게시 0장 문장): 버튼은 외부 링크 패널을 열고 초점을 광고 행 손잡이로(넓은 화면은 패널 제목 대신, 시트는 `data-autofocus`). 배너 슬롯·배너 대상은 패널 자리만(한도 배지 2개, 보이는 배너 0장 문장), 목록·폼은 T15(0083)·T16(0084). 부여·회수로 종류가 바뀌면 그 패널을 닫음. 1023px 이하는 같은 내용이 하단 시트.
  - `ManagerLoading.tsx`: 무대 뼈대에 3:1 회색 면. 배너 초안(`LandingDrafts.banners`)·`저장 안 함`은 T16 몫이라 구역 목록 행의 `저장 안 함`은 아직 늘 꺼짐.
- 2026-10-09: 검증(Node 24.20).
  - `pnpm --filter @crelink/web test` 30/30(`landing-preview.spec.ts` 슬롯 4건 포함: 위치 3가지·숨김·차단 앞 링크, `no_banners` 위치 유지, `no_content`와 초안, 배너 슬롯 숨김·차단 제외·빈 랜딩), `pnpm verify --fast` 통과.
  - 계약 fixture(임시 mock API, PORT_SLOT=42)로 Playwright: 1280 미리보기 사이 위치·이름표 `광고 블록 · 위치 이동`, 구역 목록 `광고 블록 / 1번째 링크 다음`, 광고 블록 패널 → 초점 `panel-title`, `외부 링크 목록에서 끌어 옮기기` → 초점 `크리링 광고 블록 순서 바꾸기`, 미리보기 `다음 배너`가 `2 / 2`로 넘기되 고른 대상 그대로. 게시 0장 점선 자리(1280·390·320), 배너 슬롯 `배너 슬롯 · 편집`·장 고르기 → 패널 `배너 · 하루 굿즈 판매 중`·트랙 밖 이름표, 보이는 배너 0장 점선 자리와 패널 문장, 구역 목록 `보이는 배너 2/5장 · 전체 3장`. 390·320: 칩 `광고 블록 · 위치` → 시트 `광고 블록`(가로 넘침 0) → `외부 링크` 시트, 초점 광고 행 손잡이. 모든 경우 가로 넘침 0, 콘솔 오류 0.
  - 확인하지 못한 것: 실제 API(통합 E2E), 편집 중 회수 흐름(T15·T16의 403 처리와 함께).
