# 0044 웹 본문이 Pretendard ExtraBold 한 굵기로만 그려짐

- 단계: 티켓
- 역할: web
- 상태: 분류 대기
- 종류: 결함
- 우선순위: P2
- 작성일: 2026-10-07

## 목적

`apps/web/src/styles.css`의 `@font-face`가 `Pretendard` 이름으로 ExtraBold(800) 파일 하나만 선언합니다. 브라우저는 이 이름의 글꼴을 이 면 하나로만 찾으므로 보통(400)·굵게(700) 글자도 ExtraBold 파일로 그려집니다. 디자인 시스템의 굵기 위계(제목 extrabold, 강조 bold, 나머지 regular)가 화면에서 사라집니다.

## 수용 기준

- [ ] 웹에서 400·700·800 굵기가 서로 다른 글리프로 그려집니다(예: 같은 문구의 canvas `measureText` 너비가 굵기마다 다름, `/docs/brand` 굵기 견본).
- [ ] 쓰지 않는 굵기 파일을 내려받지 않고, 글꼴 라이선스 파일(`public/Pretendard-OFL.txt`)을 유지합니다.

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
