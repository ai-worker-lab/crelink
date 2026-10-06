// @crelink/design-tokens에서 생성한 파일. 직접 고치지 않는다. 원본: packages/design-tokens/src/tokens.json, 생성: pnpm tokens:generate
export declare const color: {
  readonly background: {
    readonly stage: "#0e0f11";
    readonly screen: "#131517";
    readonly device: "#08090a";
  };
  readonly surface: {
    readonly default: "#1c1f23";
    readonly raised: "#252a30";
    readonly bar: "#16181b";
  };
  readonly border: {
    readonly default: "#30353c";
    readonly strong: "#434a53";
    readonly frame: "#2a2e34";
    readonly danger: "#4a2b31";
  };
  readonly text: {
    readonly primary: "#eef0f3";
    readonly secondary: "#a9b0ba";
    readonly subtle: "#8a929d";
    readonly onAction: "#0b1a33";
    readonly onPositive: "#16300a";
  };
  readonly decoration: {
    readonly subtle: "#7a828c";
  };
  readonly action: {
    readonly primary: "#5b9bff";
    readonly primaryPressed: "#3a7ae6";
    readonly primarySubtle: "rgba(91, 155, 255, 0.16)";
  };
  readonly status: {
    readonly positive: "#8fd95c";
    readonly positiveSubtle: "rgba(143, 217, 92, 0.14)";
    readonly danger: "#f79ab0";
    readonly dangerSubtle: "rgba(247, 154, 176, 0.14)";
    readonly warning: "#f2c46d";
    readonly warningSubtle: "rgba(242, 196, 109, 0.14)";
  };
  readonly overlay: {
    readonly scrim: "rgba(8, 9, 11, 0.62)";
    readonly shadow: "rgba(0, 0, 0, 0.55)";
  };
};

export declare const space: {
  readonly 2: 2;
  readonly 4: 4;
  readonly 6: 6;
  readonly 8: 8;
  readonly 10: 10;
  readonly 12: 12;
  readonly 16: 16;
  readonly 20: 20;
  readonly 24: 24;
  readonly 32: 32;
  readonly 40: 40;
  readonly 48: 48;
};

export declare const corner: {
  readonly sm: 3;
  readonly md: 6;
};

export declare const font: {
  readonly size: {
    readonly 10: 10;
    readonly 11: 11;
    readonly 12: 12;
    readonly 13: 13;
    readonly 14: 14;
    readonly 15: 15;
    readonly 16: 16;
    readonly 18: 18;
    readonly 22: 22;
    readonly 27: 27;
    readonly 34: 34;
    readonly 38: 38;
    readonly 64: 64;
  };
  readonly weight: {
    readonly regular: 400;
    readonly bold: 700;
    readonly extrabold: 800;
  };
  readonly sans: "Pretendard, -apple-system, \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif";
  readonly mono: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace";
};

export declare const tokens: {
  readonly color: typeof color;
  readonly space: typeof space;
  readonly corner: typeof corner;
  readonly font: typeof font;
};
export type Tokens = typeof tokens;
