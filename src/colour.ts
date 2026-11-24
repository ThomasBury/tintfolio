import {
  clampChroma,
  formatHex,
  oklch,
  parse,
  wcagContrast,
  type Oklch,
} from "culori";
import { hex } from "./design.ts";
export const contrast = wcagContrast;
export const passes = (ratio: number) => ratio >= 4.5;
export const toHex = (c: Oklch) =>
  formatHex(clampChroma(c, "oklch", "rgb")).toUpperCase();

export function parseColour(input: string) {
  const value = input.trim().toLowerCase();
  const normalisedHex = hex(value);
  if (normalisedHex) return normalisedHex;
  if (!value.startsWith("oklch(") || /\/\s*none\s*\)$/.test(value)) return null;
  const colour = parse(value);
  if (colour?.mode !== "oklch" || (colour.alpha ?? 1) !== 1) return null;
  const { l = 0, c = 0, h = 0 } = colour;
  if (![l, c, h].every(Number.isFinite)) return null;
  return toHex({ ...colour, l, c, h: h % 360 });
}
export function suggestions(
  wall: string,
  target: "ceiling" | "feature",
  current: string,
) {
  const base = oklch(wall)!;
  const choices =
    target === "ceiling"
      ? ([
          ["Mist", 0.13, 0.4, 0],
          ["Linen", 0.22, 0.25, -12],
          ["Chalk", 0.3, 0.12, 8],
        ] as const)
      : ([
          ["Tonal", -0.1, 0.85, 0],
          ["Deep", -0.21, 0.75, 0],
          ["Shifted", -0.15, 0.85, 22],
        ] as const);
  const seen = new Set([wall.toUpperCase(), current.toUpperCase()]);
  const result: { name: string; value: string }[] = [];
  for (const [name, lightness, chroma, angle] of choices) {
    const gray = base.c < 0.025;
    const value = toHex({
      mode: "oklch",
      l: Math.max(0, Math.min(1, base.l + lightness)),
      c: gray ? 0 : base.c * chroma,
      h: gray ? undefined : (base.h ?? 0) + angle,
    });
    if (!seen.has(value)) result.push({ name, value });
    seen.add(value);
  }
  return result;
}
export function neutralText(bg: string) {
  return contrast("#000000", bg) >= contrast("#FFFFFF", bg)
    ? "#000000"
    : "#FFFFFF";
}
export function correction(fg: string, bg: string): string | null {
  if (passes(contrast(fg, bg))) return null;
  const base = oklch(fg)!;
  const neutral = neutralText(bg);
  const target = neutral === "#000000" ? 0 : 1;
  for (let i = 1; i <= 20; i++) {
    const value = toHex({
      ...base,
      l: base.l + ((target - base.l) * i) / 20,
    });
    if (passes(contrast(value, bg))) return value;
  }
  return neutral;
}
