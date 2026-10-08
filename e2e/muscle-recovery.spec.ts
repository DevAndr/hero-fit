import { expect, test } from "@playwright/test";
import { seedWorkouts } from "./db";
import { registerUser } from "./helpers";

test("muscle recovery: dashboard map and recovery dots in the workout filter", async ({ page }) => {
  const { login } = await registerUser(page);
  // Жим вчера (грудь — основная, плечи/трицепс — второстепенные), присед 9 дней назад (ноги, пресс)
  await seedWorkouts(login, "Приседания со штангой", [{ weight: 80, reps: 5, sets: 5 }], 9);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 6 }], 1);

  await page.goto("/dashboard");
  const map = page.getByTestId("body-map");
  await expect(map).toBeVisible();
  // 6 подходов на грудь сутки назад: 24 из 72 ч
  await expect(map.getByTestId("recovery-CHEST")).toHaveAttribute("data-state", "fatigued");
  await expect(map.getByTestId("recovery-CHEST")).toContainText("33 %");
  // плечи: 3 «половинных» подхода → 30 ч, прошло 24
  await expect(map.getByTestId("recovery-SHOULDERS")).toHaveAttribute("data-state", "recovering");
  await expect(map.getByTestId("recovery-LEGS")).toHaveAttribute("data-state", "neglected");
  await expect(map.getByTestId("recovery-LEGS")).toContainText("9 дн.");
  await expect(map.getByTestId("recovery-BICEPS")).toContainText("не было");
  await expect(map.getByTestId("recovery-hint")).toContainText("Давно не было: ноги (9 дн.), пресс (9 дн.)");
  // Силуэт раскрашен по тем же состояниям
  await expect(map.locator('polygon[data-group="CHEST"]').first()).toHaveAttribute("data-state", "fatigued");

  await map.getByTestId("recovery-CHEST").click();
  await expect(map.getByTestId("recovery-hint")).toHaveText("Грудь: восстановление 33 %, ещё ~48 ч");

  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  const filter =
    (page.viewportSize()?.width ?? 0) >= 1024
      ? page.getByRole("complementary", { name: "Каталог упражнений" })
      : (await page.getByRole("button", { name: "Добавить упражнение" }).click(), page.getByRole("dialog"));
  const chest = filter.getByRole("button", { name: "Грудь", exact: true });
  await expect(chest).toHaveAttribute("data-recovery", "fatigued");
  await expect(chest).toHaveAttribute("title", "Грудь: восстановление 33 %, ещё ~48 ч");
  await expect(filter.getByRole("button", { name: "Ноги", exact: true })).toHaveAttribute("data-recovery", "neglected");
});
