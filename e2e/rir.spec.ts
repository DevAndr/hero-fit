import { expect, test } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

test("RIR after a set: saved with the draft, shown in history, easy sets trigger the weight hint at once", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });

  for (const i of [1, 2]) {
    await bench.getByLabel(`Вес, подход ${i}`).fill("80");
    await bench.getByLabel(`Повторы, подход ${i}`).fill("8");
  }
  await bench.getByLabel("Удалить подход 3").click();

  // Пока подход не выполнен — RIR не спрашиваем
  await expect(bench.getByRole("group", { name: "Запас повторов, подход 1" })).toHaveCount(0);
  for (const i of [1, 2]) {
    await bench.getByRole("button", { name: `Подход ${i} выполнен` }).click();
    const rir = bench.getByRole("group", { name: `Запас повторов, подход ${i}` });
    await rir.getByRole("button", { name: "Запас: ещё 3 повтора" }).click();
    await expect(rir.getByRole("button", { name: "Запас: ещё 3 повтора" })).toHaveAttribute("aria-pressed", "true");
  }

  // Автосохранение переживает перезагрузку
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Запас повторов, подход 2" }).getByRole("button", { name: "Запас: ещё 3 повтора" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
  await expect(page.getByText("@RIR 3").first()).toBeVisible();

  // Запас 2+ во всех подходах — подсказка уже после одной тренировки
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await expect(page.getByRole("region", { name: "Жим штанги лёжа" }).getByTestId("progression-hint")).toHaveText(
    "Пора увеличить вес: 80 → 82,5 кг — в прошлый раз оставался запас 2+ повтора",
  );
});
