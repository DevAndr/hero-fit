import { expect, test } from "@playwright/test";

// Скрытие пунктов под флагом — unit-тест visibleRelease: глобальный флаг здесь не трогаем (strength-analytics.spec)
test("guest opens the changelog from the landing footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Что нового" }).click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByRole("heading", { name: "Гильдии, рейды и цели" })).toBeVisible();
});

test("landing «Новое» plaque leads to the release anchor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Новое:/ }).click();
  await expect(page).toHaveURL(/\/changelog#2026-10$/);
});
