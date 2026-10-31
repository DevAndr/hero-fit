import { expect, test } from "@playwright/test";
import { addFlagUser, staleWorkoutRow, workoutNotifications, workoutStatus } from "./db";
import { registerUser, runTick } from "./helpers";

const H = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * H);

test("forgotten workout: one reminder after 4 hours without activity", async ({ page, request }) => {
  const me = await registerUser(page);
  await addFlagUser("stale_workouts", me.login);
  const id = await staleWorkoutRow(me.login, ago(5), ago(2));

  await runTick(request, new Date(), "stale");
  await expect.poll(() => workoutNotifications(me.login)).toEqual([
    { title: "Тренировка не завершена", body: "«Забытая» идёт уже 5 ч — завершите или отмените её", pushed: true },
  ]);
  await runTick(request, new Date(), "stale");
  expect(await workoutNotifications(me.login)).toHaveLength(1);
  expect(await workoutStatus(id)).toBe("IN_PROGRESS");
});

test("no reminder while sets are still being logged", async ({ page, request }) => {
  const me = await registerUser(page);
  await addFlagUser("stale_workouts", me.login);
  await staleWorkoutRow(me.login, ago(5), ago(0.2));
  await runTick(request, new Date(), "stale");
  expect(await workoutNotifications(me.login)).toEqual([]);
});

test("a workout open for a day is cancelled: status CANCELLED, feed entry without push, training page is free", async ({ page, request }) => {
  const me = await registerUser(page);
  await addFlagUser("stale_workouts", me.login);
  const id = await staleWorkoutRow(me.login, ago(25), ago(1));

  await runTick(request, new Date(), "stale");
  await expect.poll(() => workoutStatus(id)).toBe("CANCELLED");
  expect(await workoutNotifications(me.login)).toEqual([
    { title: "Тренировка отменена", body: "«Забытая» не завершили за сутки — она отменена и в статистику не попала", pushed: false },
  ]);
  await page.goto("/training");
  await expect(page.getByRole("button", { name: /Пустая тренировка/ })).toBeVisible();
});

test("without the flag forgotten workouts stay as they are", async ({ page, request }) => {
  const me = await registerUser(page);
  const id = await staleWorkoutRow(me.login, ago(25), ago(25));
  await runTick(request, new Date(), "stale");
  expect(await workoutStatus(id)).toBe("IN_PROGRESS");
  expect(await workoutNotifications(me.login)).toEqual([]);
});
