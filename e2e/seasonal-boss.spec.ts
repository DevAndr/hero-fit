import { expect, test } from "@playwright/test";
import { addFlagUser, mondayWeeksAgo, seedWorkouts, userId, withDb } from "./db";
import { addToWorkout, quickWorkout, registerUser } from "./helpers";

/**
 * Сезонный босс (флаг seasonal_boss). Неделю с Гринчем готовим прямо в БД (выбор по дате — unit-тесты bosses.test.ts):
 * показ везде идёт по коду BossWeek.bossCode.
 */
const GRINCH_LORE = "Крадёт не подарки, а декабрьские тренировки";

/** Босс текущей недели — Гринч (HP 3000, как у нового пользователя). */
const grinchThisWeek = (login: string) =>
  withDb(async (db) => {
    await db.query(
      `INSERT INTO "BossWeek" (id, "userId", week, "bossCode", hp) VALUES (gen_random_uuid()::text, $1, $2, 'grinch', 3000)
       ON CONFLICT ("userId", week) DO UPDATE SET "bossCode" = 'grinch', hp = 3000`,
      [await userId(db, login), mondayWeeksAgo(0)],
    );
  });

/** Победа над Гринчем n недель назад. */
const grinchWin = (login: string, weeksAgo: number) =>
  withDb(async (db) => {
    await db.query(
      `INSERT INTO "BossWeek" (id, "userId", week, "bossCode", hp, "defeatedAt") VALUES (gen_random_uuid()::text, $1, $2, 'grinch', 3000, now())`,
      [await userId(db, login), mondayWeeksAgo(weeksAgo)],
    );
  });

const count = (sql: string, login: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(sql, [await userId(db, login)]);
    return Number(rows[0].n);
  });

test("Grinch week: dashboard card, workout bar and preview", async ({ page }) => {
  const { login } = await registerUser(page);
  await grinchThisWeek(login);

  await page.goto("/dashboard");
  const card = page.getByTestId("boss-card");
  await expect(card).toContainText("Гринч");
  await expect(card).toContainText("3000 / 3000 HP");
  await expect(card.locator('[data-boss="grinch"] img')).toBeVisible();
  // Непрозрачная картинка скруглена и в карточке (88 px), не только в маленьких размерах
  await expect(card.locator('[data-boss="grinch"] img')).not.toHaveCSS("border-radius", "0px");

  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const bar = page.getByTestId("boss-bar");
  await expect(bar).toContainText("Гринч");
  await expect(bar.locator('[data-boss="grinch"] img')).toBeVisible();
  await bar.getByRole("button", { name: "Гринч: подробнее" }).click();
  const preview = page.getByTestId("boss-preview");
  await expect(preview).toContainText(GRINCH_LORE);
  await expect(preview.getByTestId("boss-viewer")).toBeVisible();
});

test("defeating the Grinch: victory, the holiday title and boss:1", async ({ page }) => {
  const { login } = await registerUser(page);
  await grinchThisWeek(login);
  // 29 подходов этой недели + 1 в тренировке = 3000
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 29 }], 0);
  await quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }]);

  const summary = page.getByTestId("boss-damage");
  await expect(summary).toContainText("Гринч");
  await expect(summary).toContainText("Повержен!");
  await expect(page.getByTestId("boss-title-unlocked")).toContainText("Открыт титул «Спаситель праздника»");

  expect(await count(`SELECT COUNT(*) n FROM "UserAchievement" WHERE "userId" = $1 AND code = 'boss:1'`, login)).toBe(1);
  expect(await count(`SELECT COUNT(*) n FROM "Notification" WHERE "userId" = $1 AND type = 'BOSS' AND title LIKE '%Гринч%'`, login)).toBe(1);

  await page.goto("/settings#title");
  await page.locator("#title").getByRole("combobox", { name: "Титул" }).click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Без титула", "Спаситель праздника"]);
  await page.getByRole("option", { name: "Спаситель праздника", exact: true }).click();
  await expect(page.getByText("Титул сохранён")).toBeVisible();
});

test("bestiary with the flag: the Grinch among the rare, the star counter keeps 12", async ({ page }) => {
  const { login } = await registerUser(page);
  await addFlagUser("seasonal_boss", login);

  await page.goto("/achievements?tab=bestiary");
  await expect(page.getByRole("heading", { name: "Редкие" })).toBeVisible();
  const grinch = page.getByTestId("bestiary-grinch");
  await expect(grinch.getByRole("heading")).toHaveText("???");
  await expect(grinch).toContainText("Приходит под Новый год");
  await expect(grinch).not.toContainText("Гринч");

  await grinchWin(login, 2);
  await page.reload();
  await expect(grinch.getByRole("heading")).toHaveText("Гринч");
  await expect(grinch).toContainText("Побед: 1");
  await expect(grinch).toContainText("первая победа");
  await expect(grinch.getByRole("img", { name: /звезд/ })).toHaveCount(0);
  await expect(page.getByTestId("bestiary-legend")).toContainText("звёзды у 0 из 12 боссов");
});

test("bestiary in the Grinch week: «На арене сейчас» only at the Grinch, the replaced boss comes in 12 weeks", async ({ page }) => {
  const { login } = await registerUser(page);
  await addFlagUser("seasonal_boss", login);
  await grinchThisWeek(login);

  await page.goto("/achievements?tab=bestiary");
  await expect(page.getByTestId("bestiary-grinch")).toContainText("На арене сейчас");
  await expect(page.getByTestId("bestiary-legend")).toBeVisible();
  const main = page.locator('[data-testid^="bestiary-"]:not([data-testid="bestiary-grinch"]):not([data-testid="bestiary-legend"])');
  await expect(main).toHaveCount(12);
  await expect(main.filter({ hasText: "На арене сейчас" })).toHaveCount(0);
  await expect(main.filter({ hasText: "Придёт через 12 недель" })).toHaveCount(1);
});

test("bestiary without the flag: no Grinch card even after a win", async ({ page }) => {
  const { login } = await registerUser(page);
  await grinchWin(login, 2);
  await page.goto("/achievements?tab=bestiary");
  await expect(page.getByTestId("bestiary-legend")).toContainText("звёзды у 0 из 12 боссов");
  await expect(page.getByTestId("bestiary-grinch")).toHaveCount(0);
  // Титул за прошлую победу остаётся и без флага
  await page.goto("/settings#title");
  await page.locator("#title").getByRole("combobox", { name: "Титул" }).click();
  await expect(page.getByRole("listbox").getByRole("option", { name: "Спаситель праздника" })).toBeVisible();
});

test("landing does not mention the Grinch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Гринч");
});
