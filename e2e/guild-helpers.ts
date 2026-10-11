import { expect, type Browser, type Page } from "@playwright/test";
import { setNickname } from "./db";
import { registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами. */
export const nickOf = (login: string, prefix = "G") => `${prefix}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-16)}`;
/** Название гильдии уникально на всю базу — с хвостом логина. */
export const guildName = (login: string) => `Жел ${login.replace(/_/g, "").slice(-12)}`;

export async function player(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  await setNickname(user.login, nickOf(user.login, name.slice(0, 2)));
  return { context, page, ...user };
}

export async function createGuild(page: Page, name: string, emblem = "Молот") {
  await page.goto("/guild");
  await page.getByRole("button", { name: "Создать гильдию" }).click();
  const dialog = page.getByRole("dialog", { name: "Создать гильдию" });
  await dialog.getByLabel("Название").fill(name);
  await dialog.getByRole("radiogroup", { name: "Значок" }).getByRole("radio", { name: emblem }).click();
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/** Ссылка-приглашение со страницы гильдии. */
export const inviteUrl = async (page: Page) => (await page.getByRole("region", { name: "Пригласить" }).getByRole("textbox", { name: "Ссылка", exact: true }).inputValue());

/** A создаёт гильдию, B вступает по ссылке. */
export async function twoInGuild(browser: Browser) {
  const a = await player(browser, "Аня");
  const b = await player(browser, "Боря");
  await createGuild(a.page, guildName(a.login));
  await b.page.goto(await inviteUrl(a.page));
  await b.page.getByRole("button", { name: "Вступить" }).click();
  await expect(b.page).toHaveURL(/\/guild$/);
  return { a, b };
}
