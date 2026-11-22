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
