import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachAssignOnce, coachTemplate, enableCoach, idOf, linkCoach } from "./db";
import { pickOption, registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами на одной тестовой базе: хвост логина с меткой времени. */
const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

/** Местная дата YYYY-MM-DD через n дней. */
function localDate(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Ближайший понедельник строго после сегодня (1…7 дней) — попадает в «Ближайшие 2 недели». */
const nextMonday = () => localDate(((1 - new Date().getDay() + 7) % 7) || 7);

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

/** Тренер со своим шаблоном и клиент, связанные напрямую в БД. */
async function setup(page: Page, browser: Browser, templateName = "Ноги — база") {
  const coach = await registerUser(page, "Тренер");
  const coachNick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, coachNick);
  const templateId = await coachTemplate(coach.login, templateName);
  const client = await another(browser);
  await linkCoach(coach.login, client.login);
  return { coach, coachNick, templateId, client, clientId: await idOf(client.login) };
}

test("coach assigns a template mon/wed/fri; client sees it in the calendar and gets notified", async ({ page, browser }) => {
  test.slow();
  const { coachNick, client, clientId } = await setup(page, browser);
  try {
    await page.goto(`/coach/clients/${clientId}?tab=plan`);
    await page.getByRole("button", { name: "Назначить" }).click();
    const dialog = page.getByRole("dialog");
    await pickOption(page, dialog.getByLabel("Шаблон"), "Ноги — база");
    await dialog.getByLabel("Дата").fill(nextMonday());
    await dialog.getByRole("checkbox", { name: "Повторять каждую неделю" }).click();
    await dialog.getByRole("button", { name: "Ср" }).click();
    await dialog.getByRole("button", { name: "Пт" }).click();
    await dialog.getByRole("button", { name: "Назначить" }).click();
    await expect(dialog).toHaveCount(0);

    const upcoming = page.getByRole("region", { name: "Ближайшие 2 недели" });
    await expect(upcoming.getByRole("listitem").filter({ hasText: "Ноги — база" }).first()).toContainText("запланировано");

    await client.page.goto(`/calendar?date=${nextMonday()}`);
    await expect(client.page.getByText(`от тренера · ${coachNick}`).filter({ visible: true }).first()).toBeVisible();
    await bell(client.page);
    await expect(client.page.getByText("Новый план от тренера")).toBeVisible();
    await expect(client.page.getByText(/Ноги — база, пн\/ср\/пт с/)).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("a coach without the link gets 404 on the plan tab", async ({ page, browser }) => {
  const { clientId } = await setup(page, browser);
  const stranger = await another(browser, "Чужой");
  try {
    await enableCoach(stranger.login, nickOf(stranger.login, "Strn"));
    const res = await stranger.page.goto(`/coach/clients/${clientId}?tab=plan`);
    expect(res?.status()).toBe(404);
  } finally {
    await stranger.context.close();
  }
});

test("client disconnecting the coach removes assigned plans from the calendar", async ({ page, browser }) => {
  test.slow();
  const { coachNick, client, clientId } = await setup(page, browser);
  try {
    await page.goto(`/coach/clients/${clientId}?tab=plan`);
    await page.getByRole("button", { name: "Назначить" }).click();
    const dialog = page.getByRole("dialog");
    await pickOption(page, dialog.getByLabel("Шаблон"), "Ноги — база");
    await dialog.getByLabel("Дата").fill(nextMonday());
    await dialog.getByRole("button", { name: "Назначить" }).click();
    await expect(dialog).toHaveCount(0);

    await client.page.goto(`/calendar?date=${nextMonday()}`);
    await expect(client.page.getByText(`от тренера · ${coachNick}`).filter({ visible: true }).first()).toBeVisible();

    await client.page.goto("/settings");
    await client.page.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();

    await client.page.goto(`/calendar?date=${nextMonday()}`);
    await expect(client.page.getByText("Ноги — база")).toHaveCount(0);
  } finally {
    await client.context.close();
  }
});

test("client starts today's assignment from the dashboard; coach sees «выполнено» and gets notified", async ({ page, browser }) => {
  test.slow();
  const { coach, coachNick, templateId, client, clientId } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(0), "23:30");
    await client.page.goto("/dashboard");
    const card = client.page.getByRole("region", { name: "План на сегодня" });
    await expect(card).toContainText("Сегодня по плану: Ноги — база · 23:30");
    await expect(card).toContainText(`от тренера · ${coachNick}`);
    await card.getByRole("button", { name: "Начать" }).click();
    await expect(client.page.getByLabel("Название тренировки")).toHaveValue("Ноги — база");
    await expect(client.page.locator("main section[aria-label]")).toHaveCount(2); // упражнения шаблона тренера

    const squat = client.page.getByRole("region", { name: "Приседания со штангой" });
    await squat.getByLabel("Вес, подход 1").fill("60");
    await squat.getByRole("button", { name: "Подход 1 выполнен" }).click();
    await client.page.getByRole("button", { name: "Завершить тренировку" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
    await expect(client.page).toHaveURL(/\/workouts\/\w+$/);

    await page.goto(`/coach/clients/${clientId}?tab=plan`);
    const upcoming = page.getByRole("region", { name: "Ближайшие 2 недели" });
    await expect(upcoming.getByRole("listitem").filter({ hasText: "Ноги — база" })).toContainText("выполнено");
    await bell(page);
    await expect(page.getByText("Тренировка выполнена")).toBeVisible();
    await expect(page.getByText(/выполнено «Ноги — база»/)).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("client cannot edit an assignment but can skip it; coach sees «пропущено клиентом»", async ({ page, browser }) => {
  test.slow();
  const { coach, templateId, client, clientId } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(0), "23:30");
    await client.page.goto(`/calendar?date=${localDate(0)}`);
    await client.page.getByRole("button", { name: /^Ноги — база, .*от тренера/ }).filter({ visible: true }).first().click();
    const dialog = client.page.getByRole("dialog");
    await expect(dialog.getByText("Назначено тренером")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Изменить" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Удалить" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Пропустить «Ноги — база»" }).click();
    await expect(client.page.getByText("«Ноги — база» пропущена")).toBeVisible();

    await page.goto(`/coach/clients/${clientId}?tab=plan`);
    const upcoming = page.getByRole("region", { name: "Ближайшие 2 недели" });
    await expect(upcoming.getByRole("listitem").filter({ hasText: "Ноги — база" })).toContainText("пропущено клиентом");
  } finally {
    await client.context.close();
  }
});

test("«От тренера» in /training starts the coach template; gone after disconnecting", async ({ page, browser }) => {
  test.slow();
  const { coach, templateId, client } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    await client.page.goto("/training");
    const section = client.page.getByRole("region", { name: "От тренера" });
    await expect(section).toContainText("Ноги — база");

    await client.page.goto("/settings");
    await client.page.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();
    await client.page.goto("/training");
    await expect(client.page.getByRole("region", { name: "От тренера" })).toHaveCount(0);
  } finally {
    await client.context.close();
  }
});

test("«От тренера» start gives the template's exercises", async ({ page, browser }) => {
  const { coach, templateId, client } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    await client.page.goto("/training");
    await client.page.getByRole("region", { name: "От тренера" }).getByRole("button", { name: "Начать «Ноги — база»" }).click();
    await expect(client.page.getByLabel("Название тренировки")).toHaveValue("Ноги — база");
    await expect(client.page.locator("main section[aria-label]")).toHaveCount(2);
  } finally {
    await client.context.close();
  }
});
