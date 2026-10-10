import { expect, test } from "@playwright/test";
import { enableCoach } from "./db";
import { registerUser } from "./helpers";

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
