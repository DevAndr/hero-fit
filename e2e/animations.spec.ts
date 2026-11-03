import { expect, test } from "@playwright/test";
import { addFlagUser, logWeight, setNutritionMacros, setNutritionProfile } from "./db";
import { addToWorkout, registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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

test("calorie ring halo pulses a few times on /nutrition and restarts after a new entry", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  await setNutritionMacros(me.login, false);
  await setNutritionProfile(me.login, { heightCm: 180, birthYear: 1996, activityLevel: "MODERATE", nutritionGoal: "MAINTAIN", gender: "MALE" });
  await logWeight(me.login, todayLocal(), 80);
  await page.goto("/nutrition");
  const halo = page.getByRole("region", { name: "Итог дня" }).getByTestId("ring-halo");
  const anim = () => halo.evaluate((el) => ({ name: getComputedStyle(el).animationName, count: getComputedStyle(el).animationIterationCount }));
  // Не бесконечно: несколько вдохов, потом статичное свечение
  expect(await anim()).toEqual({ name: "ring-halo", count: "4" });
  const before = await halo.elementHandle();
  await page.getByRole("region", { name: "Обед", exact: true }).getByRole("button", { name: "Добавить" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить: Обед" });
  await dialog.getByLabel("Название").fill("Суп");
  await dialog.getByLabel("Ккал").fill("300");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByTestId("day-kcal")).toContainText("300 /");
  // Новая запись — новый элемент свечения, пульс с начала
  expect(await before!.evaluate((el) => el.isConnected)).toBe(false);
  expect((await anim()).name).toBe("ring-halo");
});
