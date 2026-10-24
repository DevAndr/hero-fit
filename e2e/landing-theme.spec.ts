import { expect, test } from "@playwright/test";

// Переключатель темы в шапке публичных страниц; выбор — в том же localStorage, что и в /settings

const html = (page: import("@playwright/test").Page) => page.locator("html");

test("guest's landing follows the OS theme until a choice is made", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(html(page)).toHaveClass(/\blight\b/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveClass(/\bdark\b/);
});

test("guest switches the landing to light and back; the choice survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(html(page)).toHaveClass(/\bdark\b/);
  const header = page.getByRole("banner");

  await header.getByRole("button", { name: "Включить светлую тему" }).click();
  await expect(html(page)).toHaveClass(/\blight\b/);
  await page.reload();
  await expect(html(page)).toHaveClass(/\blight\b/);

  // Тема одна на устройство — на инструментах тоже светлая
  await page.goto("/tools/1rm");
  await expect(html(page)).toHaveClass(/\blight\b/);

  await header.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect(html(page)).toHaveClass(/\bdark\b/);
});

test("the toggle fits the header on a narrow phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Только телефон");
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("button", { name: "Включить светлую тему" })).toBeVisible();
  // Не с innerWidth: мобильный браузер растягивает его до ширины контента
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
