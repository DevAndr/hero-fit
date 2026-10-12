import { expect, test } from "@playwright/test";
import { addFlagUser, assistantEnabled } from "./db";
import { registerUser } from "./helpers";

// Флаг smart_coach — списком на пользователя (addFlagUser), не глобально: спеки идут параллельно
test("settings toggle hides the assistant", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("smart_coach", me.login);
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Помощник" });
  await expect(toggle).toBeChecked();
  await expect(async () => {
    await toggle.click();
    await expect(toggle).not.toBeChecked({ timeout: 1000 });
  }).toPass();
  await expect.poll(() => assistantEnabled(me.login)).toBe(false);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Помощник" })).toHaveCount(0);
});
