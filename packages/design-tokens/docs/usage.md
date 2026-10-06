# 디자인 토큰 사용법

`@crelink/design-tokens`는 색·간격·모서리·글자 크기·글자 굵기·글꼴 스택의 단일 원본입니다. 디자인(`design/`), 웹(`apps/web`), 앱(`apps/app`)은 모두 이 패키지의 생성물을 사용합니다. 결정 배경은 [ADR 0001 디자인 토큰 단일 원본](../../../docs/adr/0001-design-tokens.md)을 봅니다.

현재 `src/tokens.json`의 값은 서비스 고유 색이 없는 중립 시작 팔레트(어두운 회색 배경, 파란 강조색)입니다. 서비스의 시각 디자인이 정해지면 디자인 작업에서 값과 의미를 다시 정의합니다. 토큰 이름과 생성물의 식별자는 웹·앱이 의존하므로 바꿀 때 사용처를 함께 옮깁니다.

## 구성

| 경로 | 역할 | 편집 |
| --- | --- | --- |
| `src/tokens.json` | 토큰 이름과 값의 원본 | 직접 수정 (값·의미는 `designer` 소유) |
| `src/opendesign.json` | OpenDesign 디자인 시스템 공통 슬롯(`--bg`, `--accent`, `--text-*` 등)과 토큰의 대응, 패키지 이름·설명 | 직접 수정 (`designer` 소유) |
| `scripts/generate.mjs` | 원본 검증과 생성물 작성, `--check` 검사 | 통합 담당 |
| `generated/tokens.css` | 웹용 CSS 변수 (`@crelink/design-tokens/tokens.css`) | 생성물, 수정 금지 |
| `generated/index.js`, `generated/index.d.ts` | 앱(React Native)·TS용 객체와 리터럴 타입 (`@crelink/design-tokens`) | 생성물, 수정 금지 |
| `../../design/shared/tokens.css` | 디자인 산출물용 CSS 변수 (`generated/tokens.css`와 같은 내용) | 생성물, 수정 금지 |
| `../../design/system/tokens.css`, `manifest.json` | OpenDesign 디자인 시스템 패키지. 앱 토큰 CSS 변수와 공통 슬롯을 함께 담음([OpenDesign 사용 기준](../../../design/docs/opendesign.md#디자인-시스템-패키지)) | 생성물, 수정 금지 |

생성물은 저장소에 커밋하므로 웹·앱은 별도 빌드 단계 없이 import합니다.

## 토큰 값 바꾸기

1. `src/tokens.json`(필요하면 `src/opendesign.json`)을 수정합니다.
2. 루트에서 `pnpm tokens:generate`를 실행해 생성물을 갱신합니다. 로컬 OpenDesign을 쓰면 `pnpm design:sync`로 디자인 시스템도 갱신합니다.
3. 원본과 생성물을 함께 커밋합니다. `pnpm tokens:check`는 생성물이 원본과 다르면 실패하며, 루트 `pnpm typecheck`·`pnpm build`가 가장 먼저 실행합니다.

## 원본 규칙

`scripts/generate.mjs`가 다음 규칙을 검사하고 어기면 생성하지 않습니다.

- 최상위 `"$cssPrefix"`는 토큰이 아니라 CSS 변수 접두사 설정입니다([CSS 변수 접두사](#css-변수-접두사)). `$`로 시작하는 키는 토큰으로 만들지 않습니다.
- 키는 소문자·숫자·하이픈(kebab-case)만 씁니다. 숫자 키(`space.16`, `font.size.14`)는 스케일 값 자체를 이름으로 씁니다.
- `color` 값은 소문자 6자리 hex(`#ff8a3d`) 또는 `rgba(r, g, b, a)`입니다.
- 다른 토큰을 `"{color.action.primary}"`처럼 참조할 수 있습니다. 생성물에는 해석된 값이 들어갑니다. 없는 대상·순환 참조는 오류입니다.
- `src/opendesign.json`의 `tokens`는 OpenDesign 공통 슬롯을 하나도 빠짐없이 담아야 하고(목록과 쓰임새: `scripts/generate.mjs`의 `OPENDESIGN_SLOTS`), 값은 `"{color.text.primary}"` 같은 토큰 참조나 색이 아닌 CSS 값만 씁니다. 값 전체가 참조면 해석한 값이, `"0 8px 24px {color.overlay.shadow}"`처럼 다른 글자와 섞인 참조는 `var(--<접두사>-color-overlay-shadow)`가 들어갑니다. 색 리터럴은 오류입니다. 빠진 슬롯은 한 번에 모두, 쓰임새와 값 형식과 함께 안내합니다.
- 숫자 중 `space`, `corner`, `font.size`는 CSS에서 `px`를 붙이고, `font.weight`는 단위 없이 씁니다. 앱 객체에는 숫자 그대로 들어갑니다.

## 이름 규칙

이름은 쓰임새(의미)로 짓습니다. 예를 들어 흐린 글자는 `color.text.subtle`이며, 같은 계열이라도 글자가 아닌 장식선·스위치 손잡이는 `color.decoration.subtle`을 씁니다.

| 원본 경로 | CSS 변수 | 앱 객체 |
| --- | --- | --- |
| `color.text.subtle` | `--ds-color-text-subtle` | `color.text.subtle` |
| `color.action.primary-pressed` | `--ds-color-action-primary-pressed` | `color.action.primaryPressed` |
| `color.status.danger-subtle` | `--ds-color-status-danger-subtle` | `color.status.dangerSubtle` |
| `space.16` | `--ds-space-16` (`16px`) | `space[16]` (`16`) |
| `corner.md` | `--ds-corner-md` (`6px`) | `corner.md` (`6`) |
| `font.size.14` | `--ds-font-size-14` (`14px`) | `font.size[14]` (`14`) |
| `font.weight.bold` | `--ds-font-weight-bold` (`700`) | `font.weight.bold` (`700`) |
| `font.sans` | `--ds-font-sans` | `font.sans` |

CSS 변수는 `--<접두사>-` 뒤에 원본 경로를 하이픈으로 잇고, 앱 객체는 하이픈 키를 camelCase로 바꿉니다. 위 표의 `--ds-`는 현재 접두사 설정(`"$cssPrefix": "ds"`)의 결과입니다.

## CSS 변수 접두사

CSS 변수 접두사는 `src/tokens.json` 최상위 `"$cssPrefix"` 한 곳에서 정합니다. 값은 소문자로 시작하는 kebab-case(소문자·숫자·하이픈)이고, 형식이 틀리거나 OpenDesign 공통 슬롯 이름(`--bg`, `--text-*` 등)과 겹치면 생성기가 해결 방법과 함께 실패합니다. 생성기(`scripts/generate.mjs`)와 디자인 검사(`pnpm design:check`)는 이 설정을 읽으므로 손댈 필요가 없습니다.

접두사를 바꾸면 생성물의 변수 이름이 모두 바뀌므로 그 이름을 쓰는 소비 코드를 같은 변경에서 옮깁니다.

1. `"$cssPrefix"`를 바꾸고 `pnpm tokens:generate`를 실행합니다.
2. 이전 접두사 변수를 쓰는 곳을 새 접두사로 바꿉니다: 웹 스타일(`apps/web/src/styles.css` 등의 `var(--<이전>-*)`), `design/system/DESIGN.md`, `design/<기능>/` 산출물. 앱 객체(`color.text.subtle` 등)는 접두사와 무관합니다.
3. `pnpm design:check`가 `design/<기능>/` 산출물의 CSS와 `design/system/DESIGN.md`에 남은 이전 접두사 변수(`--<이전>-color-...`)를 고칠 이름과 함께 실패로 알려 줍니다. 웹 스타일은 검사하지 않으므로 이전 접두사를 검색해 남지 않았는지 확인합니다.

## 웹에서 쓰기

`apps/web/src/app/layout.tsx`에서 전역 스타일보다 먼저 CSS 변수를 불러오고, 스타일에는 토큰 CSS 변수(`var(--<접두사>-*)`, 현재 `var(--ds-*)`)만 씁니다.

```tsx
import '@crelink/design-tokens/tokens.css';
import '../styles.css';
```

## 앱에서 쓰기

```tsx
import { color, space, corner, font } from '@crelink/design-tokens';

const styles = StyleSheet.create({
  meta: { color: color.text.subtle, fontSize: font.size[12], marginTop: space[4] },
});
```

`font.sans`·`font.mono`는 CSS 글꼴 스택 문자열이므로 React Native `fontFamily`에 넣지 않습니다.

## 색 리터럴 예외

웹·앱 소스(`apps/web/src`, `apps/app/app`, `apps/app/src`)에는 색 리터럴을 쓰지 않습니다. 외부 서비스 공식 색(예: 소셜 로그인 버튼)이 필요하면 `color.brand.*` 같은 토큰을 추가해 씁니다. 예외는 `transparent`·`currentColor`·`inherit` 같은 CSS 키워드와 정적 에셋 파일(`apps/web/public/*.svg`, 글꼴)뿐입니다.
