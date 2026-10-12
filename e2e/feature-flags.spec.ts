import { expect, test } from "@playwright/test";
import { E2E_ADMIN, makeAdmin, resetFlag, seedWorkouts } from "./db";
import { registerUser } from "./helpers";

// Флаг глобальный — сценарии по очереди
test.describe.configure({ mode: "serial" });
test.afterEach(() => resetFlag("strength_analytics"));

test("non-admin gets 404 on the flags page", async ({ page }) => {
  await registerUser(page);
  const res = await page.goto("/admin/flags");
  expect(res?.status()).toBe(404);
});

test("admin rolls strength_analytics out to self and kills it", async ({ page }) => {
  const me = await registerUser(page);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 5, sets: 3 }], 0);
  await makeAdmin(me.login);

  await page.goto("/admin/flags");
  const card = page.getByRole("article", { name: "strength_analytics" });
  // До гидратации форма отправилась бы обычным запросом — повторяем, пока не ответит action
  await expect(async () => {
    await card.getByLabel("Логин или ник").fill("no_such_user_x");
    await card.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Пользователь не найден")).toBeVisible({ timeout: 2000 });
  }).toPass();

  await card.getByLabel("Логин или ник").fill(E2E_ADMIN);
  await card.getByRole("button", { name: "Добавить" }).click();
  await expect(card.getByRole("button", { name: /^Убрать / })).toBeVisible();

  await page.goto("/stats");
  await expect(page.getByRole("region", { name: "Месяц к месяцу" })).toHaveCount(0);

  await page.goto("/admin/flags");
  await card.getByRole("switch", { name: "Включён" }).click();
  await expect(card.getByRole("switch", { name: "Включён" })).toBeChecked();
  await page.goto("/stats");
  await expect(page.getByRole("region", { name: "Месяц к месяцу" })).toBeVisible();

  await page.goto("/admin/flags");
  await card.getByRole("switch", { name: "Включён" }).click();
  await expect(card.getByRole("switch", { name: "Включён" })).not.toBeChecked();
  await page.goto("/stats");
  await expect(page.getByRole("region", { name: "Месяц к месяцу" })).toHaveCount(0);
});
