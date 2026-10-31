import { expect, test, type Page } from "@playwright/test";
import { achievementCodes, addFlagUser, addFoodEntry, setNutritionMacros } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

const localDay = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - daysAgo * 86_400_000));

async function addEntry(page: Page, mealName: string, name: string, kcal: string) {
  await page.getByRole("region", { name: mealName, exact: true }).getByRole("button", { name: "Добавить" }).click();
  const dialog = page.getByRole("dialog", { name: `Добавить: ${mealName}` });
  await dialog.getByLabel("Название").fill(name);
  await dialog.getByLabel("Ккал").fill(kcal);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
}

test("a week of diary days: streak achievements, streak line and the dashboard card", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  await setNutritionMacros(me.login, false);
  // 6 зачётных дней до сегодня: 2 приёма по 500 ккал
  for (let i = 1; i <= 6; i++) {
    await addFoodEntry(me.login, { date: localDay(i), meal: "BREAKFAST", name: "Каша", kcal: 500 });
    await addFoodEntry(me.login, { date: localDay(i), meal: "LUNCH", name: "Суп", kcal: 500 });
  }
  await page.goto("/nutrition");
  await addEntry(page, "Завтрак", "Каша", "500");
  // Один приём — день ещё не зачтён, серия идёт со вчера (6), ачивки за 7 нет
  await expect(page.getByRole("region", { name: "Итог дня" })).toContainText("Серия дневника: 6 дней");
  await addEntry(page, "Обед", "Суп", "500");
  await expect(page.getByRole("region", { name: "Итог дня" })).toContainText("Серия дневника: 7 дней");
  await expect.poll(() => achievementCodes(me.login)).toEqual(expect.arrayContaining(["diary:3", "diary:7"]));

  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Питание сегодня" });
  await expect(card).toContainText("Съедено 1 000 ккал");
  await expect(card).toContainText("Серия дневника: 7 дней");
  await card.getByRole("link", { name: "Открыть дневник" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);
});

test("without the flag there is no nutrition card on the dashboard", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Питание сегодня" })).toHaveCount(0);
});
