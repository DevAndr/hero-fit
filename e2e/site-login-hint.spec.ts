import { expect, test, type Page } from "@playwright/test";
import { createTelegramUser, notificationBodies, setCreatedAt, withDb } from "./db";
import { PASSWORD, runTick } from "./helpers";
import { mockTelegram } from "./telegram-webapp";

const HINT = "Аккаунт создан в Telegram. Задайте email и пароль — тогда прогресс будет доступен и в браузере";
const DAY = 86_400_000;
const newTelegramId = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

/** Аккаунт из Mini App без пароля (зарегистрирован daysAgo дней назад) и вход в него через /tg. */
async function telegramUser(page: Page, daysAgo: number) {
  const id = newTelegramId();
  const login = await createTelegramUser(id);
  await setCreatedAt(login, new Date(Date.now() - daysAgo * DAY));
  await mockTelegram(page, { id, firstName: "Маша" });
  await page.goto("/tg");
  await expect(page).toHaveURL(/\/dashboard$/);
  return { id, login };
}

const card = (page: Page) => page.getByRole("region", { name: "Входите и на сайте" });

test("no hint on the first days without workouts", async ({ page }) => {
  await telegramUser(page, 1);
  await expect(page.locator("main")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("hint after 3 days leads to the site login block; setting a password removes it", async ({ page }) => {
  const { id } = await telegramUser(page, 4);
  await expect(card(page)).toContainText(HINT);
  // Адрес ссылки — проверкой атрибута, переход — goto: после клиентского перехода форма настроек могла ещё не ожить
  await expect(card(page).getByRole("link", { name: "Задать пароль" })).toHaveAttribute("href", "/settings#site-login");
  await page.goto("/settings#site-login");
  const block = page.getByRole("region", { name: "Вход на сайте" });
  await block.getByLabel("Email").fill(`tg${id}@test.local`);
  await block.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await block.getByLabel("Повторите пароль").fill(PASSWORD);
  await block.getByRole("button", { name: "Сохранить" }).click();
  await expect(block.getByText("Теперь можно входить на сайте по email и паролю")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator("main")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("hide removes the hint for good", async ({ page }) => {
  await telegramUser(page, 4);
  await card(page).getByRole("button", { name: "Скрыть" }).click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("the tick skips accounts that hid the hint", async ({ request }) => {
  // Скрыто уже в базе: тик соседних тестов идёт по всей базе и мог бы опередить нажатие «Скрыть»
  const login = await createTelegramUser(newTelegramId());
  await setCreatedAt(login, new Date(Date.now() - 4 * DAY));
  await withDb((db) => db.query(`update "User" set "siteLoginHintHiddenAt" = now() where login = $1`, [login]));
  await runTick(request, new Date(), "siteLogin");
  expect(await notificationBodies(login)).not.toContain(HINT);
});

test("the tick adds one feed entry", async ({ page, request }) => {
  const { login } = await telegramUser(page, 4);
  await runTick(request, new Date(), "siteLogin");
  await runTick(request, new Date(), "siteLogin");
  expect((await notificationBodies(login)).filter((b) => b === HINT)).toHaveLength(1);
});
