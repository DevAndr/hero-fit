import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, seedWorkouts, setTimeZone } from "./db";
import { addToWorkout, quickWorkout, registerUser } from "./helpers";
import { E2E_TZ, localAt } from "./tz";

// Флаг dashboard_v3 — списком на пользователя (addFlagUser): спеки идут параллельно, прежний дашборд у остальных

async function v3User(page: Page) {
  const me = await registerUser(page);
  await setTimeZone(me.login);
  await addFlagUser("dashboard_v3", me.login);
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

test("a first result is not a record; an active workout keeps the day open", async ({ page }) => {
  await v3User(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "50", reps: "8" }]);
  await page.goto("/dashboard");
  // Первый результат в упражнении — не рекорд (как в статистике)
  await expect(page.getByRole("region", { name: "Неделя в цифрах" }).getByText("Рекорды").locator("..")).toContainText("0");

  // Новая тренировка начата, но не завершена: кнопка «Продолжить», плитка с тренировкой по-прежнему одна (сегодняшняя)
  // (тренировка становится активной с первым отмеченным подходом)
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Приседания со штангой"]);
  const block = page.getByRole("region", { name: "Приседания со штангой" });
  await block.getByLabel("Вес, подход 1").fill("60");
  await block.getByLabel("Повторы, подход 1").fill("5");
  await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.goto("/dashboard");
  await expect(page.getByRole("main").getByRole("link", { name: "Продолжить тренировку" })).toBeVisible();
  await expect(page.locator("li[aria-label$=': тренировка']")).toHaveCount(1);
});

test("without the flag the old dashboard stays", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Тренировок всего")).toBeVisible();
  await expect(page.getByRole("region", { name: "Неделя в цифрах" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Прогресс", exact: true })).toHaveCount(0);
});

test("no horizontal scroll on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Только телефон");
  await page.setViewportSize({ width: 360, height: 780 });
  await v3User(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Баланс нагрузки" })).toBeVisible();
  // Не с innerWidth: мобильный браузер растягивает его до ширины контента
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const last = await strip(page).last().boundingBox();
  const hero = await page.locator('section[aria-label="Сегодня"]').boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(hero!.x + hero!.width - 16);
});

test("blocks are grouped into progress, game and community tiers", async ({ page }) => {
  await v3User(page);
  await page.goto("/dashboard");
  const tier = (name: string) => page.getByRole("region", { name, exact: true });
  const tiers: Record<string, string[]> = {
    Прогресс: ["Неделя в цифрах", "Баланс нагрузки", "Календарь активности", "Объём тренировок", "Последняя тренировка", "Статистика"],
    Игра: ["Уровень", "Ближайшая ачивка", "Босс недели", "Цели"],
    Сообщество: ["Гильдия", "Друзья недавно"],
  };
  for (const [name, blocks] of Object.entries(tiers)) {
    await expect(tier(name).getByRole("heading", { name, exact: true })).toBeVisible();
    for (const block of blocks) await expect(tier(name).getByRole("region", { name: block, exact: true })).toBeVisible();
  }
  await expect(tier("Прогресс").getByTestId("body-map")).toBeVisible();
  // «Сегодня» без заголовка яруса — над «Прогрессом»
  await expect(page.getByRole("heading", { name: "Сегодня", exact: true })).toHaveCount(0);
});
