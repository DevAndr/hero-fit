import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, seedWorkouts, setTimeZone } from "./db";
import { addToWorkout, quickWorkout, registerUser } from "./helpers";
import { E2E_TZ, localAt } from "./tz";

// Флаг dashboard_v2 — списком на пользователя (addFlagUser): спеки идут параллельно, старый дашборд у остальных

async function v2User(page: Page) {
  const me = await registerUser(page);
  await setTimeZone(me.login);
  await addFlagUser("dashboard_v2", me.login);
  return me;
}

const strip = (page: Page) => page.getByRole("list", { name: "Неделя" }).getByRole("listitem");

test("new user: every widget shows its empty state", async ({ page }) => {
  await v2User(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("week-headline")).toHaveText("Ещё 3 тренировки — и неделя засчитана в серию");
  for (const name of ["Неделя в цифрах", "Свежие рекорды", "Баланс нагрузки", "Календарь активности", "Карта мышц"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByText("Рекорды появятся после тренировок")).toBeVisible();
  await expect(page.getByText("Баланс появится после тренировок")).toBeVisible();
  await expect(strip(page)).toHaveCount(7);
  const text = (await page.locator("main").innerText()) ?? "";
  expect(text).not.toMatch(/NaN|Infinity/);
});

test("this week's workouts fill the strip and the numbers", async ({ page }) => {
  const me = await v2User(page);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const mondayKey = monday.toISOString().slice(0, 10);
  // Обе — до текущего часа (прогон стартует в 12:xx местного): понедельник 10:00 и сегодня 09:00
  const finishedAt = [localAt(mondayKey, "10:00"), localAt(today, "09:00")];
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 10, sets: 3 }, { weight: 60, reps: 10, sets: 3 }], 2, { finishedAt });

  await page.goto("/dashboard");
  const days = new Set([mondayKey, today]).size;
  await expect(page.locator("li[aria-label$=': тренировка']")).toHaveCount(days);
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toContainText("3,6 т");
  await expect(page.getByRole("region", { name: "Баланс нагрузки" })).toContainText("Грудь");
});

test("strength widget is hidden without strength_analytics", async ({ page }) => {
  await v2User(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Тренд силы" })).toHaveCount(0);
});

test("a finished workout gives a fresh record; an active one keeps the day open", async ({ page }) => {
  await v2User(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "50", reps: "8" }]);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Свежие рекорды" })).toContainText("Жим штанги лёжа");

  // Новая тренировка начата, но не завершена: кнопка «Продолжить», плиток с тренировкой по-прежнему одна (сегодняшняя)
  // (тренировка становится активной с первым отмеченным подходом)
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Приседания со штангой"]);
  const block = page.getByRole("region", { name: "Приседания со штангой" });
  await block.getByLabel("Вес, подход 1").fill("60");
  await block.getByLabel("Повторы, подход 1").fill("5");
  await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Продолжить тренировку" }).first()).toBeVisible();
  await expect(page.locator("li[aria-label$=': тренировка']")).toHaveCount(1);
});

test("no horizontal scroll on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Только телефон");
  await v2User(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("without the flag the old dashboard stays", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Тренировок всего")).toBeVisible();
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toHaveCount(0);
});
