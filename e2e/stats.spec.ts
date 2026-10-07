import { expect, test } from "@playwright/test";
import { seedWorkouts } from "./db";
import { addToWorkout, registerUser } from "./helpers";

test("empty stats page still offers the 1RM calculator", async ({ page }) => {
  await registerUser(page);
  await page.goto("/stats");
  await expect(page.getByText("Пока нет данных")).toBeVisible();

  const calc = page.getByRole("region", { name: "Калькулятор 1RM" });
  await calc.getByLabel("Вес, кг").fill("100");
  await calc.getByLabel("Повторы").fill("5");
  await expect(calc.getByTestId("one-rm-result")).toHaveText("116,7 кг");
  // Вес на 10 повторений: 116,67 / (1 + 10/30) = 87,5
  await expect(calc.locator("tbody tr").nth(9)).toContainText("87,5 кг");
});

test("history → hint in editor, tiles, muscle groups, exercise progress", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [
    { weight: 100, reps: 5, sets: 3 },
    { weight: 100, reps: 5, sets: 3 },
    { weight: 100, reps: 5, sets: 3 },
  ], 4);
  await seedWorkouts(login, "Приседания со штангой", [{ weight: 120, reps: 5, sets: 3 }], 5);

  // «Пора увеличить вес» прямо в тренировке
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });
  await expect(bench.getByTestId("progression-hint")).toHaveText("Пора увеличить вес: 100 → 102,5 кг");
  await bench.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);

  await page.goto("/stats");
  const workouts = page.getByRole("region", { name: "Тренировки" });
  await expect(workouts).toContainText("Всего5");
  await expect(workouts).toContainText("За 7 дней5");
  await expect(page.getByRole("region", { name: "Время в зале" })).toContainText("Всё время4 ч");

  const muscles = page.getByRole("region", { name: "Группы мышц" });
  await expect(muscles.locator("table")).toContainText("Грудь4");
  await expect(muscles.locator("table")).toContainText("Ноги1");
  await muscles.getByRole("tab", { name: "Всё время" }).click();
  await expect(muscles.locator("table")).toContainText("Пресс0");

  await expect(page.getByRole("region", { name: "История тренировок" }).locator("tbody tr")).toHaveCount(5);

  await page.getByRole("link", { name: /^Жим штанги лёжа/ }).click();
  await expect(page).toHaveURL(/\/stats\/exercises\//);
  await expect(page.getByRole("heading", { name: "Жим штанги лёжа", level: 1 })).toBeVisible();
  await expect(page.getByTestId("progression-hint")).toBeVisible();
  const prs = page.getByRole("region", { name: "Личные рекорды" });
  await expect(prs).toContainText("Макс. вес100 кг");
  await expect(prs).toContainText("1RM (расчётный)116,7 кг");
  await expect(page.getByRole("region", { name: "График прогресса" }).locator(".recharts-line-dot")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Тренировки (4)" })).toBeVisible();
  // Калькулятор заполнен лучшим подходом
  await expect(page.getByRole("region", { name: "Калькулятор 1RM" }).getByTestId("one-rm-result")).toHaveText("116,7 кг");
});

test("trend charts: weekly metrics, activity calendar, strength lines, rhythm, rep ranges", async ({ page }) => {
  const { login } = await registerUser(page);
  // 10 недель: по тренировке в неделю на каждое из трёх упражнений, вес растёт
  for (let i = 0; i < 10; i++) {
    const daysAgo = 7 * (10 - i);
    await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 80 + 2.5 * i, reps: 5, sets: 3 }], daysAgo);
    await seedWorkouts(login, "Приседания со штангой", [{ weight: 100 + 5 * i, reps: 5, sets: 3 }], daysAgo - 2);
    await seedWorkouts(login, "Тяга штанги в наклоне", [{ weight: 60 + 2.5 * i, reps: 10, sets: 3 }], daysAgo - 4);
  }

  await page.goto("/stats");

  const trend = page.getByRole("region", { name: "Тренды по неделям" });
  await expect(trend.getByRole("heading", { name: "Объём по неделям" })).toBeVisible();
  await trend.getByRole("tab", { name: "Тренировки" }).click();
  await expect(trend.getByRole("heading", { name: "Тренировки по неделям" })).toBeVisible();
  // 12 недель в таблице; неделя с тремя тренировками есть
  await expect(trend.locator("table tr")).toHaveCount(12);
  await expect(trend.locator("table")).toContainText("3");

  const calendar = page.getByRole("region", { name: "Календарь активности" });
  await expect(calendar).toContainText("Тренировочных дней за 26 недель: 30");
  await expect(calendar.locator('[data-level="4"]').first()).toBeVisible();

  const strength = page.getByRole("region", { name: "Сила в упражнениях" });
  for (const name of ["Жим штанги лёжа", "Приседания со штангой", "Тяга штанги в наклоне"]) {
    await expect(strength.getByRole("list", { name: "Легенда" })).toContainText(name);
  }
  await expect(strength.locator(".recharts-line")).toHaveCount(3);
  // Последний присед: 145 × (1 + 5/30) ≈ 169,2 кг
  await expect(strength.locator("table")).toContainText("169,2 кг");

  const rhythm = page.getByRole("region", { name: "Когда вы тренируетесь" });
  await expect(rhythm).toContainText("Чаще всего:");
  await rhythm.getByRole("tab", { name: "Время суток" }).click();
  await expect(rhythm.locator("table tr")).toHaveCount(24);

  const reps = page.getByRole("region", { name: "Диапазоны повторов" });
  await reps.getByRole("tab", { name: "Всё время" }).click();
  // 60 подходов по 5 (жим + присед) и 30 по 10 (тяга)
  await expect(reps).toContainText("Преобладает: сила (67%)");
  await expect(reps.locator("table")).toContainText("6–12 (гипертрофия)30 (33%)");

  // Широкие графики (календарь, вкладки) прокручиваются внутри карточек, а не всей страницей
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
