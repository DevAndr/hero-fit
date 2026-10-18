import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { feedbackRows, seedFeedback } from "./db";
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
