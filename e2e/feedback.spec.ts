import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { feedbackRows, makeAdmin, notificationTitles, seedFeedback, withDb } from "./db";
import { registerUser } from "./helpers";

// Обратная связь (спека 2026-10-18-feedback-design)

const uniq = (text: string) => `${text} ${randomUUID().slice(0, 6)}`;

async function send(page: Page, kind: "Ошибка" | "Идея" | "Другое", body: string) {
  await page.getByRole("radio", { name: kind }).click();
  await page.getByLabel("Сообщение").fill(body);
  await page.getByRole("button", { name: "Отправить" }).click();
}

test("from the profile menu: validation, send, appears in my feedback with the page", async ({ page }) => {
  await registerUser(page);
  await page.goto("/exercises");
  await page.getByRole("button", { name: /Меню профиля/ }).first().click();
  await page.getByRole("menuitem", { name: "Обратная связь" }).click();
  await expect(page).toHaveURL(/\/feedback\?from=%2Fexercises$/);

  await send(page, "Ошибка", "коротко");
  await expect(page.getByRole("form", { name: "Новое обращение" }).getByRole("alert")).toHaveText("Опишите подробнее — от 10 символов");

  const body = uniq("Не сохраняется вес в подходе");
  await send(page, "Ошибка", body);
  await expect(page.getByText("Спасибо! Обращение отправлено")).toBeVisible();
  await expect(page.getByLabel("Сообщение")).toHaveValue("");
  const mine = page.getByRole("region", { name: "Мои обращения" }).getByRole("article").filter({ hasText: body });
  await expect(mine).toContainText("Новое");
  await expect(mine).toContainText("Ошибка");
  const [row] = await feedbackRows(body);
  expect(row.page).toBe("/exercises");
  expect(row.version).toBeTruthy();
});

test("daily limit: the sixth feedback is refused", async ({ page }) => {
  const me = await registerUser(page);
  await seedFeedback(me.login, 5);
  await page.goto("/feedback");
  await send(page, "Идея", uniq("Ещё одно пожелание сверх лимита"));
  await expect(page.getByRole("form", { name: "Новое обращение" }).getByRole("alert")).toHaveText("Слишком много обращений — попробуйте завтра");
});

test("foreign from= is dropped; double click sends once", async ({ page }) => {
  await registerUser(page);
  await page.goto("/feedback?from=https://evil.com");
  const body = uniq("Пожелание с чужой страницей");
  await page.getByLabel("Сообщение").fill(body);
  await page.getByRole("button", { name: "Отправить" }).dblclick();
  await expect(page.getByText("Спасибо! Обращение отправлено")).toBeVisible();
  await expect.poll(async () => (await feedbackRows(body)).length).toBe(1);
  await page.waitForTimeout(500);
  const rows = await feedbackRows(body);
  expect(rows).toHaveLength(1);
  expect(rows[0].page).toBeNull();
});

test("settings link and empty state", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Обратная связь" }).click();
  await expect(page).toHaveURL(/\/feedback/);
  await expect(page.getByRole("region", { name: "Мои обращения" })).toContainText("Пока нет обращений");
});

test.describe("admin inbox", () => {
  // makeAdmin переименовывает глобального админа — по очереди и только на desktop
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "desktop", "Админ один на прогон");
  });

  test("non-admin gets 404", async ({ page }) => {
    await registerUser(page);
    expect((await page.goto("/admin/feedback"))?.status()).toBe(404);
  });

  test("admin marks feedback done with a note; the author is notified once and sees the status", async ({ page, browser }) => {
    const author = await registerUser(page);
    await page.goto("/feedback?from=%2Fexercises");
    const body = uniq("Добавьте экспорт в таблицу");
    await send(page, "Идея", body);
    await expect(page.getByText("Спасибо! Обращение отправлено")).toBeVisible();

    const adminPage = await browser.newPage();
    const admin = await registerUser(adminPage);
    await makeAdmin(admin.login);
    await adminPage.goto("/admin/feedback");
    const card = adminPage.getByRole("article", { name: `Обращение от ${author.login}` });
    await expect(card).toContainText(body);
    await expect(card).toContainText("Страница: /exercises");
    await card.getByRole("radio", { name: "Сделано" }).click();
    await card.getByLabel("Заметка (видна только админам)").fill("Сделали в 0.14");
    await card.getByRole("button", { name: "Сохранить" }).click();
    await expect(card).toBeHidden();

    await adminPage.getByRole("navigation", { name: "Статус" }).getByRole("link", { name: "Сделано" }).click();
    const done = adminPage.getByRole("article", { name: `Обращение от ${author.login}` });
    await expect(done.getByLabel("Заметка (видна только админам)")).toHaveValue("Сделали в 0.14");
    await done.getByRole("button", { name: "Сохранить" }).click();
    await expect(adminPage.getByText("Сохранено")).toBeVisible();

    await expect.poll(async () => (await notificationTitles(author.login)).filter((t) => t === "Обратная связь")).toHaveLength(1);
    await page.reload();
    const mine = page.getByRole("region", { name: "Мои обращения" }).getByRole("article").filter({ hasText: body });
    await expect(mine).toContainText("Сделано");
    await expect(page.getByText("Сделали в 0.14")).toHaveCount(0);
  });

  test("saving from a stale card does not overwrite a newer status", async ({ page, browser }) => {
    const author = await registerUser(await browser.newPage());
    const body = uniq("Устаревшая карточка");
    const [id] = await seedFeedback(author.login, 1, { body });
    const admin = await registerUser(page);
    await makeAdmin(admin.login);
    await page.goto("/admin/feedback");
    const card = page.getByRole("article", { name: `Обращение от ${author.login}` });
    await expect(card).toContainText(body);
    // Тем временем в другой вкладке поставили «Сделано» с заметкой
    await withDb((db) => db.query(`update "Feedback" set status = 'DONE', "adminNote" = 'из другой вкладки' where id = $1`, [id]));
    await card.getByRole("radio", { name: "В работе" }).click();
    await card.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Обращение уже изменили — обновите страницу")).toBeVisible();
    const [row] = await feedbackRows(body);
    expect(row.status).toBe("DONE");
  });
});
