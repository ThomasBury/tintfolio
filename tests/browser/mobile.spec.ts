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
  const surfaces = page.getByRole("region", { name: "Room surfaces" });
  const floor = surfaces.getByLabel("Existing floor");
  const reset = surfaces.getByRole("button", { name: "Reset floor" });
  await onScreen(surfaces);
  await expect(reset).toBeDisabled();
  await expect(surfaces.getByLabel("Surfaces", { exact: true })).toHaveCount(0);
  await page.getByLabel("Lighting").press("Tab");
  await expect(floor).toBeFocused();
  await page.getByLabel("Lighting").focus();
  const illustratedFloor = page.locator("[data-surface=floor]");
  const bounds = (await illustratedFloor.boundingBox())!;
  await illustratedFloor.tap({ position: { x: bounds.width / 2, y: bounds.height - 5 } });
  await expect(floor).toBeFocused();
  await floor.fill("#57616b");
  await expect(illustratedFloor).toHaveCSS("fill", "rgb(87, 97, 107)");
  await reset.tap();
  await expect(illustratedFloor).toHaveCSS("fill", "rgb(210, 177, 140)");

  await page.getByLabel("Search palettes").fill("#344");
  await page.getByRole("button", { name: /Combination #344/ }).tap();
  const pair = surfaces.getByLabel("Surfaces", { exact: true });
  await pair.press("End");
  await expect(pair).toHaveValue("feature");
  const wall = surfaces.getByLabel("Main wall", { exact: true });
  await wall.selectOption("2");
  await expect(page.locator("[data-surface=wall]").first()).toHaveCSS("fill", "rgb(163, 106, 165)");
  await onScreen(wall);
  await onScreen(page.locator("#room"));
  await page.setViewportSize({ width: 320, height: 340 });
  await floor.scrollIntoViewIfNeeded();
  await onScreen(floor);
  await onScreen(pair);
  await page.getByRole("button", { name: "Paint spec sheet" }).tap();
  await onScreen(page.getByRole("button", { name: "Print or save as PDF" }));
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((node) => node.scrollWidth)).toBe(await dialog.evaluate((node) => node.clientWidth));
});

test("the door colour editor fits beside the sticky room preview on mobile", async ({ page }) => {
  await page.goto("/paint/");
  const surfaces = page.getByRole("region", { name: "Room surfaces" });
  const edit = surfaces.getByRole("button", { name: "Edit door colour" });
  const hex = surfaces.getByLabel("Door HEX");
  await edit.tap();
  await expect(edit).toHaveAttribute("aria-expanded", "true");
  await expect(hex).toBeFocused();
  await onScreen(hex);
  await onScreen(page.locator("#room"));
  await hex.fill("#4C6571");
  await expect(page.locator('[data-surface="door"]')).toHaveCSS("fill", "rgb(76, 101, 113)");
  await onScreen(hex);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await surfaces.getByRole("button", { name: "Match main wall" }).tap();
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await expect(edit).toBeFocused();
  await expect(hex).toBeHidden();
  await expect(surfaces.getByText("Same as main wall")).toBeVisible();
});

test("the Website activity chart and report action fit the 320-pixel preview", async ({ page }) => {
  await page.goto("/web/");
  const chart = page.getByRole("list", { name: "Projects per week" });
  const report = page.getByRole("button", { name: "View report" });
  await onScreen(chart);
  await onScreen(report);
  await report.tap();
  await expect(page.getByRole("button", { name: "Tune Accent", exact: true })).toBeFocused();
  await onScreen(page.locator("#role-strip"));
  await page.setViewportSize({ width: 320, height: 340 });
  await report.scrollIntoViewIfNeeded();
  await onScreen(report);
  await onScreen(chart);
});
