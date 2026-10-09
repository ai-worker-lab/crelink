# 0075 스파이크: 로컬 파일에서 움직이는 이미지 첫 장면 얻기

- 단계: 티켓
- 역할: web
- 상위: 0063
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 S1입니다. 요구는 R20 ④, R21 ②입니다.

## 수용 기준

- [x] 위 `위험과 스파이크` 첫 줄. 미정 1이 A·D면 만들지 않습니다. (미정 1 = C라 진행. 결과·추천은 아래 진행 기록)

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` S1
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ④, R21 ②
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 스파이크 실행(web). 결론: **`createImageBitmap(file)` 하나로 충분**합니다. 서버 변환(미정 1 재상정)은 필요 없습니다.
  - 표본(임시 폴더 `/tmp/crelink-s1`, 저장소 밖): 장면 3개(1: 가운데 3:1 영역 왼쪽 반 빨강·오른쪽 반 투명, 영역 밖 검정 / 2: 파랑 / 3: 초록), 장면마다 500ms, 무한 반복. 형식 GIF(ffmpeg, 투명 팔레트)·움직이는 WebP(`img2webp -lossless`, `webpmux -info`로 `animation transparency`·3장면 확인)·APNG(ffmpeg `-f apng`, IDAT = 첫 장면). 크기 1500×900(위아래 자름)·3000×500(좌우 자름)·300×300(키우지 않음). 9개 모두 ffprobe로 3장면 확인.
  - 방법: 하네스 페이지가 `<input type="file">`로 받은 `File`마다 ① `createImageBitmap(file)` ② `ImageDecoder`(`decode({ frameIndex: 0 })` → `VideoFrame`) ③ `<img>`(blob URL, 문서에 붙여 재생) `decode()` 직후 canvas `drawImage` ④ ③을 1.3초(셋째 장면 구간) 뒤에 ⑤ `<img>` 1.3초 뒤 `createImageBitmap(img)` ⑥ 앱 도우미 `makeStillImage`(`still-image.ts`를 그대로 변환해 불러옴)로 3:1로 잘라 그린 뒤 화소를 읽었습니다. 판정: 왼쪽 위 모서리·왼쪽 가운데가 빨강 불투명이면 첫 장면·가운데 자르기 맞음, 오른쪽 가운데 알파 < 30이면 투명도 유지. 최악 PNG 크기는 1200×400 무작위 RGBA를 `toBlob('image/png')`로.
  - 데스크톱(Playwright 1.63, `setInputFiles`): Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6. iOS: Xcode 시뮬레이터 iPhone 17(iOS 26.5) Mobile Safari, UA `… iPhone OS 18_7 … Version/26.5 Mobile/15E148 Safari/604.1`. 시뮬레이터는 파일 고르기를 자동으로 할 수 없어 같은 표본을 `fetch` → `new File([blob], name, { type })`로 만들었습니다(디코딩 입력은 같은 Blob). 콘솔 오류는 네 곳 모두 0건.

    | 방법 | Chromium | Firefox | WebKit(macOS) | iOS 26.5 Safari(시뮬레이터) |
    | --- | --- | --- | --- | --- |
    | ① `createImageBitmap(file)` | 9/9 첫 장면·자르기·투명도 | 9/9 | 9/9 | 9/9 |
    | ② `ImageDecoder` | 9/9 | 9/9 | 첫 장면이지만 9/9 자르기 무시(원본 전체가 그려짐)·투명 → 검정 | 없음(`typeof ImageDecoder === 'undefined'`) |
    | ③ `<img>` 직후 `drawImage` | 9/9 | 9/9 | 9/9 | 9/9 |
    | ④ `<img>` 1.3초 뒤 `drawImage` | 9/9 첫 장면 | 9/9 | 9/9 | 9/9 |
    | ⑤ `<img>` 1.3초 뒤 `createImageBitmap(img)` | 9/9 첫 장면 | 9/9 | 9/9 **셋째 장면**(지금 장면) | 9/9 **셋째 장면** |
    | ⑥ `makeStillImage`(①+자르기+PNG) | 9/9, 1200×400 11,024B·300×100 1,094B, 5~25ms | 9/9, 3,813B·640B, 0~19ms | 9/9, 9,984B·1,034B, 4~43ms | 9/9, 9,984B·1,034B, 5~120ms |
    | 최악 PNG(1200×400 잡음) | 1,927,888B | 1,923,889B | 1,922,052B | 1,922,052B |

  - 추천: `createImageBitmap(file)` → canvas 가운데 3:1 자르기 → `toBlob('image/png')`. DOM·blob URL이 필요 없고 네 환경 모두 첫 장면·투명도를 지킵니다. 최악 PNG도 약 1.92MB라 4MB 한도 안입니다(설계 추정 약 1.9MB와 같음).
  - 설계와 다른 점: 설계 `정지 이미지`의 "`createImageBitmap(file)`, 되면 `ImageDecoder`"에서 **`ImageDecoder`를 쓰지 않습니다.** iOS Safari에 없고, macOS WebKit은 `drawImage(VideoFrame, sx, sy, sw, sh, …)`의 원본 영역을 무시하고 투명도를 잃습니다. 대체 경로(`<img>`)도 두지 않습니다. ①이 모든 환경에서 됐고, `<img>`를 거쳐 비트맵을 만들면 WebKit은 지금 장면을 돌려줍니다(⑤). `drawImage(img)`(③④)는 첫 장면이었지만 필요하지 않습니다.
  - 도우미(T12가 그대로 씀): `apps/web/src/lib/still-image.ts`
    - `stillCrop(source, { aspect, max })`: 가운데 기준 자르기 영역과 출력 크기(정수, 키우지 않음, 최소 1px, 홀수 픽셀은 오른쪽·아래가 1 더 잘림). 크기가 0·NaN이면 `RangeError`.
    - `makeStillImage(file, { aspect, max })`: 위 추천 방식으로 `<원본 이름>-still.png` `File`(`image/png`)을 돌려줍니다. 해석 못 하는 파일은 브라우저 `DOMException`을 그대로 던집니다(T12가 기존 이미지 오류 줄로 보임).
    - `stillFileName(name)`.
    - 공유 상수 `BANNER_ASPECT_RATIO`·`BANNER_STILL_SIZE`는 T1이 아직 넣지 않아 인자로 받습니다. T12는 `makeStillImage(file, { aspect: BANNER_ASPECT_RATIO, max: BANNER_STILL_SIZE })`로 부릅니다.
    - 단위 테스트 `still-image.spec.ts` 9건: 1500×900·3000×500·2400×800·300×300·반올림(500×333, 1001×300)·1×1·임의 크기 6개의 한도·비율·범위, 잘못된 크기, 파일 이름.
  - 남은 확인(미확인)
    - iOS 실기기와 인앱 브라우저(WKWebView, 예: 인스타그램)는 보지 않았습니다. 시뮬레이터 Mobile Safari와 같은 시스템 WebKit이지만, 확정 근거는 시뮬레이터 결과까지입니다. → **iOS 실기기·WKWebView 미확인.**
    - iOS 사진 보관함에서 고를 때 GIF가 다른 형식으로 바뀌어 넘어오는지는 시뮬레이터 자동화로 볼 수 없었습니다. T12 브라우저 확인에서 `file.type`을 봅니다(바뀌어 오면 서버가 `animated: false`라 정지 이미지를 만들지 않으므로 깨지지는 않음).
    - 첫 장면이 기본 이미지가 아닌 APNG(IDAT가 애니메이션 밖)와 Safari 데스크톱 앱은 시험하지 않았습니다.
  - 실행한 검사: `pnpm --filter @crelink/web test`(22건 통과, 새 9건 포함), `pnpm --filter @crelink/web typecheck`(통과), 바꾼 파일 `prettier --check`·`eslint`(통과), `pnpm work:scope`(통과). 화면을 바꾸지 않아 `make up`·`pnpm smoke`·폭 확인은 해당 없음(T12가 `ImageField`에 붙일 때 함). 전체 `pnpm verify`는 돌리지 않았습니다.
  - orchestrator: 설계 `변경 기록`에 위 결론과 `ImageDecoder` 제외를 옮겨 주세요.
