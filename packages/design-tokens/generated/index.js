// @crelink/design-tokens에서 생성한 파일. 직접 고치지 않는다. 원본: packages/design-tokens/src/tokens.json, 생성: pnpm tokens:generate
export const color = {
  background: {
    stage: "#0e0f11",
    screen: "#131517",
    device: "#08090a",
  },
  surface: {
    default: "#1c1f23",
    raised: "#252a30",
    bar: "#16181b",
  },
  border: {
    default: "#30353c",
    strong: "#434a53",
    frame: "#2a2e34",
    danger: "#4a2b31",
  },
  text: {
    primary: "#eef0f3",
    secondary: "#a9b0ba",
    subtle: "#8a929d",
    onAction: "#0b1a33",
    onPositive: "#16300a",
  },
  decoration: {
    subtle: "#7a828c",
  },
  action: {
    primary: "#5b9bff",
    primaryPressed: "#3a7ae6",
    primarySubtle: "rgba(91, 155, 255, 0.16)",
  },
  status: {
    positive: "#8fd95c",
    positiveSubtle: "rgba(143, 217, 92, 0.14)",
    danger: "#f79ab0",
    dangerSubtle: "rgba(247, 154, 176, 0.14)",
    warning: "#f2c46d",
    warningSubtle: "rgba(242, 196, 109, 0.14)",
  },
  overlay: {
    scrim: "rgba(8, 9, 11, 0.62)",
    shadow: "rgba(0, 0, 0, 0.55)",
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
  sm: 3,
  md: 6,
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
