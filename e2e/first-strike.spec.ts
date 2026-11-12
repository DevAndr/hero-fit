import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { achievementCodes, addFlagUser, seedStretchSessions, seedWorkouts, userExists, userId, withDb } from "./db";
import { addToWorkout, PASSWORD, quickWorkout, registerUser } from "./helpers";

// «Первый удар» из кабинета (спека 2026-11-12-first-strike-design): флаг включается пользователю по списку

const count = (sql: string, login: string) =>
  withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query<{ n: number }>(sql, [id]);
    return Number(rows[0].n);
  });

const strikes = (login: string) => count(`SELECT COUNT(*) n FROM "XpEvent" WHERE "userId" = $1 AND reason = 'FIRST_STRIKE'`, login);

/** Новый пользователь с флагом: экскурсия у registerUser уже пройдена — карточка видна сразу. */
async function setup(page: Page) {
  const user = await registerUser(page);
  await addFlagUser("first_strike", user.login);
  await page.reload();
  return user;
}

/** Открыть диалог с карточки. */
async function openDialog(page: Page) {
  await page.getByTestId("first-strike-card").getByRole("button", { name: "Ударить" }).click();
  const dialog = page.getByTestId("first-strike-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Удар с карточки: упражнение и значение; ждёт экран результата. */
async function strike(page: Page, exercise = "Приседания", value?: string) {
  const dialog = await openDialog(page);
  await dialog.getByRole("radiogroup", { name: "Упражнение" }).getByRole("radio", { name: exercise }).click();
  if (value !== undefined) await dialog.getByLabel(exercise === "Планка" ? "Секунды" : "Повторы").fill(value);
  await dialog.getByRole("button", { name: "Ударить" }).click();
  const result = page.getByTestId("first-strike-result");
  await expect(result).toBeVisible();
  return result;
}

test("card: strike hits the boss, pays XP and the achievement", async ({ page }) => {
  const { login } = await setup(page);
  await expect(page.getByTestId("first-strike-card")).toBeVisible();
  await expect(page.getByTestId("boss-card")).toContainText("3000 / 3000 HP");

  const result = await strike(page, "Отжимания", "12");
  await expect(result).toContainText("−100");
  await expect(result).toContainText("+30 XP");
  await expect(result).toContainText("Первый удар");

  await result.getByRole("button", { name: "Позже" }).click();
  await expect(page.getByTestId("first-strike-dialog")).toBeHidden();
  await expect(page.getByTestId("first-strike-card")).toHaveCount(0);
  await expect(page.getByTestId("boss-card")).toContainText("2900 / 3000 HP");

  const events = await withDb(async (db) => {
    const { rows } = await db.query<{ amount: number; meta: unknown }>(
      `SELECT amount, meta FROM "XpEvent" WHERE "userId" = $1 AND reason = 'FIRST_STRIKE'`,
      [await userId(db, login)],
    );
    return rows;
  });
  expect(events).toEqual([{ amount: 30, meta: { exercise: "pushup", value: 12 } }]);
  const codes = await achievementCodes(login);
  expect(codes).toContain("firststrike:1");
  expect(codes).not.toContain("workouts:1");
  expect(await count(`SELECT "weekWorkouts" n FROM "User" WHERE id = $1`, login)).toBe(0);
  expect(await count(`SELECT "currentStreak" n FROM "User" WHERE id = $1`, login)).toBe(0);
  expect(await count(`SELECT COUNT(*) n FROM "Workout" WHERE "userId" = $1`, login)).toBe(0);
});

test("invalid input is refused", async ({ page }) => {
  const { login } = await setup(page);
  const dialog = await openDialog(page);
  const field = dialog.getByLabel("Повторы");
  for (const value of ["0", "201", ""]) {
    await field.fill(value);
    await dialog.getByRole("button", { name: "Ударить" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Повторов — от 1 до 200");
  }
  await expect(page.getByTestId("first-strike-result")).toHaveCount(0);
  expect(await strikes(login)).toBe(0);
});

test('second tab gets "already struck"', async ({ page, context }) => {
  const { login } = await setup(page);
  const other = await context.newPage();
  await other.goto("/dashboard");
  const otherDialog = await openDialog(other);

  await strike(page);
  await otherDialog.getByRole("button", { name: "Ударить" }).click();
  await expect(otherDialog.getByRole("alert")).toContainText("Первый удар уже нанесён");
  await expect(other.getByTestId("first-strike-result")).toHaveCount(0);
  expect(await strikes(login)).toBe(1);
});

test("no card after a completed workout", async ({ page }) => {
  const { login } = await setup(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 1 }], 0);
  await page.reload();
  await expect(page.getByTestId("boss-card")).toBeVisible();
  await expect(page.getByTestId("first-strike-card")).toHaveCount(0);
  await page.goto("/dashboard?strike=1");
  await expect(page.getByTestId("boss-card")).toBeVisible();
  await expect(page.getByTestId("first-strike-dialog")).toHaveCount(0);
});

test("no card without the flag", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard?strike=1");
  await expect(page.getByTestId("boss-card")).toBeVisible();
  await expect(page.getByTestId("first-strike-card")).toHaveCount(0);
  await expect(page.getByTestId("first-strike-dialog")).toHaveCount(0);
});

test("strike then a real workout the same week", async ({ page }) => {
  const { login } = await setup(page);
  const result = await strike(page);
  await result.getByRole("button", { name: "Позже" }).click();
  await expect(page.getByTestId("first-strike-card")).toHaveCount(0);

  await quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }]);
  await expect(page.getByTestId("boss-damage")).toContainText("Урон боссу: −100");
  await page.goto("/dashboard");
  await expect(page.getByTestId("boss-card")).toContainText("2800 / 3000 HP");
  expect(await achievementCodes(login)).toContain("workouts:1");
});

test("flag turned off after the strike keeps the damage", async ({ page }) => {
  const { login } = await setup(page);
  const result = await strike(page);
  await result.getByRole("button", { name: "Позже" }).click();
  await withDb(async (db) =>
    db.query(`UPDATE "FeatureFlag" SET "userIds" = array_remove("userIds", $1) WHERE key = 'first_strike'`, [await userId(db, login)]),
  );
  await page.reload();
  await expect(page.getByTestId("boss-card")).toContainText("2900 / 3000 HP");
  await expect(page.getByTestId("first-strike-card")).toHaveCount(0);
});

test("stretch-only history still allows the strike", async ({ page }) => {
  const { login } = await setup(page);
  await seedStretchSessions(login, "Кошка-корова", [new Date(Date.now() - 3600_000)]);
  await page.reload();
  await expect(page.getByTestId("first-strike-card")).toBeVisible();
});

test("strike with a draft offers to continue it", async ({ page }) => {
  await setup(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await page.goto("/dashboard");

  const result = await strike(page);
  await expect(result.getByRole("link", { name: "Продолжить черновик" })).toHaveAttribute("href", "/training");
});

test("account data", async ({ page }) => {
  const { login } = await setup(page);
  const result = await strike(page);
  await result.getByRole("button", { name: "Позже" }).click();

  await page.goto("/settings");
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click(),
  ]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(typeof data.profile.firstStrikeAt).toBe("string");

  await page.getByRole("region", { name: "Удаление аккаунта" }).getByRole("button", { name: "Удалить аккаунт" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Удалить аккаунт?" });
  await dialog.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(login)).toBe(false);
});
