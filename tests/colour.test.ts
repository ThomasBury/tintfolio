import assert from "node:assert/strict";
import test from "node:test";
import { getColorDisplayName } from "../src/colour-name.ts";
import {
  contrast,
  correction,
  passes,
  suggestions,
  toHex,
} from "../src/colour.ts";

test("display names prefer exact pigment metadata and use perceptual neighbours for custom colours", () => {
  const pigment = { hex: "#c5a56e", name: "Isabella Color" };
  assert.equal(getColorDisplayName("#C5A56E", pigment), "Isabella Color");
  assert.equal(getColorDisplayName("#f3e5d5"), "Warm cream");
  assert.equal(getColorDisplayName("#C88F77", pigment), "Warm Terracotta");
  assert.equal(getColorDisplayName("#C78E76", { hex: "#C78E76", name: "#C78E76" }), "Warm Terracotta");
  assert.equal(getColorDisplayName("#1C1F2A", { hex: "#1C1F2A", name: "532 C" }), "Midnight Ink");
});

// Inverse OKLab reference primaries from Björn Ottosson's published matrices.
// Achromatic L=0.5 gives linear RGB 0.125, or 99 in nonlinear 8-bit sRGB.
test("OKLCH primaries, neutral and sRGB boundary", () => {
  assert.equal(
    toHex({ mode: "oklch", l: 0.62795536, c: 0.25768331, h: 29.233885 }),
    "#FF0000",
  );
  assert.equal(
    toHex({ mode: "oklch", l: 0.86643961, c: 0.29482724, h: 142.49534 }),
    "#00FF00",
  );
  assert.equal(toHex({ mode: "oklch", l: 0.5, c: 0 }), "#636363");
  assert.equal(
    toHex({ mode: "oklch", l: 0.62795536, c: 0.55, h: 29.233885 }),
    "#FF0000",
  );
});
test("suggestions are deterministic, unique and different from the base and target", () => {
  for (const wall of ["#AAAAAA", "#00FF00", "#FF00FF", "#FEFEFE", "#000000"]) {
    for (const target of ["ceiling", "feature"] as const) {
      const choices = suggestions(wall, target, "#777777");
      assert.deepEqual(choices, suggestions(wall, target, "#777777"));
      const values = choices.map((c) => c.value);
      assert.ok(values.length <= 3);
      assert.equal(new Set(values).size, values.length);
      for (const value of values) {
        assert.match(value, /^#[A-F0-9]{6}$/);
        assert.ok(![wall, "#777777"].includes(value));
        if (wall === "#AAAAAA") assert.match(value, /^#(..)\1\1$/);
      }
    }
  }
  assert.deepEqual(
    suggestions("#FEFEFE", "ceiling", "#AAAAAA").map((c) => c.value),
    ["#FFFFFF"],
  );
  assert.deepEqual(suggestions("#FEFEFE", "ceiling", "#FFFFFF"), []);
});
test("contrast uses unrounded sRGB luminance including near the threshold", () => {
  assert.equal(contrast("#000000", "#FFFFFF"), 21);
  assert.equal(contrast("#123456", "#123456"), 1);
  // Pure red relative luminance is 0.2126 in the W3C formula.
  assert.ok(Math.abs(contrast("#FF0000", "#FFFFFF") - 1.05 / 0.2626) < 1e-10);
  const near = contrast("#777773", "#FFFFFF");
  assert.ok(Math.abs(near - 4.4961343386) < 1e-9);
  assert.equal(near.toFixed(2), "4.50");
  assert.equal(passes(near), false);
  assert.equal(passes(4.5), true);
});
test("final serialized corrections pass for light, dark and mid-tone backgrounds", () => {
  for (const bg of ["#FF0000", "#777777", "#EEEEEE", "#000000", "#336699"]) {
    const fix = correction(bg, bg)!;
    assert.match(fix, /^#[A-F0-9]{6}$/);
    assert.ok(passes(contrast(fix, bg)));
  }
  assert.equal(correction("#FFFFFF", "#000000"), null);
});
