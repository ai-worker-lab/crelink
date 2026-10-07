# 0040 웹·앱 화면에 스튜디오 라이트 디자인 적용

- 단계: 티켓
- 역할: orchestrator
- 선행: 0020
- 상태: 준비
- 종류: 유지보수
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-07

## 목적

0020에서 토큰과 디자인 시스템을 스튜디오 라이트(밝은 바탕·흰 카드·둥근 모서리·산호빛 빨강 강조)로 바꿨지만, 웹 스타일은 아직 템플릿 시작 스타일(계단형 픽셀 모서리, 어두운 바탕 전제)로 짜여 있고 앱 상태 표시줄은 밝은 글자입니다. 화면을 새 디자인 시스템 규칙에 맞춥니다. 웹·앱·패키지 문서를 함께 바꾸므로 orchestrator 티켓입니다.

## 수용 기준

- [ ] `apps/web/src/styles.css`에서 계단 모서리(`--notch-md`, `clip-path` 다각형)가 사라지고 모서리는 `--ds-corner-*`의 `border-radius`로 그린다(`design/system/DESIGN.md` 컴포넌트 절).
- [ ] 웹 화면(`/`, `/me`, `/me/landings/{publicId}`, `/p/{publicId}`, `/notice`, `/privacy`, `/admin…`)이 DESIGN.md를 따르고 390px·1280px에서 가로 넘침·대비 문제가 없다.
- [ ] 초점 링이 DESIGN.md(바깥 3px, 2px 간격, 본문 글자색)와 같다.
- [ ] 앱 `StatusBar`·`PixelFrame` 등 어두운 바탕·계단 모서리 전제를 밝은 바탕·둥근 모서리로 바꾼다.
- [ ] `packages/design-tokens/docs/usage.md`의 "중립 시작 팔레트" 서술과 `corner.md` 예시 값(6px)을 현재 값에 맞춘다.
- [ ] `pnpm verify`, `pnpm smoke`, `pnpm e2e`가 통과한다.

## 범위

- 포함: 웹 스타일·필요한 마크업 클래스, 앱 공통 UI 컴포넌트, 토큰 사용법 문서.
- 제외: 기능 추가, 토큰 값 변경(designer 0020 소관).

## 위험·복구

0020과 함께 머지하지 않으면 그 사이 웹은 밝은 색에 큰 계단 모서리, 앱은 안 보이는 상태 표시줄로 보입니다. 되돌리기는 PR revert입니다.

## 연결

- 디자인 시스템: [DESIGN.md](../../../design/system/DESIGN.md), 토큰 원본 `packages/design-tokens/src/tokens.json`
- 웹 스타일 `apps/web/src/styles.css`, 앱 `apps/app/app/_layout.tsx`, `apps/app/src/components/ui/index.tsx`

## 진행 기록

- 2026-10-07: 생성. 0020(designer)이 토큰·DESIGN.md를 바꾸며 소유 범위 밖 반영 작업을 넘김.
