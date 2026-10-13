import { expect, test } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

// Числовые поля тренировки: фокус выделяет значение — новое число заменяет старое, а не дописывается
test("set fields select their value on focus", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });
  const weight = bench.getByLabel("Вес, подход 1");
  const reps = bench.getByLabel("Повторы, подход 1");
  await weight.fill("60");
  await reps.fill("10");

  // Клик (мышь / тап) — выделение не сбрасывается отпусканием кнопки
  await weight.click();
  await page.keyboard.type("70");
  await expect(weight).toHaveValue("70");

  // Tab с соседнего поля
  await page.keyboard.press("Tab");
  await page.keyboard.type("8");
  await expect(reps).toHaveValue("8");

  // Повторный клик по уже выделенному полю ставит курсор: можно дописать
  await reps.click();
  await reps.click();
  await page.keyboard.press("End");
  await page.keyboard.type("1");
  await expect(reps).toHaveValue("81");
});
