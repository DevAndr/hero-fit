import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, logWeight, setNutritionMacros, setNutritionProfile } from "./db";
import { registerUser } from "./helpers";
import { E2E_TZ } from "./tz";

// Вид шкалы калорий (флаг nutrition_bar_styles, у пользователя — не глобальный): котёл (по умолчанию), кольцо, пончик.
// С движением — чтобы проверить всплывающее «+N» над котлом.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function cauldronUser(page: Page, flag = true) {
  const me = await registerUser(page);
  await addFlagUser("nutrition", me.login);
  if (flag) await addFlagUser("nutrition_bar_styles", me.login);
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

async function openBarDialog(page: Page) {
  await page.getByRole("region", { name: "Итог дня" }).getByRole("button", { name: "Настройки итога дня" }).click();
  await page.getByRole("menuitem", { name: "Сменить вид шкалы ккал…" }).click();
  return page.getByRole("dialog", { name: "Вид шкалы калорий" });
}

test("«⋮» → «Change the kcal bar»: dialog with previews of every style, the choice is saved", async ({ page }) => {
  await cauldronUser(page);
  await page.goto("/nutrition");
  const summary = page.getByRole("region", { name: "Итог дня" });
  await expect(summary.getByTestId("cauldron-bar")).toBeVisible();

  let dialog = await openBarDialog(page);
  const cauldron = dialog.getByRole("button", { name: /Котёл с зельем/ });
  const ring = dialog.getByRole("button", { name: /Кольцо/ });
  await expect(cauldron).toHaveAttribute("aria-pressed", "true");
  await expect(ring).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: /Пончик/ })).toHaveAttribute("aria-pressed", "false");
  // Превью — на сегодняшних цифрах
  await expect(cauldron.getByTestId("cauldron-bar")).toContainText("2 760осталось");
  await expect(ring).toContainText("2 760");

  await ring.click();
  await expect(dialog).toBeHidden();
  await expect(summary.getByTestId("cauldron-bar")).toHaveCount(0);
  await expect(summary.getByTestId("ring-halo")).toBeVisible();
  await page.reload();
  await expect(summary.getByTestId("ring-halo")).toBeVisible();

  dialog = await openBarDialog(page);
  await expect(dialog.getByRole("button", { name: /Кольцо/ })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: /Котёл с зельем/ }).click();
  await expect(summary.getByTestId("cauldron-bar")).toBeVisible();
  await page.reload();
  await expect(summary.getByTestId("cauldron-bar")).toBeVisible();
});

test("donut: glaze opens by the share of the norm, over the norm — full glaze and a red halo", async ({ page }) => {
  await cauldronUser(page);
  await page.goto("/nutrition");
  const summary = page.getByRole("region", { name: "Итог дня" });
  const dialog = await openBarDialog(page);
  await expect(dialog.getByRole("button", { name: /Пончик/ }).getByTestId("donut-ring")).toContainText("2 760");
  await dialog.getByRole("button", { name: /Пончик/ }).click();
  const donut = summary.getByTestId("donut-ring");
  await expect(donut).toHaveAccessibleName("Съедено 0 из 2 760 ккал, осталось 2 760");
  await expect(summary.getByTestId("cauldron-bar")).toHaveCount(0);

  await addEntry(page, "Завтрак", "690");
  await expect(donut).toHaveAccessibleName("Съедено 690 из 2 760 ккал, осталось 2 070");
  await expect(summary.getByTestId("donut-gain")).toHaveText("+690");
  // Глазурь — четверть круга
  await expect(summary.getByTestId("donut-glaze")).toHaveCSS("--donut-share", "25%");
  await expect(summary.getByTestId("donut-halo")).toHaveCount(0);

  await addEntry(page, "Обед", "2310");
  await expect(donut).toHaveAccessibleName("Съедено 3 000 из 2 760 ккал, 240 сверх нормы");
  await expect(donut).toHaveAttribute("data-over", "true");
  await expect(donut).toContainText("+240сверх нормы");
  await expect(summary.getByTestId("donut-halo")).toBeVisible();
  await page.reload();
  await expect(summary.getByTestId("donut-ring")).toBeVisible();
});

test("without the flag — the usual ring and no bar item in the menu", async ({ page }) => {
  await cauldronUser(page, false);
  await page.goto("/nutrition");
  const summary = page.getByRole("region", { name: "Итог дня" });
  await expect(summary.getByRole("img", { name: "Съедено 0 из 2 760 ккал, осталось 2 760" })).toBeVisible();
  await expect(summary.getByTestId("cauldron-bar")).toHaveCount(0);
  await summary.getByRole("button", { name: "Настройки итога дня" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Белки, жиры, углеводы" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Сменить вид шкалы ккал…" })).toHaveCount(0);
});
