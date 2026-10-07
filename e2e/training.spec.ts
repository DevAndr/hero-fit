import { expect, test, type Page } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

const exerciseBlock = (page: Page, name: string) => page.getByRole("region", { name });

async function fillSet(page: Page, exercise: string, index: number, weight: string, reps: string) {
  const block = exerciseBlock(page, exercise);
  await block.getByLabel(`Вес, подход ${index}`).fill(weight);
  await block.getByLabel(`Повторы, подход ${index}`).fill(reps);
}

const completeSet = (page: Page, exercise: string, index: number) =>
  exerciseBlock(page, exercise).getByRole("button", { name: `Подход ${index} выполнен` }).click();

async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
}

test.beforeEach(async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
});

test("full workout: build, sets, rest timer, autosave, finish → summary with XP and streak", async ({ page }) => {
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await expect(page.getByLabel("Название тренировки")).toHaveValue("Тренировка");
  await page.getByLabel("Название тренировки").fill("Грудь и спина");

  await addToWorkout(page, ["Жим штанги лёжа", "Подтягивания"]);
  const bench = exerciseBlock(page, "Жим штанги лёжа");
  await expect(bench.getByTestId("set-row")).toHaveCount(3);

  await fillSet(page, "Жим штанги лёжа", 1, "60", "10");
  await fillSet(page, "Жим штанги лёжа", 2, "62,5", "8");

  // Неограниченные подходы: добавленный копирует предыдущий
  await bench.getByRole("button", { name: "Подход", exact: true }).click();
  await expect(bench.getByTestId("set-row")).toHaveCount(4);
  await bench.getByLabel("Удалить подход 3").click();
  await expect(bench.getByTestId("set-row")).toHaveCount(3);

  // Первый отмеченный подход сам запускает тренировку и таймер отдыха
  await completeSet(page, "Жим штанги лёжа", 1);
  await expect(page.getByTestId("elapsed")).toBeVisible();
  const timer = page.getByRole("timer", { name: "Таймер отдыха" });
  await expect(timer).toBeVisible();
  await expect(timer).toContainText("далее Жим штанги лёжа");
  const before = await timer.getByTestId("rest-remaining").textContent();
  await timer.getByRole("button", { name: "Плюс 15 секунд" }).click();
  await expect(timer.getByTestId("rest-remaining")).not.toHaveText(before!);
  await timer.getByRole("button", { name: "Пропустить отдых" }).click();
  await expect(timer).toBeHidden();

  await completeSet(page, "Жим штанги лёжа", 2);
  await fillSet(page, "Подтягивания", 1, "", "12");
  await completeSet(page, "Подтягивания", 1);

  // Автосохранение переживает перезагрузку
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(page.getByLabel("Название тренировки")).toHaveValue("Грудь и спина");
  await expect(exerciseBlock(page, "Жим штанги лёжа").getByLabel("Вес, подход 2")).toHaveValue("62.5");
  await expect(exerciseBlock(page, "Жим штанги лёжа").locator("[data-done]")).toHaveCount(2);
  await expect(page.getByRole("timer")).toBeVisible(); // таймер отдыха восстановлен

  await finish(page);
  await expect(page).toHaveURL(/\/workouts\/\w+$/);
  await expect(page.getByRole("heading", { name: "Грудь и спина — готово!" })).toBeVisible();
  // 3 подхода, 30 повторов, 600 + 500 = 1100 кг → 50 + 15 + 6 + 5 = 76 XP
  // + 32 за ачивку «Жим лёжа: 60 кг» (рабочий вес 62,5 кг)
  await expect(page.getByTestId("xp-earned")).toHaveText("+108 XP");
  await expect(page.getByText("76 за тренировку + 32 за ачивки")).toBeVisible();
  await expect(page.getByTestId("streak")).toContainText("0");
  await expect(page.getByText("Неделя: 1/3 — ещё 2 тренировки до +1 к серии")).toBeVisible();
  await expect(page.getByText("1 100 кг")).toBeVisible();
  // Невыполненные подходы в историю не попали
  await expect(page.getByText("60 × 10")).toBeVisible();
  await expect(page.getByText("12 повт.")).toBeVisible();
  await expect(page.getByText("LVL 2")).toBeVisible(); // 108 XP ≥ 100 — переход на 2-й уровень
});

test("repeat last workout prefills sets; beating it gives a PR", async ({ page }) => {
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Приседания со штангой"]);
  await fillSet(page, "Приседания со штангой", 1, "100", "5");
  await completeSet(page, "Приседания со штангой", 1);
  await finish(page);
  await expect(page.getByTestId("xp-earned")).toBeVisible();
  await expect(page.getByText("Новые рекорды")).toHaveCount(0); // первый результат — без «рекорда»

  await page.goto("/training");
  await page.getByRole("button", { name: /Повторить «Тренировка»/ }).click();
  const squat = exerciseBlock(page, "Приседания со штангой");
  await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("100");
  await expect(squat.getByText("Прошлый раз: 100×5")).toBeVisible();

  await squat.getByLabel("Вес, подход 1").fill("110");
  await completeSet(page, "Приседания со штангой", 1);
  await finish(page);

  await expect(page.getByText("Новые рекорды")).toBeVisible();
  await expect(page.getByText("100 кг → 110 кг")).toBeVisible();
  await expect(page.getByText(/за рекорды/)).toBeVisible();
  // Вторая тренировка недели — до засчитанной недели ещё одна
  await expect(page.getByText("Неделя: 2/3 — ещё 1 тренировка до +1 к серии")).toBeVisible();
});

test("three workouts in a week extend the weekly streak", async ({ page }) => {
  test.slow(); // три полные тренировки — под параллельной нагрузкой не укладываются в 30 с
  for (const n of [1, 2, 3]) {
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await addToWorkout(page, ["Подтягивания"]);
    await fillSet(page, "Подтягивания", 1, "", "10");
    await completeSet(page, "Подтягивания", 1);
    await finish(page);
    await expect(page).toHaveURL(/\/workouts\/\w+$/);
    if (n < 3) await expect(page.getByText(`Неделя: ${n}/3`)).toBeVisible();
  }
  await expect(page.getByText("Неделя засчитана — серия 1 неделя!")).toBeVisible();
  await expect(page.getByTestId("streak")).toContainText("1");
  await expect(page.getByTestId("header-streak")).toHaveText("1");
});

test("start from a program template, then cancel", async ({ page }) => {
  await page.getByRole("button", { name: "Начать «Push»" }).click();
  await expect(page.getByLabel("Название тренировки")).toHaveValue("Push");
  await expect(page.locator("main section[aria-label]")).toHaveCount(5);
  await expect(exerciseBlock(page, "Жим штанги лёжа").getByTestId("set-row")).toHaveCount(4);
  await expect(exerciseBlock(page, "Жим штанги лёжа").getByLabel("Повторы, подход 1")).toHaveValue("8");

  await page.getByRole("button", { name: "Действия с тренировкой" }).click();
  await page.getByRole("menuitem", { name: "Отменить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отменить тренировку" }).click();
  await expect(page.getByRole("heading", { name: "Новая тренировка" })).toBeVisible();
  // redirect() из action — не сетевая ошибка
  await expect(page.getByText(/Нет сети/)).toHaveCount(0);
});

test("cannot finish without completed sets; save finished workout as template", async ({ page }) => {
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Шраги со штангой"]);
  await page.getByRole("button", { name: "Начать", exact: true }).click();
  await finish(page);
  await expect(page.getByText("Отметьте хотя бы один выполненный подход")).toBeVisible();

  await fillSet(page, "Шраги со штангой", 1, "80", "12");
  await completeSet(page, "Шраги со штангой", 1);
  await finish(page);
  await expect(page).toHaveURL(/\/workouts\//);

  await page.getByRole("button", { name: "Сохранить как шаблон" }).click();
  await page.getByLabel("Название шаблона").fill("Мои шраги");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Шаблон «Мои шраги» сохранён")).toBeVisible();

  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Мои шаблоны" })).toBeVisible();
  await page.getByRole("button", { name: "Начать «Мои шраги»" }).click();
  await expect(exerciseBlock(page, "Шраги со штангой").getByLabel("Вес, подход 1")).toHaveValue("80");
});
