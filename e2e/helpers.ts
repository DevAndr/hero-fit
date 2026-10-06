import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Secret123";

let counter = 0;
export function uniqueLogin() {
  return `e2e_${Date.now().toString(36)}_${process.pid}_${counter++}`;
}

/** Регистрирует нового пользователя и оставляет его залогиненным на /dashboard. */
export async function registerUser(page: Page, name = "Герой") {
  const login = uniqueLogin();
  await page.goto("/register");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Email").fill(`${login}@test.local`);
  await page.getByLabel("Имя (необязательно)").fill(name);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Повторите пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { login, email: `${login}@test.local` };
}
