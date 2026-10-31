import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, addFoodEntry, foodEntries, logWeight, setNutritionProfile } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

const localDay = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - daysAgo * 86_400_000));

async function diaryUser(page: Page, withNorm = false) {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  if (withNorm) {
    // Мужчина 1996 г. р., 180 см, 80 кг, средняя активность → 2 760 ккал
    await setNutritionProfile(me.login, { heightCm: 180, birthYear: 1996, activityLevel: "MODERATE", nutritionGoal: "MAINTAIN", gender: "MALE" });
    await logWeight(me.login, localDay(0), 80);
  }
  return me;
}

const meal = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function addEntry(page: Page, mealName: string, food: { name: string; kcal: string; protein?: string }) {
  await meal(page, mealName).getByRole("button", { name: "Добавить" }).click();
  const dialog = page.getByRole("dialog", { name: `Добавить: ${mealName}` });
  await dialog.getByLabel("Название").fill(food.name);
  await dialog.getByLabel("Ккал").fill(food.kcal);
  if (food.protein) await dialog.getByLabel("Белки, г").fill(food.protein);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
}

test("add breakfast → meal total and day total; with a profile shows what is left", async ({ page }) => {
  await diaryUser(page, true);
  await page.goto("/nutrition");
  await addEntry(page, "Завтрак", { name: "Овсянка", kcal: "300", protein: "10" });
  const breakfast = meal(page, "Завтрак");
  await expect(breakfast).toContainText("300 ккал");
  await expect(breakfast.getByRole("listitem")).toContainText("Б 10");
  const summary = page.getByRole("region", { name: "Итог дня" });
  await expect(summary.getByTestId("day-kcal")).toHaveText("300 / 2 760 ккал");
  await expect(summary).toContainText("Осталось 2 460");
});

test("edit and delete an entry", async ({ page }) => {
  await diaryUser(page);
  await page.goto("/nutrition");
  await addEntry(page, "Обед", { name: "Гречка", kcal: "350" });
  const lunch = meal(page, "Обед");
  await lunch.getByRole("button", { name: "Действия: Гречка" }).click();
  await page.getByRole("menuitem", { name: "Изменить" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить запись" });
  await dialog.getByLabel("Ккал").fill("400");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(lunch.getByRole("listitem")).toContainText("400 ккал");
  await lunch.getByRole("button", { name: "Действия: Гречка" }).click();
  await page.getByRole("menuitem", { name: "Удалить" }).click();
  await expect(lunch.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByTestId("day-kcal")).toHaveText("0 ккал");
});

test("recent foods fill the form; names are case-insensitive", async ({ page }) => {
  const me = await diaryUser(page);
  await addFoodEntry(me.login, { date: localDay(2), meal: "BREAKFAST", name: "овсянка", kcal: 250, createdAt: new Date(Date.now() - 2 * 86_400_000) });
  await addFoodEntry(me.login, { date: localDay(1), meal: "BREAKFAST", name: "Овсянка", kcal: 300, createdAt: new Date(Date.now() - 86_400_000) });
  await page.goto("/nutrition");
  await meal(page, "Перекус").getByRole("button", { name: "Добавить" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить: Перекус" });
  const recents = dialog.getByRole("group", { name: "Недавние" });
  await expect(recents.getByRole("button")).toHaveText(["Овсянка"]);
  await recents.getByRole("button", { name: "Овсянка" }).click();
  await expect(dialog.getByLabel("Ккал")).toHaveValue("300");
  await expect(dialog.getByLabel("Название")).toHaveValue("Овсянка");
});

test("repeat yesterday's meal; a double click does not duplicate", async ({ page }) => {
  const me = await diaryUser(page);
  await addFoodEntry(me.login, { date: localDay(1), meal: "BREAKFAST", name: "Яйца", kcal: 160 });
  await addFoodEntry(me.login, { date: localDay(1), meal: "BREAKFAST", name: "Тост", kcal: 120 });
  await page.goto("/nutrition");
  await meal(page, "Завтрак").getByRole("button", { name: "Повторить вчерашний" }).dblclick();
  await expect(meal(page, "Завтрак").getByRole("listitem")).toHaveCount(2);
  await expect.poll(() => foodEntries(me.login, localDay(0))).toHaveLength(2);
  expect((await foodEntries(me.login, localDay(0))).map((e) => e.name)).toEqual(["Яйца", "Тост"]);
});

test("add to today from yesterday", async ({ page }) => {
  const me = await diaryUser(page);
  await addFoodEntry(me.login, { date: localDay(1), meal: "DINNER", name: "Рыба", kcal: 280 });
  await page.goto(`/nutrition?date=${localDay(1)}`);
  await expect(page.getByRole("navigation", { name: "День дневника" })).toContainText("Вчера");
  await meal(page, "Ужин").getByRole("button", { name: "Действия: Рыба" }).click();
  await page.getByRole("menuitem", { name: "Добавить сегодня" }).click();
  await expect.poll(() => foodEntries(me.login, localDay(0))).toEqual([{ name: "Рыба", meal: "DINNER", kcal: 280 }]);
  expect(await foodEntries(me.login, localDay(1))).toHaveLength(1);
});

test("adding on a past day saves to that day", async ({ page }) => {
  const me = await diaryUser(page);
  await page.goto(`/nutrition?date=${localDay(2)}`);
  await addEntry(page, "Обед", { name: "Суп", kcal: "200" });
  await expect(meal(page, "Обед").getByRole("listitem")).toContainText("Суп");
  expect(await foodEntries(me.login, localDay(2))).toEqual([{ name: "Суп", meal: "LUNCH", kcal: 200 }]);
  expect(await foodEntries(me.login, localDay(0))).toEqual([]);
});

test("next day is disabled on today; a future date opens today", async ({ page }) => {
  await diaryUser(page);
  await page.goto("/nutrition?date=2999-01-01");
  const nav = page.getByRole("navigation", { name: "День дневника" });
  await expect(nav.getByRole("heading")).toHaveText("Сегодня");
  await expect(nav.getByLabel("Следующий день")).toHaveAttribute("aria-disabled", "true");
  await nav.getByRole("link", { name: "Предыдущий день" }).click();
  await expect(nav.getByRole("heading")).toHaveText("Вчера");
});

test("over the norm shows +N", async ({ page }) => {
  await diaryUser(page, true);
  await page.goto("/nutrition");
  await addEntry(page, "Ужин", { name: "Пицца", kcal: "3000" });
  await expect(page.getByRole("region", { name: "Итог дня" })).toContainText("+240 сверх нормы");
});
