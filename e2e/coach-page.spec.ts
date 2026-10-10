import { expect, test, type Browser } from "@playwright/test";
import { activeCoachLinks, coachProfile, createUserRow, enableCoach, linkCoach } from "./db";
import { PASSWORD, registerUser, uniqueLogin } from "./helpers";

const nickOf = (login: string) => `T_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const ABOUT = "Работаю с новичками и силовыми: базовые движения, техника, понятный прогресс каждую неделю.";

test("coach fills and publishes the page; short about is refused", async ({ page }) => {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login);
  await enableCoach(coach.login, nick);
  await page.goto("/coach");
  await page.getByRole("link", { name: "Публичная страница" }).click();
  await expect(page).toHaveURL(/\/coach\/page$/);

  await page.getByLabel("Имя на странице").fill("Иван Тренер");
  await page.getByLabel("Город").fill("Казань");
  await page.getByRole("checkbox", { name: "Сила" }).click();
  await page.getByLabel("О себе").fill("Коротко о себе");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Расскажите о себе — минимум 50 символов")).toBeVisible();

  await page.getByLabel("О себе").fill(ABOUT);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByRole("button", { name: "Снять с публикации" })).toBeVisible();
  await expect(page.getByText(new RegExp(`/trainer/${nick}$`))).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Город")).toHaveValue("Казань");
  await expect(page.getByRole("checkbox", { name: "Сила" })).toBeChecked();
});

async function publishedCoach(page: import("@playwright/test").Page, extra: Parameters<typeof coachProfile>[1] = { about: ABOUT }) {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login);
  await enableCoach(coach.login, nick);
  await coachProfile(coach.login, { publish: true, ...extra });
  return { coach, nick };
}

async function guest(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("guest joins from the public page", async ({ page, browser }) => {
  test.slow();
  const { coach, nick } = await publishedCoach(page, { about: ABOUT, city: "Казань", displayName: "Иван Тренер", specialties: ["strength"] });
  const g = await guest(browser);
  try {
    await g.page.goto(`/trainer/${nick.toLowerCase()}`);
    await expect(g.page.getByRole("heading", { level: 1 })).toHaveText("Иван Тренер");
    await expect(g.page.getByText("Казань", { exact: false }).first()).toBeVisible();
    await expect(g.page.getByText("Сила", { exact: true })).toBeVisible();
    await expect(g.page.getByText(ABOUT)).toBeVisible();
    await g.page.getByRole("link", { name: "Заниматься" }).first().click();
    await expect(g.page).toHaveURL(/\/register\?next=/);
    const login = uniqueLogin();
    await g.page.getByLabel("Логин").fill(login);
    await g.page.getByLabel("Email").fill(`${login}@test.local`);
    await g.page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
    await g.page.getByLabel("Повторите пароль").fill(PASSWORD);
    await g.page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ }).click();
    await g.page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(g.page).toHaveURL(/\/coach\/join\/\w+$/, { timeout: 15_000 });
    await g.page.getByRole("button", { name: "Разрешить" }).click();
    await expect.poll(() => activeCoachLinks(login)).toEqual([coach.login]);
  } finally {
    await g.context.close();
  }
});

test("unpublished page: 404 for guests, preview for the coach", async ({ page, browser }) => {
  const { coach, nick } = await publishedCoach(page);
  await coachProfile(coach.login, { about: ABOUT, publish: false });
  const g = await guest(browser);
  try {
    const res = await g.page.goto(`/trainer/${nick}`);
    expect(res?.status()).toBe(404);
  } finally {
    await g.context.close();
  }
  await page.goto(`/trainer/${nick}`);
  await expect(page.getByText("Страница не опубликована — её видите только вы")).toBeVisible();
  await expect(page.getByText("Это ваша страница")).toBeVisible();
});

test("stats appear from 3 clients; hidden stat is not shown", async ({ page, browser }) => {
  const { coach, nick } = await publishedCoach(page);
  for (const _ of [1, 2]) {
    const login = uniqueLogin();
    await createUserRow(login);
    await linkCoach(coach.login, login);
  }
  const g = await guest(browser);
  try {
    await g.page.goto(`/trainer/${nick}`);
    const stats = g.page.getByRole("region", { name: "Цифры" });
    await expect(stats).toContainText(/2\s*клиента/);
    await expect(stats).not.toContainText("тренировок клиентов");
    const third = uniqueLogin();
    await createUserRow(third);
    await linkCoach(coach.login, third);
    await g.page.reload();
    await expect(stats).toContainText(/0\s*тренировок клиентов за 30 дней/);
    await coachProfile(coach.login, { about: ABOUT, publish: true, hiddenStats: ["clients"] });
    await g.page.reload();
    await expect(stats).not.toContainText(/3\s*клиента/);
  } finally {
    await g.context.close();
  }
});

test("a client of the coach sees «Вы занимаетесь с этим тренером»; about is plain text", async ({ page, browser }) => {
  const { coach, nick } = await publishedCoach(page, { about: `${ABOUT} <b>жирный</b>` });
  const g = await guest(browser);
  try {
    const client = await registerUser(g.page, "Клиент");
    await linkCoach(coach.login, client.login);
    await g.page.goto(`/trainer/${nick}`);
    await expect(g.page.getByText("Вы занимаетесь с этим тренером")).toBeVisible();
    await expect(g.page.getByRole("link", { name: "Заниматься" })).toHaveCount(0);
    await expect(g.page.getByText("<b>жирный</b>")).toBeVisible();
  } finally {
    await g.context.close();
  }
});
