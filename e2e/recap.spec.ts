import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addSubscription, createUserRow, makeFriends, mondayWeeksAgo, seedRecapWeek, userId, withDb } from "./db";
import { localAt } from "./tz";
import { registerUser, runTick, uniqueLogin } from "./helpers";
import { startPushService } from "./push-server";

const press = (o: { day: number; time?: string; xp?: number }) => ({
  day: o.day,
  time: o.time ?? "19:00",
  exercise: "Жим штанги лёжа",
  weight: 100,
  reps: 5,
  sets: 3,
  xp: o.xp ?? 80,
});

test("recap page shows totals, best set and league", async ({ page }) => {
  const me = await registerUser(page);
  const friend = uniqueLogin();
  await createUserRow(friend);
  await makeFriends(me.login, `Me_${me.login.slice(-8)}`, friend, `Fr_${friend.slice(-8)}`);
  const week = mondayWeeksAgo(2);
  await seedRecapWeek(me.login, week, [press({ day: 0 }), press({ day: 2 }), press({ day: 4 })]);
  await seedRecapWeek(friend, week, [press({ day: 1, xp: 500 })]);

  await page.goto(`/recap/${week}`);
  await expect(page.getByRole("heading", { name: "Итоги недели" })).toBeVisible();
  await expect(page.getByTestId("recap-total-workouts")).toHaveText("3");
  const best = page.getByRole("region", { name: "Лучший подход" });
  await expect(best).toContainText("Жим штанги лёжа");
  await expect(best).toContainText("100 кг × 5");
  await expect(page.getByRole("region", { name: "Лига друзей" })).toContainText("2-е место");

  const seen = await withDb(async (db) => {
    const { rows } = await db.query(`select "seenAt" from "WeeklyRecap" where "userId" = $1 and week = $2`, [await userId(db, me.login), week]);
    return rows[0]?.seenAt;
  });
  expect(seen).toBeTruthy();
});

test("sunday 23:30 local counts for that week", async ({ page }) => {
  const me = await registerUser(page);
  const week = mondayWeeksAgo(2);
  await seedRecapWeek(me.login, week, [press({ day: 6, time: "23:30" })]);
  await page.goto(`/recap/${week}`);
  await expect(page.getByTestId("recap-total-workouts")).toHaveText("1");
});

test("invalid week → 404", async ({ page }) => {
  await registerUser(page);
  for (const week of ["abc", "2026-10-07"]) {
    await page.goto(`/recap/${week}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
});

test("archive lists recaps", async ({ page }) => {
  const me = await registerUser(page);
  const week = mondayWeeksAgo(2);
  await seedRecapWeek(me.login, week, [press({ day: 1 })]);
  await page.goto("/recap");
  await expect(page.getByText("Итоги появятся в понедельник")).toBeVisible();
  await page.goto(`/recap/${week}`);
  await page.getByRole("link", { name: "Все итоги" }).click();
  await expect(page).toHaveURL(/\/recap$/);
  await page.getByRole("link", { name: /1 тренировка/ }).click();
  await expect(page).toHaveURL(new RegExp(`/recap/${week}$`));
});

// Тестовый понедельник — две недели назад: фоновый воркер (реальное время) эти итоги не трогает.
const TICK_MONDAY = mondayWeeksAgo(2);
const RECAP_WEEK = mondayWeeksAgo(3);

async function recapNotifications(login: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ title: string; body: string; url: string }>(
      `select title, body, url from "Notification" where "userId" = $1 and type = 'RECAP' order by "createdAt"`,
      [await userId(db, login)],
    );
    return rows;
  });
}

test("monday tick creates recap and one notification", async ({ page, request }) => {
  const me = await registerUser(page);
  await seedRecapWeek(me.login, RECAP_WEEK, [press({ day: 0 }), press({ day: 3 })]);
  const now = localAt(TICK_MONDAY, "09:30");
  await runTick(request, now);
  await runTick(request, now);
  await Promise.all([runTick(request, now), runTick(request, now)]);
  const list = await recapNotifications(me.login);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: "Итоги недели 📊", url: `/recap/${RECAP_WEEK}` });
  expect(list[0].body).toContain("лучший подход: Жим штанги лёжа 100×5");

  await page.reload();
  await page.getByRole("button", { name: /Уведомления/ }).click();
  await page.getByRole("menuitem", { name: /Итоги недели/ }).click();
  await expect(page).toHaveURL(new RegExp(`/recap/${RECAP_WEEK}$`));
});

test("before 09:00 no push; seen recap → no push", async ({ page, request }) => {
  // Своя пара недель: тики соседних тестов (TICK_MONDAY) эти итоги не отправят
  const tickMonday = mondayWeeksAgo(5);
  const week = mondayWeeksAgo(6);
  const me = await registerUser(page);
  await seedRecapWeek(me.login, week, [press({ day: 1 })]);
  await runTick(request, localAt(tickMonday, "08:30"));
  expect(await recapNotifications(me.login)).toHaveLength(0);
  await page.goto(`/recap/${week}`);
  await expect(page.getByTestId("recap-total-workouts")).toHaveText("1");
  await runTick(request, localAt(tickMonday, "09:30"));
  expect(await recapNotifications(me.login)).toHaveLength(0);
});

test("fresh start nudge once", async ({ page, request }) => {
  // Свои недели: тренировки 9 недель назад, тики — пн 7 и 6 недель назад (соседние сценарии их не задевают)
  const me = await registerUser(page);
  await seedRecapWeek(me.login, mondayWeeksAgo(9), [press({ day: 2 })]);
  const now = localAt(mondayWeeksAgo(7), "09:30");
  await runTick(request, now);
  await runTick(request, now);
  await runTick(request, localAt(mondayWeeksAgo(6), "09:30"));
  const list = await recapNotifications(me.login);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: "Новая неделя — новый старт 💪", url: "/training" });
});

test("notifyRecap off: recap is created, no notification", async ({ page, request }) => {
  const me = await registerUser(page);
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Итоги недели — в понедельник утром" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await seedRecapWeek(me.login, RECAP_WEEK, [press({ day: 1 })]);
  await runTick(request, localAt(TICK_MONDAY, "09:30"));
  expect(await recapNotifications(me.login)).toHaveLength(0);
  const recaps = await withDb(async (db) => {
    const { rows } = await db.query(`select 1 from "WeeklyRecap" where "userId" = $1 and week = $2`, [await userId(db, me.login), RECAP_WEEK]);
    return rows.length;
  });
  expect(recaps).toBe(1);
});

test("recap push reaches the push service", async ({ page, request }) => {
  const push = await startPushService();
  try {
    const me = await registerUser(page);
    await addSubscription(me.login, push);
    await seedRecapWeek(me.login, RECAP_WEEK, [press({ day: 1 })]);
    await runTick(request, localAt(TICK_MONDAY, "09:30"));
    await expect.poll(() => push.received.length).toBe(1);
    expect(push.received[0].payload).toMatchObject({ type: "RECAP", title: "Итоги недели 📊", url: `/recap/${RECAP_WEEK}` });
  } finally {
    await push.close();
  }
});

test("dashboard card → recap; seen card loses the badge", async ({ page }) => {
  const me = await registerUser(page);
  await seedRecapWeek(me.login, mondayWeeksAgo(1), [press({ day: 0 }), press({ day: 2 })]);
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Итоги недели" });
  await expect(card).toContainText("новое");
  await expect(card).toContainText("лучший подход: Жим штанги лёжа 100×5");
  await card.getByRole("link", { name: "Смотреть итоги" }).click();
  await expect(page).toHaveURL(new RegExp(`/recap/${mondayWeeksAgo(1)}$`));
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Итоги недели" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Итоги недели" })).not.toContainText("новое");
});

test("stats links to recaps", async ({ page }) => {
  const me = await registerUser(page);
  await seedRecapWeek(me.login, mondayWeeksAgo(1), [press({ day: 0 })]);
  await page.goto("/stats");
  await page.getByRole("link", { name: "Итоги недель" }).click();
  await expect(page).toHaveURL(/\/recap$/);
});

test("archive pages forward and back", async ({ page }) => {
  const me = await registerUser(page);
  await withDb(async (db) => {
    const uid = await userId(db, me.login);
    for (let i = 1; i <= 21; i++) {
      const week = mondayWeeksAgo(i);
      const data = { version: 1, week, totals: { workouts: 1, minutes: 30, volume: 1000, sets: 5, prev: null } };
      await db.query(`insert into "WeeklyRecap" (id, "userId", week, data, "seenAt", "pushedAt") values ($1, $2, $3, $4, now(), now())`, [
        randomUUID(),
        uid,
        week,
        JSON.stringify(data),
      ]);
    }
  });
  await page.goto("/recap");
  await expect(page.getByRole("link", { name: "Назад" })).toHaveCount(0);
  await page.getByRole("link", { name: "Ещё" }).click();
  await expect(page).toHaveURL(/\/recap\?page=2$/);
  await expect(page.getByRole("link", { name: /1 тренировка/ })).toHaveCount(1);
  await page.getByRole("link", { name: "Назад" }).click();
  await expect(page).toHaveURL(/\/recap(\?page=1)?$/);
  await expect(page.getByRole("link", { name: /1 тренировка/ })).toHaveCount(20);
});
