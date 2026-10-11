import { expect, test, type Browser, type Page } from "@playwright/test";
import { coachNotifications, enableCoach, idOf, linkCoach } from "./db";
import { quickWorkout, registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами: хвост логина с меткой времени. */
const nickOf = (login: string) => `Coac_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

const card = (page: Page) => page.getByRole("region", { name: "Как прошла тренировка?" });

async function rate(page: Page, rpe: number, note = "") {
  const c = card(page);
  await c.getByRole("radio", { name: `Тяжесть ${rpe}` }).click();
  await c.getByLabel("Заметка").fill(note);
  await c.getByRole("button", { name: "Сохранить" }).click();
}

/** Тренер и клиент (на своей странице), связанные напрямую в БД. */
async function coachAndClient(page: Page, browser: Browser) {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login));
  const context = await browser.newContext();
  const clientPage = await context.newPage();
  const client = await registerUser(clientPage, "Маша");
  await linkCoach(coach.login, client.login);
  return { coach, client, clientPage, context, clientId: await idOf(client.login) };
}

test("rate a workout: save, see it after reload, edit", async ({ page }) => {
  await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);

  await card(page).getByRole("radio", { name: "Тяжесть 7" }).click();
  await expect(card(page)).toContainText("Тяжело");
  await card(page).getByLabel("Заметка").fill("болела спина");
  await card(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(card(page)).toContainText("Тяжесть 7 — Тяжело");
  await expect(card(page)).toContainText("болела спина");

  await page.reload();
  await expect(card(page)).toContainText("Тяжесть 7 — Тяжело");
  await expect(card(page)).toContainText("болела спина");

  await card(page).getByRole("button", { name: "Изменить" }).click();
  await rate(page, 5, "болела спина");
  await expect(card(page)).toContainText("Тяжесть 5 — Нормально");
});

test("the coach gets one notice for a hard workout and sees the rating", async ({ page, browser }) => {
  const { coach, clientPage, context, clientId } = await coachAndClient(page, browser);
  await quickWorkout(clientPage, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);
  const workoutId = new URL(clientPage.url()).pathname.split("/").pop()!;

  await rate(clientPage, 9);
  await expect(card(clientPage)).toContainText("Тяжесть 9 — На пределе");
  const notices = await coachNotifications(coach.login);
  expect(notices).toHaveLength(1);
  expect(notices[0].title).toMatch(/: тяжесть 9\/10 — На пределе$/);
  expect(notices[0].url).toBe(`/coach/clients/${clientId}/workouts/${workoutId}`);

  await card(clientPage).getByRole("button", { name: "Изменить" }).click();
  await rate(clientPage, 10, "болела спина");
  await expect(card(clientPage)).toContainText("Тяжесть 10 — На пределе");
  expect(await coachNotifications(coach.login)).toHaveLength(1);

  await page.goto(`/coach/clients/${clientId}/workouts/${workoutId}`);
  const block = page.getByRole("region", { name: "Оценка клиента" });
  await expect(block).toContainText("Тяжесть 10 — На пределе");
  await expect(block).toContainText("болела спина");
  await context.close();
});

test("an easy workout without a note does not notify the coach", async ({ page, browser }) => {
  const { coach, clientPage, context } = await coachAndClient(page, browser);
  await quickWorkout(clientPage, "Жим штанги лёжа", [{ weight: "60", reps: "10" }]);
  await rate(clientPage, 6);
  await expect(card(clientPage)).toContainText("Тяжесть 6 — Нормально");
  expect(await coachNotifications(coach.login)).toEqual([]);
  await context.close();
});
