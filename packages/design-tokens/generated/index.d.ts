// @crelink/design-tokens에서 생성한 파일. 직접 고치지 않는다. 원본: packages/design-tokens/src/tokens.json, 생성: pnpm tokens:generate
export declare const color: {
  readonly background: {
    readonly stage: "#f5f7f9";
    readonly screen: "#ffffff";
    readonly device: "#171b20";
  };
  readonly surface: {
    readonly default: "#ffffff";
    readonly raised: "#f0f3f7";
    readonly bar: "#ffffff";
  };
  readonly border: {
    readonly default: "#dfe1e5";
    readonly strong: "#8f9298";
    readonly frame: "#e9ebef";
    readonly danger: "#f6c2bf";
  };
  readonly text: {
    readonly primary: "#171b20";
    readonly secondary: "#44484e";
    readonly subtle: "#5f636a";
    readonly onAction: "#ffffff";
    readonly onPositive: "#ffffff";
  };
  readonly decoration: {
    readonly subtle: "#a7abb1";
  };
  readonly action: {
    readonly primary: "#d02d27";
    readonly primaryPressed: "#b31415";
    readonly primarySubtle: "rgba(208, 45, 39, 0.1)";
  };
  readonly status: {
    readonly positive: "#137738";
    readonly positiveSubtle: "rgba(19, 119, 56, 0.1)";
    readonly danger: "#b6143f";
    readonly dangerSubtle: "rgba(182, 20, 63, 0.08)";
    readonly warning: "#9d6300";
    readonly warningSubtle: "rgba(157, 99, 0, 0.1)";
  };
  readonly overlay: {
    readonly scrim: "rgba(23, 27, 32, 0.48)";
    readonly shadow: "rgba(23, 27, 32, 0.08)";
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
  readonly sm: 8;
  readonly md: 12;
  readonly lg: 16;
  readonly full: 999;
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
