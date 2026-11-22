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
