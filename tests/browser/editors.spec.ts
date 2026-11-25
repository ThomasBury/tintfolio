import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { contrast } from "../../src/colour.ts";
import { catalogue } from "../../src/design.ts";
import namedCombinations from "../../src/named-combinations.json" with { type: "json" };

const origin = "https://tintfolio.bury-thomas.workers.dev";
const paintPilot = "/wall-paint/sage-green-and-warm-cream-living-room";
const webPilot = "/website-colours/high-contrast-cream-and-plum-palette";
const fill = (page: Page, surface: string) => page.locator(`[data-surface="${surface}"]`).first();
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const combinations = (page: Page) => page.locator("#library");
const find = async (page: Page, term: string) => {
  await page.getByLabel("Search palettes").fill(term);
  return combinations(page).locator(".wada-card").first();
};
const close = async (page: Page) => page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

async function share(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Design link copied." })).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

test("combination #48 applies on the sticky room, preserves room and floor, and undoes in place", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=bedroom&pair=feature&floor=57616B&wall=123456&feature=998877");
  const library = combinations(page);
  await expect(library.getByRole("button", { name: "#A9B39E · #F3E5D5", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "A Dictionary of Color Combinations" })).toHaveAttribute("href", /seigensha/);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Source").selectOption("wada");
  await expect(library.locator(".wada-card").first()).toHaveText("#C5A56E · #59256A");
  const card = await find(page, "#48");
  await expect(card).toHaveAccessibleName("#B73F74 · #005B8D");
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  const scroll = await page.evaluate(() => scrollY);
  await card.press("Enter");
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toHaveText("#B73F74 · #005B8D applied.");
  await expect(fill(page, "wall")).not.toHaveCSS("fill", rgb("#123456"));
  await expect(fill(page, "floor")).toHaveCSS("fill", rgb("#57616B"));
  await expect(page.getByLabel("Room", { exact: true })).toHaveValue("bedroom");
  expect(await page.locator("#room").evaluate((item) => {
    const box = item.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await page.getByRole("button", { name: "Undo palette" }).click();
  await expect(card).toBeFocused();
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await expect(fill(page, "feature")).toHaveCSS("fill", rgb("#998877"));
});

test("wheel auditions screen positions while Feature wall selection commits its own ceiling", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=living&pair=feature&wall=123456&feature=998877");
  await expect(page.locator("#wada-results-status")).toHaveText(/of \d+ combinations/);
  const card = (id: number) => page.locator(`[data-combination="${id}"]`);
  const more = page.locator("#wada-more");
  while (!(await card(121).count())) {
    await expect(more).toBeVisible();
    await more.evaluate((button: HTMLButtonElement) => button.click());
  }

  const ceiling = fill(page, "ceiling");
  await card(121).press("Enter");
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));
  const session = await page.evaluate(() => sessionStorage.getItem("tintfolio-paint"));
  const results = page.locator(".library-results");
  const frame = results.locator("..");
  await results.evaluate((node) => {
    const row = node.querySelector('[data-combination="121"]')!.getBoundingClientRect();
    node.scrollTop += row.top + row.height / 2 - (node.getBoundingClientRect().top + 100);
  });
  const box = (await results.boundingBox())!;
  const pointer = { x: box.x + box.width / 2, y: box.y + 100 };
  await page.mouse.move(pointer.x, pointer.y);
  const wheelTo = async (id: number, expected: string) => {
    const row = (await card(id).boundingBox())!;
    await page.mouse.wheel(0, row.y + row.height / 2 - pointer.y);
    await expect.poll(() => page.evaluate(({ x, y }) =>
      document.elementFromPoint(x, y)?.closest(".wada-card")?.getAttribute("data-combination"), pointer)).toBe(String(id));
    await expect(ceiling).toHaveCSS("fill", rgb(expected));
  };

  await wheelTo(48, "#F5F0E6");
  await expect(frame).toHaveAttribute("data-fade-top", "");
  await expect(card(121)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => sessionStorage.getItem("tintfolio-paint"))).toBe(session);
  await page.mouse.move(box.x - 25, pointer.y);
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));
  await page.mouse.click(pointer.x, pointer.y);
  await expect(card(48)).toHaveAttribute("aria-pressed", "true");
  await expect(ceiling).toHaveCSS("fill", rgb("#F5F0E6"));

  await wheelTo(125, "#40456A");
  await expect(card(48)).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(pointer.x, pointer.y);
  await expect(card(125)).toHaveAttribute("aria-pressed", "true");
  await expect(ceiling).toHaveCSS("fill", rgb("#40456A"));
  await page.getByRole("button", { name: "Undo palette" }).click();
  await expect(card(48)).toHaveAttribute("aria-pressed", "true");
  await expect(ceiling).toHaveCSS("fill", rgb("#F5F0E6"));
});

test("paint reassigns and swaps roles on the canvas, and prints its surface colours", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=kitchen&pair=feature&floor=57616B&wall=123456&feature=998877");
  const canvas = page.getByRole("region", { name: "Room surfaces" });
  await expect(canvas.getByRole("radio", { name: "Feature wall" })).toBeChecked();
  await (await find(page, "#344")).click();
  const wall = canvas.getByLabel("Main wall", { exact: true });
  const secondary = canvas.getByRole("combobox", { name: "Feature wall", exact: true });
  await expect(wall).toHaveValue("0");
  await expect(secondary).toHaveValue("1");
  await expect(canvas.getByText("Choose which two palette colours to apply.")).toBeVisible();
  for (const selector of [wall, secondary]) {
    await expect(selector.locator("option")).toHaveText([
      "#FDC57E", "#1C4286", "#A36AA5", "#111314",
    ]);
  }
  await expect(wall.locator('option[value="1"]')).toBeDisabled();
  await wall.selectOption("2");
  await secondary.selectOption("3");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#A36AA5"));
  const swap = page.getByRole("button", { name: "Swap roles" });
  await swap.press("Space");
  await expect(swap).toBeFocused();
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#111314"));
  await expect(fill(page, "feature")).toHaveCSS("fill", rgb("#A36AA5"));
  const before = await fill(page, "wall").evaluate((node) => getComputedStyle(node).fill);
  await page.getByRole("radio", { name: "Golden hour" }).check();
  await expect(page.locator("#room-light stop").first()).toHaveAttribute("stop-color", "#FFCC78");
  await page.getByRole("radio", { name: "Warm evening" }).check();
  await expect(page.locator("radialGradient#room-light")).toBeAttached();
  await expect(fill(page, "wall")).toHaveCSS("fill", before);
  await page.getByRole("button", { name: "Paint spec sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Paint spec sheet" });
  for (const [surface, hex] of [["Main wall", "#111314"], ["Feature wall", "#A36AA5"], ["Ceiling", "#A36AA5"], ["Trim", "#EBE4D7"]])
    await expect(dialog.getByRole("row", { name: surface + " " + hex })).toBeVisible();
  await expect(dialog.getByText("Existing floor #57616B")).toBeVisible();
  await expect(dialog.getByText(/Kitchen · Warm evening/)).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("main")).toBeHidden();
  await expect(dialog.getByRole("table")).toBeVisible();
});

test("the door follows the right main wall or keeps a custom colour through palette changes", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=living&pair=feature&wall=123456&feature=998877");
  const surfaces = page.getByRole("region", { name: "Room surfaces" });
  const door = fill(page, "door");
  const rightWall = page.locator('[data-surface="wall"]').last();
  const wallFill = () => rightWall.evaluate((node) => getComputedStyle(node).fill);
  const edit = surfaces.getByRole("button", { name: "Edit door colour" });
  const match = surfaces.getByRole("button", { name: "Match main wall" });
  const hex = surfaces.getByLabel("Door HEX");
  const picker = surfaces.getByLabel("Pick Door colour");
  await expect(surfaces.getByText("Same as main wall")).toBeVisible();
  await expect(door).toHaveCSS("fill", await wallFill());
  await expect(fill(page, "feature")).toHaveCSS("fill", rgb("#998877"));
  expect((await door.boundingBox())!.x).toBeGreaterThan((await rightWall.boundingBox())!.x);
  await expect(hex).toBeHidden();

  const card = await find(page, "#344");
  await card.hover();
  await expect(door).toHaveCSS("fill", rgb("#FDC57E"));
  await edit.press("Enter");
  await expect(hex).toBeFocused();
  await expect(hex).toHaveValue("#123456");
  await hex.fill("#AB");
  await hex.press("Enter");
  await expect(hex).toHaveAttribute("aria-invalid", "true");
  await expect(door).toHaveCSS("fill", rgb("#123456"));
  await hex.fill("#2468ac");
  await expect(picker).toHaveValue("#2468ac");
  await expect(door).toHaveCSS("fill", rgb("#2468AC"));
  await card.hover();
  await expect(rightWall).toHaveCSS("fill", rgb("#FDC57E"));
  await expect(door).toHaveCSS("fill", rgb("#2468AC"));
  await card.click();
  await picker.fill("#8642ac");
  await expect(hex).toHaveValue("#8642AC");
  await page.getByRole("button", { name: "Undo palette" }).click();
  await expect(rightWall).toHaveCSS("fill", rgb("#123456"));
  await expect(door).toHaveCSS("fill", rgb("#8642AC"));
  await expect(page.getByRole("group", { name: "Active swatches" }).getByRole("button", { name: /door/i })).toHaveCount(0);

  await page.reload();
  await expect(door).toHaveCSS("fill", rgb("#8642AC"));
  const link = await share(page);
  expect(new URL(link).searchParams.get("door")).toBe("8642AC");
  await page.getByRole("button", { name: "Saved swatches" }).click();
  await page.getByRole("button", { name: "Save current design" }).click();
  await expect(page.getByRole("dialog").getByText("Door #8642AC")).toBeVisible();
  await close(page);
  await match.click();
  await expect(edit).toBeFocused();
  await expect(match).toBeHidden();
  await expect(surfaces.getByText("Same as main wall")).toBeVisible();
  await expect(door).toHaveCSS("fill", await wallFill());
  await page.locator("#role-wall").click();
  await page.getByLabel("Main wall HEX").fill("#2468AC");
  await expect(door).toHaveCSS("fill", rgb("#2468AC"));
  await door.click();
  await expect(hex).toBeFocused();
  await expect(hex).toHaveValue("#2468AC");
  await page.getByRole("button", { name: "Saved swatches" }).click();
  await page.getByRole("button", { name: "Restore design 1" }).click();
  await expect(door).toHaveCSS("fill", rgb("#8642AC"));
});

test("the feature-wall ceiling survives palette actions, reload, saved restore and sharing", async ({ page, browser }) => {
  const legacy = "mode=pair&room=living&pair=feature&lighting=north&wall=123456&feature=998877";
  await page.goto("/paint/?" + legacy);
  const ceiling = fill(page, "ceiling");
  const expectCeiling = (value: string) => expect(ceiling).toHaveCSS("fill", rgb(value));
  const edit = page.getByRole("button", { name: /^Edit Ceiling #/ });
  const hex = page.getByLabel("Ceiling HEX");
  await expectCeiling("#F5F0E6");
  await page.evaluate((design) => localStorage.setItem("tintfolio-saved-paint", JSON.stringify([design])), legacy);
  const openSaved = () => page.getByRole("button", { name: "Saved swatches" }).click();
  const save = page.getByRole("button", { name: "Save current design" });
  await openSaved();
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "This design is already saved." })).toBeVisible();
  await close(page);

  await edit.press("Enter");
  await expect(hex).toBeVisible();
  await hex.fill("#2468AC");
  await expectCeiling("#2468AC");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await expect(fill(page, "feature")).toHaveCSS("fill", rgb("#998877"));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectCeiling("#F5F0E6");
  await hex.fill("#2468AC");
  await page.getByRole("tab", { name: "Explore" }).click();
  const card = await find(page, "#344");
  await card.hover();
  await expect(fill(page, "feature")).not.toHaveCSS("fill", rgb("#998877"));
  await expectCeiling("#2468AC");
  await card.click();
  await expectCeiling("#2468AC");
  await page.getByLabel("Search palettes").fill("#48");
  const random = page.getByRole("button", { name: "Randomize" });
  await random.click();
  await expect(page.locator("#status")).toHaveText("#B73F74 · #005B8D applied.");
  await expectCeiling("#2468AC");
  const mainBefore = await fill(page, "wall").evaluate((node) => getComputedStyle(node).fill);
  const featureBefore = await fill(page, "feature").evaluate((node) => getComputedStyle(node).fill);
  await page.getByRole("button", { name: "Swap roles" }).click();
  await expect(fill(page, "wall")).toHaveCSS("fill", featureBefore);
  await expect(fill(page, "feature")).toHaveCSS("fill", mainBefore);
  await expectCeiling("#2468AC");
  await ceiling.click({ position: { x: 280, y: 8 } });
  await expect(hex).toHaveValue("#2468AC");
  await hex.fill("#8642AC");
  await page.getByRole("button", { name: "Undo palette" }).click();
  await expect(fill(page, "wall")).toHaveCSS("fill", mainBefore);
  await expectCeiling("#8642AC");

  await page.reload();
  await expectCeiling("#8642AC");
  await openSaved();
  await save.click();
  await expect(page.locator(".saved-design").nth(1)).toContainText("Ceiling #8642AC");
  await page.getByRole("button", { name: "Restore design 1" }).click();
  await expectCeiling("#F5F0E6");
  await openSaved();
  await page.getByRole("button", { name: "Restore design 2" }).click();
  await expectCeiling("#8642AC");

  const url = await share(page);
  expect(new URL(url).searchParams.get("ceiling")).toBe("8642AC");
  const fresh = await browser.newPage();
  try {
    await fresh.goto(url);
    await expect(fill(fresh, "ceiling")).toHaveCSS("fill", rgb("#8642AC"));
    await fresh.getByRole("button", { name: "Paint spec sheet" }).click();
    await fresh.emulateMedia({ media: "print" });
    await expect(fresh.getByRole("row", { name: "Ceiling #8642AC" })).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test("automatic ceilings survive links and saved restore and can be reset after locking or editing", async ({ page, browser }) => {
  await page.goto("/paint/?mode=pair&room=living&pair=feature&wall=123456&feature=998877");
  const ceiling = fill(page, "ceiling");
  const lock = page.getByRole("button", { name: "Lock Ceiling" });
  const reset = page.getByRole("button", { name: "Use palette ceiling" });
  const openSaved = page.getByRole("button", { name: "Saved swatches" });
  await (await find(page, "#121")).click();
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));
  await lock.click();
  const card = await find(page, "#125");
  await card.hover();
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));
  await card.click();
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));
  await expect(reset).toBeDisabled();
  await lock.click();
  await reset.click();
  await expect(ceiling).toHaveCSS("fill", rgb("#40456A"));

  const automatic = await share(page);
  expect(new URL(automatic).searchParams.get("ceilingMode")).toBe("auto");
  expect(new URL(automatic).searchParams.get("ceiling")).toBe("40456A");
  await openSaved.click();
  await page.getByRole("button", { name: "Save current design" }).click();
  await close(page);
  await page.reload();
  await expect(ceiling).toHaveCSS("fill", rgb("#40456A"));
  await (await find(page, "#121")).click();
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));

  await page.getByRole("button", { name: /^Edit Ceiling #/ }).click();
  const hex = page.getByLabel("Ceiling HEX or OKLCH");
  await hex.fill("oklch(60% 0 0)");
  await expect(ceiling).toHaveCSS("fill", rgb("#808080"));
  await hex.press("Enter");
  await expect(hex).toHaveValue("#808080");
  await reset.click();
  await expect(ceiling).toHaveCSS("fill", rgb("#555832"));
  await page.getByRole("button", { name: "Undo palette" }).click();
  await expect(ceiling).toHaveCSS("fill", rgb("#808080"));
  await page.getByRole("tab", { name: "Explore" }).click();
  await (await find(page, "#48")).press("Space");
  await expect(ceiling).toHaveCSS("fill", rgb("#808080"));
  await openSaved.click();
  await page.getByRole("button", { name: "Restore design 1" }).click();
  await expect(ceiling).toHaveCSS("fill", rgb("#40456A"));
  await (await find(page, "#48")).press("Space");
  await expect(ceiling).toHaveCSS("fill", rgb("#F5F0E6"));

  const fresh = await browser.newPage();
  try {
    await fresh.goto(automatic);
    await expect(fill(fresh, "ceiling")).toHaveCSS("fill", rgb("#40456A"));
    await fresh.getByRole("button", { name: "Use palette ceiling" }).click();
    await expect(fill(fresh, "ceiling")).toHaveCSS("fill", rgb("#F5F0E6"));
    await fresh.getByRole("radio", { name: "Separate ceiling" }).check();
    await (await find(fresh, "#125")).click();
    await expect(fill(fresh, "wall")).toHaveCSS("fill", rgb("#D1B0A7"));
    await expect(fill(fresh, "ceiling")).toHaveCSS("fill", rgb("#0093A5"));
  } finally {
    await fresh.close();
  }
});

test("manual paint edits are reflected in the canvas swatch controls", async ({ page }) => {
  await page.goto("/paint/");
  await (await find(page, "#344")).click();
  await page.getByRole("tab", { name: "Tune" }).click();
  await page.locator("#hex").fill("oklch(50% 0 0)");
  const wall = page.getByLabel("Main wall", { exact: true });
  await expect(wall.locator("option:checked")).toHaveText("Custom · #636363");
  await wall.selectOption("2");
  await expect(wall).toHaveValue("2");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#A36AA5"));
});

test("failed library load leaves curated palettes usable and retry keeps keyboard focus", async ({ page }) => {
  let attempts = 0;
  const firstLoad = Promise.withResolvers<void>();
  await page.route("**/wada-combinations.json", async (route) => {
    if (++attempts > 1) return route.continue();
    await firstLoad.promise;
    return route.abort();
  });
  await page.goto("/web/");
  try {
    await page.getByLabel("Search palettes").fill("#48");
    await expect(page.locator("#wada-load")).toHaveText("Loading Wada combinations…");
    await expect(page.locator("#wada-results-status")).toBeEmpty();
    await expect(page.getByRole("button", { name: "Clear search" })).toBeHidden();
  } finally {
    firstLoad.resolve();
  }
  await (await find(page, "12-0815 TCX")).press("Enter");
  await expect(page.locator("#status")).toHaveText("#F2E5CD · #D58592 · #783E33 applied.");
  await expect(page.locator("#wada-load")).toContainText("Curated palettes are still available");
  await page.getByLabel("Search palettes").fill("#48");
  await expect(page.locator("#wada-results-status")).toHaveText("No matching combinations");
  await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).press("Enter");
  await expect(page.getByLabel("Search palettes")).toBeFocused();
  await expect(page.locator("#wada-load")).toBeEmpty();
  await expect(combinations(page).locator(".wada-card")).toHaveText("#B73F74 · #005B8D");
  await expect(page.getByRole("button", { name: "Clear search" })).toBeHidden();
  await page.getByLabel("Search palettes").fill("");
  await page.getByLabel("Search palettes").fill("Developer Docs");
  await expect(combinations(page).locator(".wada-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Randomize" }).press("Enter");
  await expect(page.locator("#status")).toHaveText("#F3EADF · #492E46 · #35615E · #FFFFFF applied.");
  await expect(page.getByRole("button", { name: "Randomize" })).toBeFocused();
});

test("Load more and scrolling append pages while keeping keyboard focus", async ({ page }) => {
  await page.goto("/paint/");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Source").selectOption("wada");
  await expect(page.locator("#wada-results-status")).toHaveText("24 of 348 combinations");
  const more = page.getByRole("button", { name: "Load more" });
  await more.focus();
  await more.press("Enter");
  await expect(page.locator(".wada-card").nth(24)).toBeFocused();
  expect(await page.locator(".wada-card").count()).toBeGreaterThanOrEqual(48);
  await more.scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".wada-card").count()).toBeGreaterThanOrEqual(72);
  await expect(page.locator(".wada-card").nth(24)).toBeFocused();
});

test("old and new links work in a fresh browser and shared state takes precedence", async ({ page, browser }) => {
  const old = "/paint/?mode=pair&room=bedroom&pair=ceiling&wall=102030&ceiling=456789";
  await page.goto(old);
  await expect(page.getByRole("radio", { name: "North daylight" })).toBeChecked();
  await page.getByRole("radio", { name: "Golden hour" }).check();
  const newPaint = await share(page);
  expect(new URL(newPaint).searchParams.get("lighting")).toBe("golden");
  await page.goto("/web/?mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF");
  await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  const newWeb = await share(page);
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto("/paint/");
    await other.getByLabel("Room", { exact: true }).selectOption("kitchen");
    await other.goto(newPaint);
    await expect(other.getByLabel("Room", { exact: true })).toHaveValue("bedroom");
    await expect(other.getByRole("radio", { name: "Golden hour" })).toBeChecked();
    await expect(fill(other, "wall")).toHaveCSS("fill", rgb("#102030"));
    await other.goto(old);
    await expect(other.getByRole("radio", { name: "North daylight" })).toBeChecked();
    await other.goto(newWeb);
    await expect(other.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    await expect(other.locator("#specimen-button")).toHaveCSS("background-color", rgb("#35615E"));
  } finally {
    await fresh.close();
  }
});

test("a fresh Website studio opens the Light site palette and exports its exact preview colours", async ({ page }) => {
  await page.goto("/web/");
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(page.locator("#role-strip code")).toHaveText(["#F8F7F2", "#1C1F2A", "#F16AB7", "#000000"]);
  await expect(page.locator("#metrics-text")).toContainText("15.31:1 AAA");
  await expect(page.locator("#metrics-text")).toContainText("APCA Lc +99");
  await expect(page.locator("#metrics-onAccent")).toContainText("7.49:1 AAA");
  await expect(page.locator("#metrics-onAccent")).toContainText("APCA Lc +51");
  await expect(page.locator("#specimen")).toHaveCSS("background-color", rgb("#F8F7F2"));
  await expect(page.locator("#specimen")).toHaveCSS("color", rgb("#1C1F2A"));
  await expect(page.locator("#specimen-button")).toHaveCSS("background-color", rgb("#F16AB7"));
  await expect(page.locator("#specimen-button")).toHaveCSS("color", rgb("#000000"));
  await page.getByRole("button", { name: "Check contrast" }).click();
  await expect(page.getByRole("button", { name: "Site palette" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("row", { name: /Button fill/ })).toContainText("2.71:1");
  await expect(page.getByRole("row", { name: /Button fill/ })).toContainText("Fail");
  const apca = page.getByRole("region", { name: "APCA contrast" });
  for (const [lc, size] of [[75, 18], [60, 24], [45, 36]]) {
    await expect(apca.getByRole("row", { name: new RegExp(`^${lc} ${size}px `) })).toBeVisible();
  }
  await page.getByRole("button", { name: "Export theme" }).click();
  const output = page.locator("#theme-code");
  for (const [token, value] of Object.entries({
    background: "#F8F7F2", "primary-text": "#1C1F2A", accent: "#F16AB7", "text-on-accent": "#000000",
  })) await expect(output).toHaveValue(new RegExp(`--${token}: ${value};`));
  await close(page);
  await page.getByRole("radio", { name: "Dark" }).check();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.locator("#role-accent code")).toHaveText("#F16AB7");
});

test("website shows adjusted and added swatches, reports rendered contrast, and exports both themes", async ({ page }) => {
  await page.goto("/web/");
  await (await find(page, "#1")).click();
  await expect(page.locator("#assignment-count")).toContainText("adjusted or added");
  await page.getByRole("button", { name: "Check contrast" }).click();
  await expect(page.locator("#canvas-notes")).toContainText("Adjusted from #0093A5");
  await page.getByRole("tab", { name: "Explore" }).click();
  await (await find(page, "#125")).click();
  await page.getByRole("tab", { name: "Tune" }).click();
  await expect(page.locator("#canvas-notes")).toContainText("Text on accent #000000 · Added");
  const specimen = page.locator("#specimen");
  for (const theme of ["light", "dark"]) {
    await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).check();
    const properties = await specimen.evaluate((node) =>
      Object.fromEntries(Array.from((node as HTMLElement).style).map((key) => [key, (node as HTMLElement).style.getPropertyValue(key)])));
    const { heading, cards, input, button } = {
      heading: specimen.locator("h3"), cards: specimen.locator(".dashboard-card"),
      input: specimen.getByLabel("Email"), button: specimen.locator("#specimen-button"),
    };
    await expect(heading).toHaveCSS("color", rgb(properties["--primary-text"]));
    for (const card of await cards.all()) {
      await expect(card).toHaveCSS("background-color", rgb(properties["--surface"]));
      expect(await card.evaluate((node) => getComputedStyle(node).boxShadow)).toContain(rgb(properties["--divider"]));
    }
    const surface = cards.first();
    await expect(input).toHaveCSS("border-top-color", rgb(properties["--border"]));
    await expect(specimen.getByLabel("Project name")).toHaveCSS("border-top-color", rgb(properties["--border"]));
    await expect(surface.locator(".dashboard-alert")).toHaveCSS("border-top-color", rgb(properties["--divider"]));
    await expect(button).toHaveCSS("background-color", rgb(properties["--accent"]));
    await expect(specimen.locator("time")).toHaveCSS("background-color", rgb(properties["--accent"]));
    await expect(specimen.locator("time")).toHaveCSS("color", rgb(properties["--text-on-accent"]));
    const bars = surface.locator(".dashboard-bar");
    for (const bar of (await bars.all()).slice(0, 3)) {
      await expect(bar).toHaveCSS("background-color", rgb(properties["--muted-text"]));
    }
    const report = surface.getByRole("button", { name: "View report" });
    await expect(bars.last()).toHaveCSS("background-color", rgb(properties["--accent"]));
    await expect(report).toHaveCSS("color", rgb(properties["--accent"]));
    const cardColour = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);
    const inputContrast = contrast(await input.evaluate((node) => getComputedStyle(node).borderTopColor), cardColour);
    const chartContrast = contrast(await bars.last().evaluate((node) => getComputedStyle(node).backgroundColor), cardColour);
    const reportContrast = contrast(await report.evaluate((node) => getComputedStyle(node).color), cardColour);
    await expect(page.getByRole("row", { name: `Input border ${inputContrast.toFixed(2)}:1 ${inputContrast >= 3 ? "Pass" : "Fail"} —` })).toBeVisible();
    await expect(page.getByRole("row", { name: `Latest activity bar ${chartContrast.toFixed(2)}:1 ${chartContrast >= 3 ? "Pass" : "Fail"} —` })).toBeVisible();
    await expect(page.getByRole("row", { name: `View report text ${reportContrast.toFixed(2)}:1 ${reportContrast >= 4.5 ? "Pass" : "Fail"} ${reportContrast >= 7 ? "Pass" : "Fail"}` })).toBeVisible();
    const ratio = contrast(properties["--primary-text"], properties["--background"]);
    await expect(page.getByRole("row", { name: `Page text ${ratio.toFixed(2)}:1 ${ratio >= 4.5 ? "Pass" : "Fail"} ${ratio >= 7 ? "Pass" : "Fail"}` })).toBeVisible();
    await page.getByRole("button", { name: "Export theme" }).click();
    for (const format of ["hex", "oklch", "tailwind", "figma"]) {
      await page.getByLabel("Format").selectOption(format);
      const output = await page.getByLabel("Output").inputValue();
      for (const [key, hex] of Object.entries(properties)) {
        if (format === "figma") expect(JSON.parse(output)[key.slice(2)].$value.hex).toBe(hex);
        else if (format === "oklch") expect(output).toContain(`${key}: oklch(`);
        else expect(output).toContain(`${format === "tailwind" ? "--color-" + key.slice(2) : key}: ${hex};`);
      }
    }
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe(`tintfolio-${theme}.json`);
    expect(JSON.parse(await readFile((await download.path())!, "utf8")).accent.$value.hex).toBe(properties["--accent"]);
    await close(page);
  }
});

test("Website Tune uses live opaque OKLCH, normalizes on Enter or blur, and keeps the base colour in dark mode", async ({ page }) => {
  await page.goto("/web/?mode=text&background=FFFFFF&text=777773");
  const strip = page.getByRole("group", { name: "Active swatches" });
  await expect(strip.getByText("4.50:1", { exact: true })).toBeVisible();
  await expect(strip.getByText("Below AA")).toBeVisible();
  await strip.getByRole("button", { name: /^Edit Background/ }).click();
  const field = page.locator("#hex");
  const specimen = page.getByRole("article", { name: "Sample website" });
  await field.fill("oklch(50% 0 0)");
  await expect(specimen).toHaveCSS("background-color", rgb("#636363"));
  await expect(field).toHaveValue("oklch(50% 0 0)");
  await field.press("Enter");
  await expect(field).toHaveValue("#636363");
  await field.fill("oklch(0.5 0 0 / 0.6)");
  await field.press("Enter");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(specimen).toHaveCSS("background-color", rgb("#636363"));
  await field.fill("oklch(60% 0 0 / 100%)");
  await field.blur();
  await expect(field).toHaveValue("#808080");
  await expect(field).not.toHaveAttribute("aria-invalid");
  const light = page.getByRole("radio", { name: "Light" });
  const dark = page.getByRole("radio", { name: "Dark" });
  await light.press("ArrowRight");
  await expect(dark).toBeFocused();
  await expect(dark).toBeChecked();
  await expect(page.getByLabel("Base Background HEX or OKLCH")).toHaveValue("#808080");
  await expect(specimen).not.toHaveCSS("background-color", rgb("#808080"));
  await expect(page.getByRole("table", { name: "APCA reference sizes at normal weight (400)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Why APCA" })).toBeVisible();
});

test("Website swaps each pair independently, respects locks and restores with palette Undo", async ({ page }) => {
  await page.goto("/web/?mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF&theme=dark");
  const pageSwap = page.getByRole("button", { name: "Swap Background and Primary Text" });
  const accentSwap = page.getByRole("button", { name: "Swap Accent and Text on accent" });
  const undo = page.getByRole("button", { name: "Undo palette" });
  const colour = (role: string) => page.locator(`#role-${role} code`);
  const background = await colour("background").textContent();
  const primary = await colour("text").textContent();
  for (const [role, swap] of [
    ["Background", pageSwap], ["Primary Text", pageSwap], ["Accent", accentSwap], ["Text on accent", accentSwap],
  ] as const) {
    const lock = page.getByRole("button", { name: "Lock " + role, exact: true });
    await lock.click();
    await expect(swap).toBeDisabled();
    await expect(swap === pageSwap ? accentSwap : pageSwap).toBeEnabled();
    await lock.click();
  }
  await accentSwap.press("Enter");
  await expect(accentSwap).toBeFocused();
  await expect(colour("accent")).toHaveText("#FFFFFF");
  await expect(colour("onAccent")).toHaveText("#35615E");
  await expect(colour("background")).toHaveText(background!);
  await undo.press("Enter");
  await expect(accentSwap).toBeFocused();
  await expect(colour("accent")).toHaveText("#35615E");
  await page.locator("#studio").press("s");
  await expect(colour("background")).toHaveText(primary!);
  await expect(colour("text")).toHaveText(background!);
  await expect(colour("accent")).toHaveText("#35615E");
  await undo.press("Enter");
  await expect(colour("text")).toHaveText(primary!);
  await colour("background").click();
  await page.getByRole("button", { name: "Text pair", exact: true }).click();
  await expect(pageSwap).toBeVisible();
  await expect(accentSwap).toHaveCount(0);
});

test("Website app bar and palette scroll fit both desktop sizes and themes", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/web/");
    const bar = page.getByRole("banner");
    await expect(bar.getByRole("button")).toHaveText(["Saved swatches", "Share", "Export theme"]);
    expect((await bar.boundingBox())!.height).toBe(52);
    const current = (await bar.getByRole("link", { name: "Website colours" }).boundingBox())!;
    expect((await bar.getByRole("button", { name: "Saved swatches" }).boundingBox())!.x).toBeGreaterThan(current.x + current.width);
    await expect(page.getByRole("heading", { name: "Website colours", level: 1 })).toHaveClass("sr");
    await expect(page.getByRole("contentinfo", { name: "Pairing guide" }).getByRole("link")).toHaveAttribute("href", webPilot);

    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("radio", { name: theme }).check();
      const search = page.getByRole("searchbox", { name: "Search palettes" });
      await search.clear();
      const results = page.locator(".library-results");
      const frame = page.locator(".library-results-frame");
      const pinned = await search.boundingBox();
      await expect(frame).toHaveAttribute("data-fade-bottom", "");
      await expect(frame).not.toHaveAttribute("data-fade-top");
      await results.evaluate((element) => { element.scrollTop = 200; });
      await expect(frame).toHaveAttribute("data-fade-top", "");
      expect(await search.boundingBox()).toEqual(pinned);
      expect(await frame.evaluate((element) => getComputedStyle(element, "::before").height)).toBe("8px");
      await search.fill("#48");
      const card = results.getByRole("button", { name: "#B73F74 · #005B8D", exact: true });
      await search.press("Tab");
      await page.getByRole("button", { name: "Randomize" }).press("Tab");
      await expect(card).toBeFocused();
      await expect(card).toHaveCSS("outline-style", "solid");
      await card.press("Enter");
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await expect(frame).not.toHaveAttribute("data-fade-top");
      await expect(frame).not.toHaveAttribute("data-fade-bottom");
      await expect(page.locator("#role-strip")).toBeInViewport({ ratio: 1 });
    }
  }
});

test("both default studios and their guide links fit on desktop arrival", async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    for (const route of ["paint", "web"]) {
      await page.goto(`/${route}/`);
      await page.evaluate(() => document.fonts.ready);
      const bar = page.getByRole("banner");
      const nav = (await bar.getByRole("navigation").boundingBox())!;
      const actions = (await bar.locator(".actions").boundingBox())!;
      const wrap = (await bar.locator(".wrap").boundingBox())!;
      const padding = await bar.locator(".wrap").evaluate((node) => parseFloat(getComputedStyle(node).paddingRight));
      expect(actions.x + actions.width).toBeCloseTo(wrap.x + wrap.width - padding, 0);
      expect(nav.x + nav.width).toBeLessThan(actions.x);
      await expect(page.locator("#studio")).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("contentinfo", { name: "Pairing guide" }).getByRole("link")).toBeInViewport({ ratio: 1 });
      if (route === "web") {
        for (const card of await page.locator(".dashboard-card").all()) {
          await expect(card).toBeInViewport({ ratio: 1 });
        }
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 450 });
  for (const route of ["paint", "web"]) {
    await page.goto(`/${route}/`);
    if (route === "web") {
      const preview = page.getByRole("region", { name: "Sample website preview" });
      await preview.press("End");
      await expect.poll(() => preview.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await expect(preview.getByRole("button", { name: "Tune accent" })).toBeInViewport();
    }
    const guide = page.getByRole("contentinfo", { name: "Pairing guide" }).getByRole("link");
    await guide.scrollIntoViewIfNeeded();
    await expect(guide).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  }
});

test("Pantone codes remain searchable in both studios and are displayed in Paint rows", async ({ page }) => {
  for (const route of ["paint", "web"]) {
    await page.goto(`/${route}/`);
    const card = await find(page, "12-0815 TCX");
    await expect(card.locator("b")).toHaveText("#F2E5CD · #D58592 · #783E33");
    await expect(card.locator("small")).toHaveCount(route === "paint" ? 1 : 0);
  }
});

test("the activity chart labels all four weeks and View report opens Accent by keyboard", async ({ page }) => {
  await page.goto("/web/");
  await expect(page.locator(".dashboard-metric")).toContainText("24");
  const chart = page.getByRole("list", { name: "Projects per week" });
  await expect(chart.getByRole("listitem")).toHaveText(["4 Wk 1", "5 Wk 2", "6 Wk 3", "9 Wk 4"]);
  const bars = await chart.locator(".dashboard-bar").evaluateAll((nodes) => nodes.map((node) => {
    const { height, bottom } = node.getBoundingClientRect();
    return { height, bottom };
  }));
  expect(bars.map(({ height }) => height / bars[0].height * 4)).toEqual([4, 5, 6, 9]);
  expect(new Set(bars.map(({ bottom }) => bottom)).size).toBe(1);
  const report = page.getByRole("button", { name: "View report" });
  await expect(report).toHaveCSS("text-decoration-line", "underline");
  await report.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Edit Accent #/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Tune" })).toHaveAttribute("aria-selected", "true");
  await page.locator("#hex").fill("#123456");
  await expect(report).toHaveCSS("color", rgb("#123456"));
  await expect(chart.locator(".dashboard-bar").last()).toHaveCSS("background-color", rgb("#123456"));
});

test("saved swatches are capped, compared, restored, removed and isolated by editor", async ({ page }) => {
  await page.goto("/paint/");
  const open = () => page.getByRole("button", { name: "Saved swatches" }).click();
  const save = page.getByRole("button", { name: "Save current design" });
  for (const [hash, light] of [["Nordic Limewash", "north"], ["Clay & chalk", "golden"], ["Coastal blue", "evening"], ["Soft sage", "golden"]]) {
    await (await find(page, hash)).click();
    await page.locator("#lighting-" + light).check();
    await open();
    await save.click();
    await close(page);
  }
  await page.reload();
  await open();
  const cards = page.locator(".saved-design");
  await expect(cards).toHaveCount(4);
  expect((await cards.nth(0).boundingBox())!.x).toBeLessThan((await cards.nth(1).boundingBox())!.x);
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Remove design 4" }).click();
  await expect(cards).toHaveCount(3);
  await page.getByRole("button", { name: "Restore design 2" }).click();
  await expect(page.getByRole("radio", { name: "Golden hour" })).toBeChecked();
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#C78E76"));
  await page.goto("/web/");
  await open();
  await expect(cards).toHaveCount(0);
});

test("denied storage keeps live editing and temporary saved swatches working", async ({ page }) => {
  await page.addInitScript(() => {
    for (const property of ["localStorage", "sessionStorage"])
      Object.defineProperty(window, property, { get() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await page.goto("/web/");
  await (await find(page, "Developer Docs")).click();
  await page.getByRole("button", { name: "Saved swatches" }).click();
  await page.getByRole("button", { name: "Save current design" }).click();
  await expect(page.locator("#saved-status")).toContainText("Storage is unavailable");
  await expect(page.locator(".saved-design")).toHaveCount(1);
  await page.getByRole("button", { name: "Restore design 1" }).click();
  await expect(page.locator("#specimen")).toBeVisible();
});

test("photo tint downscales, moves and resizes by keyboard and pointer, and stays local", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=living&pair=feature&wall=A9B39E&feature=66765E&ceiling=804020");
  const sample = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#464646";
    ctx.fillRect(0, 0, 1440, 450);
    ctx.fillStyle = "#999999";
    ctx.fillRect(0, 450, 1440, 450);
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByRole("button", { name: "Tint a photo" }).click();
  const input = page.getByLabel("Choose a photo");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await input.setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("invalid") });
  await expect(page.locator("#photo-status")).toContainText("could not be read");
  await input.setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: Buffer.from(sample, "base64") });
  await expect(page.locator("#photo-status")).toHaveText("Photo ready.");
  await expect(page.locator("#photo-canvas")).toHaveAttribute("width", "1200");
  await page.getByLabel("Paint colour").selectOption({ label: "Ceiling · #804020" });
  const region = page.getByRole("group", { name: "Move tint region" });
  const resize = page.getByRole("button", { name: "Resize tint region" });
  const box = (await region.boundingBox())!;
  await region.press("Shift+ArrowRight");
  const moved = (await region.boundingBox())!;
  expect(moved.x).toBeGreaterThan(box.x);
  await resize.press("Shift+ArrowDown");
  expect((await region.boundingBox())!.height).toBeGreaterThan(moved.height);
  await page.mouse.move(moved.x + 15, moved.y + 15);
  await page.mouse.down();
  await page.mouse.move(moved.x - 10, moved.y + 15);
  await page.mouse.up();
  const dragged = (await region.boundingBox())!;
  expect(dragged.x).toBeLessThan(moved.x);
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 18, handle.y + handle.height / 2 + 10);
  await page.mouse.up();
  expect((await region.boundingBox())!.width).toBeGreaterThan(dragged.width);
  const pixels = await page.locator("#photo-canvas").evaluate((node: HTMLCanvasElement) => {
    const ctx = node.getContext("2d")!;
    return [[0, 0], [500, 250], [500, 480]].map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  });
  expect(pixels[0]).toEqual([70, 70, 70, 255]);
  expect(pixels[1][0]).toBeGreaterThan(pixels[1][1]);
  expect(pixels[1][1]).toBeGreaterThan(pixels[1][2]);
  expect(pixels[1][1]).toBeLessThan(pixels[2][1]);
  expect(requests).toEqual([]);
  await close(page);
  const shared = await share(page);
  await page.goto(shared);
  await expect(page.locator("#room")).toBeVisible();
  await page.getByRole("button", { name: "Tint a photo" }).click();
  await expect(page.locator("#photo-canvas")).toBeHidden();
});

test("pilot pages have working presets, static guidance, clean canonicals and a 404 boundary", async ({ page, browser, request }) => {
  for (const [path, guidance, route] of [[paintPilot, "Use soft sage", "/paint/"], [webPilot, "Set paragraphs in deep plum", "/web/"]]) {
    const query = "?from=shared";
    const response = await request.get(path + query);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toBe(origin + path);
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      const staticPage = await noJs.newPage();
      await staticPage.goto(path);
      const pairing = staticPage.getByRole("main").getByRole("region", { name: "Pairing guidance" });
      await expect(pairing.getByText(new RegExp(guidance))).toBeVisible();
      const heading = await staticPage.getByRole("heading", { level: 1 }).textContent();
      await expect(staticPage).toHaveTitle(`${heading} · Tintfolio`);
    } finally {
      await noJs.close();
    }
    await page.goto(route);
    await expect(page.locator(`a[href="${path}"]`)).toBeVisible();
    await page.goto(path);
    if (route === "/paint/") await expect(fill(page, "ceiling")).toHaveCSS("fill", rgb("#F3E5D5"));
    else await expect(page.locator("#specimen")).toHaveCSS("background-color", rgb("#F3EADF"));
  }
  const missing = await request.get("/unknown-tintfolio-route");
  expect(missing.status()).toBe(404);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(Array.from(xml.matchAll(/<loc>(.+)<\/loc>/g), (m) => m[1])).toEqual(
    ["/paint/", "/web/", paintPilot, webPilot].map((path) => origin + path),
  );
});

for (const route of ["paint", "web"]) {
  test(route + " recovers from empty searches without discarding the other criteria", async ({ page }) => {
    await page.goto("/" + route + "/");
    const search = page.getByRole("searchbox");
    const status = page.locator("#wada-results-status");
    const cards = page.locator(".wada-card");
    const clearSearch = page.getByRole("button", { name: "Clear search" });
    const clearFilters = page.getByRole("button", { name: "Clear filters" });
    const filters = page.getByRole("button", { name: /^Filters/ });
    const source = page.getByLabel("Source");
    const count = page.getByLabel("Swatch count");
    const style = page.getByLabel("Style");

    await search.fill("no-such-palette");
    await expect(status).toHaveText("No matching combinations");
    await expect(clearFilters).toBeHidden();
    await clearSearch.press("Enter");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await expect(cards).toHaveCount(24);

    await filters.click();
    await source.selectOption("wada");
    await count.selectOption("4");
    await style.selectOption("bold");
    await expect(status).toHaveText("No matching combinations");
    await expect(clearSearch).toBeHidden();
    await clearFilters.click();
    await expect(search).toBeFocused();
    await expect(filters).toHaveText("Filters");
    await expect(source).toHaveValue("");
    await expect(count).toHaveValue("0");
    await expect(style).toHaveValue("");
    await expect(cards).toHaveCount(24);

    await source.selectOption("wada");
    await count.selectOption("4");
    await search.fill("#48");
    await expect(clearFilters).toBeVisible();
    await clearSearch.click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await expect(source).toHaveValue("wada");
    await expect(count).toHaveValue("4");
    await expect(cards.first().locator(".chip")).toHaveCount(4);
    await search.fill("#48");
    await expect(clearSearch).toBeVisible();
    await clearFilters.press("Space");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("#48");
    await expect(filters).toHaveText("Filters");
    await expect(cards).toHaveText("#B73F74 · #005B8D");
  });

  test(route + " follows native Tune values through edits, role selection and Undo", async ({ page }) => {
    await page.goto(route === "paint" ? "/paint/?mode=pair&room=living&pair=ceiling&wall=A9B39E&ceiling=F5F0E6" : "/web/");
    await page.getByRole("tab", { name: "Tune" }).click();
    const lightness = page.getByRole("slider", { name: "Lightness" });
    const warmth = page.getByRole("slider", { name: "Warmth" });
    const hex = page.locator("#hex");
    const readouts = async () => {
      const l = `${await lightness.inputValue()}%`;
      const b = Number(await warmth.inputValue());
      const signed = b > 0 ? `+${b}` : String(b);
      await expect(page.locator("#lightness-value")).toHaveText(l);
      await expect(lightness).toHaveAttribute("aria-valuetext", l);
      await expect(page.locator("#warmth-value")).toHaveText(signed);
      await expect(warmth).toHaveAttribute("aria-valuetext", signed);
    };

    await hex.fill("#AB");
    await hex.press("Enter");
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#feedback")).toContainText("Enter six HEX digits");
    await hex.fill("#936F5B");
    await expect(hex).not.toHaveAttribute("aria-invalid");
    await readouts();
    await expect(page.locator("#warmth-value")).toHaveText(/^\+\d+$/);
    await hex.fill("oklch(60% 0 0)");
    await hex.press("Enter");
    await expect(hex).toHaveValue("#808080");
    await expect(lightness).toHaveValue("60");
    await expect(warmth).toHaveValue("0");
    await readouts();

    await lightness.press("ArrowRight");
    await expect(lightness).toHaveValue("61");
    await readouts();
    const beforeWarmth = await hex.inputValue();
    const { x, y, width, height } = (await warmth.boundingBox())!;
    await page.mouse.move(x + width / 4, y + height / 2);
    await page.mouse.down();
    await expect.poll(async () => Number(await warmth.inputValue())).toBeLessThan(0);
    await readouts();
    await page.mouse.up();
    await page.locator("#undo").click();
    await expect(hex).toHaveValue(beforeWarmth);
    await readouts();

    await page.locator(route === "paint" ? "#role-ceiling" : "#role-text").click();
    await expect(hex).not.toHaveValue(beforeWarmth);
    await readouts();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const copy = page.getByRole("button", { name: "Copy", exact: true });
    await page.locator("#picker").press("Tab");
    await expect(hex).toBeFocused();
    await expect(hex).toHaveCSS("outline-style", "solid");
    await hex.press("Tab");
    await expect(copy).toBeFocused();
    await expect(copy).toHaveCSS("outline-style", "solid");
    await copy.press("Enter");
    await expect(page.getByText("HEX copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await hex.inputValue());
  });

  test(route + " keeps filter choices and results when the disclosure closes", async ({ page }) => {
    await page.goto("/" + route + "/");
    const filters = page.getByRole("button", { name: /^Filters/ });
    const source = page.getByLabel("Source");
    const count = page.getByLabel("Swatch count");
    const cards = page.locator(".wada-card");
    await expect(filters).toHaveAttribute("aria-expanded", "false");
    await expect(source).toBeHidden();
    if (route === "paint") {
      await expect(cards.locator("b").nth(0)).toHaveText("#A9B39E · #F5F0E6");
      await expect(cards.locator("b").nth(1)).toHaveText("#C78E76 · #F3E5D5");
      await expect(cards.locator("b").nth(2)).toHaveText("#C3D0D0 · #657F89");
      await expect(cards.locator("b").nth(3)).toHaveText("#A9B39E · #F3E5D5");
    }
    await filters.press("Enter");
    await source.selectOption("curated");
    await count.selectOption("2");
    await expect(filters).toHaveText("Filters (2)");
    await expect(page.locator("#wada-load")).toBeEmpty();
    const before = await cards.allTextContents();
    expect(before.length).toBeGreaterThan(0);
    await filters.press("Space");
    await expect(filters).toBeFocused();
    await expect(source).toBeHidden();
    expect(await cards.allTextContents()).toEqual(before);
    await filters.click();
    await expect(source).toHaveValue("curated");
    await expect(count).toHaveValue("2");
  });

  test(route + " previews on hover without changing committed data and applies without leaving the workspace", async ({ page }) => {
    await page.goto("/" + route + "/");
    const preview = route === "paint" ? fill(page, "wall") : page.locator("#specimen");
    const property = route === "paint" ? "fill" : "background-color";
    const colour = () => preview.evaluate((node, property) => getComputedStyle(node).getPropertyValue(property), property);
    const initial = await colour();
    const original = await page.evaluate((route) => sessionStorage.getItem("tintfolio-" + route), route);
    const card = await find(page, "#48");
    await card.hover();
    await expect.poll(colour).not.toBe(initial);
    expect(await page.evaluate((route) => sessionStorage.getItem("tintfolio-" + route), route)).toBe(original);
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Undo palette" })).toBeDisabled();
    if (route === "web") {
      await page.getByRole("button", { name: "Export theme" }).press("Enter");
      await expect(page.getByLabel("Output")).toHaveValue(new RegExp("--background: " + JSON.parse(original!).colours.background));
      await close(page);
    }
    await page.locator("header .brand").hover();
    await expect.poll(colour).toBe(initial);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await page.locator("header .brand").hover();
    await expect.poll(colour).not.toBe(initial);
    for (const selector of ["#picture", "#role-strip"]) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    const next = await find(page, route === "paint" ? "Clay & chalk" : "Developer Docs");
    const committed = await colour();
    await next.hover();
    await expect.poll(colour).not.toBe(committed);
    await page.getByRole("button", { name: "Undo palette" }).click();
    await expect.poll(colour).toBe(initial);
  });
}

test("Paint locks the exact wall HEX in hover and apply, and workspace shortcuts preserve field keys", async ({ page }) => {
  await page.goto("/paint/");
  await page.locator('[data-surface="ceiling"]').click({ position: { x: 280, y: 8 } });
  await expect(page.getByRole("tab", { name: "Tune" })).toHaveAttribute("aria-selected", "true");
  const hex = page.locator("#hex");
  await hex.fill("#123456");
  await page.getByRole("button", { name: "Lock Main wall" }).click();
  await page.getByRole("tab", { name: "Explore" }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Source").selectOption("wada");
  await page.getByLabel("Swatch count").selectOption("2");
  await expect(page.locator("#wada-results-status")).toHaveText(/of \d+ combinations/);
  const search = page.getByLabel("Search palettes");
  await search.press("s");
  await search.press("Space");
  await search.press("ArrowLeft");
  await expect(search).toHaveValue("s ");
  await expect(page.getByRole("button", { name: "Undo palette" })).toBeDisabled();
  await search.fill("");
  const cards = page.locator(".wada-card");
  await cards.first().hover();
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await page.getByRole("heading", { name: "Room preview" }).hover();
  const studio = page.locator("#studio");
  await studio.press("ArrowRight");
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await studio.press("ArrowRight");
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await studio.press("ArrowLeft");
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  await studio.press("Space");
  await expect(cards.first()).toHaveAttribute("aria-pressed", "false");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  const swap = page.getByRole("button", { name: "Swap roles" });
  await expect(swap).toBeDisabled();
  await studio.press("s");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await page.getByRole("button", { name: "Lock Main wall" }).click();
  await expect(swap).toBeEnabled();
  const ceiling = await fill(page, "ceiling").evaluate((node) => getComputedStyle(node).fill);
  await studio.press("s");
  await expect(fill(page, "wall")).toHaveCSS("fill", ceiling);
  await page.getByRole("button", { name: "Undo palette" }).click();
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await fill(page, "ceiling").click({ position: { x: 280, y: 8 } });
  await expect(page.getByRole("button", { name: /^Edit Ceiling #/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Suggestions", { exact: true })).toBeVisible();
  const before = await hex.inputValue();
  await page.getByRole("slider", { name: "Lightness" }).press("ArrowLeft");
  await expect(hex).not.toHaveValue(before);
});

test("Website preserves a locked accent in site mode when applying a pair and tunes canvas roles", async ({ page }) => {
  await page.goto("/web/?mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF");
  await page.getByRole("button", { name: /^Edit Accent #/ }).click();
  await expect(page.locator("#hex")).toHaveValue("#35615E");
  await page.locator("#specimen-button span").click();
  await expect(page.getByRole("button", { name: /^Edit Text on accent #/ })).toBeFocused();
  await expect(page.locator("#hex")).toHaveValue("#FFFFFF");
  await page.getByRole("button", { name: "Lock Accent", exact: true }).click();
  await page.getByRole("tab", { name: "Explore" }).click();
  const card = await find(page, "Paper & ink");
  await card.hover();
  await expect(page.locator("#specimen-button")).toHaveCSS("background-color", rgb("#35615E"));
  await card.press("Space");
  await expect(page.locator("#specimen-button")).toHaveCSS("background-color", rgb("#35615E"));
  await expect(page.getByRole("button", { name: "Lock Accent", exact: true })).toHaveAttribute("aria-pressed", "true");
  const url = new URL(await share(page));
  expect(url.searchParams.get("mode")).toBe("site");
  expect(url.searchParams.get("accent")).toBe("35615E");
  await page.getByRole("heading", { name: "Workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit Primary Text #/ })).toBeFocused();
  const hex = page.locator("#hex");
  await expect(hex).toHaveValue("#353C30");
  await page.getByRole("slider", { name: "Warmth" }).press("ArrowRight");
  await expect(hex).not.toHaveValue("#353C30");
  await page.getByRole("button", { name: "Lock Background" }).click();
  await expect(page.getByRole("button", { name: "Swap Background and Primary Text" })).toBeDisabled();
});

test("Explore filters curated tags and source contrast independently of automatic correction", async ({ page }) => {
  await page.goto("/web/");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const style = page.getByLabel("Style");
  await style.selectOption("bold");
  const ginkgo = page.locator('.wada-card[data-combination="The Ginkgo"]');
  const paper = page.locator('.wada-card[data-combination="Paper & ink"]');
  await expect(ginkgo).toBeVisible();
  await style.selectOption("warm");
  await expect(page.locator('.wada-card[data-combination="Chocolate & Blues"]')).toBeVisible();
  await expect(ginkgo).toHaveCount(0);
  await page.getByLabel("Swatch count").selectOption("2");
  await style.selectOption("contrast");
  await expect(paper).toBeVisible();
  await expect(page.locator('.wada-card[data-combination="Nordic Limewash"]')).toHaveCount(0);
  await page.getByLabel("Source").selectOption("wada");
  await expect(paper).toHaveCount(0);
});

for (const tool of ["paint", "web"] as const) {
  test(tool + " Explore ranks source swatch counts before and after Wada loads and across pages", async ({ page }) => {
    let finishLoading!: () => void;
    const loading = new Promise<void>((resolve) => { finishLoading = resolve; });
    await page.route("**/wada-combinations.json", async (route) => {
      await loading;
      await route.continue();
    });
    const cards = page.locator(".wada-card");
    const results = () => cards.evaluateAll((nodes) => nodes.map((node) => ({
      id: node.getAttribute("data-combination"), count: node.querySelectorAll(".chip").length,
      label: node.querySelector(".wada-label b")?.textContent,
    })));
    const rank = tool === "paint" ? [2, 3, 4] : [3, 4, 2];
    const recommended = tool === "paint" ? "Nordic Limewash" : "Developer Docs";
    const more = page.locator("#wada-more");
    const { combinations: rows, swatches: pigments } = JSON.parse(await readFile("public/wada-combinations.json", "utf8")) as {
      combinations: number[][]; swatches: [string, string][];
    };
    const featured = new Set([4, 125, 344]);
    const entry = (id: string, hexes: string[]) => ({ id, count: hexes.length, label: hexes.join(" · ") });
    const wada = rows.map(([id, ...swatches]) => entry(String(id), swatches.map((index) => pigments[index][1].toUpperCase())));
    const named = namedCombinations.map(({ id, swatches }) => entry(id, swatches.map(({ hex }) => hex)));
    const curated = [
      ...catalogue[tool].map(({ name, colours }) => {
        const hexes = Object.values(colours);
        return entry(name, hexes.length === 1 ? [...hexes, "#F5F0E6"] : hexes);
      }),
      ...named.filter(({ id }) => id === recommended),
      ...wada.filter(({ id }) => featured.has(Number(id))),
      ...named.filter(({ id }) => id !== recommended),
    ];
    try {
      await page.goto("/" + tool + "/");
      await expect(page.locator("#wada-load")).toHaveText("Loading Wada combinations…");
      const firstPage = await results();
      expect(firstPage).toHaveLength(24);
      expect(firstPage).toEqual(rank.flatMap((count) => curated.filter((entry) => entry.count === count)).slice(0, 24));
    } finally {
      finishLoading();
    }

    // Keep the featured cards in their catalogue positions and exclude their downloaded duplicates.
    const expected = rank.flatMap((count) => [
      ...curated.filter((entry) => entry.count === count),
      ...wada.filter((entry) => entry.count === count && !featured.has(Number(entry.id))),
    ]);
    await expect(page.locator("#wada-results-status")).toHaveText(new RegExp(`^\\d+ of ${expected.length} combinations$`));
    for (let shown = 0; shown < expected.length;) {
      const displayed = await results();
      expect(displayed.length).toBeGreaterThan(shown);
      expect(displayed).toEqual(expected.slice(0, displayed.length));
      shown = displayed.length;
      if (shown < expected.length) {
        // The observer can append the final page and hide the button between reads.
        await more.evaluate((button: HTMLButtonElement) => {
          if (!button.hidden) button.click();
        });
      }
    }
    expect(await results()).toEqual(expected);
    await expect(more).toBeHidden();

    await page.getByLabel("Search palettes").fill("blue");
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByLabel("Source").selectOption("wada");
    await page.getByLabel("Swatch count").selectOption("3");
    if (tool === "web") await page.getByLabel("Style").selectOption("contrast");
    const filtered = await results();
    expect(filtered.length).toBeGreaterThan(1);
    expect(filtered[0]).toEqual(entry("125", ["#D1B0A7", "#0093A5", "#40456A"]));
    expect(filtered.every(({ id, count }) => Number(id) >= 121 && Number(id) <= 240 && count === 3)).toBe(true);
    expect(filtered.every(({ id }) => rows[Number(id) - 1].slice(1).some((index) => /blue/i.test(pigments[index][0])))).toBe(true);
  });
}
