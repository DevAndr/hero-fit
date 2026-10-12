import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

// Сценарии с флагом strength_analytics — в e2e/strength-analytics.spec.ts (флаг глобальный, файл идёт по очереди)

test("non-admin gets 404 on the flags page", async ({ page }) => {
  await registerUser(page);
  const res = await page.goto("/admin/flags");
  expect(res?.status()).toBe(404);
});
