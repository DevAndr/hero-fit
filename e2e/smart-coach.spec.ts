import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, assistantEnabled, enableCoach, idOf, linkCoach, seedWorkouts, withDb, workoutWellbeing } from "./db";
import { addToWorkout, registerUser } from "./helpers";

// Флаг smart_coach — списком на пользователя (addFlagUser), не глобально: спеки идут параллельно

const chat = (page: Page) => page.getByRole("dialog", { name: "Помощник" });

/** Активная тренировка с упражнениями (запущена — подход отмечать не нужно). */
async function startWorkout(page: Page, exercises: string[]) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, exercises);
  await page.getByRole("button", { name: "Начать", exact: true }).click();
  await expect(page.getByTestId("elapsed")).toBeVisible();
}

async function askAbout(page: Page, exercise: string) {
  await page.getByRole("region", { name: exercise }).getByRole("button", { name: "Действия с упражнением" }).click();
  await page.getByRole("menuitem", { name: "Спросить помощника" }).click();
  await expect(chat(page)).toBeVisible();
}

const workoutId = (login: string) =>
  withDb(async (db) => (await db.query<{ id: string }>(`select w.id from "Workout" w join "User" u on u.id = w."userId" where u.login = $1 order by w."createdAt" desc limit 1`, [login])).rows[0].id);

test("no flag — no assistant", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Помощник" })).toHaveCount(0);
});

test("settings toggle hides the assistant", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("smart_coach", me.login);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Помощник" })).toBeVisible();
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Помощник" });
  await expect(toggle).toBeChecked();
  await expect(async () => {
    await toggle.click();
    await expect(toggle).not.toBeChecked({ timeout: 1000 });
  }).toPass();
  await expect.poll(() => assistantEnabled(me.login)).toBe(false);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Помощник" })).toHaveCount(0);
});

test("weight for today from history fills the sets", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("smart_coach", me.login);
  // 3 тренировки подряд 3 × 8 · 60 — «пора прибавить»: 62,5
  await seedWorkouts(me.login, "Жим штанги лёжа", [
    { weight: 60, reps: 8, sets: 3 },
    { weight: 60, reps: 8, sets: 3 },
    { weight: 60, reps: 8, sets: 3 },
  ]);
  await startWorkout(page, ["Жим штанги лёжа"]);
  await page.getByRole("region", { name: "Как ты сегодня?" }).getByRole("button", { name: "Пропустить" }).click();
  await askAbout(page, "Жим штанги лёжа");
  await chat(page).getByRole("button", { name: "Какой вес взять сегодня?" }).click();
  await expect(chat(page).getByText("Пора прибавить: 3 × 8 · 62,5 кг.")).toBeVisible();
  await chat(page).getByRole("button", { name: "Почему так?" }).click();
  await expect(chat(page).getByText(/В прошлый раз 3 × 8 · 60 кг/)).toBeVisible();
  await chat(page).getByRole("button", { name: "Подставить в подходы" }).click();
  await expect(page.getByRole("region", { name: "Жим штанги лёжа" }).getByLabel("Вес, подход 1")).toHaveValue("62.5");
});

test("tired check-in is saved and the coach sees it", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, `C_${coach.login.slice(-14).replace(/_/g, "")}`);
  const context = await browser.newContext();
  const client = await context.newPage();
  const me = await registerUser(client, "Клиент");
  await addFlagUser("smart_coach", me.login);
  await linkCoach(coach.login, me.login);

  await startWorkout(client, ["Жим штанги лёжа"]);
  await client.getByRole("region", { name: "Как ты сегодня?" }).getByRole("button", { name: "Устал" }).click();
  const id = await workoutId(me.login);
  await expect.poll(() => workoutWellbeing(id)).toBe("TIRED");

  const block = client.getByRole("region", { name: "Жим штанги лёжа" });
  await block.getByLabel("Вес, подход 1").fill("60");
  await block.getByLabel("Повторы, подход 1").fill("8");
  await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await client.getByRole("button", { name: "Завершить тренировку" }).click();
  await client.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(client).toHaveURL(/\/workouts\//);
  await context.close();

  await page.goto(`/coach/clients/${await idOf(me.login)}/workouts/${id}`);
  await expect(page.getByRole("region", { name: "Оценка клиента" }).getByText("Самочувствие: устал")).toBeVisible();
});

test("knee pain removes leg exercises and stays on the device", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("smart_coach", me.login);
  await startWorkout(page, ["Приседания со штангой", "Жим штанги лёжа"]);
  await page.getByRole("region", { name: "Как ты сегодня?" }).getByRole("button", { name: "Что-то болит" }).click();
  await chat(page).getByRole("button", { name: "Колено" }).click();
  await expect(chat(page).getByText(/Не делай через боль/)).toBeVisible();
  await chat(page).getByRole("button", { name: "Убрать: Приседания со штангой" }).click();
  await expect(page.getByRole("region", { name: "Приседания со штангой" })).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText(/Сохранено/);

  // Боль помнится на устройстве — и на сервер не ушла
  await chat(page).getByRole("button", { name: "Закрыть помощника" }).click();
  await addToWorkout(page, ["Жим ногами"]);
  await page.reload();
  await askAbout(page, "Жим ногами");
  await chat(page).getByRole("button", { name: "Какой вес взять сегодня?" }).click();
  await expect(chat(page).getByText(/Пропусти это упражнение сегодня/)).toBeVisible();
  const row = await withDb(async (db) => (await db.query(`select row_to_json(w)::text as j from "Workout" w where id = $1`, [await workoutId(me.login)])).rows[0].j as string);
  expect(row).not.toMatch(/knee|колен/i);
});

test("help works offline", async ({ page, context }) => {
  const me = await registerUser(page);
  await addFlagUser("smart_coach", me.login);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Помощник" }).click();
  await context.setOffline(true);
  await chat(page).getByRole("button", { name: "Как это работает?" }).click();
  await chat(page).getByRole("button", { name: "Серия и заморозки" }).click();
  await expect(chat(page).getByText(/3 тренировки/)).toBeVisible();
  await chat(page).getByRole("button", { name: "Назад в меню" }).click();
  await chat(page).getByRole("button", { name: "Застой — что делать?" }).click();
  await expect(chat(page).getByText("Нужна сеть — попробуй, когда появится связь.")).toBeVisible();
  await context.setOffline(false);
});
