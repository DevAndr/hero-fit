import { expect, test } from "@playwright/test";

// Лендинг v2: вёрстка не ломается по ширине и в обеих темах; «уменьшить движение» — сразу финальные значения.

for (const width of [360, 768, 1280]) {
  test(`no horizontal scroll at ${width}px, top to bottom`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 700) await page.evaluate((yy) => window.scrollTo(0, yy), y);
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(inner);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`${colorScheme} theme: hero and the phone mockup render`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("img", { name: "Дашборд Hero Fit: уровень, XP и серия недель" })).toBeVisible();
  });
}

test("reduced motion: the XP bar is full at once", async ({ page }) => {
  // reducedMotion: "reduce" — по умолчанию в playwright.config.ts
  await page.goto("/");
  await expect(page.getByTestId("hero-xp-bar")).toHaveAttribute("style", /width: 68%/);
});
