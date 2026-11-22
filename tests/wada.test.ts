import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contrast } from "../src/colour.ts";
import namedCombinations from "../src/named-combinations.json" with { type: "json" };
import {
  assignWeb,
  matchingCombinations,
  randomCombination,
  unpackCollection,
  type Swatch,
} from "../src/wada.ts";

const collection = unpackCollection(JSON.parse(readFileSync(
  new URL("../public/wada-combinations.json", import.meta.url), "utf8",
)));

test("collection preserves its ordered IDs, sizes and source swatches", () => {
  assert.deepEqual(collection.map(({ id }) => id), Array.from({ length: 348 }, (_, i) => i + 1));
  assert.deepEqual([2, 3, 4].map((count) => matchingCombinations(collection, count, "").length), [120, 120, 108]);
  assert.equal(new Set(collection.flatMap(({ swatches }) => swatches)).size, 159);
  assert.deepEqual(collection[3].swatches, [
    { name: "Isabella Color", hex: "#c5a56e" },
    { name: "Red Violet", hex: "#59256a" },
  ]);
  for (const { swatches } of collection) assert.equal(new Set(swatches).size, swatches.length);
  assert.deepEqual(matchingCombinations(collection, 2, " # 4 "), [collection[3]]);
  assert.deepEqual(matchingCombinations(collection, 3, " #4 "), []);
  const blues = matchingCombinations(collection, 4, "bLuE");
  assert.ok(blues.length > 24);
  assert.ok(blues.every(({ swatches }) =>
    swatches.length === 4 && swatches.some(({ name }) => /blue/i.test(name))));
});

test("random draws give each eligible match one slot and skip the current preview", (t) => {
  const current = 17;
  const eligible = collection.filter(({ id }) => id !== current);
  let draw = 0;
  t.mock.method(Math, "random", () => draw);
  for (const [index, combination] of eligible.entries()) {
    draw = (index + 0.5) / eligible.length;
    assert.equal(randomCombination(collection, current), combination);
  }
  assert.equal(randomCombination([], current), undefined);
  assert.equal(randomCombination([collection[current - 1]], current), collection[current - 1]);
});

test("every web assignment minimizes source corrections and passes at full precision", () => {
  for (const { id, swatches } of [...collection, ...namedCombinations]) {
    const actual = assignWeb(swatches);
    let best: { changes: number; lightness: number; order: Swatch[] } | undefined;
    for (const bg of swatches) {
      for (const fg of swatches.filter((swatch) => swatch !== bg)) {
        const rest = swatches.filter((swatch) => swatch !== bg && swatch !== fg);
        const pageChanges = contrast(fg.hex, bg.hex) < 4.5 ? 1 : 0;
        for (const accent of rest.length ? rest : [undefined]) {
          const label = rest.find((swatch) => swatch !== accent);
          const changes = pageChanges + (accent && label && contrast(label.hex, accent.hex) < 4.5 ? 1 : 0);
          const lightness = contrast(bg.hex, "#000000");
          if (!best || changes < best.changes || (changes === best.changes && lightness > best.lightness)) {
            best = { changes, lightness, order: [bg, fg, accent, label].filter((swatch): swatch is Swatch => Boolean(swatch)) };
          }
        }
      }
    }
    assert.deepEqual(actual.flatMap(({ source }) => source ? [source] : []), best!.order, `#${id}`);
    assert.equal(actual.filter(({ source, hex }) => source && source.hex.toUpperCase() !== hex).length, best!.changes, `#${id}`);
    assert.ok(contrast(actual[1].hex, actual[0].hex) >= 4.5, `#${id} page text`);
    if (swatches.length > 2) {
      assert.ok(contrast(actual[3].hex, actual[2].hex) >= 4.5, `#${id} button text`);
      if (swatches.length === 3) {
        assert.ok(["#000000", "#FFFFFF"].includes(actual[3].hex));
        assert.equal(contrast(actual[3].hex, actual[2].hex), Math.max(
          contrast("#000000", actual[2].hex),
          contrast("#FFFFFF", actual[2].hex),
        ));
      }
    }
  }
  assert.deepEqual(assignWeb(collection[3].swatches).map(({ hex }) => hex), ["#C5A56E", "#59256A"]);
  const [background, text] = assignWeb(collection[0].swatches);
  assert.equal(background.hex, "#D96629");
  assert.equal(text.source?.hex, "#0093a5");
  assert.notEqual(text.hex, text.source?.hex.toUpperCase());
});
