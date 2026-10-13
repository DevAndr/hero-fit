import { expect, test } from "@playwright/test";
import { makeAdmin, visitDays } from "./db";
import { registerUser } from "./helpers";

// makeAdmin переименовывает глобального админа — сценарии по очереди и только на desktop
test.describe.configure({ mode: "serial" });

test("a visit writes one day to the visit log", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/dashboard");
  await page.reload();
  await expect.poll(() => visitDays({ login: me.login })).toHaveLength(1);
});

test.describe("admin metrics page", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "desktop", "Админ один на прогон");
  });

  test("non-admin gets 404", async ({ page }) => {
    await registerUser(page);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
  });

  test("admin sees tiles, charts, cohorts and features; range switches to 90 days", async ({ page }) => {
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Метрики", level: 1 })).toBeVisible();
    const tiles = page.getByRole("region", { name: "Сводка" });
    await expect(tiles.getByText("Пользователей")).toBeVisible();
    await expect(tiles.getByText("Активные", { exact: true })).toBeVisible();
    for (const name of ["Регистрации", "Активные", "Тренировки"]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    }
    const cohorts = page.getByRole("table", { name: "Удержание по неделям регистрации" });
    await expect(cohorts).toBeVisible();
    await expect(cohorts.getByRole("row")).toHaveCount(9);
    await expect(page.getByRole("region", { name: "Фичи" }).getByText("Прошли экскурсию")).toBeVisible();

    await page.getByRole("link", { name: "90 дней" }).click();
    await expect(page).toHaveURL(/\/admin\?range=90$/);
    await expect(page.getByRole("link", { name: "90 дней" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/за 90 дней$/).first()).toBeVisible();
  });
});
