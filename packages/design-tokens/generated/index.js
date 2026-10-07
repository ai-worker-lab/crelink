// @crelink/design-tokens에서 생성한 파일. 직접 고치지 않는다. 원본: packages/design-tokens/src/tokens.json, 생성: pnpm tokens:generate
export const color = {
  background: {
    stage: "#f5f7f9",
    screen: "#ffffff",
    device: "#171b20",
  },
  surface: {
    default: "#ffffff",
    raised: "#f0f3f7",
    bar: "#ffffff",
  },
  border: {
    default: "#dfe1e5",
    strong: "#8f9298",
    frame: "#e9ebef",
    danger: "#f6c2bf",
  },
  text: {
    primary: "#171b20",
    secondary: "#44484e",
    subtle: "#5f636a",
    onAction: "#ffffff",
    onPositive: "#ffffff",
  },
  decoration: {
    subtle: "#a7abb1",
  },
  action: {
    primary: "#d02d27",
    primaryPressed: "#b31415",
    primarySubtle: "rgba(208, 45, 39, 0.1)",
  },
  status: {
    positive: "#137738",
    positiveSubtle: "rgba(19, 119, 56, 0.1)",
    danger: "#b6143f",
    dangerSubtle: "rgba(182, 20, 63, 0.08)",
    warning: "#9d6300",
    warningSubtle: "rgba(157, 99, 0, 0.1)",
  },
  overlay: {
    scrim: "rgba(23, 27, 32, 0.48)",
    shadow: "rgba(23, 27, 32, 0.08)",
  },
};

export const space = {
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
};

export const corner = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const font = {
  size: {
    10: 10,
    11: 11,
    12: 12,
    13: 13,
    14: 14,
    15: 15,
    16: 16,
    18: 18,
    22: 22,
    27: 27,
    34: 34,
    38: 38,
    64: 64,
  },
  weight: {
    regular: 400,
    bold: 700,
    extrabold: 800,
  },
  sans: "Pretendard, -apple-system, \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif",
  mono: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
};

export const tokens = { color, space, corner, font };
