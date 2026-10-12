import { expect, test } from "@playwright/test";
import { createGoal, E2E_ADMIN, makeAdmin, mondayWeeksAgo, resetFlag, seedRecapWeek, seedWorkouts, setFlag } from "./db";
import { registerUser } from "./helpers";

// Аналитика — под глобальным флагом strength_analytics: сценарии по очереди, флаг включён у всех, кроме проверок флага
test.describe.configure({ mode: "serial" });
// Проекты desktop и mobile идут параллельно — с одним глобальным флагом и одним логином админа только desktop
const DESKTOP_ONLY = "глобальный флаг — один проект";
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", DESKTOP_ONLY);
  await setFlag("strength_analytics", { enabled: true, percent: 100 });
});
test.afterEach(async ({}, info) => {
  if (info.project.name === "desktop") await resetFlag("strength_analytics");
});

const press = (day: number, weight: number) => ({ day, time: "19:00", exercise: "Жим штанги лёжа", weight, reps: 5, sets: 3, xp: 80 });

test("weekly recap shows «Ты стал сильнее» with the exercise", async ({ page }) => {
  const me = await registerUser(page);
  const week = mondayWeeksAgo(2);
  // «Раньше» (6…9 недель назад) — 60×5, «сейчас» (2…5) — 70×5; по 2 тренировки в каждом окне
  await seedRecapWeek(me.login, mondayWeeksAgo(7), [press(0, 60), press(3, 60)]);
  await seedRecapWeek(me.login, week, [press(0, 70), press(3, 70)]);

  await page.goto(`/recap/${week}`);
  const block = page.getByRole("region", { name: "Сильнее" });
  await expect(block).toContainText("Ты стал сильнее в 1 из 1 упражнения");
  await expect(block).toContainText("Жим штанги лёжа · 1ПМ 70 → 81,5 кг · +17 %");
});

test("stats shows the month-to-month card", async ({ page }) => {
  const me = await registerUser(page);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 5, sets: 3 }], 0);
  await page.goto("/stats");
  const card = page.getByRole("region", { name: "Месяц к месяцу" });
  await expect(card).toContainText("Тренировки");
  await expect(card).toContainText(/против/);
});

test("strength goal shows a forecast from the weekly trend", async ({ page }) => {
  const me = await registerUser(page);
  // Рабочий вес растёт по 2 кг в неделю три недели подряд
  for (const [weeksAgo, weight] of [[3, 60], [2, 62], [1, 64]] as const) {
    await seedRecapWeek(me.login, mondayWeeksAgo(weeksAgo), [press(1, weight)]);
  }
  await createGoal(me.login, { type: "STRENGTH", exerciseName: "Жим штанги лёжа", metric: "MAX_WEIGHT", target: 70, startValue: 64 });
  await page.goto("/goals");
  await expect(page.getByTestId("goal-forecast")).toContainText("≈");
});

test("flag off hides the month card, the recap block and the forecast; already built recap too", async ({ page }) => {
  const me = await registerUser(page);
  const week = mondayWeeksAgo(2);
  await seedRecapWeek(me.login, mondayWeeksAgo(7), [press(0, 60), press(3, 60)]);
  await seedRecapWeek(me.login, week, [press(0, 70), press(3, 70)]);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 5, sets: 3 }], 0);

  // Снимок собран при включённом флаге — со strength
  await page.goto(`/recap/${week}`);
  await expect(page.getByRole("region", { name: "Сильнее" })).toBeVisible();

  await resetFlag("strength_analytics");
  await page.reload();
  await expect(page.getByRole("region", { name: "Сильнее" })).toHaveCount(0);
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Тренировки" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Месяц к месяцу" })).toHaveCount(0);
});

test("admin rolls strength_analytics out to self and kills it", async ({ page }) => {
  await resetFlag("strength_analytics"); // начинаем с выключенного
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
