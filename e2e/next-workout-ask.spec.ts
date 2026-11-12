import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, latestWorkout, linkTelegram, makeFriends, seedStretchSessions, seedWorkouts, setUserTimeZone, userId, withDb } from "./db";
import { quickWorkout, registerUser } from "./helpers";
import { E2E_TZ, E2E_TZ_OFFSET } from "./tz";

// Флаг next_workout_ask включается списком пользователей (addFlagUser) — тесты идут параллельно, desktop + mobile.
test.describe.configure({ timeout: 90_000 });

const DAY = 86_400_000;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const TODAY = new Date(Date.now() + E2E_TZ_OFFSET * 3_600_000).toISOString().slice(0, 10);
const TOMORROW = shift(TODAY, 1);

const card = (page: Page) => page.getByTestId("next-workout");
const summaryLoaded = (page: Page) => expect(page.getByRole("heading", { name: /— готово!/ })).toBeVisible();

/** Пользователь во флаге, в поясе e2e; channel — Telegram привязан, и выбор сохраняется сразу, без шага «Как напомнить?». */
async function flaggedUser(page: Page, opts: { channel?: boolean } = { channel: true }) {
  const me = await registerUser(page);
  await setUserTimeZone(me.login, E2E_TZ);
  await addFlagUser("next_workout_ask", me.login);
  if (opts.channel) await linkTelegram(me.login, `7${Math.floor(Math.random() * 1e12)}`);
  return me;
}

/** Завершённая тренировка в базе (finishedAt — сейчас минус minutesAgo) и её сводка. */
async function seededSummary(page: Page, login: string, minutesAgo = 1) {
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 40, reps: 10, sets: 3 }], 0, { finishedAt: [new Date(Date.now() - minutesAgo * 60_000)] });
  const { id } = await latestWorkout(login);
  await page.goto(`/workouts/${id}`);
  await summaryLoaded(page);
  return id;
}

const planRows = (login: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ date: string; time: string; title: string; templateId: string | null; durationMin: number; emailReminder: boolean }>(
      `select e.date, e.time, e.title, e."templateId", e."durationMin", e."emailReminder" from "PlanEntry" e join "User" u on u.id = e."userId" where u.login = $1`,
      [login],
    );
    return rows;
  });

const asked = (workoutId: string) =>
  withDb(async (db) => (await db.query<{ a: boolean }>(`select "scheduleAskedAt" is not null as a from "Workout" where id = $1`, [workoutId])).rows[0].a);

test("after finishing: «Завтра» → confirmation, one entry tomorrow, visible in the calendar", async ({ page }) => {
  const me = await flaggedUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "40", reps: "10" }]);
  await expect(card(page).getByRole("heading", { name: "Когда следующая тренировка?" })).toBeVisible();
  await card(page).getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(card(page).getByRole("heading", { name: /^Запланировано: / })).toBeVisible();
  await expect(card(page).getByRole("link", { name: "Открыть календарь" })).toHaveAttribute("href", "/calendar");

  const rows = await planRows(me.login);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ date: TOMORROW, title: "Тренировка", templateId: null, durationMin: 60, emailReminder: false });
  expect(rows[0].time).toMatch(/^\d\d:[03]0$/);
  const { id } = await latestWorkout(me.login);
  expect(await asked(id)).toBe(true);
  await page.reload();
  await summaryLoaded(page);
  await expect(card(page)).toHaveCount(0);

  await page.goto(`/calendar?date=${TOMORROW}`);
  await expect(page.getByRole("button", { name: new RegExp(rows[0].time) }).first()).toBeVisible();
});

test("«Не сейчас» hides the card for good and creates nothing", async ({ page }) => {
  const me = await flaggedUser(page);
  const id = await seededSummary(page, me.login);
  await card(page).getByRole("button", { name: "Не сейчас" }).click();
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => asked(id)).toBe(true);
  await page.reload();
  await summaryLoaded(page);
  await expect(card(page)).toHaveCount(0);
  expect(await planRows(me.login)).toEqual([]);
});

test("own date and time in the past → error, no entry", async ({ page }) => {
  const me = await flaggedUser(page);
  const id = await seededSummary(page, me.login);
  await card(page).getByRole("button", { name: "Выбрать дату и время" }).click();
  await card(page).getByLabel("Дата").fill(TODAY);
  await card(page).getByLabel("Начало").fill("00:15");
  await card(page).getByRole("button", { name: "Дальше" }).click();
  await expect(card(page).getByRole("alert")).toHaveText("Выберите время в будущем");
  expect(await planRows(me.login)).toEqual([]);
  expect(await asked(id)).toBe(false);
});

test("two tabs: the second choice says «Уже запланировано», one entry", async ({ page }) => {
  const me = await flaggedUser(page);
  const id = await seededSummary(page, me.login);
  const second = await page.context().newPage();
  await second.goto(`/workouts/${id}`);
  await expect(card(second)).toBeVisible();

  await card(page).getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(card(page).getByRole("heading", { name: /^Запланировано: / })).toBeVisible();
  await card(second).getByRole("button", { name: "Послезавтра" }).click();
  await expect(card(second).getByRole("alert")).toHaveText("Уже запланировано");
  expect(await planRows(me.login)).toHaveLength(1);
  await second.close();
});

test("a calendar entry within 7 days → no card", async ({ page }) => {
  const me = await flaggedUser(page);
  await withDb(async (db) =>
    db.query(`insert into "PlanEntry" (id, "userId", title, date, time, "updatedAt") values ($1, $2, 'Свой план', $3, '18:00', now())`, [
      randomUUID(),
      await userId(db, me.login),
      shift(TODAY, 3),
    ]),
  );
  await seededSummary(page, me.login);
  await expect(card(page)).toHaveCount(0);
});

test("without the flag → no card", async ({ page }) => {
  const me = await registerUser(page);
  await setUserTimeZone(me.login, E2E_TZ);
  await seededSummary(page, me.login);
  await expect(card(page)).toHaveCount(0);
});

test("an old workout and a friend's workout → no card", async ({ page, browser }) => {
  const me = await flaggedUser(page);
  const id = await seededSummary(page, me.login, 7 * 60);
  await expect(card(page)).toHaveCount(0);

  // Свежая тренировка, но смотрит друг: сводка только владельцу
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 40, reps: 10, sets: 3 }], 0, { finishedAt: [new Date()] });
  const fresh = (await latestWorkout(me.login)).id;
  expect(fresh).not.toBe(id);
  const context = await browser.newContext();
  try {
    const friendPage = await context.newPage();
    const friend = await flaggedUser(friendPage);
    await makeFriends(me.login, `a${me.login.slice(-8)}`, friend.login, `b${friend.login.slice(-8)}`);
    await friendPage.goto(`/workouts/${fresh}`);
    await expect(friendPage.getByRole("heading", { name: /— готово!/ })).toHaveCount(0);
    await expect(card(friendPage)).toHaveCount(0);
  } finally {
    await context.close();
  }
  // А у владельца — есть
  await page.goto(`/workouts/${fresh}`);
  await expect(card(page)).toBeVisible();
});

test("a stretching session → no card", async ({ page }) => {
  const me = await flaggedUser(page);
  await seedStretchSessions(me.login, "Кошка-корова", [new Date(Date.now() - 60_000)]);
  const { id } = await latestWorkout(me.login);
  await page.goto(`/workouts/${id}`);
  await summaryLoaded(page);
  await expect(card(page)).toHaveCount(0);
});

test("no push and no Telegram: «Как напомнить?» step, email checkbox → emailReminder", async ({ page }) => {
  const me = await flaggedUser(page, { channel: false });
  await seededSummary(page, me.login);
  await card(page).getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(card(page).getByRole("heading", { name: "Как напомнить?" })).toBeVisible();
  await card(page).getByRole("checkbox", { name: new RegExp(`Напомнить на почту \\(${me.email}\\)`) }).click();
  await card(page).getByRole("button", { name: "Готово" }).click();
  await expect(card(page).getByRole("heading", { name: /^Запланировано: / })).toBeVisible();

  const rows = await planRows(me.login);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ date: TOMORROW, title: "Тренировка", emailReminder: true });
});
