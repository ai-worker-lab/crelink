# 0238 사이트 아이콘

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 기능
- 우선순위: P2
- 작성일: 2026-11-10

## 목적

운영 사이트에 파비콘이 없어 브라우저 탭에 아이콘이 나오지 않고 `/favicon.ico`가 404입니다. 2026-11-10 사용자가 후보 중 맞물린 두 고리를 골랐고 SVG를 원본으로 하라고 정했습니다.

## 수용 기준

- [ ] `app/icon.svg`가 원본이고 문서에 `rel="icon"` SVG 링크가 나옵니다. 180px에서 맞물린 자리에 흠이 없습니다.
- [ ] 휴대폰 홈 화면용 `apple-icon`이 나옵니다.
- [ ] 파비콘 예외를 지운 ego smoke가 통과합니다.
- [ ] `pnpm ci:local --report`가 통과합니다.

## 범위

- 포함: `apps/web/src/app/icon.svg`, `apps/web/src/app/apple-icon.png`, `tests/e2e/ego/lib/browser.mjs`, 변경 기록.
- 제외: 머리글 로고 교체(글자 `크리링` 유지), `favicon.ico`, 앱(Expo) 아이콘.

## 위험·복구

정적 파일만 추가합니다. 되돌리려면 이 변경을 revert합니다. 상표 조사는 하지 않았습니다.

## 연결

- 코드: `apps/web/src/app/icon.svg`

## 진행 기록

- 2026-11-10: 생성. 후보 C의 180px 흠은 위에 그리는 호의 양 끝을 다른 고리와 겹치지 않는 자리로 옮겨 없앴습니다. `apple-icon.png`는 같은 SVG의 모서리만 직각으로 해 180px로 렌더링했습니다(iOS가 모서리를 깎음).
