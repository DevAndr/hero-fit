import { expect, test } from "@playwright/test";
import { createUserRow, makeFriends, mondayWeeksAgo, seedRecapWeek, userId, withDb } from "./db";
import { registerUser, uniqueLogin } from "./helpers";

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
