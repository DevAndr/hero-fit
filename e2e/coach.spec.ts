import { expect, test, type Browser, type Page } from "@playwright/test";
import { activeCoachLinks, enableCoach, linkCoach } from "./db";
import { PASSWORD, registerUser } from "./helpers";

const nickOf = (login: string, p: string) => `${p}_${login.slice(-8)}`;

/** Второй пользователь в отдельном контексте. */
async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

async function bell(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
}

test("coach mode needs a nickname, then shows the invite link", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Режим тренера" });
  await expect(card.getByText("Сначала задайте ник")).toBeVisible();
  await expect(card.getByRole("switch")).toBeDisabled();

  await page.goto("/friends");
  await page.getByLabel("Ник", { exact: true }).fill(nickOf(login, "Coach"));
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(`Вы — ${nickOf(login, "Coach")}`)).toBeVisible();

  await page.goto("/settings");
  await card.getByRole("switch").click();
  await expect(page.getByText("Режим тренера включён — раздел «Клиенты» в меню")).toBeVisible();
  await page.goto("/coach");
  await expect(page.getByTestId("coach-invite-link")).toContainText("/coach/join/");
});

test("client accepts via link after signing in; second visit says already linked", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  const coachNick = nickOf(coach.login, "Coach");
  const code = await enableCoach(coach.login, coachNick);

  const client = await another(browser);
  try {
    await client.context.clearCookies();
    await client.page.goto(`/coach/join/${code}`);
    await expect(client.page).toHaveURL(/\/login\?next=/);
    await client.page.getByLabel("Логин или email").fill(client.login);
    await client.page.getByLabel("Пароль").fill(PASSWORD);
    await client.page.getByRole("button", { name: "Войти" }).click();
    await expect(client.page.getByRole("heading", { name: `Тренер ${coachNick} просит доступ к вашим тренировкам` })).toBeVisible();
    await client.page.getByRole("button", { name: "Разрешить" }).click();
    await expect(client.page).toHaveURL(/\/dashboard$/);
    expect(await activeCoachLinks(client.login)).toEqual([coach.login]);

    await client.page.goto(`/coach/join/${code}`);
    await expect(client.page.getByRole("heading", { name: `Вы уже занимаетесь с ${coachNick}` })).toBeVisible();

    await bell(page);
    await expect(page.getByText("Новый клиент")).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("own and unknown invite codes", async ({ page }) => {
  const { login } = await registerUser(page);
  const code = await enableCoach(login, nickOf(login, "Coach"));
  await page.goto(`/coach/join/${code}`);
  await expect(page.getByRole("heading", { name: "Это ваша ссылка" })).toBeVisible();
  await page.goto("/coach/join/ZZZZZZZZ");
  await expect(page.getByRole("heading", { name: "Ссылка недействительна" })).toBeVisible();
});

test("switching coaches ends the old link and notifies the old coach", async ({ page, browser }) => {
  test.slow();
  const coachA = await registerUser(page, "Тренер А");
  await enableCoach(coachA.login, nickOf(coachA.login, "CoachA"));
  const coachB = await another(browser, "Тренер Б");
  const codeB = await enableCoach(coachB.login, nickOf(coachB.login, "CoachB"));
  const client = await another(browser);
  try {
    await linkCoach(coachA.login, client.login);
    await client.page.goto(`/coach/join/${codeB}`);
    await expect(client.page.getByText(`Сейчас ваш тренер — ${nickOf(coachA.login, "CoachA")}`)).toBeVisible();
    await client.page.getByRole("button", { name: "Разрешить" }).click();
    await expect(client.page).toHaveURL(/\/dashboard$/);
    expect(await activeCoachLinks(client.login)).toEqual([coachB.login]);

    await bell(page);
    await expect(page.getByText(/перешёл к другому тренеру/)).toBeVisible();
  } finally {
    await coachB.context.close();
    await client.context.close();
  }
});

test("client disconnects the coach in settings", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  const coachNick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, coachNick);
  const client = await another(browser);
  try {
    await linkCoach(coach.login, client.login);
    await client.page.goto("/settings");
    const card = client.page.getByRole("region", { name: "Мой тренер" });
    await expect(card).toContainText(coachNick);
    await card.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(await activeCoachLinks(client.login)).toEqual([]);

    await bell(page);
    await expect(page.getByText("Клиент отключил доступ", { exact: true })).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("«Клиенты» in the menu only for coaches", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Клиенты" })).toHaveCount(0);
  await enableCoach(login, nickOf(login, "Coach"));
  await page.reload();
  await page.getByRole("button", { name: "Меню профиля" }).click();
  await expect(page.getByRole("menuitem", { name: "Клиенты" })).toBeVisible();
});
