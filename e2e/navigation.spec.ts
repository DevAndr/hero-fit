import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test("slow page: progress bar on top right after the click, gone once the page opens", async ({ page }) => {
  await registerUser(page);
  await page.goto("/achievements");
  // Медленный сервер: задерживаем рендер /exercises (у страницы нет loading.tsx — без полоски клик молчал бы)
  await page.route(/\/exercises\?_rsc=/, async (route) => {
    if (!route.request().headers()["next-router-prefetch"]) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  await page.locator('a[href="/exercises"]:visible').first().click();
  await expect(page.getByTestId("nav-progress")).toBeVisible({ timeout: 1000 });
  await expect(page).toHaveURL(/\/achievements$/);
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(page.getByTestId("nav-progress")).toHaveCount(0);

  // Ссылка на текущую страницу полоску не зажигает
  await page.locator('a[href="/exercises"]:visible').first().click();
  await expect(page.getByTestId("nav-progress")).toHaveCount(0);
});
