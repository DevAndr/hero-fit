import { expect, test } from "@playwright/test";
import { createTelegramUser } from "./db";
import { PASSWORD } from "./helpers";

/** Уникальный Telegram id на тест (фейковый Bot API и база общие для воркеров). */
export const newTelegramId = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

test("passwordless account cannot sign in with a password", async ({ page }) => {
  const login = await createTelegramUser(newTelegramId());
  await page.goto("/login");
  await page.getByLabel("Логин или email").fill(login);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
});

test("forgot password answers neutrally", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${newTelegramId()}@test.local`);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByText("Если аккаунт с таким email существует")).toBeVisible();
});

test("pages may be framed only by Telegram", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'self' https://web.telegram.org");
  expect(res.headers()["x-frame-options"]).toBeUndefined();
});
