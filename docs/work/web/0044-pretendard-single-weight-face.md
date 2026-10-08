# 0044 웹 본문이 Pretendard ExtraBold 한 굵기로만 그려짐

- 단계: 티켓
- 역할: web
- 상태: 검증
- 종류: 결함
- 우선순위: P2
- 작성일: 2026-10-07

## 목적

`apps/web/src/styles.css`의 `@font-face`가 `Pretendard` 이름으로 ExtraBold(800) 파일 하나만 선언합니다. 브라우저는 이 이름의 글꼴을 이 면 하나로만 찾으므로 보통(400)·굵게(700) 글자도 ExtraBold 파일로 그려집니다. 디자인 시스템의 굵기 위계(제목 extrabold, 강조 bold, 나머지 regular)가 화면에서 사라집니다.

## 수용 기준

- [x] 웹에서 400·700·800 굵기가 서로 다른 글리프로 그려집니다(예: 같은 문구의 canvas `measureText` 너비가 굵기마다 다름, `/docs/brand` 굵기 견본).
- [x] 쓰지 않는 굵기 파일을 내려받지 않고, 글꼴 라이선스 파일(`public/Pretendard-OFL.txt`)을 유지합니다.

## 범위

- 포함: `apps/web/src/styles.css` `@font-face`, `apps/web/public/` 글꼴 파일.
- 제외: 앱(`apps/app`) 글꼴.

## 위험·복구

해당 없음.

## 연결

- 디자인: `design/system/DESIGN.md` 타이포그래피 절
- 발견: [0043](../orchestrator/0043-public-docs-page.md)

## 진행 기록

- 2026-10-07: 생성. 0043 브라우저 확인(Playwright Chromium, 로컬 개발 서버)에서 `document.fonts`에 `Pretendard 800`만 있고, canvas `measureText('크리링 보통 Aa')` 너비가 `400 18px Pretendard`와 `800 18px Pretendard`에서 같음(109.4px).
- 2026-10-08: 사용자 결정으로 착수(브랜치 `work/0044-pretendard-single-weight-face`).
- 2026-10-08: 구현. 기존 `Pretendard-ExtraBold.woff2`가 Pretendard v1.3.9 배포 zip(`Pretendard-1.3.9.zip`, `web/static/woff2/`)의 같은 파일과 SHA-256이 같음(`dd7c1e15…`)을 확인하고, 같은 폴더의 `Pretendard-Regular.woff2`(765,892B)·`Pretendard-Bold.woff2`(791,156B)를 `apps/web/public/`에 그대로 넣음. `styles.css`에 토큰 굵기(`tokens.json` `font.weight` regular 400·bold 700·extrabold 800)마다 `@font-face` 하나씩. 다른 굵기(Thin~Black 중 나머지)는 토큰에 없어 넣지 않음. 가변 글꼴(`PretendardVariable.woff2`)은 파일 하나로 모든 굵기를 받게 되어 고르지 않음. `Pretendard-OFL.txt`는 배포 zip의 `LICENSE.txt`보다 저작권 고지(Source·Inter)가 더 있어 그대로 둠.
- 2026-10-08: 검증(로컬 개발 서버 5193, Playwright Chromium, `/docs/brand`). `document.fonts`의 Pretendard 면 400·700·800 모두 `loaded`(전에는 800 하나). canvas `measureText('크리링 보통 Aa')` 18px 너비 400 108.1px·700 109.0px·800 109.4px(전에는 셋 다 109.4px). 굵기 견본 스크린숏에서 보통·굵게·아주 굵게가 서로 다르게 보임. 받은 woff2는 Regular·Bold·ExtraBold 세 개뿐. 웹 이미지는 `apps/web/public`을 통째로 복사해(`apps/web/Dockerfile`) 새 파일도 운영에 포함됨.
- 2026-10-08: 검증 명령(Node 24.20.0): `pnpm verify` 8단계 통과, `pnpm smoke` 5건 통과, `pnpm work:scope 0044` 통과. 셸 기본 Node 22.23.2로 처음 돌린 `pnpm verify`는 API 시험 스위트가 `Must use import to load ES Module`(`@nestjs/common`)로 실패했는데 Node 버전 문제(`.nvmrc` 24)로 이 변경과 무관. 운영 확인은 머지·배포 뒤.
