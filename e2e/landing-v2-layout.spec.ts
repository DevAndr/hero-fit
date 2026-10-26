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

test("header anchors open their tab; inactive tabs stay in the HTML for search engines", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("Собрать гильдию");
  await page.goto("/#guilds");
  await expect(page.getByRole("tabpanel", { name: "Гильдии и рейды" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Друзья и лига" })).toBeHidden();
});

test("bento calculator links fit their tile at 768px", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  for (const name of ["Калькулятор 1ПМ", "Блины и разминка", "DOTS и Wilks"]) {
    const link = page.getByRole("region", { name: "Всё для прогресса" }).getByRole("link", { name });
    const [scroll, client] = await link.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll, name).toBeLessThanOrEqual(client);
  }
});

test("h1 is not clipped at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const [scroll, client] = await page.getByRole("heading", { level: 1 }).evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scroll).toBeLessThanOrEqual(client);
});

test("workout mockup: the rest timer stops at zero instead of looping", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await page.goto("/");
  const phone = page.getByRole("img", { name: "Экран тренировки: подходы и таймер отдыха" });
  await phone.scrollIntoViewIfNeeded();
  // Шагами: наблюдатель видимости срабатывает асинхронно — отсчёт может начаться не сразу
  for (let i = 0; i < 12; i++) {
    await page.clock.runFor(10_000);
    await page.waitForTimeout(50);
  }
  await expect(phone).toContainText("0:00");
  await expect(phone).toContainText("Пора к следующему подходу");
});

test("coach mockup shows only real client-list chips", async ({ page }) => {
  await page.goto("/");
  const phone = page.getByRole("img", { name: "Экран тренера: клиенты и сигналы" });
  await expect(phone).toContainText("Пора увеличить вес");
  await expect(phone).not.toContainText("Новый рекорд");
});
