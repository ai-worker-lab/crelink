# 0083 배너 슬롯 패널 목록

- 단계: 티켓
- 역할: web
- 상위: 0063
- 선행: 0079
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T15입니다. 요구는 R21 ②③④⑤⑥입니다.

## 수용 기준

- [x] 배너 슬롯 패널 목록: 배지, 정렬, 숨기기(409 되돌림), 차단 표시, 보이는 배너 0장 문장, 코드별 한도·회수 처리, BFF. 390·1280px.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T15
- 요구: [PRD](../../product/crelink.md#요구사항) R21 ②③④⑤⑥
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간, 0084와 한 번에). 계약 `CreatorLandingState.banners`·`bannerLimits`·`slot`, `CreatorBannerView`, `UpdateBannerRequest`, `ReorderRequest`, `CRELINK_API_PATHS.meBanner`·`meBannersOrder` 그대로(계약 변경 없음). 실제 API(0070)는 병렬 구현 중이라 계약 mock으로 확인.
  - 새 `components/manage/BannerSlotSection.tsx`(`PageEditor`의 `case 'banner-slot'`, 0079의 자리 표시 `BannerSlotPanel`을 대체): 배지 `보이는 배너 a/n장`·`숨긴 배너 포함 전체 b/m장`(가득 차면 `limit-full`), 행(손잡이·3:1 썸네일 96×32, 움직이는 배너는 정지 이미지·대체 문구 한 줄 말줄임·도메인 또는 `연결 없음`·숨기기 스위치·`수정`), 숨김 흐림 0.45·`숨김`, 차단 `차단됨`·사유·스위치 `aria-disabled`(`수정`은 됨), 행 `저장 안 함`. dnd-kit 끌기·키보드 정렬 → `PUT /api/me/banners/order { ids }`, 응답 목록으로 바꾸고 실패하면 되돌림. 안내 `<대체 문구> 배너를 들었어요. 지금 k번째, 전체 n장이에요.`·`… k번째 자리에 놓았어요.`. 숨기기는 `PATCH { hidden }` 뒤 상태 다시 읽기, 실패하면 되돌림. `배너 추가`는 보관 상한·보이는 한도면 안내로 바뀜. 보이는 배너 0장 문장.
  - 오류 코드(`rethrowBannerError`, `useAction`이 코드를 버려 task 안에서 처리): `banner_limit_reached`·`banner_total_limit_reached`는 편집 상태를 다시 읽어 그 `bannerLimits`의 n·m 문장(`limits.ts` `bannerLimitError`), `banner_slot_not_granted`는 `ManagerContext.bannerSlotRevoked`(상태 다시 읽기). 다시 읽은 `slot.kind`가 'ad'로 바뀌면 `ManagerProvider`가 배너 초안을 모두 버리고 `slotNotice`(`배너 슬롯이 회수되어 이 자리에 다시 크리링 광고 블록이 나와요.`)를 두며, `PageEditor`는 배너 패널이 사라진 것으로 보고 처음 패널로 돌아가 안내(`BannerSlotNotice`)에 초점(넓은 화면 처음 패널 머리 아래, 좁은 화면 sticky 줄 아래). 대상을 고르면 안내를 지움.
  - BFF 허용(`app/api/backend/[...path]/route.ts`): `POST api/me/banners`, `PUT api/me/banners/order`, `PATCH·DELETE api/me/banners/{ID}`.
  - 디자인 인계와 다른 점: 행의 스위치·`수정`을 썸네일 줄 아래로 내림(패널 380~430px에 썸네일 96px까지 한 줄이면 대체 문구가 두세 글자만 남아, 링크 행의 1199px 이하 배치를 따름). 보이는 한도로 추가가 막힐 때 문구는 handoff에 없어 `보이는 배너는 n장까지예요. 다른 배너를 숨기거나 지우면 새 배너를 추가할 수 있어요.`(링크 한도 안내 모양). 차단 사유 줄은 링크 행처럼 `크리링이 이 배너를 차단해 방문자에게 보이지 않아요. 주소를 고쳐도 운영자가 풀 때까지 차단돼요. 사유: …`. 목록 위 도움말 한 줄(`배너를 누르면 고칠 수 있고, 손잡이를 끌면 순서가 바뀌어요. …`)은 외부 링크 패널과 맞춰 더함.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, 0084와 함께).
  - `pnpm --filter @crelink/web test` 40/40(새 `limits.spec.ts` 2건: n·m 문장, 추가 막힘 경계 n-1·n·보관 상한), `pnpm verify --fast` 통과, `pnpm work:scope 0083 --base HEAD` 통과(통합 브랜치 기준 비교는 이미 들어간 다른 역할 커밋 때문에 실패하므로 작업 트리만 확인).
  - 브라우저(Playwright Chromium, PORT_SLOT=49: 계약 mock API `/tmp/crelink-t15-mock/server.mjs` 7920 + `next dev` 10093, 확인 스크립트 `check.mjs`, 저장소 밖): 1280×820·390×844에서 각 35항목 통과. 배지 `보이는 배너 1/3장`·`숨긴 배너 포함 전체 3/5장`, 행 3개·`연결 없음`·차단 스위치 `aria-disabled`·사유·`숨김`. 한도 1로 바꾼 뒤 숨긴 배너 스위치 → 409 문장 `보이는 배너는 1장까지예요. …`과 스위치 되돌림, 한도 복구 뒤 다시 보이기 성공·배지 `2/3장`. 키보드 정렬(스페이스·↓·스페이스) → `PUT /api/me/banners/order`·화면 순서·안내 `하루 굿즈 판매 중 배너를 2번째 자리에 놓았어요.`. 보관 상한 4 → `배너는 숨긴 것까지 4장까지 둘 수 있어요. …`·`배너 추가` 없음, 보이는 한도 → 추가 막힘 문장. 모두 숨김 → 0장 문장과 미리보기 점선 자리. 폼을 연 채 회수(mock 403) → 회수 안내·초점, 1280은 처음 패널 `광고 블록` 줄, 390은 시트 닫힘, 초안 버림, 미리보기 광고 블록. 가로 넘침 0(패널·폼·0장·회수 뒤), 콘솔 오류·페이지 예외 0(의도한 409·422·500 응답의 리소스 실패와 mock 링크 가짜 도메인 사이트 아이콘 제외, DELETE 204는 Chromium이 평범한 fetch에도 `ERR_ABORTED` requestfailed로 남겨 세지 않음).
  - `pnpm smoke` 5/5 통과(`.local/instance.env` 슬롯 49의 주소로 위 mock API·`next dev`를 대상으로 실행. `make up`은 부모 checkout과 Compose 프로젝트 이름(`crelink`)이 같아 띄우지 않음).
  - 확인하지 못한 것: 실제 API(0070) 연결(통합 E2E, T17), 포인터 끌기(키보드만).
- 2026-10-09: 0085 통합에서 실제 API(0070)로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `배너 슬롯`).
  - 배지와 한도: `보이는 배너 n/5장`·`숨긴 배너 포함 전체 5/20장`, 0장 문장, 5장이면 `배너 추가` 대신 안내.
  - 숨기기: 스위치 숨김, 다시 보이기 409면 n을 넣은 문장이 나오고 스위치가 되돌아갑니다.
  - 정렬: 키보드 정렬이 공개 랜딩 첫 장과 같습니다.
  - 차단: 차단 배너는 `차단됨`·사유·잠긴 스위치입니다.
  - 편집 중 회수: 회수 안내가 나오고 처음 패널로 돌아갑니다.
