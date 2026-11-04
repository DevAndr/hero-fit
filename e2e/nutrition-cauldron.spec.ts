import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, logWeight, setNutritionMacros, setNutritionProfile } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

// Котёл калорий (флаг nutrition_cauldron, у пользователя — не глобальный): зелье — доля нормы, сверх нормы — перелив.
// С движением — чтобы проверить всплывающее «+N» над котлом.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function cauldronUser(page: Page, flag = true) {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  if (flag) await addFlagUser("nutrition_cauldron", me.login);
  await setNutritionMacros(me.login, false);
  // Мужчина 1996 г. р., 180 см, 80 кг, средняя активность → 2 760 ккал
  await setNutritionProfile(me.login, { heightCm: 180, birthYear: 1996, activityLevel: "MODERATE", nutritionGoal: "MAINTAIN", gender: "MALE" });
  await logWeight(me.login, today(), 80);
  return me;
}

async function addEntry(page: Page, mealName: string, kcal: string) {
  await page.getByRole("region", { name: mealName, exact: true }).getByRole("button", { name: "Добавить" }).click();
  const dialog = page.getByRole("dialog", { name: `Добавить: ${mealName}` });
  await dialog.getByLabel("Название").fill("Еда");
  await dialog.getByLabel("Ккал").fill(kcal);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
}

test("with the flag the day summary shows the cauldron: potion share, «+N» from the pot, spill over the norm", async ({ page }) => {
  await cauldronUser(page);
  await page.goto("/nutrition");
  const summary = page.getByRole("region", { name: "Итог дня" });
  const bar = summary.getByTestId("cauldron-bar");
  await expect(bar).toHaveAccessibleName("Съедено 0 из 2 760 ккал, осталось 2 760");
  await expect(summary.getByTestId("ring-halo")).toHaveCount(0);

  await addEntry(page, "Завтрак", "1380");
  await expect(bar).toHaveAccessibleName("Съедено 1 380 из 2 760 ккал, осталось 1 380");
  await expect(summary.getByTestId("cauldron-gain")).toHaveText("+1 380");
  await expect(bar).toContainText("1 380осталось");
  // Зелье — половина жёлоба
  await expect(summary.getByTestId("cauldron-fill")).toHaveCSS("clip-path", /inset\(0px 50% 0px 0px round/);
  await expect(bar).not.toHaveAttribute("data-over");

  await addEntry(page, "Обед", "1620");
  await expect(bar).toHaveAccessibleName("Съедено 3 000 из 2 760 ккал, 240 сверх нормы");
  await expect(bar).toHaveAttribute("data-over", "true");
  await expect(bar).toContainText("+240сверх нормы");
});

test("without the flag — the usual ring", async ({ page }) => {
  await cauldronUser(page, false);
  await page.goto("/nutrition");
  const summary = page.getByRole("region", { name: "Итог дня" });
  await expect(summary.getByRole("img", { name: "Съедено 0 из 2 760 ккал, осталось 2 760" })).toBeVisible();
  await expect(summary.getByTestId("cauldron-bar")).toHaveCount(0);
});
