# 0081 운영자 광고 배너 화면

- 단계: 티켓
- 역할: web
- 상위: 0063
- 선행: 0077, 0080
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T13입니다. 요구는 R20 ④⑧⑨입니다.

## 수용 기준

- [x] 운영자 `/admin/ad-banners`: 메뉴, 표·카드, 걸러보기, 정렬, 대화상자(미리보기·`datetime-local` 변환), 내리기, 경고·빈·로딩·오류(`AdminShell` prop), BFF. 390·700·1280px.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T13
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ④⑧⑨
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(web, 격리 작업공간, 커밋 없이 patch).
  - 화면: `src/app/admin/ad-banners/page.tsx`(서버 렌더 `GET /api/admin/ad-banners`), `loading.tsx`(제목 + 뼈대: 걸러보기 줄과 행 3개), `src/components/admin/AdBanners.tsx`(제목·설명·`배너 등록`, 게시 0장 경고 줄, 걸러보기 `전체 n · 게시 중 n · 예약 n · 끝남 n`(`counts`, `aria-pressed`, `item.status`로 거름), 노출 도움말, 표, 내리기, 정렬), `src/components/admin/AdBannerDialog.tsx`(등록·수정), `src/lib/seoul-time.ts`(`datetime-local` ↔ `+09:00` ISO)와 단위 테스트 `seoul-time.spec.ts` 4건.
  - 메뉴 `광고 배너`(`AdminShell`, 크리에이터 · 차단 도메인 · 광고 배너 · 내 크리링). `AdminShell`에 `errorTitle`·`retryHref` prop: 이 화면은 `광고 배너를 불러오지 못했어요.` + `다시 시도`(문서 새로 읽기), 403은 기존 권한 없음 안내.
  - 정렬: `전체`에서만 손잡이(dnd-kit 끌기·키보드, 링크 정렬과 같은 안내 문장), 놓으면 화면 먼저 바꾸고 `PUT /api/admin/ad-banners/order { ids: 전체 }`, 응답 `AdBannerView[]`로 맞춤, 실패하면 되돌림. 결과 안내 `<대체 문구> 배너를 n번째로 옮겼어요.`. 다른 걸러보기에서는 손잡이 열을 그리지 않고 `순서는 전체에서 바꿀 수 있어요.`.
  - 대화상자: `ImageField banner`(정지 이미지 쌍), 대체 문구 n/100, 연결 URL, 게시 시작(새 배너는 지금 한국 시간)·게시 끝(`비워 두면 내릴 때까지 게시해요.`), `방문자에게 이렇게 보여요` = `BannerCarousel`(`ad`, 장 1개, 폭 최대 448). 저장 전 화면 검사: 이미지 없음, 날짜 형식, 끝 ≤ 시작(`게시 끝은 시작보다 뒤여야 해요.`). 수정은 바뀐 필드만 `PATCH`(기간은 입력값 분 단위로 비교, 이미지를 바꾸면 `stillImageFileId`도 함께). `banner_period_invalid`는 기간 입력, `link_url_invalid`·`link_domain_blocked`는 URL 입력에 `aria-invalid`, 그 밖 실패는 저장 버튼이 `다시 시도`. 저장 뒤 닫고 `router.refresh()`, 연 버튼으로 초점 복귀.
  - 내리기: 게시 중·예약 행만, `window.confirm('이 배너를 내릴까요? 게시 끝을 지금으로 바꿔 모든 랜딩에서 바로 빠져요.')` 뒤 `PUT …/{id}/end` → `router.refresh()`.
  - BFF 허용 `POST api/admin/ad-banners`, `PUT api/admin/ad-banners/order`, `PATCH api/admin/ad-banners/{ID}`, `PUT api/admin/ad-banners/{ID}/end`(목록 `GET`은 서버 렌더만이라 넣지 않음). `EditSheet`에 `className` prop(넓은 화면 가운데 대화상자). `styles.css` 끝 블록, `README.md` 화면 표, `CHANGELOGS.md`.
  - 계약·mock: `packages/shared` 계약(`AdBannerListResponse`·`AdBannerView`·`AdBannerRequest`·`UpdateAdBannerRequest`·`ReorderRequest`·`CRELINK_API_PATHS.adminAdBanner*`) 그대로 씀. 빠진 계약 없음. 실제 API(0071) 연결은 확인하지 않았고, 화면 확인은 저장소 밖 계약 모양 임시 mock(`/tmp`, 상태 계산·`counts`·검증 오류 코드·`order_mismatch`·멱등 `/end` 흉내)으로 함. 앱 코드에는 mock이 없음.
  - 디자인 인계와 다른 점(가장 가까운 승인 화면을 따른 판단)
    - 700px 이하 카드는 설계의 `useWideLayout`(1024px 경계) 대신 같은 `<table>`을 CSS로 카드처럼 그림(디자인 시안과 같은 방식). 목록 DOM이 하나라 dnd-kit id가 겹치지 않고, 서버 렌더와 첫 그림이 같아 폭 전환 깜박임이 없음. 701~1023px은 표이고 1024px에서도 표 안 가로 스크롤 0.
    - 표 썸네일은 정지 이미지가 있으면 그것을 보여 줌(관리 표에서 움직임 되풀이 없음). 미리보기는 공개 랜딩과 같이 움직임·멈춤 버튼.
    - 걸러보기별 빈 문장(`게시 중인 배너가 없어요.`·`예약된 배너가 없어요.`·`끝난 배너가 없어요.`), 게시 0장 경고는 빈 목록에서도 보임, 작업 결과 안내(`'<대체 문구>' 배너를 등록했어요. 목록 맨 뒤에 들어가요.`·`저장했어요.`·`내렸어요.`), 대체 문구 도움말과 `한국 시간 기준이에요.`, 화면 검사 문구 `배너 이미지를 골라 주세요.`·`게시 기간의 날짜와 시각을 확인해 주세요.`는 handoff에 없어 지금 운영자 화면 문체로 더함. 확인 대화는 다른 운영자 확인과 같은 `window.confirm`.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, `PORT_SLOT=48`: `.local/instance.env`를 슬롯 0에서 48로 고침, 웹 9993·mock API 7820).
  - `pnpm verify --fast` 통과(tokens·work·docs·design·lint·typecheck), `pnpm --filter @crelink/web test` 39/39 통과(새 4건 포함).
  - `pnpm work:scope 0081`: 이 티켓의 변경은 모두 `apps/web/**`·`docs/work/**`. 실패 33건은 통합 브랜치에 이미 커밋된 다른 역할 티켓(api·shared·설계·handoff) 변경이 기준(`origin/main...HEAD`)에 들어간 것.
  - 브라우저(Playwright Chromium, `next dev` + 계약 mock, 390·700·1024·1280px, 폭마다 45개·합계 180개 확인 모두 통과): 메뉴 링크, 걸러보기 `aria-pressed`·예약만·끝남에는 내리기 없음·손잡이 숨김, 키보드 정렬(스페이스·↓·스페이스 → `… 배너를 2번째로 옮겼어요.`, 새로고침 뒤 유지), 정렬 실패(서버 500) 되돌림, 포인터 끌기(1280·390), 등록(빈 미리보기 → 이미지 올리기 → `BannerCarousel` 미리보기·`광고` 배지·대체 문구, 기간 오류·`aria-invalid`, 차단 도메인 422, 서버 500 → `다시 시도` → 등록 → 맨 뒤, `배너 등록`으로 초점 복귀), 수정(처음 값, `PATCH` 본문이 바뀐 `alt`·`endsAt`만인 것을 mock 기록으로 확인, 기간 표시), 내리기(확인 문구 → `끝남`, 내리기 버튼 사라짐), 게시 0장 경고, 빈 목록, 불러오기 오류 → `다시 시도` → 목록, 로딩 뼈대. 대화상자 배치: 390·700 하단 시트(아래 붙음), 1024·1280 가운데 560. 문서 가로 넘침 0(목록·대화상자·흐름 뒤·빈·로딩), 표 안 가로 스크롤 0, 콘솔·페이지 오류 0(의도한 4xx·5xx 응답의 리소스 오류 줄 제외).
  - 통합(T17)에 남는 것: 실제 API(0071)로 등록·수정·내리기·정렬과 오류 코드 확인, 운영자 계정의 `POST /api/me/files` 업로드와 운영자 이미지 소유 규칙, E2E 정리에서 운영자 사용자를 지우기 전에 시험이 만든 `ad_banners` 삭제.
- 2026-10-09: 0085 통합에서 실제 API(0071)로 위 남은 것을 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `운영자 크리링 배너`·`무료 랜딩`).
  - 화면: 메뉴 `광고 배너`, 게시 0장 경고, 걸러보기 `예약 1`·`게시 중 2`·`전체 3`·`끝남 3`.
  - 등록: 대화상자 오류 3가지(ftp·차단 도메인·기간), 운영자 업로드(PNG·GIF 쌍).
  - 정렬·수정·내리기: 키보드 정렬과 안내, `수정`은 PATCH 본문이 `{ url }`뿐이고, `내리기`는 확인 뒤 `끝남`입니다.
  - 집계와 폭: 표 노출·클릭이 DB와 같고, 390·700·1280px에서 가로 넘침이 없습니다.
  - 정리: E2E는 운영자보다 `ad_banners`를 먼저 지웁니다(`tests/e2e/fixtures.ts`).
