import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { contrast } from "../../src/colour.ts";

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
  await expect(library.getByRole("button", { name: /Nordic Limewash/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "A Dictionary of Color Combinations" })).toHaveAttribute("href", /seigensha/);
  await page.getByLabel("Source").selectOption("wada");
  await expect(library.locator(".wada-card").first()).toContainText("Isabella Color");
  const card = await find(page, "#48");
  await expect(card).toContainText("Combination #48");
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  const scroll = await page.evaluate(() => scrollY);
  await card.press("Enter");
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toHaveText("Combination #48 applied.");
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

test("paint reassigns and swaps roles on the canvas, and prints its surface colours", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=kitchen&pair=feature&floor=57616B&wall=123456&feature=998877");
  const canvas = page.getByRole("region", { name: "Room surfaces" });
  await expect(canvas.getByLabel("Surfaces", { exact: true })).toHaveValue("feature");
  await (await find(page, "#344")).click();
  const wall = canvas.getByLabel("Main wall", { exact: true });
  const secondary = canvas.getByLabel("Feature wall", { exact: true });
  await expect(wall).toHaveValue("0");
  await expect(secondary).toHaveValue("1");
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
  await page.getByLabel("Lighting").selectOption("golden");
  await expect(page.locator("#room-light stop").first()).toHaveAttribute("stop-color", "#FFCC78");
  await page.getByLabel("Lighting").selectOption("evening");
  await expect(page.locator("radialGradient#room-light")).toBeAttached();
  await expect(fill(page, "wall")).toHaveCSS("fill", before);
  await page.getByRole("button", { name: "Paint spec sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Paint spec sheet" });
  for (const [surface, hex] of [["Main wall", "#111314"], ["Feature wall", "#A36AA5"], ["Ceiling", "#F5F0E6"], ["Trim", "#EBE4D7"]])
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

test("manual paint edits are reflected in the canvas swatch controls", async ({ page }) => {
  await page.goto("/paint/");
  await (await find(page, "#344")).click();
  await page.getByRole("tab", { name: "Tune" }).click();
  await page.locator("#hex").fill("#123456");
  const wall = page.getByLabel("Main wall", { exact: true });
  await expect(wall.locator("option:checked")).toHaveText("Custom · #123456");
  await wall.selectOption("2");
  await expect(wall).toHaveValue("2");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#A36AA5"));
});

test("failed library load leaves curated palettes usable and retry keeps keyboard focus", async ({ page }) => {
  let attempts = 0;
  await page.route("**/wada-combinations.json", (route) => ++attempts === 1 ? route.abort() : route.continue());
  await page.goto("/web/");
  await (await find(page, "12-0815 TCX")).press("Enter");
  await expect(page.locator("#status")).toHaveText("Flower Market applied.");
  await expect(page.locator("#wada-load")).toContainText("Curated palettes are still available");
  await page.getByRole("button", { name: "Retry" }).press("Enter");
  await expect(page.getByLabel("Search palettes")).toBeFocused();
  await expect(page.locator("#wada-load")).toBeEmpty();
  await page.getByLabel("Search palettes").fill("");
  await page.getByLabel("Search palettes").fill("Developer Docs");
  await expect(combinations(page).locator(".wada-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Randomize" }).press("Enter");
  await expect(page.locator("#status")).toHaveText("Developer Docs applied.");
  await expect(page.getByRole("button", { name: "Randomize" })).toBeFocused();
});

test("Load more and scrolling append pages while keeping keyboard focus", async ({ page }) => {
  await page.goto("/paint/");
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
  await expect(page.getByLabel("Lighting")).toHaveValue("north");
  await page.getByLabel("Lighting").selectOption("golden");
  const newPaint = await share(page);
  expect(new URL(newPaint).searchParams.get("lighting")).toBe("golden");
  await page.goto("/web/?mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF");
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("light");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  const newWeb = await share(page);
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto("/paint/");
    await other.getByLabel("Room", { exact: true }).selectOption("kitchen");
    await other.goto(newPaint);
    await expect(other.getByLabel("Room", { exact: true })).toHaveValue("bedroom");
    await expect(other.getByLabel("Lighting")).toHaveValue("golden");
    await expect(fill(other, "wall")).toHaveCSS("fill", rgb("#102030"));
    await other.goto(old);
    await expect(other.getByLabel("Lighting")).toHaveValue("north");
    await other.goto(newWeb);
    await expect(other.getByLabel("Theme", { exact: true })).toHaveValue("dark");
    await expect(other.locator("#specimen-button")).toHaveCSS("background-color", rgb("#35615E"));
  } finally {
    await fresh.close();
  }
});

test("website shows adjusted and added swatches, reports rendered contrast, and exports both themes", async ({ page }) => {
  await page.goto("/web/");
  await (await find(page, "#1")).click();
  await expect(page.locator("#assignment-count")).toContainText("adjusted or added");
  await page.getByRole("button", { name: "Check contrast" }).click();
  await expect(page.locator("#canvas-notes")).toContainText("Adjusted from Cerulian Blue");
  await page.getByRole("tab", { name: "Explore" }).click();
  await (await find(page, "#125")).click();
  await page.getByRole("tab", { name: "Tune" }).click();
  await expect(page.locator("#canvas-notes")).toContainText("Text on accent #000000 · Added");
  const specimen = page.locator("#specimen");
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    const properties = await specimen.evaluate((node) =>
      Object.fromEntries(Array.from((node as HTMLElement).style).map((key) => [key, (node as HTMLElement).style.getPropertyValue(key)])));
    const { heading, surface, input, button } = {
      heading: specimen.locator("h3"), surface: specimen.locator(".dashboard-card").first(),
      input: specimen.getByLabel("Email"), button: specimen.locator("#specimen-button"),
    };
    await expect(heading).toHaveCSS("color", rgb(properties["--primary-text"]));
    await expect(surface).toHaveCSS("background-color", rgb(properties["--surface"]));
    await expect(input).toHaveCSS("border-top-color", rgb(properties["--border"]));
    await expect(button).toHaveCSS("background-color", rgb(properties["--accent"]));
    const bars = surface.locator(".dashboard-bar");
    for (const bar of (await bars.all()).slice(0, 3)) {
      await expect(bar).toHaveCSS("background-color", rgb(properties["--muted-text"]));
    }
    const report = surface.getByRole("button", { name: "View report" });
    await expect(bars.last()).toHaveCSS("background-color", rgb(properties["--accent"]));
    await expect(report).toHaveCSS("color", rgb(properties["--accent"]));
    const cardColour = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);
    const chartContrast = contrast(await bars.last().evaluate((node) => getComputedStyle(node).backgroundColor), cardColour);
    const reportContrast = contrast(await report.evaluate((node) => getComputedStyle(node).color), cardColour);
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
  await expect(page.getByRole("button", { name: "Tune Accent", exact: true })).toBeFocused();
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
    await page.getByLabel("Lighting").selectOption(light);
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
  await expect(page.getByLabel("Lighting")).toHaveValue("golden");
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
  await page.goto("/paint/");
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
  expect(pixels[1][0]).not.toBe(pixels[1][1]);
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
      await expect(staticPage.getByText(new RegExp(guidance))).toBeVisible();
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
    await page.locator("h1").hover();
    await expect.poll(colour).toBe(initial);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await page.locator("h1").hover();
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
  await page.locator("h1").hover();
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
  await expect(page.getByRole("button", { name: "Tune Ceiling" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Suggestions", { exact: true })).toBeVisible();
  const before = await hex.inputValue();
  await page.getByRole("slider", { name: "Lightness" }).press("ArrowLeft");
  await expect(hex).not.toHaveValue(before);
});

test("Website preserves a locked accent in site mode when applying a pair and tunes canvas roles", async ({ page }) => {
  await page.goto("/web/?mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF");
  await page.getByRole("button", { name: "Tune Accent", exact: true }).click();
  await expect(page.locator("#hex")).toHaveValue("#35615E");
  await page.locator("#specimen-button span").click();
  await expect(page.getByRole("button", { name: "Tune Text on accent" })).toBeFocused();
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
  await expect(page.getByRole("button", { name: "Tune Primary Text" })).toBeFocused();
  const hex = page.locator("#hex");
  await expect(hex).toHaveValue("#353C30");
  await page.getByRole("slider", { name: "Warmth" }).press("ArrowRight");
  await expect(hex).not.toHaveValue("#353C30");
  await page.getByRole("button", { name: "Lock Background" }).click();
  await expect(page.getByRole("button", { name: "Swap roles" })).toBeDisabled();
});

test("Explore filters curated tags and source contrast independently of automatic correction", async ({ page }) => {
  await page.goto("/web/");
  const style = page.getByLabel("Style");
  await style.selectOption("bold");
  await expect(page.locator(".wada-card").getByText("The Ginkgo")).toBeVisible();
  await style.selectOption("warm");
  await expect(page.locator(".wada-card").getByText("Chocolate & Blues")).toBeVisible();
  await expect(page.locator(".wada-card").getByText("The Ginkgo")).toHaveCount(0);
  await page.getByLabel("Swatch count").selectOption("2");
  await style.selectOption("contrast");
  await expect(page.locator(".wada-card").getByText("Paper & ink")).toBeVisible();
  await expect(page.locator(".wada-card").getByText("Nordic Limewash")).toHaveCount(0);
  await page.getByLabel("Source").selectOption("wada");
  await expect(page.locator(".wada-card").getByText("Paper & ink")).toHaveCount(0);
});

test("Website Explore ranks source swatch counts before and after Wada loads and across pages", async ({ page }) => {
  let finishLoading!: () => void;
  const loading = new Promise<void>((resolve) => { finishLoading = resolve; });
  await page.route("**/wada-combinations.json", async (route) => {
    await loading;
    await route.continue();
  });
  const cards = page.locator(".wada-card");
  const results = () => cards.evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-combination"), count: node.querySelectorAll(".chip").length,
  })));
  const rank = [3, 4, 2];
  const more = page.locator("#wada-more");
  let curated: Awaited<ReturnType<typeof results>>;
  try {
    await page.goto("/web/");
    await expect(page.locator("#wada-load")).toHaveText("Loading Wada combinations…");
    curated = await results();
    expect([...new Set(curated.map(({ count }) => count))]).toEqual(rank);
    expect(curated.slice(0, 3).map(({ id }) => id)).toEqual(["125", "The Ginkgo", "Cool Fall Breeze"]);
  } finally {
    finishLoading();
  }

  // Keep the featured cards in their catalogue positions and exclude their downloaded duplicates.
  const { combinations: rows } = JSON.parse(await readFile("public/wada-combinations.json", "utf8")) as { combinations: number[][] };
  const featured = new Set(curated.map(({ id }) => id));
  const expected = rank.flatMap((count) => [
    ...curated.filter((entry) => entry.count === count),
    ...rows.filter(([id, ...swatches]) => swatches.length === count && !featured.has(String(id)))
      .map(([id]) => ({ id: String(id), count })),
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
  await page.getByLabel("Source").selectOption("wada");
  await page.getByLabel("Swatch count").selectOption("3");
  await page.getByLabel("Style").selectOption("contrast");
  const filtered = await results();
  expect(filtered.length).toBeGreaterThan(1);
  expect(filtered[0]).toEqual({ id: "125", count: 3 });
  expect(filtered.every(({ id, count }) => Number(id) >= 121 && Number(id) <= 240 && count === 3)).toBe(true);
  await expect(cards.filter({ hasNotText: /blue/i })).toHaveCount(0);
});
