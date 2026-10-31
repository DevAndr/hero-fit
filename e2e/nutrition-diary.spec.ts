import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, addFoodEntry, foodEntries, logWeight, setNutritionMacros, setNutritionProfile } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

const localDay = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - daysAgo * 86_400_000));

async function diaryUser(page: Page, withNorm = false) {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  await setNutritionMacros(me.login, false);
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
  const me = await diaryUser(page, true);
  await setNutritionMacros(me.login, true);
  await page.goto("/nutrition");
  await addEntry(page, "Завтрак", { name: "Овсянка", kcal: "300", protein: "10" });
  const breakfast = meal(page, "Завтрак");
  await expect(breakfast).toContainText("300 ккал");
  await expect(breakfast.getByRole("listitem")).toContainText("Б 10");
  const summary = page.getByRole("region", { name: "Итог дня" });
  await expect(summary.getByTestId("day-kcal")).toHaveText("300 / 2 760 ккал");
  await expect(summary.getByRole("img", { name: "Съедено 300 из 2 760 ккал, осталось 2 460" })).toBeVisible();
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
  // Копия ушла в другой день — без подтверждения не видно, что сработало
  await expect(page.getByText("Добавлено в сегодня")).toBeVisible();
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
  await expect(nav.getByRole("button", { name: "Следующий день" })).toBeDisabled();
  await nav.getByRole("link", { name: "Предыдущий день" }).click();
  await expect(nav.getByRole("heading")).toHaveText("Вчера");
});

test("over the norm shows +N", async ({ page }) => {
  await diaryUser(page, true);
  await page.goto("/nutrition");
  await addEntry(page, "Ужин", { name: "Пицца", kcal: "3000" });
  const ring = page.getByRole("region", { name: "Итог дня" }).getByRole("img", { name: "Съедено 3 000 из 2 760 ккал, 240 сверх нормы" });
  await expect(ring).toContainText("+240");
  await expect(ring).toContainText("сверх нормы");
});

test("simple input by default: only name and kcal, no macros in the day total", async ({ page }) => {
  await diaryUser(page, true);
  await page.goto("/nutrition");
  const summary = page.getByRole("region", { name: "Итог дня" });
  await expect(summary.getByRole("switch", { name: "Белки, жиры, углеводы" })).not.toBeChecked();
  await expect(summary.getByText("Белки", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Норма на день" }).getByText("Белки", { exact: true })).toHaveCount(0);
  await meal(page, "Завтрак").getByRole("button", { name: "Добавить" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить: Завтрак" });
  await expect(dialog.getByLabel("Ккал")).toBeVisible();
  await expect(dialog.getByLabel("Белки, г")).toHaveCount(0);
});

test("the macros switch shows the fields and is remembered", async ({ page }) => {
  await diaryUser(page);
  await page.goto("/nutrition");
  const toggle = page.getByRole("region", { name: "Итог дня" }).getByRole("switch", { name: "Белки, жиры, углеводы" });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(page.getByRole("region", { name: "Итог дня" }).getByRole("switch", { name: "Белки, жиры, углеводы" })).toBeChecked();
  await meal(page, "Обед").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("dialog", { name: "Добавить: Обед" }).getByLabel("Белки, г")).toBeVisible();
});

test("editing in simple mode keeps the macros already entered", async ({ page }) => {
  const me = await diaryUser(page);
  await addFoodEntry(me.login, { date: localDay(0), meal: "LUNCH", name: "Курица", kcal: 200, protein: 30 });
  await page.goto("/nutrition");
  const lunch = meal(page, "Обед");
  await expect(lunch.getByRole("listitem")).not.toContainText("Б 30");
  await lunch.getByRole("button", { name: "Действия: Курица" }).click();
  await page.getByRole("menuitem", { name: "Изменить" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить запись" });
  await dialog.getByLabel("Ккал").fill("220");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(lunch.getByRole("listitem")).toContainText("220 ккал");
  await page.getByRole("region", { name: "Итог дня" }).getByRole("switch", { name: "Белки, жиры, углеводы" }).click();
  await expect(lunch.getByRole("listitem")).toContainText("Б 30");
});

test("first visit asks for the input mode; advanced shows macros and is not asked again", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  await page.goto("/nutrition");
  const dialog = page.getByRole("dialog", { name: "Как будете вести дневник?" });
  await expect(dialog).toContainText("Поменять можно в любой момент");
  await dialog.getByRole("button", { name: /Продвинутый/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Итог дня" }).getByRole("switch", { name: "Белки, жиры, углеводы" })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("region", { name: "Итог дня" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Как будете вести дневник?" })).toHaveCount(0);
});

test("closing the mode dialog keeps simple input and does not ask again", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  await page.goto("/nutrition");
  const dialog = page.getByRole("dialog", { name: "Как будете вести дневник?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Итог дня" }).getByRole("switch", { name: "Белки, жиры, углеводы" })).not.toBeChecked();
  await expect.poll(async () => {
    await page.reload();
    await expect(page.getByRole("region", { name: "Итог дня" })).toBeVisible();
    return page.getByRole("dialog", { name: "Как будете вести дневник?" }).count();
  }).toBe(0);
});

test("deleted entry can be restored from the toast", async ({ page }) => {
  await diaryUser(page);
  await page.goto("/nutrition");
  await addEntry(page, "Ужин", { name: "Салат", kcal: "150" });
  const dinner = meal(page, "Ужин");
  await dinner.getByRole("button", { name: "Действия: Салат" }).click();
  await page.getByRole("menuitem", { name: "Удалить" }).click();
  await expect(dinner.getByRole("listitem")).toHaveCount(0);
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(dinner.getByRole("listitem")).toContainText("Салат");
  await expect(dinner.getByRole("listitem")).toContainText("150 ккал");
});

test("kcal typed with a thousands space is accepted", async ({ page }) => {
  await diaryUser(page);
  await page.goto("/nutrition");
  await addEntry(page, "Обед", { name: "Бизнес-ланч", kcal: "1 500" });
  await expect(meal(page, "Обед").getByRole("listitem")).toContainText("1 500 ккал");
});
