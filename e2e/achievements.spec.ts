import { expect, test, type Page } from "@playwright/test";
import { seedWorkouts, userId, withDb } from "./db";
import { registerUser } from "./helpers";

async function quickWorkout(page: Page, exercise: string, sets: { weight: string; reps: string }[]) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Поиск упражнения").fill(exercise);
  await dialog.getByRole("button", { name: new RegExp(`^${exercise}`) }).click();
  await dialog.getByRole("button", { name: /^Добавить \(/ }).click();

  const block = page.getByRole("region", { name: exercise });
  for (let i = 3; i < sets.length; i++) await block.getByRole("button", { name: "Подход", exact: true }).click();
  for (const [i, s] of sets.entries()) {
    await block.getByLabel(`Вес, подход ${i + 1}`).fill(s.weight);
    await block.getByLabel(`Повторы, подход ${i + 1}`).fill(s.reps);
    await block.getByRole("button", { name: `Подход ${i + 1} выполнен` }).click();
  }
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

test("new user sees goals with progress and an empty list", async ({ page }) => {
  await registerUser(page);
  await page.goto("/achievements");
  await expect(page.getByText("Получено: 0")).toBeVisible();
  await expect(page.getByLabel("Цель: Разогрев")).toContainText("0 / 5");
  await expect(page.getByLabel("Цель: В ударе")).toContainText("0 / 3");
  await expect(page.getByText("Пока пусто")).toBeVisible();
});

test("more than 4 sets in an exercise → achievement, toast once, XP added", async ({ page }) => {
  await registerUser(page);
  const sets = Array.from({ length: 5 }, () => ({ weight: "60", reps: "10" }));
  await quickWorkout(page, "Шраги со штангой", sets);

  const section = page.locator("section").filter({ hasText: "Новые ачивки" });
  await expect(section).toContainText("Сет-герой: Шраги со штангой");
  await expect(section).toContainText("+15 XP");
  // 5 подходов, 50 повторов, 3000 кг → 50 + 25 + 10 + 15 = 100 XP, + 15 за ачивку
  await expect(page.getByTestId("xp-earned")).toHaveText("+115 XP");
  await expect(page.getByText("100 за тренировку + 15 за ачивки")).toBeVisible();

  await expect(page.getByText("🏆 Сет-герой: Шраги со штангой")).toBeVisible();
  await page.goto("/achievements");
  await expect(page.getByText("Получено: 1")).toBeVisible();
  await expect(page.getByRole("article", { name: "Сет-герой: Шраги со штангой" })).toBeVisible();
  await expect(page.getByText("🏆 Сет-герой")).toHaveCount(0); // уже просмотрена — тост не повторяется
});

test("5th workout, weight progress and streak achievements are generated from history", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [
    { weight: 100, reps: 5, sets: 3 },
    { weight: 100, reps: 5, sets: 3 },
    { weight: 105, reps: 5, sets: 3 },
    { weight: 110, reps: 5, sets: 3 },
  ]);
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(
      `update "User" set "currentStreak" = 6, "longestStreak" = 6, "lastStreakAt" = now() - interval '30 hours' where id = $1`,
      [id],
    );
  });

  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "130", reps: "3" }]);

  const section = page.locator("section").filter({ hasText: "Новые ачивки" });
  for (const title of ["Разогрев", "Жим штанги лёжа: +10%", "Жим штанги лёжа: +25%", "В ударе", "Неделя огня"]) {
    await expect(section.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(section.getByText("Жим штанги лёжа: +50%")).toHaveCount(0);
  await expect(page.getByTestId("streak")).toContainText("7");

  await page.goto("/achievements");
  await expect(page.getByText("Получено: 5")).toBeVisible();
  // Ближайшая цель по весу: +50% (сейчас +30%)
  await expect(page.getByLabel("Цель: Жим штанги лёжа: +50%")).toContainText("30% / 50%");
  await expect(page.getByLabel("Цель: Втянулся")).toContainText("5 / 10");
});

test("daily login streak in the user's time zone", async ({ page }) => {
  const { login } = await registerUser(page);
  // Вчерашний календарный день по Москве (timezoneId в playwright.config)
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(
    new Date(Date.now() - 24 * 3600 * 1000),
  );
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`update "User" set "lastLoginDay" = $2, "loginStreak" = 2 where id = $1`, [id, yesterday]);
  });

  await page.reload();
  await expect(page.getByText("🏆 3 дня подряд в приложении")).toBeVisible();
  await page.reload();
  await page.goto("/achievements");
  await expect(page.getByLabel("Цель: Неделя в игре")).toContainText("3 / 7");
});
