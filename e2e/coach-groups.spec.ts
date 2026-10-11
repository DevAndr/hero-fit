import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachGroupMembers, enableCoach, endCoachLinks, idOf, linkCoach, setTimeZone } from "./db";
import { registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами: хвост логина с меткой времени. */
const nickOf = (login: string) => `Coac_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

async function client(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

async function setup(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login));
  await setTimeZone(coach.login);
  const clients = [await client(browser, "Аня"), await client(browser, "Боря"), await client(browser, "Вика")];
  for (const c of clients) await linkCoach(coach.login, c.login);
  return { coach, clients };
}

const groupsDialog = (page: Page) => page.getByRole("dialog", { name: "Группы" });

/** Создать группу через диалог «Группы» (диалог открыт). */
async function createGroup(page: Page, name: string, members: string[]) {
  const dialog = groupsDialog(page);
  await dialog.getByRole("button", { name: "Создать группу" }).click();
  await dialog.getByLabel("Название").fill(name);
  for (const m of members) await dialog.getByRole("group", { name: "Клиенты" }).getByRole("checkbox", { name: m }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog.getByRole("list", { name: "Группы клиентов" })).toContainText(name);
}

const close = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(groupsDialog(page)).toHaveCount(0);
};

test("create a group, filter the list, pick the group when assigning", async ({ page, browser }) => {
  test.slow();
  const { clients } = await setup(page, browser);
  try {
    await page.goto("/coach");
    await page.getByRole("button", { name: "Группы" }).click();
    await createGroup(page, "Утро", ["Аня", "Боря"]);
    await expect(groupsDialog(page).getByRole("listitem").filter({ hasText: "Утро" })).toContainText("2");
    await close(page);

    const list = page.getByRole("list", { name: "Клиенты" });
    await expect(list.getByRole("listitem").filter({ hasText: "Аня" })).toContainText("Утро");
    await page.getByRole("navigation", { name: "Фильтр по группе" }).getByRole("link", { name: "Утро (2)" }).click();
    await expect(page).toHaveURL(/\?group=/);
    await expect(list).toContainText("Аня");
    await expect(list).toContainText("Боря");
    await expect(list).not.toContainText("Вика");

    await page.getByRole("button", { name: "Назначить нескольким" }).click();
    const picked = page.getByRole("dialog", { name: "Назначить нескольким" }).getByRole("group", { name: "Клиенты" });
    await picked.getByRole("button", { name: "Отметить группу «Утро»" }).click();
    await expect(picked.getByRole("checkbox", { name: "Аня" })).toBeChecked();
    await expect(picked.getByRole("checkbox", { name: "Боря" })).toBeChecked();
    await expect(picked.getByRole("checkbox", { name: "Вика" })).not.toBeChecked();
  } finally {
    for (const c of clients) await c.context.close();
  }
});

test("rename, duplicate name, delete", async ({ page, browser }) => {
  const { clients } = await setup(page, browser);
  try {
    await page.goto("/coach");
    await page.getByRole("button", { name: "Группы" }).click();
    await createGroup(page, "Утро", ["Аня"]);
    await createGroup(page, "Вечер", ["Вика"]);
    const dialog = groupsDialog(page);
    const groups = dialog.getByRole("list", { name: "Группы клиентов" });

    await groups.getByRole("listitem").filter({ hasText: "Вечер" }).getByRole("button", { name: "Изменить" }).click();
    await dialog.getByLabel("Название").fill("  утро ");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Такая группа уже есть")).toBeVisible();
    await dialog.getByLabel("Название").fill("Онлайн");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(groups).toContainText("Онлайн");
    await expect(groups).not.toContainText("Вечер");

    await groups.getByRole("listitem").filter({ hasText: "Онлайн" }).getByRole("button", { name: "Удалить" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Удалить группу «Онлайн»?" });
    await expect(confirm).toContainText("Клиенты останутся, удалится только группа");
    await confirm.getByRole("button", { name: "Удалить" }).click();
    await expect(groups).not.toContainText("Онлайн");
    await expect(groups).toContainText("Утро");
  } finally {
    for (const c of clients) await c.context.close();
  }
});

test("a removed client leaves the group", async ({ page, browser }) => {
  const { coach, clients } = await setup(page, browser);
  try {
    await page.goto("/coach");
    await page.getByRole("button", { name: "Группы" }).click();
    await createGroup(page, "Утро", ["Аня", "Боря"]);
    await close(page);

    await page.goto(`/coach/clients/${await idOf(clients[0].login)}`);
    await expect(page.getByText("Утро").first()).toBeVisible();
    await page.getByRole("button", { name: "Удалить клиента" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await expect(page.getByRole("navigation", { name: "Фильтр по группе" }).getByRole("link", { name: "Утро (1)" })).toBeVisible();
    expect(await coachGroupMembers(coach.login)).toBe(1);
  } finally {
    for (const c of clients) await c.context.close();
  }
});

test("groups stay manageable when the coach has no clients left", async ({ page, browser }) => {
  const { coach, clients } = await setup(page, browser);
  try {
    await page.goto("/coach");
    await page.getByRole("button", { name: "Группы" }).click();
    await createGroup(page, "Утро", ["Аня"]);
    await close(page);
    await endCoachLinks(coach.login);

    await page.goto("/coach");
    await expect(page.getByRole("link", { name: "Утро (0)" })).toBeVisible();
    await page.getByRole("button", { name: "Группы" }).click();
    await groupsDialog(page).getByRole("listitem").filter({ hasText: "Утро" }).getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByRole("navigation", { name: "Фильтр по группе" })).toHaveCount(0);
  } finally {
    for (const c of clients) await c.context.close();
  }
});
