# crelink 디자인 시스템

> Category: Product

crelink 웹·앱이 함께 쓰는 시각 규칙입니다. 이 패키지는 OpenDesign에 가져와(`pnpm design:sync`) 모든 OpenDesign 산출물의 디자인 시스템으로 씁니다. 값의 원본은 `packages/design-tokens/src/tokens.json`이고, 같은 폴더의 `tokens.css`·`manifest.json`은 `pnpm tokens:generate`가 만듭니다. 앱 토큰 CSS 변수 이름의 접두사는 `tokens.json`의 `$cssPrefix`가 정하며, `pnpm design:check`가 이 문서의 토큰 이름을 원본과 대조합니다. 이 문서는 값 대신 쓰임새와 규칙을 설명합니다. 현재 값은 서비스 고유 색이 없는 중립 시작 팔레트이며, 서비스의 시각 디자인이 정해지면 `designer`가 값과 이 문서를 함께 바꿉니다.

## 시각 테마와 분위기

- 어두운 회색 무대 위에 화면 카드가 떠 있는 정돈된 제품 UI입니다. 장식보다 정보 위계와 상태 표현을 우선합니다.
- 강조색(파랑)은 화면마다 주요 행동 한두 곳에만 씁니다. 나머지 위계는 글자 굵기·크기·명도로 만듭니다.
- 모서리는 둥글지 않고 계단형(픽셀) 모서리입니다. 이 형태가 시작 스타일의 가장 큰 특징입니다.

## 색 역할

| 역할 | 앱 토큰 | OpenDesign 슬롯 |
| --- | --- | --- |
| 무대(페이지 바깥) | `--ds-color-background-stage` | — |
| 화면 배경 | `--ds-color-background-screen` | `--bg` |
| 카드·컨테이너 | `--ds-color-surface-default` | `--surface` |
| 띄운 면(팝오버·선택 행) | `--ds-color-surface-raised` | `--surface-warm` |
| 본문 글자 / 보조 / 흐린 글자 | `--ds-color-text-primary` / `-secondary` / `-subtle` | `--fg` / `--fg-2` / `--muted` |
| 테두리 / 약한 구분선 | `--ds-color-border-default` / `--ds-color-border-frame` | `--border` / `--border-soft` |
| 주요 행동 / 눌림 / 옅은 배경 | `--ds-color-action-primary` / `-primary-pressed` / `-primary-subtle` | `--accent` / `--accent-active` |
| 강조색 위 글자 | `--ds-color-text-on-action` | `--accent-on` |
| 성공 / 경고 / 위험 | `--ds-color-status-positive` / `-warning` / `-danger` | `--success` / `--warn` / `--danger` |
| 덮개·그림자 | `--ds-color-overlay-scrim` / `-shadow` | — |

- 상태 색은 글자보다 테두리·배지·옅은 배경(`*-subtle`)으로 씁니다. 위험 상태의 카드 테두리는 `--ds-color-border-danger`입니다.
- 장식선·스위치 손잡이처럼 글자가 아닌 흐린 요소는 `--ds-color-decoration-subtle`을 씁니다.

## 타이포그래피

- 글꼴은 `--ds-font-sans`(Pretendard 우선) 하나로 제목과 본문을 씁니다. 숫자·코드는 `--ds-font-mono`입니다.
- 크기는 `--ds-font-size-*` 스케일만 씁니다. 본문 15, 보조 13, 캡션 11~12, 소제목 18~22, 화면 제목 27~38, 첫 화면 대표 제목 64(작은 화면에서 38까지 줄임).
- 제목은 `--ds-font-weight-extrabold`, 강조 본문은 `--ds-font-weight-bold`, 나머지는 `--ds-font-weight-regular`입니다.
- 줄 간격은 본문 1.65, 제목 1.15이고 자간은 0입니다. 한국어 제목·본문은 어절 단위로 줄바꿈합니다(`word-break: keep-all`).

## 간격과 레이아웃

- 간격은 `--ds-space-*`(2·4·6·8·10·12·16·20·24·32·40·48)만 씁니다. 같은 묶음 안은 8~12, 묶음 사이는 16~24, 구획 사이는 32~48입니다.
- 내용 폭은 최대 1060px이고 좌우 여백은 데스크톱 32, 태블릿 24, 휴대폰 16입니다.
- 최소 폭 320px에서 가로 넘침이 없어야 합니다. 700px 이하에서는 한 열로 접습니다.
- 누를 수 있는 요소의 높이는 44px 이상입니다.

## 컴포넌트

- 모서리: 버튼·카드·입력은 `border-radius: 0`에 `clip-path` 계단 다각형을 씁니다. 계단 크기는 `--ds-corner-md`(작은 요소는 `--ds-corner-sm`)입니다.
- 주요 버튼: 배경 `--ds-color-action-primary`, 글자 `--ds-color-text-on-action`, 굵기 extrabold, 안쪽 여백 12·16. 화면당 한두 개만 둡니다.
- 카드·빈 상태: 배경 `--ds-color-surface-default`, 2px 테두리 `--ds-color-border-default`, 안쪽 여백 20.
- 상태 배지: 2px 테두리를 상태 색으로, 배경은 면 색으로 둡니다.
- 모든 화면은 로딩·성공(데이터 있음)·빈 상태·오류 상태를 함께 설계합니다. 오류에는 다시 시도할 수 있는 행동을 둡니다.
- SNS 브랜드 아이콘(인스타그램·유튜브 등)은 디자인 시스템 적용 제외입니다. 공식 파일을 원본 색·모양 그대로 쓰고 토큰·테마·모서리·필터를 걸지 않습니다(`apps/web/docs/sns-icons.md`).

## 상태와 접근성

- 키보드 초점은 3px 실선 링(`--ds-color-action-primary`)입니다. 계단 모서리가 바깥 링을 잘라내므로 계단 모서리 요소는 링을 안쪽(음수 `outline-offset`)에 그리고 색은 `currentColor`입니다.
- 비활성은 불투명도 0.48과 `not-allowed` 커서입니다.
- 일반 글자 대비 4.5:1, 큰 글자 3:1 이상을 실제 배경 쌍에서 확인합니다.
- 색만으로 상태를 전달하지 않고 글자·아이콘을 함께 둡니다.

## 모션

- 상태 변화는 150~200ms, `cubic-bezier(0.23, 1, 0.32, 1)`입니다. 들어올 때 `ease-in`을 쓰지 않습니다.
- `prefers-reduced-motion: reduce`에서는 애니메이션과 전환을 사실상 끕니다.
- 장식용 반복 애니메이션은 두지 않습니다.

## 하지 말 것

- `tokens.css`의 `:root` 밖에서 색 리터럴(hex, `rgb()`, `hsl()` 등)을 쓰지 않습니다. 새 색이 필요하면 `tokens.json`에 쓰임새 이름으로 추가합니다.
- 둥근 모서리, 그라디언트 배경, 보라·남색 계열 기본 강조색, 과한 그림자를 쓰지 않습니다.
- 자리표시 문구(lorem ipsum)나 임의 이미지를 넣지 않습니다. 실제 화면 문구와 상태를 씁니다.
- 디자인 도구 내부 파일을 웹·앱 런타임에서 불러오는 구조를 전제로 그리지 않습니다.

## 산출물 작성 규칙(OpenDesign 에이전트용)

- 산출물 CSS는 `var(--ds-*)`를 우선 씁니다. 웹·앱 구현이 같은 이름을 쓰므로 그대로 옮길 수 있습니다. OpenDesign 템플릿이 쓰는 공통 슬롯(`--bg`, `--accent` 등)은 같은 값을 가리킵니다.
- 산출물 첫 `<style>`에 `tokens.css`의 `:root` 블록을 그대로 붙입니다. 저장소 `design/<기능>/`에 옮길 때는 그 블록을 `<link rel="stylesheet" href="../system/tokens.css">`로 바꿉니다.
- 데스크톱(1280px)과 휴대폰(390px) 폭을 함께 확인합니다. 모바일 앱 화면은 390×844 기준입니다.
