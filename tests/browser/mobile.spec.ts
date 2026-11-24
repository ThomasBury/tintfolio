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
  test(route + " shows the preview and a complete starter palette on a fresh phone visit", async ({ page }) => {
    await page.goto("/" + route + "/");
    await page.evaluate(() => document.fonts.ready);
    const preview = page.locator("#picture");
    const starter = page.locator(".wada-card").first();
    await expect(starter).toHaveAttribute("data-combination", route === "paint" ? "Soft sage" : "Field notes");
    await expect(preview).toBeInViewport({ ratio: 1 });
    await expect(starter).toBeInViewport({ ratio: 1 });
    await onScreen(starter);
    expect(await page.evaluate(() => scrollY)).toBe(0);

    const before = await preview.innerHTML();
    await starter.tap();
    await expect(starter).toHaveAttribute("aria-pressed", "true");
    expect(await preview.innerHTML()).not.toBe(before);
    if (route === "paint") {
      const surfaces = page.getByRole("button", { name: "Room surfaces" });
      await expect(surfaces).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("button", { name: "Undo palette" }).press("Space");
      await expect(surfaces).toHaveAttribute("aria-expanded", "false");
    }
  });

  test(route + " keeps the compact preview visible while applying and undoing with the keyboard", async ({ page }) => {
    await page.goto("/" + route + "/");
    const preview = page.locator("#picture");
    const canvasBefore = await preview.innerHTML();
    await page.getByLabel("Search palettes").fill("#48");
    const card = page.getByRole("button", { name: "#B73F74 · #005B8D", exact: true });
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
  const toggle = surfaces.getByRole("button", { name: "Room surfaces" });
  const floor = surfaces.getByLabel("Existing floor");
  const reset = surfaces.getByRole("button", { name: "Reset floor" });
  await onScreen(surfaces);
  const oneColour = surfaces.getByRole("radio", { name: "One colour" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(oneColour).toBeHidden();
  await page.getByRole("radio", { name: "North daylight" }).press("Tab");
  await expect(toggle).toBeFocused();
  await toggle.press("Space");
  await expect(oneColour).toBeChecked();
  await expect(reset).toBeDisabled();
  await toggle.press("Tab");
  await expect(oneColour).toBeFocused();
  await oneColour.press("Tab");
  await expect(floor).toBeFocused();
  await toggle.press("Enter");
  const illustratedFloor = page.locator("[data-surface=floor]");
  const bounds = (await illustratedFloor.boundingBox())!;
  await illustratedFloor.tap({ position: { x: bounds.width / 2, y: bounds.height - 5 } });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(floor).toBeFocused();
  await floor.fill("#57616b");
  await expect(illustratedFloor).toHaveCSS("fill", "rgb(87, 97, 107)");
  await reset.tap();
  await expect(illustratedFloor).toHaveCSS("fill", "rgb(210, 177, 140)");

  await page.getByLabel("Search palettes").fill("#344");
  const card = page.getByRole("button", { name: "#FDC57E · #1C4286 · #A36AA5 · #111314", exact: true });
  await card.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Undo palette" }).press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await card.tap();
  const pair = surfaces.getByRole("radio", { name: "Feature wall" });
  await pair.tap();
  await expect(pair).toBeChecked();
  const wall = surfaces.getByLabel("Main wall", { exact: true });
  await wall.selectOption("2");
  await expect(page.locator("[data-surface=wall]").first()).toHaveCSS("fill", "rgb(163, 106, 165)");
  await onScreen(wall);
  await onScreen(page.locator("#room"));
  await page.setViewportSize({ width: 320, height: 340 });
  await floor.scrollIntoViewIfNeeded();
  await onScreen(floor);
  await onScreen(pair);
  await page.getByRole("button", { name: "More", exact: true }).tap();
  await page.getByRole("button", { name: "Paint spec sheet" }).tap();
  await onScreen(page.getByRole("button", { name: "Print or save as PDF" }));
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((node) => node.scrollWidth)).toBe(await dialog.evaluate((node) => node.clientWidth));
});

test("paint layout, lighting and the ceiling editor work by keyboard and touch at 320 pixels", async ({ page }) => {
  await page.goto("/paint/");
  const lighting = page.getByRole("group", { name: "Lighting" });
  const north = lighting.getByRole("radio", { name: "North daylight" });
  const golden = lighting.getByRole("radio", { name: "Golden hour" });
  const evening = lighting.getByRole("radio", { name: "Warm evening" });
  await expect(north).toBeChecked();
  await north.press("ArrowRight");
  await expect(golden).toBeChecked();
  await expect(golden).toBeFocused();
  await expect(golden.locator("..")).toHaveCSS("outline-style", "solid");
  await evening.tap();
  await expect(evening).toBeChecked();

  await page.getByRole("button", { name: "Room surfaces" }).tap();
  const layout = page.getByRole("group", { name: "Paint layout" });
  await layout.getByRole("radio", { name: "One colour" }).press("ArrowLeft");
  const feature = layout.getByRole("radio", { name: "Feature wall" });
  await expect(feature).toBeChecked();
  await onScreen(feature);
  const swatches = page.getByRole("group", { name: "Active swatches" });
  await expect(swatches.locator("code")).toHaveText(["#A9B39E", "#66765E", "#F5F0E6"]);
  await expect(swatches.getByText("Main wall", { exact: true })).toBeVisible();
  await expect(swatches.getByText("Feature wall", { exact: true })).toBeVisible();
  const editCeiling = swatches.getByRole("button", { name: /^Edit ceiling #/ });
  await editCeiling.tap();
  await expect(editCeiling).toBeFocused();
  const hex = page.getByLabel("Ceiling HEX");
  await hex.fill("#26598D");
  await expect(swatches.locator("code")).toHaveText(["#A9B39E", "#66765E", "#26598D"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("the door colour editor fits beside the sticky room preview on mobile", async ({ page }) => {
  await page.goto("/paint/");
  const surfaces = page.getByRole("region", { name: "Room surfaces" });
  const toggle = surfaces.getByRole("button", { name: "Room surfaces" });
  const edit = surfaces.getByRole("button", { name: "Edit door colour" });
  const hex = surfaces.getByLabel("Door HEX");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.locator('[data-surface="door"]').tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(edit).toHaveAttribute("aria-expanded", "true");
  await expect(hex).toBeFocused();
  await onScreen(hex);
  await onScreen(page.locator("#room"));
  await hex.fill("oklch(60% 0 0)");
  await expect(page.locator('[data-surface="door"]')).toHaveCSS("fill", "rgb(128, 128, 128)");
  await hex.blur();
  await expect(hex).toHaveValue("#808080");
  await onScreen(hex);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await surfaces.getByRole("button", { name: "Match main wall" }).tap();
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await expect(edit).toBeFocused();
  await expect(hex).toBeHidden();
  await expect(surfaces.getByText("Same as main wall")).toBeVisible();
});

test("Paint app bar, pinned Explore controls and swatch swap fit both 320-pixel heights", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
    value: { writeText: () => Promise.reject(new Error("Clipboard denied")) },
  }));
  for (const height of [640, 340]) {
    await page.setViewportSize({ width: 320, height });
    await page.goto("/paint/?mode=pair&room=living&pair=feature&wall=A9B39E&feature=66765E");
    await page.evaluate(() => document.fonts.ready);
    const bar = page.getByRole("banner");
    const share = bar.getByRole("button", { name: "Share" });
    const more = bar.getByRole("button", { name: "More", exact: true });
    const preview = page.locator("#preview-card");
    const previewPosition = await preview.boundingBox();
    await more.press("Enter");
    const sheet = bar.getByRole("button", { name: "Paint spec sheet" });
    expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual((await more.boundingBox())!.y + 44);
    expect(await preview.boundingBox()).toEqual(previewPosition);
    await more.press("Tab");
    await expect(sheet).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await expect(sheet).toBeHidden();
    await more.tap();
    await bar.tap({ position: { x: 315, y: 80 } });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    for (const name of ["Saved swatches", "Paint spec sheet", "Tint a photo"]) {
      const opener = bar.getByRole("button", { name });
      if (name !== "Saved swatches") await more.tap();
      await onScreen(opener);
      await opener.tap();
      await expect(page.getByRole("dialog", { name })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(name === "Saved swatches" ? opener : more).toBeFocused();
      await expect(more).toHaveAttribute("aria-expanded", "false");
    }
    const barHeight = (await bar.boundingBox())!.height;
    await share.press("Enter");
    const manual = page.getByRole("textbox", { name: "Select and copy manually" });
    await expect(manual).toBeFocused();
    await expect(manual).toHaveValue(/ceilingMode=auto/);
    expect((await bar.boundingBox())!.height).toBe(barHeight);
    expect((await manual.boundingBox())!.y).toBeGreaterThanOrEqual(barHeight);

    await page.locator("#room").evaluate((room) => room.scrollIntoView({ block: "center" }));
    await onScreen(page.locator("#room"));
    expect(await page.getByRole("region", { name: "Room surfaces" }).isVisible()).toBe(true);
    const filters = page.getByRole("button", { name: /^Filters/ });
    await filters.tap();
    const count = page.getByLabel("Swatch count");
    await count.selectOption("3");
    await count.scrollIntoViewIfNeeded();
    await onScreen(count);
    const results = page.locator(".library-results");
    const row = results.locator(".wada-card").first();
    await expect.poll(async () => {
      const area = (await results.boundingBox())!;
      const item = (await row.boundingBox())!;
      return item.y >= area.y && item.y + item.height <= area.y + area.height;
    }).toBe(true);
    await row.scrollIntoViewIfNeeded();
    await onScreen(row);
    const search = page.getByRole("searchbox");
    const controls = [search, filters, page.getByRole("button", { name: "Randomize" }), count];
    // A touch press temporarily translates the Filters button by one pixel.
    await expect(filters).toHaveCSS("transform", "none");
    const positions = await Promise.all(controls.map((control) => control.boundingBox()));
    await results.evaluate((node) => { node.scrollTop = 100; });
    await expect(page.locator(".library-results-frame")).toHaveAttribute("data-fade-top", "");
    expect(await Promise.all(controls.map((control) => control.boundingBox()))).toEqual(positions);
    await search.fill("#125");
    await row.tap();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#role-strip code")).toHaveText(["#D1B0A7", "#0093A5", "#40456A"]);
    const swap = page.getByRole("button", { name: "Swap roles" });
    const wall = (await page.locator("#role-wall").boundingBox())!;
    const feature = (await page.locator("#role-feature").boundingBox())!;
    const button = (await swap.boundingBox())!;
    expect(button.x).toBeGreaterThanOrEqual(wall.x + wall.width);
    expect(button.x + button.width).toBeLessThanOrEqual(feature.x);
    await swap.tap();
    await expect(page.locator("#role-strip code")).toHaveText(["#0093A5", "#D1B0A7", "#40456A"]);
    await page.getByRole("button", { name: "Undo palette" }).press("Space");
    await expect(swap).toBeFocused();
    await expect(page.getByRole("button", { name: "Room surfaces" })).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test("the Website activity chart and report action fit the 320-pixel preview", async ({ page }) => {
  await page.goto("/web/");
  const chart = page.getByRole("list", { name: "Projects per week" });
  const report = page.getByRole("button", { name: "View report" });
  await onScreen(chart);
  await onScreen(report);
  await report.tap();
  await expect(page.getByRole("button", { name: /^Edit Accent #/ })).toBeFocused();
  await onScreen(page.locator("#role-strip"));
  const tiles = page.locator(".tile");
  await expect(tiles).toHaveCount(4);
  for (const tile of await tiles.all()) {
    await expect(tile.locator("code")).toHaveText(/^#[\dA-F]{6}$/);
    expect(await tile.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.setViewportSize({ width: 320, height: 340 });
  await report.scrollIntoViewIfNeeded();
  await onScreen(report);
  await onScreen(chart);
});

test("Website app bar, theme and paired swatches work by touch and keyboard at both 320-pixel heights", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
    value: { writeText: () => Promise.reject(new Error("Clipboard denied")) },
  }));
  for (const height of [640, 340]) {
    await page.setViewportSize({ width: 320, height });
    await page.goto("/web/?mode=site&background=F3EADF&text=492E46&accent=35615E&onAccent=FFFFFF");
    const bar = page.getByRole("banner");
    const saved = bar.getByRole("button", { name: "Saved swatches" });
    const share = bar.getByRole("button", { name: "Share" });
    const exportTheme = bar.getByRole("button", { name: "Export theme" });
    for (const action of [saved, share, exportTheme]) {
      await onScreen(action);
      const target = (await action.boundingBox())!;
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
    const barHeight = (await bar.boundingBox())!.height;
    await share.tap();
    const manual = page.getByRole("textbox", { name: "Select and copy manually" });
    await expect(manual).toBeFocused();
    await expect(manual).toHaveValue(/mode=site&theme=light&background=F3EADF/);
    expect((await bar.boundingBox())!.height).toBe(barHeight);
    expect((await manual.boundingBox())!.y).toBeGreaterThanOrEqual(barHeight);

    await saved.tap();
    await page.keyboard.press("Escape");
    await expect(saved).toBeFocused();
    await exportTheme.press("Enter");
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).tap();
    await expect(exportTheme).toBeFocused();

    const dark = page.getByRole("radio", { name: "Dark" });
    const light = page.getByRole("radio", { name: "Light" });
    await dark.tap();
    await expect(dark).toBeChecked();
    await dark.press("ArrowLeft");
    await expect(light).toBeChecked();
    await expect(light).toBeFocused();
    const results = page.locator(".library-results");
    const firstRow = results.locator(".wada-card").first();
    await expect.poll(async () => {
      const result = (await results.boundingBox())!;
      const row = (await firstRow.boundingBox())!;
      return row.y + row.height <= result.y + result.height;
    }).toBe(true);
    const pairs = page.locator(".swatch-pair");
    const [pagePair, accentPair] = await pairs.all();
    expect((await accentPair.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await pagePair.boundingBox())!.y + (await pagePair.boundingBox())!.height);
    for (const pair of [pagePair, accentPair]) {
      const tiles = await pair.locator(".tile").all();
      const swap = pair.getByRole("button", { name: /^Swap/ });
      const before = (await tiles[0].boundingBox())!;
      const action = (await swap.boundingBox())!;
      expect(action.x).toBeGreaterThanOrEqual(before.x + before.width);
      expect(action.x + action.width).toBeLessThanOrEqual((await tiles[1].boundingBox())!.x);
      expect(action.width).toBeGreaterThanOrEqual(44);
      expect(action.height).toBeGreaterThanOrEqual(44);
    }
    const accentSwap = accentPair.getByRole("button", { name: /^Swap/ });
    await accentSwap.tap();
    await expect(page.locator("#role-accent code")).toHaveText("#FFFFFF");
    await page.getByRole("button", { name: "Undo palette" }).press("Space");
    await expect(page.locator("#role-accent code")).toHaveText("#35615E");
    await expect(accentSwap).toBeFocused();
    await onScreen(accentSwap);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});
