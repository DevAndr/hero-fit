import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFlagUser, clubTaskOf, clubTaskRewards, createClub, createClubTask, joinClub, notificationBodies, setNickname, withDb } from "./db";
import { quickWorkout, registerUser } from "./helpers";

// Задания клуба (спека 2026-10-12-club-tasks-design). Флаг clubs — списком на пользователя; игроков несколько — --workers=8

const unique = () => Math.random().toString(36).slice(2, 7);
const BENCH = "Жим штанги лёжа";

async function clubPlayer(browser: Browser) {
  const page: Page = await (await browser.newContext()).newPage();
  const user = await registerUser(page);
  await addFlagUser("clubs", user.login);
  await setNickname(user.login, `Таск${unique()}`);
  return { page, login: user.login };
}

const titles = (login: string) =>
  withDb(async (db) =>
    (await db.query<{ title: string }>(`select n.title from "Notification" n join "User" u on u.id = n."userId" where u.login = $1`, [login])).rows.map(
      (r) => r.title,
    ),
  );

test("EACH: own workout completes the task — summary block and reward", async ({ browser }) => {
  const me = await clubPlayer(browser);
  const club = await createClub(me.login);
  await joinClub(me.login, club.id, new Date(Date.now() - 3600_000));
  const task = await createClubTask(club.id, { type: "WORKOUTS", mode: "EACH", target: 1 });

  await quickWorkout(me.page, BENCH, [{ weight: "40", reps: "10" }]);
  const block = me.page.getByRole("region", { name: "Задания клуба" });
  await expect(block.getByText("Задание выполнено!")).toBeVisible();
  expect(await clubTaskRewards(task)).toEqual([me.login]);
});

test("CLUB: second player finishes it — rewards to contributors only, once", async ({ browser }) => {
  const a = await clubPlayer(browser);
  const b = await clubPlayer(browser);
  const idle = await clubPlayer(browser);
  const club = await createClub(a.login);
  for (const p of [a, b, idle]) await joinClub(p.login, club.id, new Date(Date.now() - 3600_000));
  const task = await createClubTask(club.id, { type: "REPS", mode: "CLUB", target: 30, exerciseName: BENCH });

  await quickWorkout(a.page, BENCH, [
    { weight: "40", reps: "10" },
    { weight: "40", reps: "10" },
  ]);
  const blockA = a.page.getByRole("region", { name: "Задания клуба" });
  await expect(blockA.getByText("+20 повторов")).toBeVisible();
  await expect(blockA.getByText("Задание выполнено!")).toHaveCount(0);
  expect((await clubTaskOf(task)).completedAt).toBeNull();

  await quickWorkout(b.page, BENCH, [{ weight: "40", reps: "10" }]);
  await expect(b.page.getByRole("region", { name: "Задания клуба" }).getByText("Клуб выполнил задание!")).toBeVisible();
  expect((await clubTaskOf(task)).completedAt).not.toBeNull();
  expect((await clubTaskRewards(task)).sort()).toEqual([a.login, b.login].sort());
  await expect.poll(async () => (await titles(a.login)).filter((t) => t.startsWith("Клуб выполнил задание")).length).toBe(1);
  // Без вклада — без сундука, уведомление без push всё равно есть
  expect((await titles(idle.login)).some((t) => t.startsWith("Клуб выполнил задание"))).toBe(true);

  // Вклад после выполнения пишется, но сундуков и уведомлений не прибавляется
  await quickWorkout(a.page, BENCH, [{ weight: "40", reps: "5" }]);
  await expect.poll(async () => (await clubTaskOf(task)).amount).toBe(35);
  expect((await clubTaskRewards(task)).length).toBe(2);
  expect((await titles(a.login)).filter((t) => t.startsWith("Клуб выполнил задание")).length).toBe(1);
  expect(await notificationBodies(a.login)).toBeTruthy();
});

test("a workout finished before joining does not count", async ({ browser }) => {
  const me = await clubPlayer(browser);
  const club = await createClub(me.login);
  // Вступление «в будущем» относительно финиша
  await joinClub(me.login, club.id, new Date(Date.now() + 3600_000));
  const task = await createClubTask(club.id, { type: "WORKOUTS", mode: "CLUB", target: 10 });
  await quickWorkout(me.page, BENCH, [{ weight: "40", reps: "10" }]);
  await expect(me.page.getByRole("region", { name: "Задания клуба" })).toHaveCount(0);
  expect((await clubTaskOf(task)).hits).toBe(0);
});
