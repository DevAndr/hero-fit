import { expect, test } from "@playwright/test";
import { PASSWORD, registerUser } from "./helpers";

test("guest is redirected to login and back after sign-in", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page).toHaveURL(/\/login\?next=%2Fexercises$/);
});

test("register → app shell → logout → login", async ({ page }) => {
  const { login } = await registerUser(page, "Тестовый Герой");

  await expect(page.getByRole("heading", { name: "Привет, Тестовый Герой!" })).toBeVisible();
  await expect(page.getByText("LVL 1")).toBeVisible();

  await page.getByRole("button", { name: "Меню профиля" }).click();
  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/exercises");
  await expect(page).toHaveURL(/\/login\?next=%2Fexercises$/);
  await page.getByLabel("Логин или email").fill(login);
  await page.getByLabel("Пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/exercises$/);
});

test("registration shows validation errors", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Логин").fill("ab");
  await page.getByLabel("Пароль", { exact: true }).fill("weak");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText("Логин — минимум 3 символа")).toBeVisible();
  await expect(page.getByText("Пароль — минимум 8 символов")).toBeVisible();
  await expect(page.getByText("Без согласия на обработку данных зарегистрироваться нельзя")).toBeVisible();
  // Введённый логин не теряется после ошибки.
  await expect(page.getByLabel("Логин")).toHaveValue("ab");
});

test("consent checkbox survives a failed submit and links to the privacy policy", async ({ page }) => {
  await page.goto("/register");
  const consent = page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ });
  await consent.click();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText("Логин — минимум 3 символа")).toBeVisible();
  await expect(consent).toBeChecked();
  await expect(page.getByText("Без согласия на обработку данных зарегистрироваться нельзя")).toBeHidden();
  await expect(page.getByRole("link", { name: "политике конфиденциальности" })).toHaveAttribute("href", "/privacy");
});
