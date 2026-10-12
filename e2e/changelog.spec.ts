import { expect, test } from "@playwright/test";
import { setChangelogSeen } from "./db";
import { registerUser } from "./helpers";

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

test("new user has no dot; a user with unseen release sees it until /whats-new", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("whats-new-dot")).toHaveCount(0);

  await setChangelogSeen(me.login, null);
  await page.reload();
  await expect(page.getByTestId("whats-new-dot").first()).toBeVisible();
  await page.goto("/whats-new");
  await expect(page.getByRole("heading", { name: "Гильдии, рейды и цели" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByTestId("whats-new-dot")).toHaveCount(0);
});
