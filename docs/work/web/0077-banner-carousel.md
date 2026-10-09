# 0077 공개 랜딩 배너 캐러셀

- 단계: 티켓
- 역할: web
- 상위: 0063
- 선행: 0067, 0076
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T9입니다. 요구는 R20 ①③④⑥, R21 ③, R19, R9입니다.

## 수용 기준

- [x] 공개 랜딩: `BannerCarousel`(children, 초점 규칙, `inert`, `aria-live`)과 `Landing` 배치(`afterLinkCount`, `ul`·빈 랜딩 판정), 이미지 실패 건너뛰기, `<picture>`·멈춤(미정 1), `/privacy` 문구. 계약 기반 mock으로 확인: 위치 3가지·1장·여러 장·숨김·슬롯만 있는 빈 랜딩, 390·1280·320px. 레이블 `크리링 광고`·`다음 배너`.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T9
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ①③④⑥, R21 ③, R19, R9
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(0078·0079와 한 작업공간, 통합 브랜치 `work/0085-ad-banner-integration` 위).
  - 새 `apps/web/src/components/landing/BannerCarousel.tsx`(`'use client'`): 장 내용은 children(`Landing`이 장마다 `<a>`·고르기 버튼·그냥 이미지를 정함). 영역 `section` `aria-roledescription="캐러셀"`·`aria-label`(`크리링 광고`, `<표시 이름> 배너`, 없으면 `크리에이터 배너`), 장마다 `role="group"` `aria-roledescription="배너"` `aria-label="k / n"`, 보이지 않는 장 `inert`, `aria-live` `n장 중 k번째 배너`. scroll-snap 트랙, `이전 배너`·`다음 배너`(끝에서 `disabled`, 비활성이 되는 버튼에 초점이 있으면 커밋 뒤 반대 버튼으로), ←/→(`preventDefault` + `scrollTo`, 새 장 링크로 초점, 링크가 없으면 영역), 지금 장은 `IntersectionObserver`(60%), 자동 넘김 없음, 움직임 줄이기면 부드러운 스크롤 끔. 이미지 실패 장은 건너뛰고(`onError`와 마운트 때 `complete && naturalWidth === 0`) 0장이면 아무것도 그리지 않음. 첫 장 말고 `loading="lazy"`.
  - 움직이는 배너(미정 1 C, handoff D1): `BannerPicture`가 `<picture><source media="(prefers-reduced-motion: reduce)" srcset=정지>`로 고르고, 한 장이라도 움직이면 조작 줄 오른쪽 끝에 `움직임 멈추기`/`다시 재생`(이름만 바꿈, `aria-pressed` 없음). 누르면 모든 움직이는 장이 정지 이미지로 바뀌고 장을 넘겨도 유지, 저장 안 함. 움직임 줄이기면 버튼(과 버튼만 있는 1장 배너 슬롯 조작 줄)을 CSS로만 숨김. 좁아서 조작 줄이 넘치면(컨테이너 250px 이하) 위치 `k / n`만 숨김.
  - `Landing.tsx`: `blocks[0].slot`을 링크 목록 `ul` 안 `afterLinkCount` 자리의 `li`에 둠, `slot`이 없거나 null이면 그리지 않음(옛 API 겹침 구간), `ul`은 보이는 링크나 슬롯이 있을 때, `hasLinkContent`에 슬롯을 넣어 슬롯만 있는 랜딩에서 `아직 준비 중인 페이지예요.`·`아직 올린 링크가 없어요.`를 보이지 않음. 방명록 탭을 켜면 `링크` 탭 안에만 있음(기존 탭 구조 그대로).
  - `/privacy`: 수집 항목에 크리에이터 배너 클릭, 새 절 `크리링 광고 노출·클릭 수`(개인 식별 정보 없이 날짜·랜딩·배너별 수), 이용 목적, 보관 기간(배너 클릭 원본 1년 뒤 집계, 광고 수는 계속 보관).
  - 스타일: `styles.css` `.banner-*` 블록(새 토큰 없음: 틀 `surface-default`·`border-default`·`corner-lg`, 배너 `corner-md`, 배지 `border-strong`·`text-secondary`·`corner-sm`, 위치 `font-mono`).
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`).
  - `pnpm --filter @crelink/web test` 30/30, `pnpm verify --fast` 통과(tokens·work·docs·design·lint·typecheck).
  - 계약 fixture 확인: 저장소 밖 임시 mock API(`/tmp`, `packages/shared` 모양의 `PublicLandingResponse` 12종)와 `next dev`(PORT_SLOT=42 포트 9393·7220, 부모 인스턴스와 겹치지 않음)를 띄워 Playwright Chromium으로 `/p/{id}`를 390·1280·320px에서 열었습니다. 12종 × 3폭 모두 가로 넘침 0, 콘솔 오류 0.
    - 위치: 맨 뒤(`afterLinkCount` 3)·맨 앞(0)·사이(2) 모두 `ul`의 해당 `li`. 1장 광고는 조작 줄에 `광고`만, 여러 장은 `광고 1 / 2`·`이전 배너(disabled)`·`다음 배너`, 2번째 장 `inert`. 숨김(`slot: null`)·옛 응답(`slot` 없음)은 슬롯 없음. 포트폴리오만 있는 랜딩은 링크 목록 자리에 광고 블록만. 슬롯만 있는 빈 랜딩(배너 슬롯 1장, 프로필 없음)은 빈 랜딩 문구 없음. 방명록 탭 랜딩은 `링크` 탭 안. 배너 슬롯 1장(움직임)은 멈춤 버튼만 있는 조작 줄, 여러 장은 배지 없음. 이미지 하나 실패(3장 중 1장)는 `1 / 2`로 건너뜀, 모두 실패는 블록 없음.
    - 상호작용(390): `다음 배너` → `2 / 2`·다음 비활성·초점 `이전 배너`로 이동·`aria-live` `2장 중 2번째 배너`, 5초 기다려도 `2 / 2`, ← → `1 / 2`·초점 1번째 장 링크, → → `2 / 2`·초점 2번째 장 링크, 트랙을 직접 스크롤(스와이프 대신)하면 `1 / 2`로 갱신. 1280: `움직임 멈추기` → 이름 `다시 재생`, 움직이는 장 src가 정지 이미지, 정지 배너는 그대로. `reducedMotion: reduce`: 멈춤 버튼 숨김, `currentSrc`가 정지 이미지, 1장 배너 슬롯은 조작 줄 숨김.
  - 확인하지 못한 것: 실제 API 연결(0068이 통합 브랜치에 들어갔다는 알림은 받았으나 이 작업공간에서 실제 API로 띄워 보지 않음, 통합 티켓 E2E 몫), 손가락 스와이프·iOS WKWebView, 스크린리더 낭독, `pnpm smoke`(실제 API·DB 인스턴스를 띄우지 않음).
- 2026-10-09: 0085 통합에서 실제 API로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts`).
  - 캐러셀: 위치 3가지, `광고` 배지·`1 / 2`, 5초 동안 자동 넘김 없음, `다음 배너` 끝 비활성, ←로 첫 장(초점은 새 장 링크), `aria-live` 문장.
  - 배너 슬롯: 배지 없는 `<이름> 배너`, 1장이면 조작 줄 없음, 여러 장이면 `1 / n`.
  - 숨김과 탭: 숨김 조건, 포트폴리오만 있는 랜딩, 방명록을 켠 랜딩의 `링크` 탭 안.
  - 움직이는 배너: `움직임 멈추기` 뒤 정지 이미지, `reduce` 설정은 처음부터 정지 이미지이고 버튼이 없습니다.
  - 폭: 320·390·1280px에서 가로 넘침이 없습니다.
  - 이미지 실패 건너뛰기는 위 mock 확인까지입니다. 손가락 스와이프·스크린리더는 설계대로 수동 확인 몫입니다.
