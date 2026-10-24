import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, seedWorkouts, setTimeZone } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ, localAt } from "./tz";

// Флаг dashboard_v3 — списком на пользователя (addFlagUser): прежний дашборд + полоса недели, «Неделя в цифрах», баланс

async function v3User(page: Page, ...flags: ("dashboard_v2" | "dashboard_v3")[]) {
  const me = await registerUser(page);
  await setTimeZone(me.login);
  for (const flag of flags.length ? flags : (["dashboard_v3"] as const)) await addFlagUser(flag, me.login);
  return me;
}

const strip = (page: Page) => page.getByRole("list", { name: "Неделя" }).getByRole("listitem");

test("new widgets join the old dashboard", async ({ page }) => {
  await v3User(page);
  await page.goto("/dashboard");
  // Прежнее приветствие заменено героем недели — не дублируется (вторая кнопка — в боковой панели оболочки)
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: /^Привет,/ })).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Начать тренировку" })).toHaveCount(1);
  await expect(page.getByTestId("week-headline")).toHaveText("Ещё 3 тренировки — и неделя засчитана в серию");
  await expect(strip(page)).toHaveCount(7);
  for (const name of ["Неделя в цифрах", "Баланс нагрузки", "Календарь активности", "Уровень", "Ближайшая ачивка", "Последняя тренировка", "Статистика"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByText("Тренировок всего")).toBeVisible();
  // Блок v2, которого в v3 нет
  await expect(page.getByRole("region", { name: "Свежие рекорды" })).toHaveCount(0);
  const text = (await page.locator("main").innerText()) ?? "";
  expect(text).not.toMatch(/NaN|Infinity/);
});

test("this week's workouts fill the strip, numbers and balance", async ({ page }) => {
  const me = await v3User(page);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const mondayKey = monday.toISOString().slice(0, 10);
  const finishedAt = [localAt(mondayKey, "10:00"), localAt(today, "09:00")];
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 10, sets: 3 }, { weight: 60, reps: 10, sets: 3 }], 2, { finishedAt });

  await page.goto("/dashboard");
  await expect(page.locator("li[aria-label$=': тренировка']")).toHaveCount(new Set([mondayKey, today]).size);
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toContainText("3,6 т");
  await expect(page.getByRole("region", { name: "Баланс нагрузки" })).toContainText("Грудь");
  await expect(page.getByRole("region", { name: "Календарь активности" })).toContainText("Тренировочных дней за 26 недель: " + new Set([mondayKey, today]).size);
});

test("tour targets stay on the old level and streak cards", async ({ page }) => {
  await v3User(page);
  await page.goto("/dashboard");
  await expect(page.locator('[data-tour="xp"]')).toHaveCount(1);
  await expect(page.locator('[data-tour="xp"]')).toHaveAttribute("aria-label", "Уровень");
  await expect(page.locator('[data-tour="streak"]')).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Неделя" })).not.toHaveAttribute("data-tour");
});

test("v3 wins over v2", async ({ page }) => {
  await v3User(page, "dashboard_v2", "dashboard_v3");
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toBeVisible();
  await expect(page.getByText("Тренировок всего")).toBeVisible();
  await expect(page.getByRole("region", { name: "Свежие рекорды" })).toHaveCount(0);
});

test("no horizontal scroll on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Только телефон");
  await page.setViewportSize({ width: 360, height: 780 });
  await v3User(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Баланс нагрузки" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const last = await strip(page).last().boundingBox();
  const hero = await page.locator('section[aria-label="Сегодня"]').boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(hero!.x + hero!.width - 16);
});
