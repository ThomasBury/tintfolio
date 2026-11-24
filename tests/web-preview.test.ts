import assert from "node:assert/strict";
import test from "node:test";
import { oklch } from "culori";
import { example } from "../src/design.ts";
import { parseColour } from "../src/colour.ts";
import { formatLc, resolveWeb, textContrast } from "../src/web-preview.ts";

test("Website surfaces move four OKLCH lightness points toward the middle", () => {
  const design = example("web", 1);
  design.colours.background = "#F3EADF";
  design.colours.text = "#492E46";
  for (const [theme, shift] of [["light", -0.04], ["dark", 0.04]] as const) {
    design.theme = theme;
    const tokens = resolveWeb(design);
    const base = oklch(tokens.background)!;
    const card = oklch(tokens.surface)!;
    const text = oklch(tokens["primary-text"])!;
    const border = oklch(tokens.border)!;
    // Allow the quantisation error of an 8-bit sRGB round trip.
    assert.ok(Math.abs(card.l - base.l - shift) < 0.003);
    assert.ok(Math.abs(card.c - base.c) < 0.003);
    assert.ok(Math.abs(border.l - (card.l + (text.l - card.l) * 0.65)) < 0.004);
    assert.equal(tokens.accent, design.colours.accent);
    assert.equal(tokens["text-on-accent"], design.colours.onAccent);
  }
  design.theme = "light";
  design.colours.background = "#666666";
  assert.equal(resolveWeb(design).surface, "#636363");
});

test("Colour inputs normalise opaque OKLCH to six-digit sRGB HEX", () => {
  assert.equal(parseColour(" a9b39e "), "#A9B39E");
  assert.equal(parseColour(" OKLCH(50% 0 none / 100%) "), "#636363");
  assert.equal(parseColour("oklch(none none none)"), "#000000");
  assert.equal(parseColour("oklch(62.795536% 0.55 29.233885deg)"), "#FF0000");
  for (const invalid of ["#abc", "#112233ff", "red", "oklch(50% 0)",
    "oklch(0.5 0 0) trailing", "oklch(0.5 0 0 / 50%)", "oklch(0.5 0 0 / none)", "oklch(0.5 1e999 0)"]) {
    assert.equal(parseColour(invalid), null, invalid);
  }
});

test("text swatches grade the unrounded WCAG ratio and preserve APCA polarity", () => {
  const near = textContrast("#777773", "#FFFFFF");
  assert.equal(near.ratio.toFixed(2), "4.50");
  assert.equal(near.grade, "Below AA");
  assert.equal(textContrast("#777772", "#FFFFFF").grade, "AA");
  assert.equal(textContrast("#111111", "#FFFFFF").grade, "AAA");

  // Reference values from https://github.com/Myndex/apca-w3/blob/master/test/index.js
  const darker = textContrast("#888888", "#FFFFFF").lc;
  const lighter = textContrast("#FFFFFF", "#888888").lc;
  assert.ok(Math.abs(darker - 63.056469930209424) < 1e-10);
  assert.ok(Math.abs(lighter - -68.54146436644962) < 1e-10);
  assert.equal(formatLc(darker), "Lc +63");
  assert.equal(formatLc(lighter), "Lc -69");
  assert.equal(formatLc(textContrast("#FFFFFF", "#FFFFFF").lc), "Lc 0");
});
