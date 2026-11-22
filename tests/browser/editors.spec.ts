import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { contrast } from "../../src/colour.ts";

const origin = "https://tintfolio.bury-thomas.workers.dev";
const paintPilot = "/wall-paint/sage-green-and-warm-cream-living-room";
const webPilot = "/website-colours/high-contrast-cream-and-plum-palette";
const fill = (page: Page, surface: string) => page.locator(`[data-surface="${surface}"]`).first();
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const combinations = (page: Page) => page.getByRole("region", { name: "Colour combinations" });
const find = async (page: Page, term: string) => {
  await page.getByLabel("Search combinations").fill(term);
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
  await page.getByLabel("Era").selectOption("Early Shōwa");
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
  await library.getByRole("button", { name: "Undo palette" }).click();
  await expect(card).toBeFocused();
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#123456"));
  await expect(fill(page, "feature")).toHaveCSS("fill", rgb("#998877"));
});

test("paint reassigns and swaps roles on the canvas, and prints its surface colours", async ({ page }) => {
  await page.goto("/paint/?mode=pair&room=kitchen&pair=feature&floor=57616B&wall=123456&feature=998877");
  await (await find(page, "#344")).click();
  await page.getByText("Room surfaces and swatches", { exact: true }).click();
  const canvas = page.locator("#preview-card");
  const wall = canvas.getByLabel("Main wall", { exact: true });
  const secondary = canvas.getByLabel("Feature wall", { exact: true });
  await expect(wall).toHaveValue("0");
  await expect(secondary).toHaveValue("1");
  await expect(wall.locator('option[value="1"]')).toBeDisabled();
  await wall.selectOption("2");
  await secondary.selectOption("3");
  await expect(fill(page, "wall")).toHaveCSS("fill", rgb("#A36AA5"));
  const swap = canvas.getByRole("button", { name: "Swap roles" });
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

test("manual paint edits are reflected in the canvas swatch controls", async ({ page }) => {
  await page.goto("/paint/");
  await (await find(page, "#344")).click();
  await page.getByText("Room surfaces and swatches", { exact: true }).click();
  await page.getByText("Edit colours", { exact: true }).click();
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
  await expect(page.getByLabel("Search combinations")).toBeFocused();
  await expect(page.locator("#wada-load")).toBeEmpty();
  await page.getByLabel("Search combinations").fill("");
  await page.getByLabel("Use case").selectOption("Documentation");
  await expect(combinations(page).locator(".wada-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Randomize" }).press("Enter");
  await expect(page.locator("#status")).toHaveText("Developer Docs applied.");
  await expect(page.getByRole("button", { name: "Randomize" })).toBeFocused();
});

test("Load more and scrolling append pages while keeping keyboard focus", async ({ page }) => {
  await page.goto("/paint/");
  await page.getByLabel("Era").selectOption("Early Shōwa");
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
  await page.getByRole("link", { name: "Check contrast" }).click();
  await expect(page.locator("#canvas-notes")).toContainText("Adjusted from Cerulian Blue");
  await (await find(page, "#125")).click();
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
