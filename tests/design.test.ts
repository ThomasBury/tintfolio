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
import { css, sheet } from "../src/export.ts";
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
test("exports declare active roles including fixed paint neutrals", () => {
  assert.equal(
    css(example("web")),
    ":root {\n  --background: #F3EEDF;\n  --text: #353C30;\n}",
  );
  const svg = sheet(example("paint"));
  assert.match(svg, /Ceiling/);
  assert.match(svg, /Trim/);
  assert.doesNotMatch(svg, /Feature wall/);
});
