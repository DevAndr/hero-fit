import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, insertWhoopConnection, insertWhoopWorkout, latestWorkout, logWeight, seedWorkouts, setNutritionMacros, setNutritionProfile, weightEntries } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

const localDay = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - daysAgo * 86_400_000));

async function nutritionUser(page: Page) {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  await setNutritionMacros(me.login, false);
  return me;
}

/** Анкета: мужчина 1996 г. р., 180 см, 80 кг, средняя активность. */
async function fillProfile(page: Page, button: string, o: { gender?: boolean; goal?: string } = {}) {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog", { name: "Данные для нормы" });
  if (o.gender !== false) await dialog.getByRole("radio", { name: "Мужской" }).click();
  await dialog.getByLabel("Год рождения").fill("1996");
  await dialog.getByLabel("Рост, см").fill("180");
  await dialog.getByLabel("Вес, кг").fill("80");
  await dialog.getByRole("radio", { name: "Средняя" }).click();
  await dialog.getByRole("radio", { name: o.goal ?? "Поддержание" }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  return dialog;
}

test("without the flag /nutrition is 404 and there is no menu item", async ({ page }) => {
  await registerUser(page);
  const res = await page.goto("/nutrition");
  expect(res?.status()).toBe(404);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Питание" })).toHaveCount(0);
});

test("empty state → profile → norm and macros", async ({ page }) => {
  const me = await nutritionUser(page);
  await setNutritionMacros(me.login, true);
  await page.goto("/nutrition");
  const card = page.getByRole("region", { name: "Норма на день" });
  await expect(card).toContainText("Посчитаем вашу норму калорий");
  const dialog = await fillProfile(page, "Заполнить");
  await expect(dialog).toBeHidden();
  await expect(card.getByTestId("norm-kcal")).toHaveText("2 760");
  await expect(card).toContainText("144 г");
  await expect(card).toContainText("72 г");
  await expect(card).toContainText("384 г");
  await expect(card).toContainText("Основной обмен 1 780 × 1,55 (средняя активность)");
});

test("saving without gender shows a field error and keeps the dialog open", async ({ page }) => {
  await nutritionUser(page);
  await page.goto("/nutrition");
  const dialog = await fillProfile(page, "Заполнить", { gender: false });
  await expect(dialog.getByText("Укажите пол")).toBeVisible();
  await expect(dialog).toBeVisible();
  // Введённое не пропадает после ошибки
  await expect(dialog.getByLabel("Год рождения")).toHaveValue("1996");
  await expect(dialog.getByLabel("Рост, см")).toHaveValue("180");
  await expect(dialog.getByLabel("Вес, кг")).toHaveValue("80");
});

test("burn: a seeded workout with body weight shows ≈ kcal on /nutrition and in the summary", async ({ page }) => {
  const me = await nutritionUser(page);
  await logWeight(me.login, localDay(3), 80);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 10, sets: 3 }]);
  await page.goto("/nutrition");
  const burn = page.getByRole("region", { name: "Расход на тренировках" });
  await expect(burn.getByTestId("burn-total")).toHaveText("≈ 400 ккал");
  await expect(burn.getByRole("listitem")).toContainText("≈ 400 ккал");
  await page.goto(`/workouts/${(await latestWorkout(me.login)).id}`);
  await expect(page.getByRole("region", { name: "Расход калорий" })).toContainText("≈ 400");
});

test("clear returns the empty state", async ({ page }) => {
  await nutritionUser(page);
  await page.goto("/nutrition");
  await fillProfile(page, "Заполнить", { goal: "Похудение" });
  const card = page.getByRole("region", { name: "Норма на день" });
  await expect(card).toContainText("− 15 % (похудение)");
  await page.getByRole("button", { name: "Изменить данные" }).click();
  await page.getByRole("dialog", { name: "Данные для нормы" }).getByRole("button", { name: "Очистить данные питания" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Очистить" }).click();
  await expect(card).toContainText("Посчитаем вашу норму калорий");
});

test("saving the profile with the same weight does not add a weigh-in", async ({ page }) => {
  const me = await nutritionUser(page);
  await logWeight(me.login, localDay(3), 80);
  await setNutritionProfile(me.login, { heightCm: 180, birthYear: 1996, activityLevel: "MODERATE", nutritionGoal: "MAINTAIN", gender: "MALE" });
  await page.goto("/nutrition");
  await page.getByRole("button", { name: "Изменить данные" }).click();
  const dialog = page.getByRole("dialog", { name: "Данные для нормы" });
  await expect(dialog.getByLabel("Вес, кг")).toHaveValue("80");
  await dialog.getByRole("radio", { name: /^Высокая/ }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  expect(await weightEntries(me.login)).toEqual([{ date: localDay(3), weight: 80 }]);
});

test("profile errors are gone when the dialog is opened again", async ({ page }) => {
  await nutritionUser(page);
  await page.goto("/nutrition");
  const dialog = await fillProfile(page, "Заполнить", { gender: false });
  await expect(dialog.getByText("Укажите пол")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Заполнить" }).click();
  await expect(page.getByRole("dialog", { name: "Данные для нормы" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Данные для нормы" }).getByText("Укажите пол")).toHaveCount(0);
});

test("without body weight WHOOP workouts are still listed under the weight hint", async ({ page }) => {
  const me = await nutritionUser(page);
  await addFlagUser("whoop", me.login);
  await insertWhoopConnection(me.login);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 10, sets: 3 }]);
  const w = await latestWorkout(me.login);
  await insertWhoopWorkout(me.login, w.startedAt, w.finishedAt, 2092);
  await page.goto("/nutrition");
  const burn = page.getByRole("region", { name: "Расход на тренировках" });
  await expect(burn).toContainText("Укажите вес в анкете");
  await expect(burn.getByRole("listitem")).toContainText("≈ 500 ккал");
  await expect(burn.getByRole("listitem")).toContainText("WHOOP");
});
