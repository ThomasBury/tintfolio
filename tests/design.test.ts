import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogue,
  decode,
  editable,
  example,
  hex,
  shareParams,
} from "../src/design.ts";
import { formatHex } from "culori";
import { exportTheme, sheet } from "../src/export.ts";
import { contrastResults, resolveWeb } from "../src/web-preview.ts";
test("each curated design round-trips with only its active values", () => {
  for (const tool of ["paint", "web"] as const) {
    assert.equal(catalogue[tool].length, 3);
    catalogue[tool].forEach((item, i) => {
      assert.ok(item.use && item.reason);
      const d = example(tool, i, "kitchen");
      const params = shareParams(tool, d);
      const restored = decode(tool, params)!;
      assert.deepEqual(editable(restored), editable(d));
      for (const r of editable(d))
        assert.equal(restored.colours[r], d.colours[r]);
      assert.equal(shareParams(tool, restored).toString(), params.toString());
    });
  }
});
test("reject incomplete colours, invalid rooms, duplicate and inactive roles", () => {
  for (const search of [
    "mode=text&background=ffffff",
    "mode=text&background=ffffxx&text=000000",
    "mode=text&background=ffffff&text=123456&text=ffffff",
    "mode=text&background=ffffff&text=000000&accent=000000",
    "mode=text&background=ffffff&text=000000&floor=d2b18c",
  ])
    assert.equal(decode("web", new URLSearchParams(search)), null);
  assert.equal(
    decode(
      "paint",
      new URLSearchParams("mode=single&room=constructor&wall=ffffff"),
    ),
    null,
  );
  assert.equal(hex("#ABC"), null);
  assert.equal(hex("a9b39e"), "#A9B39E");
});
test("paint links accept one optional existing floor colour", () => {
  const base = "mode=single&room=living&wall=a9b39e";
  assert.equal(decode("paint", new URLSearchParams(base))?.floor, undefined);
  const design = decode("paint", new URLSearchParams(base + "&floor=102030"));
  assert.equal(design?.floor, "#102030");
  assert.equal(shareParams("paint", design!).get("floor"), "102030");
  for (const floor of ["", "ABC", "102030&floor=405060"]) {
    assert.equal(decode("paint", new URLSearchParams(base + "&floor=" + floor)), null);
  }
});
test("old links get defaults and new links preserve lighting and theme", () => {
  const paint = "mode=single&room=living&wall=123456";
  const web = "mode=text&background=ffffff&text=000000";
  const params = (value: string) => new URLSearchParams(value);
  assert.equal(decode("paint", params(paint))?.lighting, "north");
  assert.equal(decode("web", params(web))?.theme, "light");
  const evening = decode("paint", params(paint + "&lighting=evening"))!;
  const dark = decode("web", params(web + "&theme=dark"))!;
  assert.equal(shareParams("paint", evening).get("lighting"), "evening");
  assert.equal(shareParams("web", dark).get("theme"), "dark");
  for (const suffix of ["&lighting=constructor", "&lighting=north&lighting=golden", "&theme=dark"])
    assert.equal(decode("paint", params(paint + suffix)), null);
  for (const suffix of ["&theme=dim", "&theme=dark&theme=light", "&lighting=north"])
    assert.equal(decode("web", params(web + suffix)), null);
});

test("paint spec lists rendered surfaces and puts the existing floor outside the table", () => {
  const d = example("paint", 2, "bedroom");
  d.floor = "#123456";
  d.lighting = "golden";
  const html = sheet(d);
  const [table, floor] = html.split("</table>");
  assert.match(html, /Bedroom · Golden hour/);
  assert.match(table, /Main wall.*#C3D0D0/);
  assert.match(table, /Feature wall.*#657F89/);
  assert.match(table, /Ceiling.*#F5F0E6/);
  assert.match(table, /Trim.*#EBE4D7/);
  assert.doesNotMatch(table, /#123456/);
  assert.match(floor, /Existing floor.*#123456/);
});

test("HEX, OKLCH, Tailwind and DTCG export the rendered light and dark tokens", () => {
  const d = example("web", 1);
  const light = resolveWeb(d);
  const dark = resolveWeb({ ...d, theme: "dark" });
  assert.notEqual(light.background, dark.background);
  assert.notEqual(light["primary-text"], dark["primary-text"]);
  assert.notEqual(light.surface, dark.surface);
  assert.equal(light.accent, dark.accent);
  assert.equal(light["text-on-accent"], dark["text-on-accent"]);
  for (const tokens of [light, dark]) {
    const css = exportTheme(tokens, "hex");
    const oklch = exportTheme(tokens, "oklch");
    const tailwind = exportTheme(tokens, "tailwind");
    const dtcg = JSON.parse(exportTheme(tokens, "figma"));
    assert.match(tailwind, /^@theme static {/);
    assert.deepEqual(Object.keys(dtcg), Object.keys(tokens));
    for (const [name, hex] of Object.entries(tokens)) {
      assert.ok(css.includes(`--${name}: ${hex};`));
      assert.ok(tailwind.includes(`--color-${name}: ${hex};`));
      const value = oklch.match(new RegExp(`--${name}: (oklch[^;]+);`))?.[1];
      assert.equal(formatHex(value).toUpperCase(), hex);
      const components = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      assert.deepEqual(dtcg[name], {
        $type: "color",
        $value: { colorSpace: "srgb", components, alpha: 1, hex },
      });
    }
  }
  const two = example("web");
  two.colours.accent = "#123456";
  assert.deepEqual(resolveWeb(two), resolveWeb(decode("web", shareParams("web", two))!));
});

test("rendered contrast uses full precision for body, large text and non-text AA and AAA", () => {
  const tokens = resolveWeb(example("web"));
  tokens.background = tokens.surface = "#FFFFFF";
  for (const [text, bodyAA, bodyAAA, largeAA, largeAAA] of [
    ["#959595", false, false, false, false],
    ["#949494", false, false, true, false],
    ["#777773", false, false, true, false],
    ["#767676", true, false, true, true],
    ["#595959", true, true, true, true],
  ] as const) {
    tokens["primary-text"] = tokens.border = tokens.accent = text;
    const get = (label: string) => contrastResults(tokens).find((check) => check.label === label)!;
    assert.equal(get("Page text").aa, bodyAA);
    assert.equal(get("Page text").aaa, bodyAAA);
    assert.equal(get("Page heading").aa, largeAA);
    assert.equal(get("Page heading").aaa, largeAAA);
    for (const label of ["Input border", "Alert icon"]) {
      assert.equal(get(label).aa, largeAA);
      assert.equal(get(label).aaa, null);
    }
    if (text === "#777773") assert.equal(get("Page text").ratio.toFixed(2), "4.50");
  }
});
