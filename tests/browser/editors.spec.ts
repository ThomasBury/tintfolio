import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

async function exported(page: Page, expected: Record<string, string>) {
  const ready = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download palette SVG" }).click();
  const download = await ready;
  const file = await download.path();
  // Playwright temporary download names have no extension. Serve the actual
  // downloaded bytes as SVG in a new top-level document.
  const tab = await page.context().newPage();
  const bytes = await readFile(file!);
  await tab.goto("data:image/svg+xml;base64," + bytes.toString("base64"));
  await expect(tab.locator("parsererror")).toHaveCount(0);
  for (const [role, hex] of Object.entries(expected)) {
    const row = tab
      .locator("g[transform]")
      .filter({ has: tab.getByText(role, { exact: true }) });
    await expect(row.locator("text").last()).toHaveText(hex);
    await expect(row.locator("rect")).toHaveAttribute("fill", hex);
  }
  await expect(tab.locator("g[transform]")).toHaveCount(
    Object.keys(expected).length,
  );
  await tab.close();
}
async function clipboard(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText());
}
async function checkedStyles(page: Page) {
  return page
    .locator("[data-surface]")
    .evaluateAll((nodes) =>
      nodes.map((n) => [
        n.getAttribute("data-surface"),
        getComputedStyle(n).fill,
      ]),
    );
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test("single colour applies one paint to all walls and the ceiling", async ({ page }) => {
  await page.goto("/paint/");
  const single = page.getByRole("button", { name: "Single colour" });
  const ceiling = page.locator("[data-surface=ceiling]");
  await expect(ceiling).toHaveCSS("fill", "rgb(169, 179, 158)");
  await page.getByRole("button", { name: "Colour pair" }).click();
  await page.getByRole("button", { name: "Ceiling", exact: true }).click();
  await page.locator("#hex").fill("#E4D0BC");
  await expect(ceiling).toHaveCSS("fill", "rgb(228, 208, 188)");
  await single.click();
  await expect(single).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Walls & ceiling" }).click();
  await page.locator("#picker").fill("#3c5064");
  await expect(page.locator("#hex")).toHaveValue("#3C5064");
  const paints = (await checkedStyles(page)).filter(([role]) => role !== "floor");
  expect(paints).toHaveLength(4);
  expect(paints.every(([, fill]) => fill === "rgb(60, 80, 100)")).toBe(true);
  await exported(page, { "Main wall": "#3C5064", Ceiling: "#3C5064", Trim: "#EBE4D7" });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(ceiling).toHaveCSS("fill", "rgb(169, 179, 158)");
  await page.getByRole("button", { name: "Colour pair" }).click();
  await expect(ceiling).toHaveCSS("fill", "rgb(228, 208, 188)");
});

test("existing floor stays independent of paint palettes", async ({ page, browser }) => {
  await page.goto("/paint/");
  const picker = page.getByLabel("Existing floor (optional)");
  const reset = page.getByRole("button", { name: "Reset floor" });
  const floor = page.locator("[data-surface=floor]");
  await expect(reset).toBeDisabled();
  const before = await checkedStyles(page);
  await picker.fill("#57616b");
  await expect(floor).toHaveCSS("fill", "rgb(87, 97, 107)");
  expect((await checkedStyles(page)).filter(([role]) => role !== "floor")).toEqual(
    before.filter(([role]) => role !== "floor"),
  );
  await expect(page.getByText("Suggestions", { exact: true })).toHaveCount(0);
  await page.getByLabel("Room", { exact: true }).selectOption("kitchen");
  await page.getByRole("button", { name: "Apply Clay & chalk palette" }).click();
  await page.getByRole("button", { name: "Single colour" }).click();
  await page.reload();
  await expect(picker).toHaveValue("#57616b");
  await expect(floor).toHaveCSS("fill", "rgb(87, 97, 107)");
  await exported(page, { "Main wall": "#C78E76", Ceiling: "#C78E76", Trim: "#EBE4D7" });

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await clipboard(page);
  const fresh = await browser.newContext();
  const reopened = await fresh.newPage();
  await reopened.goto(shared);
  await expect(reopened.getByLabel("Existing floor (optional)")).toHaveValue("#57616b");
  await expect(reopened.locator("[data-surface=floor]")).toHaveCSS("fill", "rgb(87, 97, 107)");
  await fresh.close();

  await reset.click();
  await expect(picker).toBeFocused();
  await expect(floor).toHaveCSS("fill", "rgb(210, 177, 140)");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  expect(new URL(await clipboard(page)).searchParams.has("floor")).toBe(false);
});

test("paint surfaces, storage, shared links and standalone swatches", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/paint\/$/);
  await expect(
    page.getByRole("button", { name: "Single colour" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Colour pair", exact: true }).click();
  await page.getByLabel("Surfaces").selectOption("feature");
  for (const name of ["living", "bedroom", "kitchen"]) {
    await page.getByLabel("Room", { exact: true }).selectOption(name);
    const before = await checkedStyles(page);
    await page.locator("#hex").fill("#704030");
    const after = await checkedStyles(page);
    expect(after.filter(([r]) => r !== "feature")).toEqual(
      before.filter(([r]) => r !== "feature"),
    );
    expect(after.find(([r]) => r === "feature")![1]).toBe("rgb(112, 64, 48)");
    expect(after).not.toEqual(before);
    if (name !== "kitchen") await page.locator("#hex").fill("#223344");
  }
  await page.locator("#hex").fill("#70");
  await page.locator("#hex").press("Enter");
  await expect(
    page.getByText("Enter six HEX digits", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await clipboard(page)).toBe("#704030");
  await expect(page.locator("#hex")).toHaveValue("#70");
  await exported(page, {
    "Main wall": "#A9B39E",
    "Feature wall": "#704030",
    Ceiling: "#F5F0E6",
    Trim: "#EBE4D7",
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await clipboard(page);
  await page
    .getByRole("link", { name: "Website colours", exact: true })
    .click();
  await page.getByRole("link", { name: "Wall paint", exact: true }).click();
  await expect(page.getByLabel("Room", { exact: true })).toHaveValue("kitchen");
  await page
    .getByRole("button", { name: "Apply Clay & chalk palette" })
    .click();
  await page.goto(shared);
  await expect(page.getByLabel("Surfaces")).toHaveValue("feature");
  await page.getByRole("button", { name: "Feature wall", exact: true }).click();
  await expect(page.locator("#hex")).toHaveValue("#704030");
  await page.goto("/paint/?mode=pair&wall=wrong");
  await expect(
    page.getByText("This design link is invalid.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Room", { exact: true })).toHaveValue("living");
  await expect(
    page.getByRole("button", { name: "Single colour" }),
  ).toHaveAttribute("aria-pressed", "true");
  const fresh = await browser.newContext();
  const reopened = await fresh.newPage();
  await reopened.goto(shared);
  await expect(reopened.getByLabel("Room", { exact: true })).toHaveValue(
    "kitchen",
  );
  await expect(reopened.locator("[data-surface=feature]")).toHaveCSS(
    "fill",
    "rgb(112, 64, 48)",
  );
  await fresh.close();
});

test("web expanded palette, verified button correction and CSS match rendered roles", async ({
  page,
}) => {
  await page.goto("/web/");
  await page.getByRole("button", { name: "Copy CSS" }).click();
  expect(await clipboard(page)).not.toContain("--accent");
  await page.getByRole("button", { name: "Site palette", exact: true }).click();
  const original = await page
    .locator("#specimen-button")
    .evaluate((b) => getComputedStyle(b).backgroundColor);
  await page.getByRole("button", { name: "Adjust button text" }).click();
  await expect(
    page.getByRole("button", { name: "Adjust button text" }),
  ).toHaveCount(0);
  await expect(page.locator("#specimen-button")).toHaveCSS(
    "background-color",
    original,
  );
  await page.getByRole("button", { name: "Copy CSS" }).click();
  const variables = Object.fromEntries(
    Array.from(
      (await clipboard(page)).matchAll(/--([\w-]+): (#[A-F0-9]{6});/g),
      (m) => [m[1], m[2]],
    ),
  );
  expect(Object.keys(variables)).toEqual([
    "background",
    "text",
    "accent",
    "text-on-accent",
  ]);
  const rgb = (hex: string) =>
    "rgb(" +
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ") +
    ")";
  for (const [selector, property, key] of [
    ["#specimen", "background-color", "background"],
    [".story h3", "color", "text"],
    [".story a", "color", "text"],
    ["#specimen-button", "background-color", "accent"],
    ["#specimen-button", "color", "text-on-accent"],
  ]) {
    await expect(page.locator(selector)).toHaveCSS(
      property,
      rgb(variables[key]),
    );
  }
  await exported(page, {
    Background: variables.background,
    Text: variables.text,
    Accent: variables.accent,
    "Text on accent": variables["text-on-accent"],
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await clipboard(page);
  await page
    .getByRole("button", { name: "Apply Night edition palette" })
    .click();
  await page.getByRole("link", { name: "Wall paint", exact: true }).click();
  await page
    .getByRole("link", { name: "Website colours", exact: true })
    .click();
  await expect(page.locator("#hex")).toHaveValue("#332C38");
  await page.goto(shared);
  await expect(page.locator("#specimen-button")).toHaveCSS(
    "color",
    rgb(variables["text-on-accent"]),
  );
  await page.goto("/web/?mode=site&accent=not-a-colour");
  await expect(
    page.getByText("This design link is invalid.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("#hex")).toHaveValue("#F3EEDF");
});

test("keyboard journey with unavailable session storage and clipboard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("unavailable");
      },
    });
    Object.defineProperty(navigator, "clipboard", { value: undefined });
  });
  await page.goto("/web/");
  await page.keyboard.press("Tab");
  await expect(page.getByText("Skip to editor")).toBeFocused();
  await page.keyboard.press("Enter");
  for (
    let i = 0;
    i < 12 &&
    !(await page
      .locator("#mode-site")
      .evaluate((n) => n === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(page.locator("#mode-site")).toBeFocused();
  await expect(page.locator("#mode-site")).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Space");
  await expect(page.locator("#mode-site")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (
    let i = 0;
    i < 16 &&
    !(await page.locator("#css").evaluate((n) => n === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const output = page.getByLabel("Select and copy manually");
  await expect(output).toBeFocused();
  expect(await output.inputValue()).toContain("--text-on-accent");
  expect(
    await output.evaluate(
      (n: HTMLTextAreaElement) => n.selectionEnd - n.selectionStart,
    ),
  ).toBe((await output.inputValue()).length);
});
for (const route of ["paint", "web"])
  test(route + " static metadata and initial JS budget", async ({ page }) => {
    const response = await page.goto("/" + route + "/");
    const source = await response!.text();
    expect(source).toContain('name="description"');
    expect(source).toContain('property="og:image"');
    const social = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(
      (await page.request.get(social!)).headers()["content-type"],
    ).toContain("image/png");
    const urls = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((r) => new URL(r.name))
        .filter((u) => u.pathname.endsWith(".js"))
        .map((u) => u.pathname),
    );
    expect(urls.length).toBeGreaterThan(0);
    let bytes = 0;
    for (const url of new Set(urls))
      bytes += gzipSync(await readFile("dist" + url)).length;
    expect(bytes).toBeLessThanOrEqual(75000);
  });

for (const route of ["paint", "web"]) {
  test(route + " collection retries, filters and previews by keyboard", async ({ page }) => {
    let requests = 0;
    let failRequest = () => {};
    const waiting = new Promise<void>((resolve) => { failRequest = resolve; });
    await page.addInitScript(() => { Math.random = () => 0.999999; });
    await page.route("**/wada-combinations.json", async (request) => {
      requests++;
      if (requests === 1) {
        await waiting;
        await request.fulfill({ status: 503 });
      } else await request.continue();
    });
    await page.goto("/" + route + "/");
    await page.locator("#hex").fill("#123456");

    const collection = page.locator("#wada");
    const featuredSection = page.getByRole("region", { name: "Colour combinations", exact: true });
    const featured = featuredSection.locator("#wada-featured button");
    await expect(featured).toHaveText([/#4 2 swatches/, /#125 3 swatches/, /#344 4 swatches/]);
    await expect(featuredSection.getByRole("status")).toHaveText("Loading more combinations…");
    await expect.poll(() => requests).toBe(1);
    const results = collection.locator("#wada-results button");
    await expect(results).toHaveCount(12);
    const browse = collection.getByRole("heading", { name: "Browse combinations" });
    await featuredSection.getByRole("link", { name: "Browse all combinations" }).press("Enter");
    await expect(browse).toBeFocused();
    await expect(browse).toBeInViewport({ ratio: 1 });

    const previewTitle = collection.getByRole("heading", { name: "Preview combination #4" });
    await featured.first().press("Enter");
    await expect(previewTitle).toBeFocused();
    await expect(previewTitle).toBeInViewport({ ratio: 1 });
    failRequest();
    await expect(featuredSection.getByRole("status")).toHaveText("The Wada combinations could not be loaded.");
    await expect(results.first()).toHaveAccessibleName("Preview The Ginkgo 3 swatches");
    await expect(featured.first()).toHaveAttribute("aria-pressed", "true");
    await expect(previewTitle).toBeVisible();
    const retry = featuredSection.getByRole("button", { name: "Retry" });
    await retry.press("Enter");
    const search = collection.getByLabel("Search combinations");
    await expect(search).toBeFocused();
    await expect(retry).toBeHidden();
    expect(requests).toBe(2);

    await expect(results).toHaveCount(24);
    await expect(collection.getByRole("button", { name: "Preview combination #4 2 swatches" })).toHaveAttribute("aria-pressed", "true");
    await expect(results.nth(12)).toHaveAccessibleName("Preview combination #1 2 swatches");
    await expect(results.last()).toHaveAccessibleName("Preview combination #12 2 swatches");
    await collection.getByRole("button", { name: "Next", exact: true }).click();
    await expect(collection.getByRole("heading", { name: "Results" })).toBeFocused();
    await expect(results.first()).toHaveAccessibleName("Preview combination #13 2 swatches");
    await collection.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(results.first()).toHaveAccessibleName("Preview The Ginkgo 3 swatches");

    const count = collection.getByLabel("Swatch count");
    await count.selectOption("4");
    await expect(collection.getByText("1–24 of 111 combinations")).toBeVisible();
    await search.fill("bLuE");
    await expect(collection.getByText("1–24 of 47 combinations")).toBeVisible();
    const random = collection.getByRole("button", { name: "Randomize" });
    await random.press("Space");
    await expect(collection.getByText("Page 2 of 2")).toBeVisible();
    await expect(results).toHaveCount(23);
    for (const index of [22, 21]) {
      const id = await results.nth(index).getAttribute("data-combination");
      await expect(collection.getByRole("heading", { name: "Preview combination #" + id })).toBeVisible();
      await expect(random).toBeFocused();
      if (index === 22) await page.keyboard.press("Space");
    }

    const apply = collection.getByRole("button", { name: "Apply", exact: true });
    await search.fill("#4");
    await expect(collection.getByText("No matching combinations")).toBeVisible();
    await expect(random).toBeDisabled();
    await expect(apply).toBeHidden();
    await count.selectOption("2");
    await expect(results).toHaveCount(1);
    await results.first().press("Enter");
    await expect(previewTitle).toBeFocused();
    await expect(previewTitle).toBeInViewport({ ratio: 1 });
    await expect(collection.locator(".wada-swatches")).toContainText("Isabella Color #c5a56e");
    if (route === "paint") {
      for (const control of [
        collection.getByLabel("Main wall"),
        collection.getByLabel("Ceiling"),
      ]) {
        await page.keyboard.press("Tab");
        await expect(control).toBeFocused();
      }
    }
    await page.keyboard.press("Tab");
    await expect(apply).toBeFocused();
    await expect(page.locator("#hex")).toHaveValue("#123456");
    expect(await page.evaluate((tool) =>
      JSON.parse(sessionStorage.getItem("tintfolio-" + tool)!).active, route)).toContain("123456");
    await page.keyboard.press("Enter");
    await expect(page.locator(route === "paint" ? "#mode-pair" : "#mode-text")).toBeFocused();
    await expect(page.locator("#status")).toHaveText("Combination #4 applied.");
    await expect(page.locator("#hex")).toHaveValue("#C5A56E");

    const credit = page.locator("section:has(#examples) + footer");
    await expect(credit).toContainText("Many combinations come from Sanzo Wada’s");
    await expect(credit.getByRole("link", { name: "A Dictionary of Color Combinations" })).toHaveAttribute("href", /seigensha\.com/);
    await expect(credit.getByRole("link", { name: "Dataset and conversion notes" })).toHaveAttribute("href", /dictionary-of-colour-combinations/);
    await expect(credit.getByRole("link", { name: "MIT notice" })).toHaveAttribute("href", "/wada-license.txt");
  });
}

for (const route of ["paint", "web"]) {
  test(route + " finds and applies named palettes", async ({ page }) => {
    let resume = () => {};
    const waiting = new Promise<void>((resolve) => { resume = resolve; });
    await page.route("**/wada-combinations.json", async (request) => {
      await waiting;
      await request.continue();
    });
    await page.goto("/" + route + "/");
    const collection = page.locator("#wada");
    const search = collection.getByLabel("Search combinations");
    const preview = collection.locator("#wada-preview");
    const results = collection.locator("#wada-results button");
    await search.fill("12-0815 tcx");
    await expect(results).toHaveCount(1);
    await expect(results.first()).toHaveAccessibleName("Preview Flower Market 3 swatches");
    await results.first().focus();
    resume();
    await expect(page.locator("#wada-load")).toBeEmpty();
    await expect(results.first()).toBeFocused();
    await results.first().press("Enter");
    await expect(preview).toContainText("Vanilla Custard #F2E5CD · 12-0815 TCX");

    await search.fill("merlot & butter");
    const count = collection.getByLabel("Swatch count");
    await count.selectOption("3");
    await expect(results).toHaveCount(0);
    await count.selectOption("4");
    await expect(results).toHaveCount(1);
    await results.first().press("Enter");
    await expect(results.first()).toHaveAttribute("aria-pressed", "true");
    await expect(preview.getByRole("heading", { name: "Preview Merlot & Butter" })).toBeFocused();
    await expect(preview.locator(".wada-swatches code")).toHaveText([
      "#762530", "#EBCE84", "#7A7B2D", "#905843",
    ]);

    const apply = preview.getByRole("button", { name: "Apply", exact: true });
    if (route === "paint") {
      await preview.getByLabel("Ceiling").selectOption("3");
      await apply.click();
      await expect(page.locator("#mode-pair")).toBeFocused();
      await expect(page.locator("#status")).toHaveText("Merlot & Butter applied.");
      await exported(page, { "Main wall": "#762530", Ceiling: "#905843", Trim: "#EBE4D7" });
    } else {
      await count.selectOption("3");
      await search.fill("The Ginkgo");
      await results.first().press("Enter");
      await expect(preview).toContainText("saturated coral red as the focal point");
      await apply.click();
      await expect(page.locator("#mode-site")).toBeFocused();
      await expect(page.locator("#status")).toHaveText("The Ginkgo applied.");
      await exported(page, {
        Background: "#F5F6F0", Text: "#4B624A", Accent: "#E64435", "Text on accent": "#000000",
      });
    }
  });
}

test("paint swaps a wall and ceiling pair and keeps the button focused", async ({ page }) => {
  await page.goto("/paint/");
  const swap = page.getByRole("button", { name: "Swap colours" });
  await expect(swap).toHaveCount(0);
  await page.getByRole("button", { name: "Colour pair", exact: true }).click();
  const room = page.locator("#room");
  const roomBox = (await room.boundingBox())!;
  expect((await swap.boundingBox())!.x).toBeGreaterThan(roomBox.x + roomBox.width);
  await page.getByRole("button", { name: "Ceiling", exact: true }).click();
  await page.locator("#hex").fill("#E4D0BC");

  const before = await checkedStyles(page);
  await swap.press("Space");
  await expect(swap).toBeFocused();
  await expect(page.locator("#hex")).toHaveValue("#A9B39E");
  await expect(page.locator("[data-surface=ceiling]")).toHaveCSS("fill", "rgb(169, 179, 158)");
  await expect(page.locator("[data-surface=wall]").first()).toHaveCSS("fill", "rgb(228, 208, 188)");
  await page.keyboard.press("Space");
  await expect(swap).toBeFocused();
  expect(await checkedStyles(page)).toEqual(before);
  await page.keyboard.press("Space");

  const expected = { "Main wall": "#E4D0BC", Ceiling: "#A9B39E", Trim: "#EBE4D7" };
  await exported(page, expected);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await clipboard(page);
  expect(new URL(shared).searchParams.toString()).toBe("mode=pair&room=living&pair=ceiling&wall=E4D0BC&ceiling=A9B39E");
  await page.reload();
  await expect(page.locator("#hex")).toHaveValue("#E4D0BC");
  await expect(page.locator("[data-surface=ceiling]")).toHaveCSS("fill", "rgb(169, 179, 158)");
  await page.goto(shared);
  await exported(page, expected);
});

test("paint swaps a feature wall pair after applying chosen swatches", async ({ page }) => {
  await page.goto("/paint/");
  await page.getByRole("button", { name: "Colour pair", exact: true }).click();
  const surfaces = page.getByLabel("Surfaces");
  await surfaces.selectOption("feature");
  await page.getByLabel("Room", { exact: true }).selectOption("bedroom");
  await page.locator("#hex").fill("#123456");
  const before = await checkedStyles(page);
  const collection = page.locator("#wada");
  await page.locator("#wada-featured").getByRole("button", { name: /#344/ }).click();
  await expect(collection.getByRole("button", { name: "Swap assignments" })).toHaveCount(0);
  const wall = collection.getByLabel("Main wall");
  const feature = collection.getByLabel("Feature wall");
  await expect(wall).toHaveValue("0");
  await expect(feature).toHaveValue("1");
  await expect(wall.locator("option[value='1']")).toBeDisabled();
  await expect(feature.locator("option[value='0']")).toBeDisabled();
  await wall.selectOption("2");
  await feature.selectOption("3");
  await surfaces.selectOption("ceiling");
  await expect(collection.getByLabel("Ceiling")).toHaveValue("3");
  await surfaces.selectOption("feature");
  expect(await checkedStyles(page)).toEqual(before);

  await collection.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("#hex")).toHaveValue("#A36AA5");
  await expect(page.locator("[data-surface=feature]")).toHaveCSS("fill", "rgb(17, 19, 20)");
  const swap = page.getByRole("button", { name: "Swap colours" });
  await swap.click();
  await expect(swap).toBeFocused();
  await expect(page.locator("#hex")).toHaveValue("#111314");
  await expect(page.locator("[data-surface=wall]").first()).toHaveCSS("fill", "rgb(17, 19, 20)");
  await expect(page.locator("[data-surface=feature]")).toHaveCSS("fill", "rgb(163, 106, 165)");
  const expected = {
    "Main wall": "#111314", "Feature wall": "#A36AA5", Ceiling: "#F5F0E6", Trim: "#EBE4D7",
  };
  await exported(page, expected);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await clipboard(page);
  expect(new URL(shared).searchParams.toString()).toBe("mode=pair&room=bedroom&pair=feature&wall=111314&feature=A36AA5");
  await page.reload();
  await expect(page.getByLabel("Room", { exact: true })).toHaveValue("bedroom");
  await expect(page.locator("[data-surface=feature]")).toHaveCSS("fill", "rgb(163, 106, 165)");
  await page.goto(shared);
  await exported(page, expected);
  await page.getByRole("button", { name: "Feature wall", exact: true }).click();
  await expect(page.getByText("Suggestions", { exact: true })).toBeVisible();
});

test("web labels adjusted and added colours and exports the applied roles", async ({ page }) => {
  await page.goto("/web/");
  const collection = page.locator("#wada");
  const preview = collection.locator("#wada-preview");
  const apply = preview.getByRole("button", { name: "Apply", exact: true });
  const featured = page.locator("#wada-featured");
  await collection.locator("#wada-results").getByRole("button", { name: /^Preview combination #1 / }).click();
  await expect(preview.getByText(/Adjusted from Cerulian Blue #0093a5/)).toBeVisible();
  await expect(preview.locator(".wada-swatches")).toContainText("English Red #d96629");
  await apply.click();
  await expect(page.locator("#mode-text")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#advice")).toContainText("Passes");

  await featured.getByRole("button", { name: /#125/ }).click();
  await expect(preview.getByText(/Added · Black/)).toBeVisible();
  await apply.click();
  await expect(page.locator("#mode-site")).toBeFocused();
  await expect(page.locator("#status")).toHaveText("Combination #125 applied.");
  const expected = { Background: "#D1B0A7", Text: "#40456A", Accent: "#0093A5", "Text on accent": "#000000" };
  await page.getByRole("button", { name: "Copy CSS" }).click();
  expect(await clipboard(page)).toBe(":root {\n  --background: #D1B0A7;\n  --text: #40456A;\n  --accent: #0093A5;\n  --text-on-accent: #000000;\n}");
  await exported(page, expected);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await clipboard(page);
  expect(new URL(shared).searchParams.toString()).toBe("mode=site&background=D1B0A7&text=40456A&accent=0093A5&onAccent=000000");
  await page.reload();
  await expect(page.locator("#specimen-button")).toHaveCSS("background-color", "rgb(0, 147, 165)");
  await page.goto(shared);
  await exported(page, expected);

  await featured.getByRole("button", { name: /#344/ }).click();
  await expect(preview.locator(".wada-roles dt")).toHaveCount(4);
  await expect(preview.getByText(/Added|Adjusted/)).toHaveCount(0);
});
