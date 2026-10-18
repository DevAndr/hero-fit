import { expect, test, type Page } from "@playwright/test";
import { addToWorkout, registerUser } from "./helpers";

const PRESS = "Жим ногами";
const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test("star on /exercises: favorites section, filter, unstar", async ({ page }) => {
  await registerUser(page);
  await page.goto("/exercises");
  await expect(page.getByRole("region", { name: "Избранное" })).toHaveCount(0);
  await page.getByRole("button", { name: `В избранное: ${PRESS}` }).click();
  const favorites = page.getByRole("region", { name: "Избранное" });
  await expect(favorites).toContainText(PRESS);
  // Секция «Избранное» — первая
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Избранное");

  await page.getByRole("link", { name: "Избранное" }).click();
  await expect(page).toHaveURL(/group=favorites/);
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([PRESS]);

  await page.getByRole("button", { name: `Убрать из избранного: ${PRESS}` }).click();
  await page.reload();
  await expect(page.getByText("Отмечайте ★ упражнения, которые делаете чаще всего")).toBeVisible();
});

test("star while picking in a workout: filter chip, first after reload", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  const list = async () => {
    if (desktop(page)) return page.getByRole("complementary", { name: "Каталог упражнений" });
    if (!(await page.getByRole("dialog").isVisible())) await page.getByRole("button", { name: "Добавить упражнение" }).click();
    return page.getByRole("dialog");
  };
  let scope = await list();
  await scope.getByLabel("Поиск упражнения").fill(PRESS);
  await scope.getByRole("button", { name: `В избранное: ${PRESS}` }).click();
  await expect(scope.getByRole("button", { name: `Убрать из избранного: ${PRESS}` })).toHaveAttribute("aria-pressed", "true");
  // Звезда не добавляет и не выбирает упражнение
  if (desktop(page)) await expect(page.getByRole("region", { name: PRESS })).toHaveCount(0);
  else await expect(scope.getByRole("button", { name: /^Добавить$/ })).toBeDisabled();

  await scope.getByLabel("Поиск упражнения").fill("");
  await scope.getByRole("button", { name: "Избранное", exact: true }).click();
  const names = scope.getByRole("button", { name: /^(В избранное|Убрать из избранного):/ });
  await expect(names).toHaveCount(1);

  // После перезагрузки — первым в общем списке
  if (!desktop(page)) await page.keyboard.press("Escape");
  await page.reload();
  scope = await list();
  await expect(scope.getByRole("button", { name: /^(В избранное|Убрать из избранного):/ }).first()).toHaveAccessibleName(`Убрать из избранного: ${PRESS}`);
});

test("star is shared between lists on the page", async ({ page }) => {
  test.skip(!desktop(page), "каталог — только на ПК");
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Приседания со штангой"]);
  const catalog = page.getByRole("complementary", { name: "Каталог упражнений" });
  await catalog.getByLabel("Поиск упражнения").fill(PRESS);
  await catalog.getByRole("button", { name: `В избранное: ${PRESS}` }).click();

  await page.getByRole("region", { name: "Приседания со штангой" }).getByRole("button", { name: "Действия с упражнением" }).click();
  await page.getByRole("menuitem", { name: "Заменить" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Другое упражнение…" }).click();
  await expect(dialog.getByRole("button", { name: `Убрать из избранного: ${PRESS}` })).toBeVisible();
});

test("a star in the workout does not reorder the list until the next load", async ({ page }) => {
  test.skip(!desktop(page), "каталог — только на ПК");
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  const catalog = page.getByRole("complementary", { name: "Каталог упражнений" });
  const first = () => catalog.getByTestId("catalog-item").first().locator("span.font-medium").textContent();
  const before = await first();
  expect(before).not.toBe(PRESS);
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/training"));
  await catalog.getByRole("button", { name: `В избранное: ${PRESS}` }).click();
  await saved;
  await page.waitForTimeout(500);
  expect(await first()).toBe(before);
});

test("keyboard: Enter on a star in the desktop catalog toggles it, not a drag", async ({ page }) => {
  test.skip(!desktop(page), "каталог — только на ПК");
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  const catalog = page.getByRole("complementary", { name: "Каталог упражнений" });
  await catalog.getByRole("button", { name: `В избранное: ${PRESS}` }).focus();
  await page.keyboard.press("Enter");
  await expect(catalog.getByRole("button", { name: `Убрать из избранного: ${PRESS}` })).toHaveAttribute("aria-pressed", "true");
});

test("/exercises: switching filter chips keeps stars in sync", async ({ page }) => {
  await registerUser(page);
  await page.goto("/exercises");
  await page.getByRole("button", { name: `В избранное: ${PRESS}` }).click();
  await expect(page.getByRole("region", { name: "Избранное" })).toContainText(PRESS);
  await page.goto("/exercises?group=CHEST");
  await page.getByRole("link", { name: "Все", exact: true }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(page.getByRole("region", { name: "Избранное" }).getByRole("button", { name: new RegExp(`избранного: ${PRESS}|избранное: ${PRESS}`) })).toHaveAttribute("aria-pressed", "true");
});
