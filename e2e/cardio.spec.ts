import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, timedSets } from "./db";
import { addToWorkout, registerUser } from "./helpers";

// Флаг — списком на пользователя: можно и на desktop, и на mobile
const block = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const skipRest = (page: Page) => page.getByRole("timer", { name: "Таймер отдыха" }).getByRole("button", { name: "Пропустить отдых" }).click();

test("run and plank: time and distance, cardio tile, XP per minute, endurance achievement, records", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("workout_formats", me.login);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Бег", "Планка"]);

  // У кардио — дистанция и время, без веса и повторов
  await expect(block(page, "Бег").getByLabel("Вес, подход 1")).toHaveCount(0);
  await block(page, "Бег").getByLabel("Дистанция, подход 1").fill("5,2");
  await block(page, "Бег").getByLabel("Время, подход 1").fill("28,40");
  await block(page, "Бег").getByRole("button", { name: "Подход 1 выполнен" }).click();
  // «28,40» понят как 28:40
  await expect(block(page, "Бег").getByLabel("Время, подход 1")).toHaveValue("28:40");
  await skipRest(page);

  await block(page, "Планка").getByLabel("Время, подход 1").fill("1:30");
  await block(page, "Планка").getByRole("button", { name: "Подход 1 выполнен" }).click();
  await skipRest(page);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");

  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\/\w+$/);

  await expect(page.getByText("5,2 км · 28:40 · 5:31/км")).toBeVisible();
  await expect(page.getByText("1:30", { exact: true })).toBeVisible();
  await expect(page.getByText("Кардио", { exact: true })).toBeVisible();
  // 50 + 5·2 подхода + 30 минут работы
  await expect(page.getByText(/90 за тренировку/)).toBeVisible();
  await expect(page.getByText("Пятёрка").first()).toBeVisible();
  expect(await timedSets(me.login)).toEqual([
    { name: "Бег", durationSec: 1720, distanceM: 5200 },
    { name: "Планка", durationSec: 90, distanceM: null },
  ]);

  // Страница упражнения: рекорды кардио
  await page.getByRole("link", { name: "Бег", exact: true }).click();
  const records = page.getByRole("region", { name: "Личные рекорды" });
  await expect(records).toContainText("Дальше всего");
  await expect(records).toContainText("5,2 км");
  await expect(records).toContainText("5:31/км");
});

test("own exercise of kind «Кардио» gets distance and time inputs", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("workout_formats", me.login);
  await page.goto("/exercises");
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Сайкл в зале");
  await dialog.getByRole("button", { name: "Ноги", exact: true }).click();
  await dialog.getByRole("radio", { name: "Кардио" }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Сайкл в зале"]);
  await expect(block(page, "Сайкл в зале").getByLabel("Дистанция, подход 1")).toBeVisible();
  await expect(block(page, "Сайкл в зале").getByLabel("Время, подход 1")).toBeVisible();
});

test("without the flag: no timed or cardio exercises in the catalog", async ({ page }) => {
  await registerUser(page);
  await page.goto("/exercises");
  await expect(page.getByText("Жим штанги лёжа").first()).toBeVisible();
  await expect(page.getByText("Планка", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Бег", { exact: true })).toHaveCount(0);
});
