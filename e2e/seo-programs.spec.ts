import { expect, test } from "@playwright/test";

test("список программ открывается без входа", async ({ page }) => {
  await page.goto("/training-programs");
  await expect(page).toHaveURL(/\/training-programs$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Программы тренировок в зал");
  await expect(page.locator('main a[href^="/training-programs/"]')).toHaveCount(5);
});

test("страница программы 5×5: мета, JSON-LD, таблица и кнопка старта", async ({ page }) => {
  await page.goto("/training-programs/5x5");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Программа 5×5 для силы");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/training-programs\/5x5$/);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.flatMap((b) => {
    const parsed = JSON.parse(b);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((d: { "@type": string }) => d["@type"]);
  });
  expect(types).toContain("ExercisePlan");

  const table = page.getByRole("table").first();
  await expect(table.getByText("Приседания со штангой")).toBeVisible();
  await expect(table.getByText("5 × 5").first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Начать программу" }).first()).toHaveAttribute("href", "/training-programs/5x5/start");
});

test("неизвестная программа — 404", async ({ page }) => {
  const res = await page.goto("/training-programs/nope");
  expect(res?.status()).toBe(404);
});
