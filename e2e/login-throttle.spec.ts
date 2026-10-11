import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, registerUser } from "./helpers";
import { e2eInitData } from "./telegram-webapp";

async function tryLogin(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин или email").fill(identifier);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

test("5 wrong passwords lock the login for 15 minutes, other logins unaffected", async ({ browser }) => {
  const reg = await browser.newContext();
  const { login } = await registerUser(await reg.newPage());
  const other = await browser.newContext();
  const { login: otherLogin } = await registerUser(await other.newPage());
  await reg.close();
  await other.close();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (let i = 0; i < 5; i++) {
    await tryLogin(page, login, "Wrong12345");
    await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
  }
  await tryLogin(page, login, PASSWORD);
  await expect(page.getByText(/Слишком много попыток входа. Попробуйте через 1[45] мин\./)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await tryLogin(page, otherLogin, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await ctx.close();
});

test("unknown logins are throttled the same way", async ({ page }) => {
  const ghost = `ghost${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    await tryLogin(page, ghost, "Wrong12345");
    await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
  }
  await tryLogin(page, ghost, "Wrong12345");
  await expect(page.getByText(/Слишком много попыток входа/)).toBeVisible();
});

test("Mini App link is throttled too", async ({ browser, request }) => {
  const reg = await browser.newContext();
  const { login } = await registerUser(await reg.newPage());
  await reg.close();
  const initData = e2eInitData({ id: String(Date.now() * 1000 + 7), firstName: "Маша" });
  const link = (password: string) => request.post("/api/telegram/auth", { data: { initData, action: "link", identifier: login, password } });

  for (let i = 0; i < 5; i++) expect((await link("Wrong12345")).status()).toBe(401);
  const locked = await link(PASSWORD);
  expect(locked.status()).toBe(429);
  expect(await locked.json()).toMatchObject({ error: "throttled", message: expect.stringMatching(/Слишком много попыток входа/) });
});
