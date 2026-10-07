# ADR 0001: 디자인 토큰 단일 원본과 공통 컴포넌트 규칙

- 날짜: 2026-10-01
- 상태: 승인 (결정 6은 [ADR 0013](0013-rounded-corners.md)가 대체)
- 범위: `packages/design-tokens`, `design/`, `apps/web`, `apps/app` (여러 영역)

## 배경

- 이 뼈대는 디자인·웹·앱이 한 저장소에 있는 모노레포이며, 이전 서비스에서 운영해 검증한 디자인 토큰 파이프라인을 그대로 씁니다.
- 색·간격·글자 크기를 디자인·웹·앱에 각각 따로 적으면 한 값을 바꿀 때 세 곳 이상을 고쳐야 하고, 이름과 값이 서로 어긋납니다.
- 서비스의 시각 디자인은 서비스마다 정합니다. 따라서 이 결정은 토큰을 관리하는 방식에 대한 것이며 특정 색·형태를 확정하지 않습니다.

## 결정

1. **단일 원본**: 토큰 이름과 값은 `packages/design-tokens/src/tokens.json` 한 곳에만 둡니다. 형식은 사람이 읽고 고치기 쉬운 중첩 JSON이고, `{color.action.primary}` 형태의 참조를 허용합니다. 값·의미는 `designer`, 생성기와 workspace 연결은 복합 작업의 통합 담당이 소유합니다([영역별 병렬 개발](../development/parallel-work.md)).
2. **생성물**: `pnpm tokens:generate`(`packages/design-tokens/scripts/generate.mjs`)가 원본을 검증하고 다음을 만듭니다. 생성물은 커밋하며 손으로 고치지 않습니다.
   - 웹: `generated/tokens.css` — `@crelink/design-tokens/tokens.css`로 import하는 `--ds-*` CSS 변수.
   - 앱: `generated/index.js`·`index.d.ts` — `import { color, space, corner, font } from '@crelink/design-tokens'`, camelCase 키와 리터럴 타입.
   - 디자인: `design/shared/tokens.css` — 웹 생성물과 같은 내용. OpenDesign 산출물은 이 파일을 불러옵니다.
3. **최신성 검사**: `pnpm tokens:check`는 생성물이 원본과 다르면 실패합니다. 루트 `pnpm typecheck`와 `pnpm build`의 첫 단계로 실행합니다.
4. **이름 규칙**: `--ds-*` 체계를 쓰고 쓰임새로 이름을 짓습니다(`color.text.subtle`, `color.action.primary-pressed`, `color.status.danger-subtle`, `color.overlay.scrim`). 간격·글자 크기는 값 자체를 이름으로 쓰는 스케일(`space.16`, `font.size.14`)입니다. 웹·앱 코드가 생성물 식별자에 의존하므로 키 이름을 바꿀 때는 사용처를 같은 변경에서 옮깁니다.
5. **색 리터럴 금지**: 웹(`apps/web/src`)·앱(`apps/app/app`, `apps/app/src`) 소스와 디자인 산출물(`design/` 안의 생성물 `tokens.css` 제외)에는 색 리터럴을 쓰지 않습니다. 예외는 `transparent`·`currentColor`·`inherit` 같은 키워드와 정적 에셋 파일(`apps/web/public/*.svg`, 글꼴)뿐입니다.
6. **시작 모서리 스타일(픽셀 모서리)** — 대체됨, [ADR 0013](0013-rounded-corners.md): 뼈대의 시작 컴포넌트는 계단형 모서리를 쓰며, 서비스 디자인에서 바꿀 수 있습니다. 계단형 모서리 크기는 `corner.md`·`corner.sm` 토큰으로 정합니다.
   - 웹은 `clip-path` 다각형을 씁니다. `clip-path`는 outline과 box-shadow도 잘라내므로 포커스 링은 요소 안쪽(음수 `outline-offset`)에 그립니다.
   - 앱(React Native)은 `PixelFrame`(`apps/app/src/components/ui/index.tsx`)으로 그립니다. 가운데 띠와 좌·우 기둥, 세 개의 절대 위치 `View`를 겹치지 않게 깔아 계단 모양을 만듭니다. 크기 측정(`onLayout`)이나 SVG가 필요 없어 첫 프레임이 깜빡이지 않고, 부모 배경색을 몰라도 되며, 새 의존성이 없습니다.
7. **컴포넌트 규칙 기준**: 버튼·카드·입력·상태 표시 등의 시각 규칙과 웹 CSS 변수·앱 객체 경로 대응은 디자인 작업에서 `design/` 산출물로 정의합니다. 웹·앱은 이를 각자 소유한 코드로 구현하고 `design/` 파일을 런타임에서 불러오지 않습니다.

## 결과와 트레이드오프

- 토큰 값을 바꾸려면 `tokens.json` 한 곳을 고치고 `pnpm tokens:generate`를 실행하면 디자인·웹·앱에 모두 반영됩니다. 생성물을 빠뜨리면 루트 검사에서 실패합니다.
- 생성물을 커밋하므로 웹·앱은 빌드 단계 없이 토큰을 씁니다. 대신 원본과 생성물이 같은 변경에 함께 들어가야 합니다.
- 현재 토큰 값은 서비스 고유 색이 없는 중립 시작 팔레트입니다. 서비스의 시각 디자인이 정해지면 `designer`가 값과 의미를 다시 정의하고, 쓰지 않는 키는 사용처와 함께 정리합니다.
- React Native는 `font.sans`·`font.mono`(CSS 글꼴 스택)를 쓸 수 없어, 앱은 번들 글꼴을 추가하기 전까지 시스템 글꼴을 씁니다.
- 사용법: [디자인 토큰 사용법](../../packages/design-tokens/docs/usage.md).
