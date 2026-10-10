import { expect, test, type Page } from "@playwright/test";
import { coachProfile, createTelegramUser, enableCoach, linkTelegram, telegramChat, withDb } from "./db";
import { PASSWORD, registerUser } from "./helpers";
import { e2eInitData, mockTelegram } from "./telegram-webapp";

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

// ───────────────────────────── Mini App: вход и регистрация ─────────────────────────────

async function telegramUserRows(telegramId: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ login: string; email: string | null; passwordHash: string | null }>(
      `select login, email, "passwordHash" from "User" where "telegramChatId" = $1::bigint`,
      [telegramId],
    );
    return rows;
  });
}

async function registerViaTelegram(page: Page, id: string, firstName = "Маша", startParam?: string) {
  await mockTelegram(page, { id, firstName, startParam });
  await page.goto("/tg");
  await expect(page.getByText(`Привет, ${firstName}! Hero Fit — тренировки с уровнями, ачивками и боссами`)).toBeVisible();
  await page.getByRole("checkbox", { name: /Согласен с политикой обработки персональных данных/ }).check();
  await page.getByRole("button", { name: "Начать" }).click();
}

test("new person: consent → Начать → dashboard", async ({ page }) => {
  const id = newTelegramId();
  await mockTelegram(page, { id, firstName: "Маша" });
  await page.goto("/tg");
  await expect(page.getByText("Привет, Маша! Hero Fit — тренировки с уровнями, ачивками и боссами")).toBeVisible();
  await expect(page.getByRole("button", { name: "Начать" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Согласен с политикой обработки персональных данных/ }).check();
  await page.getByRole("button", { name: "Начать" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const rows = await telegramUserRows(id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ login: `tg${id}`, email: null, passwordHash: null });
});

test("returning person goes straight to the dashboard", async ({ browser }) => {
  const id = newTelegramId();
  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await registerViaTelegram(firstPage, id);
  await expect(firstPage).toHaveURL(/\/dashboard$/);
  await first.close();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await mockTelegram(page, { id, firstName: "Маша" });
  await page.goto("/tg");
  await expect(page).toHaveURL(/\/dashboard$/);
  await ctx.close();
});

test("bot-linked account signs in automatically", async ({ browser }) => {
  const id = newTelegramId();
  const site = await browser.newContext();
  const { login } = await registerUser(await site.newPage());
  await site.close();
  await linkTelegram(login, id);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await mockTelegram(page, { id, firstName: "Другое имя" });
  await page.goto("/tg");
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await telegramUserRows(id)).map((r) => r.login)).toEqual([login]);
  await ctx.close();
});

test("existing account: sign in and link", async ({ browser }) => {
  const id = newTelegramId();
  const site = await browser.newContext();
  const { login } = await registerUser(await site.newPage());
  await site.close();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await mockTelegram(page, { id, firstName: "Маша" });
  await page.goto("/tg");
  await page.getByRole("button", { name: "У меня уже есть аккаунт" }).click();
  await page.getByLabel("Логин или email").fill(login);
  await page.getByLabel("Пароль", { exact: true }).fill("Wrong12345");
  await page.getByRole("button", { name: "Войти и привязать Telegram" }).click();
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти и привязать Telegram" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await telegramChat(login)).toBe(id);
  await ctx.close();
});

test("link moves Telegram from another account", async ({ browser, request }) => {
  const id = newTelegramId();
  const tgLogin = await createTelegramUser(id);
  const site = await browser.newContext();
  const { login } = await registerUser(await site.newPage());
  await site.close();

  const res = await request.post("/api/telegram/auth", {
    data: { initData: e2eInitData({ id, firstName: "Маша" }), action: "link", identifier: login, password: PASSWORD },
  });
  expect(await res.json()).toMatchObject({ status: "ok" });
  expect(await telegramChat(tgLogin)).toBeNull();
  expect(await telegramChat(login)).toBe(id);
});

test("double tap registers once", async ({ request }) => {
  const id = newTelegramId();
  const initData = e2eInitData({ id, firstName: "Маша" });
  const [a, b] = await Promise.all([
    request.post("/api/telegram/auth", { data: { initData, action: "register", consent: true } }),
    request.post("/api/telegram/auth", { data: { initData, action: "register", consent: true } }),
  ]);
  expect(await a.json()).toMatchObject({ status: "ok" });
  expect(await b.json()).toMatchObject({ status: "ok" });
  expect(await telegramUserRows(id)).toHaveLength(1);
});

test("register without consent is refused", async ({ request }) => {
  const res = await request.post("/api/telegram/auth", {
    data: { initData: e2eInitData({ id: newTelegramId(), firstName: "Маша" }), action: "register" },
  });
  expect(res.status()).toBe(400);
});

test("coach invite via start_param", async ({ browser, page }) => {
  const coachCtx = await browser.newContext();
  const { login: coach } = await registerUser(await coachCtx.newPage());
  await coachCtx.close();
  const code = await enableCoach(coach, `C${newTelegramId().slice(-8)}`);

  await registerViaTelegram(page, newTelegramId(), "Маша", `join_${code}`);
  await expect(page).toHaveURL(new RegExp(`/coach/join/${code}$`));
  await expect(page.getByRole("heading", { name: /просит доступ к вашим тренировкам/ })).toBeVisible();
});

test("tampered initData shows the error", async ({ page }) => {
  await mockTelegram(page, { id: newTelegramId(), firstName: "Маша", tamper: true });
  await page.goto("/tg");
  await expect(page.getByText("Не получилось войти. Откройте Hero Fit из Telegram заново")).toBeVisible();
});

test("/tg in a plain browser goes to login", async ({ page }) => {
  await mockTelegram(page);
  await page.goto("/tg");
  await expect(page).toHaveURL(/\/login$/);
});

test("set site login, then sign in on /login", async ({ page, context }) => {
  const id = newTelegramId();
  await registerViaTelegram(page, id);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Вход на сайте" });
  const email = `tg${id}@test.local`;
  await card.getByLabel("Email").fill(email);
  await card.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await card.getByLabel("Повторите пароль").fill(PASSWORD);
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText("Теперь можно входить на сайте по email и паролю")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Вход на сайте" })).toHaveCount(0);

  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Логин или email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("site login with a taken email", async ({ browser, page }) => {
  const other = await browser.newContext();
  const { login } = await registerUser(await other.newPage());
  await other.close();

  await registerViaTelegram(page, newTelegramId());
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Вход на сайте" });
  await card.getByLabel("Email").fill(`${login}@test.local`);
  await card.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await card.getByLabel("Повторите пароль").fill(PASSWORD);
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText("Этот email уже зарегистрирован")).toBeVisible();
});

test("Mini App session keeps frame cookies after refresh rotation", async ({ page, context }) => {
  await registerViaTelegram(page, newTelegramId());
  await expect(page).toHaveURL(/\/dashboard$/);
  const rt = (await context.cookies()).find((c) => c.name === "hf_rt");
  expect(rt?.sameSite).toBe("None");

  // Access истёк — proxy ротирует refresh и ставит cookies снова, тоже для фрейма
  const res = await page.request.fetch("/dashboard", { headers: { cookie: `hf_rt=${rt!.value}` }, maxRedirects: 0 });
  const setCookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("\n");
  expect(setCookie).toMatch(/hf_at=[^\n]*SameSite=none/i);
  expect(setCookie).toMatch(/hf_at=[^\n]*Partitioned/i);
});

// ───────────────────────────── Приглашение тренера в Telegram ─────────────────────────────

test("coach sees the Telegram invite link; trainer page offers Telegram", async ({ page, browser }) => {
  const { login } = await registerUser(page);
  const nick = `T${newTelegramId().slice(-8)}`;
  const code = await enableCoach(login, nick);
  const url = `https://t.me/hero_fit_e2e_bot?startapp=join_${code}`;

  await page.goto("/coach");
  const invite = page.getByRole("region", { name: "Пригласить клиента" });
  await expect(invite.getByText("Ссылка для Telegram")).toBeVisible();
  await expect(invite.getByTestId("coach-invite-telegram")).toHaveText(url);

  await coachProfile(login, { about: "Тренер по силовым. ".repeat(4), publish: true });
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`/trainer/${nick}`);
  await expect(guestPage.getByRole("link", { name: "Заниматься в Telegram" }).first()).toHaveAttribute("href", url);
  await guest.close();
});
