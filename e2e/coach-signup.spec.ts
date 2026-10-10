import { expect, test, type Page } from "@playwright/test";
import { withDb } from "./db";
import { PASSWORD, uniqueLogin } from "./helpers";

async function fillRegister(page: Page, login: string) {
  await page.goto("/register");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Email").fill(`${login}@test.local`);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Повторите пароль").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ }).click();
}

const nickFor = (login: string) => `C_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

test("signing up as a coach opens the clients page with an invite", async ({ page }) => {
  const login = uniqueLogin();
  await fillRegister(page, login);
  await expect(page.getByLabel("Публичный ник")).toHaveCount(0);
  await page.getByRole("checkbox", { name: /Я тренер/ }).click();
  await page.getByLabel("Публичный ник").fill(nickFor(login));
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/coach$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Клиенты", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Пригласить клиента" })).toBeVisible();
  const row = await withDb(async (db) => (await db.query(`select "isCoach", nickname, "coachCode" from "User" where login = $1`, [login])).rows[0]);
  expect(row).toMatchObject({ isCoach: true, nickname: nickFor(login) });
  expect(row.coachCode).toBeTruthy();
});

test("coach signup: nickname is required and must be free", async ({ page }) => {
  const first = uniqueLogin();
  await fillRegister(page, first);
  await page.getByRole("checkbox", { name: /Я тренер/ }).click();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText("Ник — минимум 3 символа")).toBeVisible();
  // Галочка и введённые поля сохраняются после ошибки
  await expect(page.getByRole("checkbox", { name: /Я тренер/ })).toBeChecked();
  await page.getByLabel("Публичный ник").fill(nickFor(first));
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Повторите пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/coach$/, { timeout: 15_000 });

  await page.context().clearCookies();
  const second = uniqueLogin();
  await fillRegister(page, second);
  await page.getByRole("checkbox", { name: /Я тренер/ }).click();
  await page.getByLabel("Публичный ник").fill(nickFor(first).toUpperCase());
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText("Этот ник уже занят")).toBeVisible();
});
