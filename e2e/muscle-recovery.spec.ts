import { expect, test } from "@playwright/test";
import { seedWorkouts, withDb } from "./db";
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
  await expect(map.getByTestId("recovery-hint")).toContainText("Давно не было: ноги (9 дн.), ягодицы (9 дн.), пресс (9 дн.)");
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

test("RIR 0 lengthens recovery; balance tab shows lopsided pairs", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 6 }], 1);
  // Все подходы до отказа: 6 × 1,5 = 9 «эффективных» → норма 108 ч вместо 72
  await withDb((db) =>
    db.query(
      `UPDATE "WorkoutSet" s SET rir = 0 FROM "WorkoutExercise" we, "Workout" w, "User" u
        WHERE s."workoutExerciseId" = we.id AND we."workoutId" = w.id AND w."userId" = u.id AND u.login = $1`,
      [login],
    ),
  );

  await page.goto("/dashboard");
  const map = page.getByTestId("body-map");
  await expect(map.getByTestId("recovery-CHEST")).toContainText("22 %");

  await map.getByRole("tab", { name: "Баланс за 30 дней" }).click();
  await expect(map.getByTestId("recovery-CHEST")).toContainText("6 подх.");
  await expect(map.getByTestId("recovery-TRICEPS")).toContainText("3 подх.");
  await expect(map.getByTestId("recovery-CHEST")).toHaveAttribute("data-state", "level-4");
  await expect(map.getByTestId("recovery-hint")).toContainText("Грудь: 6 подходов, спина — ни одного — добавьте тяги");
  await expect(map.getByTestId("recovery-hint")).toContainText("Ни разу за 30 дней: ноги, ягодицы, предплечья, икры, бицепс, спина, трапеция, пресс");
});

test("build a workout from recovery: rested groups first, own exercises with last weights", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Приседания со штангой", [{ weight: 80, reps: 5, sets: 5 }], 9);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 6 }], 1);

  await page.goto("/training");
  // Ноги и пресс отдыхают 9 дней, остальные не тренировались; грудь (жим вчера) — нет
  await expect(page.getByTestId("recovery-plan-preview")).toHaveText(
    "Ноги · Ягодицы · Пресс · Предплечья · Икры — 6 упражнений",
  );
  await page.getByRole("button", { name: /Собрать по восстановлению/ }).click();

  await expect(page.getByLabel("Название тренировки")).toHaveValue("По восстановлению: ноги, ягодицы, пресс, предплечья, икры");
  const squat = page.getByRole("region", { name: "Приседания со штангой" });
  await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("80");
  await expect(squat.getByLabel("Повторы, подход 5")).toHaveValue("5");
  await expect(page.getByRole("region", { name: "Жим ногами" }).getByLabel("Повторы, подход 3")).toHaveValue("10");
  await expect(page.getByRole("region", { name: "Жим штанги лёжа" })).toHaveCount(0);
});
