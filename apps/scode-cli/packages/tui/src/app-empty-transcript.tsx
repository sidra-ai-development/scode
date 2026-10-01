import React from "react";
import { palette } from "./app-model.js";
import { useShimmerFrame } from "./app-motion.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const SCODE_LOGO_LINES = [
  "███████╗ ██████╗ ██████╗ ██████╗ ███████╗",
  "██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "███████╗██║     ██║   ██║██║  ██║█████╗  ",
  "╚════██║██║     ██║   ██║██║  ██║██╔══╝  ",
  "███████║╚██████╗╚██████╔╝██████╔╝███████╗",
  "╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
] as const;

const EMPTY_TRANSCRIPT_LOGO_MIN_HEIGHT = SCODE_LOGO_LINES.length;

const SCODE_GOLD_START = "#B9822E";
const SCODE_GOLD_MID = "#D9A441";
const SCODE_GOLD_END = "#F2D58A";

function goldGradientColor(index: number, length: number): string {
  if (length <= 1) return SCODE_GOLD_MID;
  const t = Math.max(0, Math.min(1, index / (length - 1)));
  return t <= 0.5
    ? mixHex(SCODE_GOLD_START, SCODE_GOLD_MID, t * 2)
    : mixHex(SCODE_GOLD_MID, SCODE_GOLD_END, (t - 0.5) * 2);
}

function mixHex(from: string, to: string, amount: number): string {
  const parse = (value: string) => ({
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  });
  const a = parse(from);
  const b = parse(to);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`;
}

function renderGoldGradientLine(text: string, key: string): React.ReactElement {
  const chars = Array.from(text);
  return h(
    "text",
    { key },
    ...chars.map((char, index) =>
      h("span", { fg: goldGradientColor(index, chars.length), key: `${key}-${index}` }, char),
    ),
  );
}


export function EmptyTranscriptLogo({
  animated = false,
}: {
  animated?: boolean;
} = {}): React.ReactElement {
  if (animated) {
    return h(AnimatedEmptyTranscriptLogo);
  }
  return renderLogoContent({ animated: false });
}

function AnimatedEmptyTranscriptLogo(): React.ReactElement {
  const frameMs = useShimmerFrame(true);
  return renderLogoContent({ animated: true, frameMs });
}

function renderLogoContent(input: { animated: boolean; frameMs?: number }): React.ReactElement {
  return h(
    "box",
    {
      style: {
        alignItems: "center",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        minHeight: EMPTY_TRANSCRIPT_LOGO_MIN_HEIGHT,
        width: "100%",
      },
    },
    ...SCODE_LOGO_LINES.map((line, index) =>
      renderLogoText({
        animated: input.animated,
        baseColor: palette.accent,
        frameMs: input.frameMs,
        key: `scode-logo-${index}`,
        text: line,
      }),
    ),
  );
}

function renderLogoText(input: {
  animated: boolean;
  baseColor: string;
  frameMs?: number;
  key: string;
  text: string;
}): React.ReactElement {
  void input.animated;
  void input.baseColor;
  void input.frameMs;
  return renderGoldGradientLine(input.text, input.key);
}
