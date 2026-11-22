import { expect, test, type Locator } from "@playwright/test";

test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });

async function onScreen(locator: Locator) {
  await expect.poll(() => locator.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight
      && node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
}

for (const route of ["paint", "web"]) {
  test(route + " keeps the compact preview visible while applying and undoing with the keyboard", async ({ page }) => {
    await page.goto("/" + route + "/");
    const preview = page.locator("#picture");
    const canvasBefore = await preview.innerHTML();
    await page.getByLabel("Search palettes").fill("#48");
    const card = page.getByRole("button", { name: /Combination #48/ });
    await card.scrollIntoViewIfNeeded();
    await card.focus();
    await card.press("Enter");
    await expect(card).toBeFocused();
    await onScreen(card);
    await onScreen(preview);
    await onScreen(page.locator("#role-strip"));
    expect(await preview.innerHTML()).not.toBe(canvasBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    const undo = page.getByRole("button", { name: "Undo palette" });
    await undo.press("Space");
    await expect(card).toBeFocused();
    expect(await preview.innerHTML()).toBe(canvasBefore);
    const toggle = page.getByRole("button", { name: "Toggle palette sheet" });
    await toggle.tap();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("tab", { name: "Explore" })).toBeHidden();
    await onScreen(preview);
    await onScreen(page.locator("#role-strip"));
    await toggle.tap();
    await card.tap();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await onScreen(preview);
    await onScreen(page.locator("#role-strip"));
    for (const control of await page.locator("#studio button:visible, #studio select:visible, #studio input:visible").all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      await expect(control).toHaveAccessibleName(/.+/);
    }
  });

  test(route + " keeps an invalid HEX and its feedback reachable with a short viewport", async ({ page }) => {
    await page.goto("/" + route + "/");
    await page.getByRole("tab", { name: "Tune" }).tap();
    await page.setViewportSize({ width: 320, height: 340 });
    const hex = page.locator("#hex");
    await hex.fill("#AB");
    await hex.press("Enter");
    await page.locator("#feedback").scrollIntoViewIfNeeded();
    await onScreen(hex);
    await onScreen(page.locator("#feedback"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
}

test("floor editing stays independent and the print spec fits at 320 pixels", async ({ page }) => {
  await page.goto("/paint/");
  await page.getByText("Room surfaces", { exact: true }).tap();
  const floor = page.getByLabel("Existing floor");
  await floor.fill("#57616b");
  await expect(page.locator("[data-surface=floor]")).toHaveCSS("fill", "rgb(87, 97, 107)");
  await page.getByRole("button", { name: "Reset floor" }).tap();
  await expect(page.locator("[data-surface=floor]")).toHaveCSS("fill", "rgb(210, 177, 140)");
  await page.getByRole("button", { name: "Paint spec sheet" }).tap();
  await onScreen(page.getByRole("button", { name: "Print or save as PDF" }));
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((node) => node.scrollWidth)).toBe(await dialog.evaluate((node) => node.clientWidth));
});
