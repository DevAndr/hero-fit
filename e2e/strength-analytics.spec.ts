import { expect, test } from "@playwright/test";
import { mondayWeeksAgo, seedRecapWeek, seedWorkouts } from "./db";
import { registerUser } from "./helpers";

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
