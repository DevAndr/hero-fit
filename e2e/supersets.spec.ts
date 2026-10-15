import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, exerciseGroups, setExerciseGroups } from "./db";
import { addToWorkout, registerUser } from "./helpers";

// Флаг — списком на пользователя: можно и на desktop, и на mobile
const block = (page: Page, name: string) => page.getByRole("region", { name });
const restTimer = (page: Page) => page.getByRole("timer", { name: "Таймер отдыха" });

async function fillAndComplete(page: Page, exercise: string, n: number, weight: string, reps: string) {
  await block(page, exercise).getByLabel(`Вес, подход ${n}`).fill(weight);
  await block(page, exercise).getByLabel(`Повторы, подход ${n}`).fill(reps);
  await block(page, exercise).getByRole("button", { name: `Подход ${n} выполнен` }).click();
}

async function pairWorkout(page: Page) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа", "Подтягивания"]);
}

test("superset: no rest inside the round, rest after it; survives reload and a template", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("workout_formats", me.login);
  await pairWorkout(page);

  await page.getByRole("button", { name: "Связать в суперсет" }).click();
  await expect(page.getByTestId("superset")).toHaveText("Суперсет");
  await expect(block(page, "Жим штанги лёжа").getByRole("heading")).toContainText("A1");
  await expect(block(page, "Подтягивания").getByRole("heading")).toContainText("A2");

  // A1 → без отдыха, подсказка про A2
  await fillAndComplete(page, "Жим штанги лёжа", 1, "60", "10");
  await expect(page.getByText("Дальше: Подтягивания")).toBeVisible();
  await expect(restTimer(page)).toHaveCount(0);
  // A2 → отдых перед следующим кругом
  await fillAndComplete(page, "Подтягивания", 1, "", "8");
  await expect(restTimer(page)).toBeVisible();
  // Следующий круг при идущем отдыхе: отдых сбрасывается
  await fillAndComplete(page, "Жим штанги лёжа", 2, "60", "10");
  await expect(restTimer(page)).toHaveCount(0);

  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  expect(await exerciseGroups(me.login)).toEqual([1, 1]);
  await page.reload();
  await expect(page.getByTestId("superset")).toHaveText("Суперсет");

  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\/\w+$/);
  await expect(page.getByTestId("superset")).toHaveText("Суперсет");
  await page.getByRole("button", { name: "Сохранить как шаблон" }).click();
  await page.getByLabel("Название шаблона").fill("Мой суперсет");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Шаблон «Мой суперсет» сохранён")).toBeVisible();

  await page.goto("/training");
  await page.getByRole("button", { name: "Начать «Мой суперсет»" }).click();
  await expect(page.getByTestId("superset")).toHaveText("Суперсет");
  expect(await exerciseGroups(me.login)).toEqual([1, 1]);
});

test("without the flag: no links, and autosave keeps groups", async ({ page }) => {
  const me = await registerUser(page);
  await pairWorkout(page);
  await expect(page.getByRole("button", { name: "Связать в суперсет" })).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await setExerciseGroups(me.login, [1, 1]);
  await page.reload();
  await expect(page.getByTestId("superset")).toHaveCount(0);
  await fillAndComplete(page, "Жим штанги лёжа", 1, "60", "10");
  // Без флага — обычный отдых
  await expect(restTimer(page)).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  expect(await exerciseGroups(me.login)).toEqual([1, 1]);
});
