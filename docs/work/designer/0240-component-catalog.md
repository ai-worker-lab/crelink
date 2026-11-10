# 0240 웹 컴포넌트 카탈로그 1차

- 단계: 티켓
- 역할: designer
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-10

## 목적

`design/system/DESIGN.md`의 컴포넌트 규칙은 짧고 웹 컴포넌트는 약 70개 파일에 흩어져 있어, 어떤 공통 부품이 있고 상태·접근성에서 무엇이 빠졌는지 한곳에서 볼 수 없습니다. 다음 화면 설계와 구현이 같은 부품을 다시 만들지 않도록 현재 상태를 정리합니다.

## 수용 기준

- [x] `design/docs/component-catalog.md`(250줄 이하)에 웹 공통 부품 목록, `apps/web/src/components/manage/`의 재사용 패턴 상세 비교, 개선 후보 최대 10개, 참고 기록이 있습니다.
- [x] 카탈로그의 파일 경로와 CSS 클래스가 실제로 존재하고, 실제 화면에서 보지 않은 동작은 `코드 기준`으로 표시합니다.
- [x] `pnpm design:check`, `pnpm docs:check`, `pnpm work:scope 0240`, `pnpm work:check`가 통과합니다.

## 범위

- 포함: 소스 읽기 기반 카탈로그, Astryx 공개 문서를 참고한 상태·접근성 비교.
- 제외: 제품 코드·`DESIGN.md`·토큰 변경, Astryx 설치와 도입, 새 시안, 앱(Expo)과 `manage/` 밖의 상세 비교.

## 위험·복구

해당 없음. 문서 한 개만 추가하며 되돌리면 끝납니다.

## 연결

- 디자인 시스템: [DESIGN.md](../../../design/system/DESIGN.md)
- 토큰 ADR: [ADR 0001](../../adr/0001-design-tokens.md)

## 진행 기록

- 2026-11-10: 생성·착수(사용자 승인 "1번 진행해보자."). 효과 지표는 측정 불가입니다. 다음 관리 화면 설계에서 재사용되는지 정성적으로만 볼 수 있습니다.
- 2026-11-10: [컴포넌트 카탈로그](../../../design/docs/component-catalog.md) 작성(designer). 소스 읽기와 Astryx 공개 문서 `get` 12건 기준이며 실제 화면·보조기술 확인은 하지 않았습니다. 개선 후보는 이번에 필요 6건, 나중 4건입니다.
- 2026-11-10: CEO 확인. 215줄. `design:check`(`od lint`는 로컬 OpenDesign이 없어 건너뜀)·`docs:check`·`work:scope 0240`·`work:check` 재실행 통과. `window.confirm` 11곳, 스위치 5벌, `.action-status:empty`, `.back-button` 36px, `.view-toggle` 40px, `.input:disabled` 0.6, `manage/InstabioImport.tsx:305`, `manage/AddressBar.tsx:296`을 코드와 대조해 일치를 확인했습니다. 개선 후보 구현은 별도 티켓입니다.
