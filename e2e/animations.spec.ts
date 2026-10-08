import { expect, test } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

// Остальные e2e идут с «уменьшить движение» (playwright.config.ts) — здесь анимации включены.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

test("set confirm plays success, first level-up fires the celebration", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const block = page.getByRole("region", { name: "Жим штанги лёжа" });
  await block.getByLabel("Вес, подход 1").fill("60");
  await block.getByLabel("Повторы, подход 1").fill("10");
  const confirm = block.getByRole("button", { name: "Подход 1 выполнен" });
  await confirm.click();

  // Вместо галочки — анимация «готово», кнопка остаётся (и нажатой), потом галочка возвращается
  await expect(confirm.locator('[data-lottie="success"] svg')).toBeVisible();
  await expect(confirm).toHaveAttribute("aria-pressed", "true");
  await expect(confirm.locator('[data-lottie="success"]')).toHaveCount(0, { timeout: 5000 });

  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
  // Первая тренировка даёт уровень 2 — салют поверх страницы, затем исчезает
  await expect(page.getByText("Новый уровень 2!")).toBeVisible();
  await expect(page.getByTestId("level-up-celebration").locator("svg").first()).toBeVisible();
  await expect(page.getByTestId("level-up-celebration")).toHaveCount(0, { timeout: 8000 });
});
