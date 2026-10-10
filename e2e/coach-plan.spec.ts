import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachAssignOnce, coachTemplate, enableCoach, idOf, linkCoach } from "./db";
import { pickOption, registerUser } from "./helpers";
import { E2E_TZ_OFFSET } from "./tz";

/** Ник ≤ 20 символов и уникален между прогонами на одной тестовой базе: хвост логина с меткой времени. */
const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

/** Сейчас в поясе e2e (поля UTC — местные). */
const localNow = () => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000);
/** Местная дата YYYY-MM-DD через n дней (в поясе браузера, а не процесса Node — на CI тот в UTC). */
const localDate = (n: number) => new Date(localNow().getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** Ближайший понедельник строго после сегодня (1…7 дней) — попадает в «Ближайшие 2 недели». */
const nextMonday = () => localDate(((1 - localNow().getUTCDay() + 7) % 7) || 7);

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

test("deleting an assigned template warns how many clients have it", async ({ page, browser }) => {
  const { coach, templateId, client } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    await page.goto("/templates");
    await page.getByRole("button", { name: "Удалить «Ноги — база»" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Назначен 1 клиенту");
  } finally {
    await client.context.close();
  }
});

test("a coach template with the coach's own exercise can be finished by the client; the coach is notified", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const templateId = await coachTemplate(coach.login, "Ноги — авторская", "Гоблет-присед тренера");
  const client = await another(browser);
  try {
    await linkCoach(coach.login, client.login);
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — авторская", localDate(2));
    await client.page.goto("/training");
    await client.page.getByRole("region", { name: "От тренера" }).getByRole("button", { name: "Начать «Ноги — авторская»" }).click();
    const own = client.page.getByRole("region", { name: "Гоблет-присед тренера" });
    await own.getByLabel("Вес, подход 1").fill("20");
    await own.getByRole("button", { name: "Подход 1 выполнен" }).click();
    await client.page.getByRole("button", { name: "Завершить тренировку" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
    await expect(client.page).toHaveURL(/\/workouts\/\w+$/);

    // Запущено из «От тренера», а не из плана, — тренер всё равно узнаёт
    await bell(page);
    await expect(page.getByText(/выполнено «Ноги — авторская»/)).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("coach swaps the template for one occurrence of a series; the client starts the new one", async ({ page, browser }) => {
  test.slow();
  const { coach, client, clientId } = await setup(page, browser);
  try {
    await coachTemplate(coach.login, "Спина — база");
    await page.goto(`/coach/clients/${clientId}?tab=plan`);
    await page.getByRole("button", { name: "Назначить" }).click();
    const dialog = page.getByRole("dialog");
    await pickOption(page, dialog.getByLabel("Шаблон"), "Ноги — база");
    await dialog.getByLabel("Дата").fill(localDate(0));
    await dialog.getByLabel("Начало").fill("23:30");
    await dialog.getByRole("checkbox", { name: "Повторять каждую неделю" }).click();
    await dialog.getByRole("button", { name: "Назначить" }).click();
    await expect(dialog).toHaveCount(0);

    const upcoming = page.getByRole("region", { name: "Ближайшие 2 недели" });
    await upcoming.getByRole("listitem").first().getByRole("button", { name: "Изменить" }).click();
    await pickOption(page, dialog.getByLabel("Шаблон"), "Спина — база");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await dialog.getByRole("button", { name: "Только эту" }).click();
    await expect(dialog).toHaveCount(0);

    await client.page.goto("/dashboard");
    const card = client.page.getByRole("region", { name: "План на сегодня" });
    await expect(card).toContainText("Спина — база");
    await card.getByRole("button", { name: "Начать" }).click();
    await expect(client.page.getByLabel("Название тренировки")).toHaveValue("Спина — база");
    await expect(client.page.locator("main section[aria-label]")).toHaveCount(2);
  } finally {
    await client.context.close();
  }
});

test("a running coach workout has no «Пропустить» in the calendar card", async ({ page, browser }) => {
  const { coach, templateId, client } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(0), "23:30");
    await client.page.goto("/dashboard");
    await client.page.getByRole("region", { name: "План на сегодня" }).getByRole("button", { name: "Начать" }).click();
    await expect(client.page.getByLabel("Название тренировки")).toHaveValue("Ноги — база");
    await client.page.goto(`/calendar?date=${localDate(0)}`);
    await client.page.getByRole("button", { name: /^Ноги — база, .*от тренера/ }).filter({ visible: true }).first().click();
    const dialog = client.page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Продолжить" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Пропустить/ })).toHaveCount(0);
  } finally {
    await client.context.close();
  }
});

test("a skipped one-off no longer keeps the template in «От тренера»", async ({ page, browser }) => {
  const { coach, templateId, client } = await setup(page, browser);
  try {
    await coachAssignOnce(coach.login, client.login, templateId, "Ноги — база", localDate(2));
    await client.page.goto(`/calendar?date=${localDate(2)}`);
    await client.page.getByRole("button", { name: /^Ноги — база, .*от тренера/ }).filter({ visible: true }).first().click();
    await client.page.getByRole("dialog").getByRole("button", { name: "Пропустить «Ноги — база»" }).click();
    await expect(client.page.getByText("«Ноги — база» пропущена")).toBeVisible();
    await client.page.goto("/training");
    await expect(client.page.getByRole("heading", { name: "Новая тренировка" })).toBeVisible();
    await expect(client.page.getByRole("region", { name: "От тренера" })).toHaveCount(0);
  } finally {
    await client.context.close();
  }
});
