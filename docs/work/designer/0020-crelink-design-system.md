# 0020 크리링 고유 디자인 시스템

- 단계: 티켓
- 역할: designer
- 상태: 검증
- 종류: 제품 결정
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-06

## 목적

지금 웹은 템플릿의 중립 시작 스타일(계단형 픽셀 모서리, 어두운 회색 무대, 파랑 강조, `design/system/DESIGN.md`)을 그대로 씁니다. 이것은 크리링을 위해 정한 디자인이 아닙니다. 크리링 브랜드에 맞는 고유 디자인 시스템(색, 글꼴, 모서리, 분위기, 컴포넌트 규칙)을 정해 토큰과 화면에 반영해야 합니다.

## 수용 기준

- [x] 크리링 디자인 방향(분위기·색·글꼴·모서리)을 사용자가 승인한다.
- [x] `packages/design-tokens/src/tokens.json`과 `design/system/DESIGN.md`가 승인된 디자인으로 바뀌고 `pnpm tokens:check`·`pnpm design:check`가 통과한다.
- [ ] (0040으로 넘김) 웹 화면(`/`, `/me`, `/p/{publicId}`, `/notice`, `/privacy`, `/admin…`)이 새 디자인을 따르고, 템플릿 시작 스타일(계단 모서리 `--notch-md` 등)이 남지 않는다.

## 범위

- 포함: 디자인 방향 결정, OpenDesign 시안, 토큰·디자인 시스템 문서.
- 웹·앱 화면 반영과 토큰 사용법 문서는 역할 소유 범위 밖이라 0040(orchestrator)에서 합니다.
- 제외: 기능 추가.

## 위험·복구

토큰 값만 바꾸고 이름은 그대로라 웹·앱이 이 브랜치를 받으면 바로 밝은 색으로 바뀝니다. 웹은 아직 계단 모서리(`--notch-md`)가 `--ds-corner-md`를 써서 계단이 6px에서 12px로 커지고, 앱 상태 표시줄은 `style="light"`라 밝은 바탕에서 안 보입니다. 이 PR은 0040과 함께(또는 0040 직전에) 머지합니다. 되돌리기는 이 PR revert 한 번입니다.

## 연결

- 계기: 2026-10-06 사용자 질문 "디자인이 왜 픽셀(도트) 디자인이 들어가 있나" — 원인은 skeleton 템플릿 시작 스타일(`design/system/DESIGN.md` "계단형(픽셀) 모서리", `apps/web/src/styles.css` `--notch-md`).
- MVP 설계의 디자인 결정: [MVP 기술 설계](../../specs/crelink-mvp.md)(기본 디자인 토큰으로 바로 구현), [PRD 범위](../../product/crelink.md#범위)
- 기준: [OpenDesign 사용 기준](../../../design/docs/opendesign.md)

## 진행 기록

- 2026-10-06: 생성. 사용자 결정: 크리링 고유 디자인 시스템 작업이 필요하다. 다만 기능과 프론트 구성을 먼저 잡고 그 뒤에 디자인을 맞춘다. 그때까지 구현은 현재 시작 스타일로 진행한다.
- 2026-10-07: OpenDesign에서 시안 3개(A 스튜디오 라이트·B 에디토리얼 모노·C 나이트 스테이지)를 공개 랜딩·링크 관리 편집 화면에 적용해 비교(OpenDesign 프로젝트 `d605bda8-fb9a-49d2-a54b-20ee82f2d0e2`, `crelink-design-directions.html`). 사용자 결정: A안 확정, 토큰과 DESIGN.md부터 반영.
- 2026-10-07: `tokens.json` 색을 A안 값으로 바꾸고(이름 유지) `corner`를 sm 8·md 12로 바꾸고 lg 16·full 999를 더함. `opendesign.json` `--bg`를 페이지 바탕(`background.stage`)으로, `--radius-lg`·`--radius-pill`·`--elev-raised`를 새 토큰으로. `pnpm tokens:generate`로 생성물 갱신. `design/system/DESIGN.md`를 스튜디오 라이트 규칙으로 다시 씀(계단 모서리 금지, 둥근 모서리·알약 버튼, 초점 링 바깥 2px·본문 글자색, 강조색·위험색 구분). 대비는 흐린 글자/페이지 바탕 5.62:1, 강조색 위 흰 글자 5.14:1, 경고 글자/흰 카드 4.98:1, 입력 테두리/흰색 3.12:1(sRGB 상대 휘도 계산). 웹·앱 반영은 0040.
