import { expect, test, type Page } from "@playwright/test";
import { ownTemplate, seedWorkouts, templateRow } from "./db";
import { registerUser } from "./helpers";

const SQUAT = "Приседания со штангой";
const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true });

/** Запустить свой шаблон со страницы шаблонов. */
async function start(page: Page, name: string) {
  await page.goto("/templates");
  await card(page, name).getByRole("button", { name: `Начать «${name}»` }).click();
  await expect(page).toHaveURL(/\/training$/);
}

/** Отметить подходы с данными повторами и завершить тренировку. */
async function finish(page: Page, reps: string[]) {
  const block = page.getByRole("region", { name: SQUAT });
  for (const [i, r] of reps.entries()) {
    await block.getByLabel(`Повторы, подход ${i + 1}`).fill(r);
    await block.getByRole("button", { name: `Подход ${i + 1} выполнен` }).click();
  }
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

test("a met goal raises the template weight", async ({ page }) => {
  await registerUser(page);
  await page.goto("/templates/new");
  await page.getByLabel("Название").fill("Ноги");
  await page.getByRole("button", { name: "Добавить упражнение" }).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Поиск упражнения").fill(SQUAT);
  await picker.getByRole("button", { name: new RegExp(`^${SQUAT}`) }).click();
  await picker.getByRole("button", { name: /^Добавить \(/ }).click();
  const row = page.getByRole("region", { name: SQUAT });
  await row.getByLabel("Подходы").fill("2");
  await row.getByLabel("Повторы").fill("5");
  await row.getByLabel("Вес, кг").fill("60");
  await row.getByLabel("Шаг, кг").fill("2,5");
  await expect(row).toContainText("Прогрессия: +2,5 кг, когда сделаешь 2 × 5 · 60 кг");
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(page).toHaveURL(/\/templates$/);

  await start(page, "Ноги");
  await expect(page.getByRole("region", { name: SQUAT }).getByLabel("Вес, подход 1")).toHaveValue("60");
  await finish(page, ["5", "5"]);
  const block = page.getByRole("region", { name: "Прогрессия" });
  await expect(block).toContainText(`${SQUAT}: в следующий раз 62,5 кг (+2,5)`);

  await start(page, "Ноги");
  await expect(page.getByRole("region", { name: SQUAT }).getByLabel("Вес, подход 1")).toHaveValue("62.5");
});

test("a miss counts a fail; only changing weight or step resets it", async ({ page }) => {
  const { login } = await registerUser(page);
  const id = await ownTemplate(login, "Ноги", SQUAT, { sets: 2, reps: 5, weight: 60, step: 2.5 });
  await start(page, "Ноги");
  await finish(page, ["3", "3"]);
  await expect(page.getByRole("region", { name: "Прогрессия" })).toContainText("повторим 60 кг · неудача 1 из 3");
  expect(await templateRow(id, SQUAT)).toMatchObject({ targetWeight: 60, fails: 1 });

  // Правка без смены веса и шага — счётчик сохраняется
  await page.goto(`/templates/${id}`);
  await page.getByLabel("Название").fill("Ноги — база");
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  expect(await templateRow(id, SQUAT)).toMatchObject({ step: 2.5, fails: 1 });

  await page.goto(`/templates/${id}`);
  await page.getByRole("region", { name: SQUAT }).getByLabel("Шаг, кг").fill("5");
  await page.getByRole("button", { name: "Сохранить шаблон" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  expect(await templateRow(id, SQUAT)).toMatchObject({ step: 5, fails: 0 });
});

test("no «Пора увеличить вес» on an exercise with progression", async ({ page }) => {
  const { login } = await registerUser(page);
  // Три одинаковые тренировки — обычно подсказка «Пора увеличить вес»
  await seedWorkouts(login, SQUAT, [
    { weight: 80, reps: 5, sets: 3 },
    { weight: 80, reps: 5, sets: 3 },
    { weight: 80, reps: 5, sets: 3 },
  ]);
  await ownTemplate(login, "С прогрессией", SQUAT, { sets: 3, reps: 5, weight: 80, step: 2.5 });
  await ownTemplate(login, "Без прогрессии", SQUAT, { sets: 3, reps: 5, weight: 80, step: null });

  await start(page, "Без прогрессии");
  await expect(page.getByRole("region", { name: SQUAT }).getByTestId("progression-hint")).toBeVisible();
  await page.getByRole("button", { name: "Действия с тренировкой" }).click();
  await page.getByRole("menuitem", { name: "Отменить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отменить тренировку" }).click();

  await start(page, "С прогрессией");
  await expect(page.getByRole("region", { name: SQUAT }).getByLabel("Вес, подход 1")).toHaveValue("80");
  await expect(page.getByRole("region", { name: SQUAT }).getByTestId("progression-hint")).toHaveCount(0);
});
