import { expect, test } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

test("warm-up sets and plate loadout in the workout editor", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа", "Подтягивания"]);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });

  // Без рабочего веса — нечего считать
  await expect(bench.getByRole("button", { name: "Разминка", exact: true })).toBeDisabled();
  for (const i of [1, 2, 3]) await bench.getByLabel(`Вес, подход ${i}`).fill("102,5");

  // Разминка: гриф × 10, 40/60/80 % — перед рабочими подходами
  await bench.getByRole("button", { name: "Разминка", exact: true }).click();
  await expect(bench.getByTestId("set-row")).toHaveCount(7);
  for (const [i, weight] of [[1, "20"], [2, "40"], [3, "60"], [4, "80"]] as const) {
    await expect(bench.getByLabel(`Подход ${i}: разминка`)).toBeVisible();
    await expect(bench.getByLabel(`Вес, подход ${i}`)).toHaveValue(weight);
  }
  await expect(bench.getByLabel("Подход 5: рабочий")).toBeVisible();
  // Повторное нажатие не дублирует
  await bench.getByRole("button", { name: "Разминка", exact: true }).click();
  await expect(bench.getByTestId("set-row")).toHaveCount(7);

  // Блины на ближайший рабочий подход
  await bench.getByRole("button", { name: "Блины", exact: true }).click();
  await expect(bench.getByRole("region", { name: "Блины на штанге" })).toContainText(
    "102,5 кг — на каждую сторону: 25 + 15 + 1,25 (гриф 20 кг)",
  );

  // Упражнение со своим весом — без этих кнопок
  const pullups = page.getByRole("region", { name: "Подтягивания" });
  await expect(pullups.getByRole("button", { name: "Блины", exact: true })).toHaveCount(0);
});
