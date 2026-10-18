import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, ownTemplate, seedWorkouts, templateRow } from "./db";
import { addToWorkout, registerUser } from "./helpers";

const SQUAT = "Приседания со штангой";
const BENCH = "Жим штанги лёжа";
const LUNGE = "Выпады с гантелями";

/** Пользователь: выпады 10 дней назад (3 × 10 · 20 кг) — первый «похожий» на присед. */
async function athlete(page: Page) {
  const user = await registerUser(page);
  await seedWorkouts(user.login, LUNGE, [{ weight: 20, reps: 10, sets: 3 }], 10);
  return user;
}

async function emptyWorkout(page: Page, names: string[]) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, names);
}

async function openSwap(page: Page, name: string) {
  await page.getByRole("region", { name }).getByRole("button", { name: "Действия с упражнением" }).click();
  await page.getByRole("menuitem", { name: "Заменить" }).click();
  const dialog = page.getByRole("dialog", { name: `Заменить: ${name}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

const order = (page: Page) => page.locator("section[data-exercise-key]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));

test("swap before any set: in place, weight from last time", async ({ page }) => {
  await athlete(page);
  await emptyWorkout(page, [SQUAT, BENCH]);
  const dialog = await openSwap(page, SQUAT);
  await expect(dialog).toContainText("Тренажёр занят? Похожие упражнения");
  const similar = dialog.getByRole("list", { name: "Похожие упражнения" }).getByRole("button");
  expect(await similar.count()).toBeLessThanOrEqual(3);
  await expect(similar.first()).toContainText(LUNGE);
  await expect(similar.first()).toContainText("в прошлый раз 3 × 10 · 20 кг");
  await expect(dialog.getByRole("button", { name: /^Бег/ })).toHaveCount(0);

  await similar.first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: LUNGE }).getByLabel("Вес, подход 1")).toHaveValue("20");
  await expect(page.getByRole("region", { name: SQUAT })).toHaveCount(0);
  expect(await order(page)).toEqual([LUNGE, BENCH]);
  await expect(page.getByRole("region", { name: LUNGE }).getByRole("heading", { name: LUNGE })).toBeFocused();
});

test("undo restores the original", async ({ page }) => {
  await athlete(page);
  await emptyWorkout(page, [SQUAT, BENCH]);
  const dialog = await openSwap(page, SQUAT);
  await dialog.getByRole("button", { name: new RegExp(`^${LUNGE}`) }).click();
  await expect(page.getByText(`Заменено: ${LUNGE}`)).toBeVisible();
  await page.getByRole("button", { name: "Вернуть" }).click();
  await expect(page.getByRole("region", { name: SQUAT })).toBeVisible();
  await expect(page.getByRole("region", { name: LUNGE })).toHaveCount(0);
  expect(await order(page)).toEqual([SQUAT, BENCH]);
});

test("after a completed set the original stays and the new one goes next", async ({ page }) => {
  await athlete(page);
  await emptyWorkout(page, [SQUAT, BENCH]);
  const squat = page.getByRole("region", { name: SQUAT });
  await squat.getByLabel("Вес, подход 1").fill("60");
  await squat.getByLabel("Повторы, подход 1").fill("10");
  await squat.getByRole("button", { name: "Подход 1 выполнен" }).click();
  const dialog = await openSwap(page, SQUAT);
  await expect(dialog).toContainText("Сделанные подходы останутся, новое упражнение встанет следом");
  await dialog.getByRole("button", { name: new RegExp(`^${LUNGE}`) }).click();
  await expect(page.getByRole("region", { name: LUNGE })).toBeVisible();
  expect(await order(page)).toEqual([SQUAT, LUNGE, BENCH]);
  // Фокус — на новом упражнении, а не на кнопке меню исходного (диалог возвращает фокус при закрытии)
  await expect(page.getByRole("region", { name: LUNGE }).getByRole("heading", { name: LUNGE })).toBeFocused();
});

test("another exercise: filter preset to the main group and can be cleared", async ({ page }) => {
  await athlete(page);
  await emptyWorkout(page, [SQUAT, BENCH]);
  const dialog = await openSwap(page, SQUAT);
  await dialog.getByRole("button", { name: "Другое упражнение…" }).click();
  const list = dialog.getByRole("list", { name: "Список упражнений" });
  await expect(dialog.getByRole("button", { name: "Ноги", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("button", { name: /^Жим ногами/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Сведение рук в кроссовере/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Все", exact: true }).click();
  await expect(list.getByRole("button", { name: /^Сведение рук в кроссовере/ })).toBeVisible();
  await expect(list.getByRole("button", { name: new RegExp(`^${BENCH}`) })).toHaveCount(0);
  await list.getByRole("button", { name: /^Жим ногами/ }).click();
  await expect(page.getByRole("region", { name: "Жим ногами" })).toBeVisible();
  expect(await order(page)).toEqual(["Жим ногами", BENCH]);
});

test("own progression is untouched by a swap", async ({ page }) => {
  const { login } = await athlete(page);
  const id = await ownTemplate(login, "Ноги", SQUAT, { sets: 3, reps: 10, weight: 100, step: 2.5, fails: 1 });
  await page.goto("/templates");
  await page.getByRole("article", { name: "Ноги", exact: true }).getByRole("button", { name: "Начать «Ноги»" }).click();
  await expect(page).toHaveURL(/\/training$/);
  const dialog = await openSwap(page, SQUAT);
  await dialog.getByRole("button", { name: new RegExp(`^${LUNGE}`) }).click();
  const lunge = page.getByRole("region", { name: LUNGE });
  for (const i of [1, 2, 3]) await lunge.getByRole("button", { name: `Подход ${i} выполнен` }).click();
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
  expect(await templateRow(id, SQUAT)).toMatchObject({ targetWeight: 100, step: 2.5, fails: 1 });
});

test("swap works offline and syncs", async ({ page, context }) => {
  await athlete(page);
  await emptyWorkout(page, [SQUAT, BENCH]);
  await expect(page.getByText("Сохранено")).toBeVisible();
  await context.setOffline(true);
  const dialog = await openSwap(page, SQUAT);
  await dialog.getByRole("button", { name: new RegExp(`^${LUNGE}`) }).click();
  await expect(page.getByRole("region", { name: LUNGE })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: LUNGE })).toBeVisible();
  await expect(page.getByRole("region", { name: SQUAT })).toHaveCount(0);
});

test("superset: the swap takes the place in the round, undo gives it back", async ({ page }) => {
  const { login } = await athlete(page);
  await addFlagUser("workout_formats", login);
  await emptyWorkout(page, [SQUAT, BENCH]);
  await page.getByRole("button", { name: `Связать «${SQUAT}» и «${BENCH}» в суперсет` }).click();
  const heading = (name: string) => page.getByRole("region", { name }).getByRole("heading");
  await expect(heading(SQUAT)).toContainText("A1");

  const dialog = await openSwap(page, SQUAT);
  await dialog.getByRole("button", { name: new RegExp(`^${LUNGE}`) }).click();
  await expect(heading(LUNGE)).toContainText("A1");
  await expect(heading(BENCH)).toContainText("A2");

  await page.getByRole("button", { name: "Вернуть" }).click();
  await expect(heading(SQUAT)).toContainText("A1");
  await expect(heading(BENCH)).toContainText("A2");
});

test("chained swaps keep one undo toast, and it returns the previous one", async ({ page }) => {
  await athlete(page);
  await emptyWorkout(page, [SQUAT, BENCH]);
  let dialog = await openSwap(page, SQUAT);
  await dialog.getByRole("button", { name: new RegExp(`^${LUNGE}`) }).click();
  dialog = await openSwap(page, LUNGE);
  await dialog.getByRole("button", { name: /^Жим ногами/ }).click();
  await expect(page.getByText("Заменено: Жим ногами")).toBeVisible();
  // Тост прошлой замены закрыт — его «Вернуть» уже не сработало бы
  // Мгновенно, без ожидания: старый тост через 4 с исчез бы и сам
  expect(await page.locator("[data-sonner-toast]").allTextContents()).toEqual(["Заменено: Жим ногамиВернуть"]);
  await page.getByRole("button", { name: "Вернуть" }).click();
  await expect(page.getByRole("region", { name: LUNGE })).toBeVisible();
  await expect(page.getByRole("region", { name: "Жим ногами" })).toHaveCount(0);
});
