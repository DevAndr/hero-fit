import { expect, test, type Browser, type Page } from "@playwright/test";
import { fillGuild, guildOf, setNickname } from "./db";
import { registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами. */
const nickOf = (login: string, prefix = "G") => `${prefix}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-16)}`;
/** Название гильдии уникально на всю базу — с хвостом логина. */
const guildName = (login: string) => `Жел ${login.replace(/_/g, "").slice(-12)}`;

async function player(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  await setNickname(user.login, nickOf(user.login, name.slice(0, 2)));
  return { context, page, ...user };
}

async function createGuild(page: Page, name: string, emblem = "Молот") {
  await page.goto("/guild");
  await page.getByRole("button", { name: "Создать гильдию" }).click();
  const dialog = page.getByRole("dialog", { name: "Создать гильдию" });
  await dialog.getByLabel("Название").fill(name);
  await dialog.getByRole("radiogroup", { name: "Значок" }).getByRole("radio", { name: emblem }).click();
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/** Ссылка-приглашение со страницы гильдии. */
const inviteUrl = async (page: Page) => (await page.getByRole("region", { name: "Пригласить" }).getByRole("textbox", { name: "Ссылка" }).inputValue());

const members = (page: Page) => page.getByRole("list", { name: "Участники гильдии" });

test("no nickname → nickname form first; create a guild", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/guild");
  await expect(page.getByRole("button", { name: "Создать гильдию" })).toHaveCount(0);
  // До гидратации поле перезапишется подсказкой — ждём, что значение удержалось
  const nick = page.getByRole("textbox", { name: "Ник" });
  await expect(async () => {
    await nick.fill(nickOf(login));
    await expect(nick).toHaveValue(nickOf(login), { timeout: 500 });
  }).toPass();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Ник сохранён")).toBeVisible();
  await createGuild(page, guildName(login));
  await expect(page.getByText("1/10")).toBeVisible();
  await expect(members(page)).toContainText("глава");
  expect(await guildOf(login)).toMatchObject({ leader: true });
});

test("join by link, leader is notified, leader manages", async ({ browser }) => {
  test.slow();
  const a = await player(browser, "Аня");
  const b = await player(browser, "Боря");
  try {
    const name = guildName(a.login);
    await createGuild(a.page, name);
    const url = await inviteUrl(a.page);

    await b.page.goto(url);
    await expect(b.page.getByRole("heading", { name: `Вступить в гильдию «${name}»?` })).toBeVisible();
    await b.page.getByRole("button", { name: "Вступить" }).click();
    await expect(b.page).toHaveURL(/\/guild$/);
    await expect(b.page.getByText("2/10")).toBeVisible();

    await a.page.goto("/dashboard");
    await a.page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(a.page.getByText("вступил(а) в гильдию")).toBeVisible();

    // Главенство — Боре; Боря исключает Аню
    await a.page.goto("/guild");
    await members(a.page).getByRole("listitem").filter({ hasText: nickOf(b.login, "Бо") }).getByRole("button", { name: "Сделать главой" }).click();
    await a.page.getByRole("alertdialog").getByRole("button", { name: "Сделать главой" }).click();
    await expect.poll(() => guildOf(b.login)).toMatchObject({ leader: true });

    await b.page.goto("/guild");
    await members(b.page).getByRole("listitem").filter({ hasText: nickOf(a.login, "Ан") }).getByRole("button", { name: "Исключить" }).click();
    await b.page.getByRole("alertdialog").getByRole("button", { name: "Исключить" }).click();
    await expect.poll(() => guildOf(a.login)).toBeNull();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("full guild, changed link, leader can't leave, last one deletes", async ({ browser }) => {
  test.slow();
  const a = await player(browser, "Аня");
  const c = await player(browser, "Вика");
  try {
    await createGuild(a.page, guildName(a.login));
    const url = await inviteUrl(a.page);
    await fillGuild((await guildOf(a.login))!.code, 10);

    await c.page.goto(url);
    await expect(c.page.getByText("В гильдии нет мест")).toBeVisible();
    await expect(c.page.getByRole("button", { name: "Вступить" })).toHaveCount(0);

    // Глава с участниками не выходит
    await a.page.goto("/guild");
    await a.page.getByRole("button", { name: "Выйти из гильдии" }).click();
    await expect(a.page.getByRole("alertdialog")).toContainText("Сначала передайте главенство");
    await a.page.keyboard.press("Escape");

    await a.page.getByRole("button", { name: "Сменить ссылку" }).click();
    await expect.poll(() => inviteUrl(a.page)).not.toBe(url);
    const res = await c.page.goto(url);
    expect(res?.status()).toBe(404);

    // Одиночная гильдия: выход удаляет её
    await createGuild(c.page, guildName(c.login), "Лапа");
    await c.page.getByRole("button", { name: "Выйти из гильдии" }).click();
    await c.page.getByRole("alertdialog").getByRole("button", { name: "Выйти" }).click();
    await expect(c.page.getByRole("button", { name: "Создать гильдию" })).toBeVisible();
    expect(await guildOf(c.login)).toBeNull();
  } finally {
    await a.context.close();
    await c.context.close();
  }
});
