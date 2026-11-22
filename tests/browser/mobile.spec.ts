import { test, expect, type Locator } from "@playwright/test";

test.use({
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
});
async function onScreen(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((node) => {
        const r = node.getBoundingClientRect();
        const x = r.x + r.width / 2,
          y = r.y + r.height / 2;
        return (
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          node.contains(document.elementFromPoint(x, y))
        );
      }),
    )
    .toBe(true);
}
for (const paint of [true, false]) {
  test(
    (paint ? "Paint" : "Website") + " mobile colour journey",
    async ({ page }) => {
      await page.goto(paint ? "/paint/" : "/web/");
      await page
        .getByRole("button", {
          name: paint ? "Colour pair" : "Site palette",
          exact: true,
        })
        .click();
      const role = page.getByRole("button", {
        name: paint ? "Ceiling" : "Text on accent",
        exact: true,
      });
      await role.click();
      const targets = page.locator("nav a, #studio button, #studio select, .picker, #hex, #examples button");
      for (const target of await targets.all()) {
        const box = await target.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        if (!(await target.evaluate(n => n.classList.contains("picker")))) {
          await expect(target).toHaveAccessibleName(/.+/);
        }
      }
      const start = await page.locator("#hex").inputValue();
      const action = paint
        ? page.getByRole("button", { name: "Mist", exact: true })
        : page.getByRole("button", { name: "Adjust button text" });
      await action.scrollIntoViewIfNeeded();
      const target = page.locator(
        paint ? "[data-surface=ceiling]" : "#specimen-button",
      );
      // The ceiling polygon's bounding box centre falls on its painted surface.
      await onScreen(target);
      await onScreen(action);
      await action.click();
      await expect(page.locator("#hex")).not.toHaveValue(start);
      await onScreen(target);
      await onScreen(page.getByRole("button", { name: "Undo" }));
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(page.locator("#hex")).toHaveValue(start);
      await onScreen(target);
      await page.setViewportSize({ width: 320, height: 640 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(320);
      await page.locator("#hex").focus();
      await page.setViewportSize({ width: 320, height: 340 });
      await page.locator("#hex").fill("#AB");
      await page.locator("#hex").press("Enter");
      await page.locator("#feedback").scrollIntoViewIfNeeded();
      await onScreen(page.locator("#hex"));
      await onScreen(page.locator("#feedback"));
    },
  );
}

test("paint floor controls and painted floor are reachable on mobile", async ({ page }) => {
  await page.goto("/paint/");
  const picker = page.getByLabel("Existing floor (optional)");
  const reset = page.getByRole("button", { name: "Reset floor" });
  const floor = page.locator("[data-surface=floor]");
  for (const width of [320, 600]) {
    await page.setViewportSize({ width, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await onScreen(picker);
    await picker.fill("#57616b");
    await expect(floor).toHaveCSS("fill", "rgb(87, 97, 107)");
    expect(await floor.evaluate((surface) => {
      const svg = surface.ownerSVGElement!;
      const point = new DOMPoint(450, 421).matrixTransform(svg.getScreenCTM()!);
      return document.elementFromPoint(point.x, point.y) === surface;
    })).toBe(true);
    await onScreen(reset);
    await reset.tap();
    await expect(floor).toHaveCSS("fill", "rgb(210, 177, 140)");
  }
});

for (const route of ["paint", "web"]) {
  test(route + " collection has reachable controls at 320 pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/" + route + "/");
    const collection = page.locator("#wada");
    await collection.locator("summary").tap();
    await collection.locator("#wada-featured").getByRole("button", { name: /#344/ }).tap();
    const preview = collection.locator("#wada-preview");
    const apply = preview.getByRole("button", { name: "Apply", exact: true });
    await expect(preview).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    for (const target of await collection.locator("summary, button:visible, select, input").all()) {
      const box = await target.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      await expect(target).toHaveAccessibleName(/.+/);
    }
    await apply.scrollIntoViewIfNeeded();
    await onScreen(apply);
    await apply.tap();
    await onScreen(page.locator(route === "paint" ? "#mode-pair" : "#mode-site"));
  });
}
