import { expect, test, type Browser, type Page } from "@playwright/test";
import { addFlagUser, clubTaskOf, clubTaskRewards, createClub, createClubTask, joinClub, notificationBodies, setNickname, withDb } from "./db";

const openRewards = (taskId: string, login: string) =>
  withDb((db) =>
    db.query(`update "ClubTaskReward" set "openedAt" = now() where "taskId" = $1 and "userId" = (select id from "User" where login = $2)`, [taskId, login]),
  );
const rewardFor = (taskId: string, login: string) =>
  withDb((db) =>
    db.query(`insert into "ClubTaskReward" (id, "taskId", "userId") select md5(random()::text), $1, id from "User" where login = $2`, [taskId, login]),
  );
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

test("admin creates tasks: minimum hint, limit of 3; member completes EACH and opens the chest", async ({ browser }) => {
  const admin = await clubPlayer(browser);
  const member = await clubPlayer(browser);
  const club = await createClub(admin.login);
  for (const p of [admin, member]) await joinClub(p.login, club.id, new Date(Date.now() - 3600_000));

  await admin.page.goto(`/clubs/${club.id}/manage`);
  const tasks = admin.page.getByRole("region", { name: "Задания клуба" });
  await tasks.getByRole("button", { name: "Новое задание" }).click();
  const dialog = admin.page.getByRole("dialog", { name: "Новое задание" });
  await dialog.getByRole("radio", { name: "Тренировки" }).click();
  await dialog.getByRole("radio", { name: "Каждому" }).click();
  await dialog.getByLabel("Длительность, дней").fill("7");
  await dialog.getByLabel("Цель", { exact: true }).fill("1");
  await expect(dialog.getByText("Минимум: 2")).toBeVisible();
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByText("Минимум для такого задания: 2")).toBeVisible();
  await dialog.getByLabel("Цель", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  await expect(tasks.getByText("Каждому: 2 тренировки за 7 дней")).toBeVisible();
  await expect.poll(async () => (await titles(member.login)).some((t) => t === "Новое задание клуба: Каждому: 2 тренировки за 7 дней")).toBe(true);

  // Ещё два — и четвёртое упирается в лимит
  await createClubTask(club.id, { type: "HOURS", mode: "CLUB", target: 600 });
  await createClubTask(club.id, { type: "VOLUME", mode: "CLUB", target: 100000 });
  await tasks.getByRole("button", { name: "Новое задание" }).click();
  await dialog.getByRole("radio", { name: "Тренировки" }).click();
  await dialog.getByRole("radio", { name: "Каждому" }).click();
  await dialog.getByLabel("Длительность, дней").fill("7");
  await dialog.getByLabel("Цель", { exact: true }).fill("5");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByText("В клубе уже 3 активных задания")).toBeVisible();

  // Участник: вкладка «Задания» по умолчанию, свой прогресс, сундук
  await member.page.goto(`/clubs/${club.id}`);
  const card = member.page.getByRole("article", { name: "Каждому: 2 тренировки за 7 дней" });
  await expect(card.getByText("0 / 2")).toBeVisible();
  await quickWorkout(member.page, BENCH, [{ weight: "40", reps: "10" }]);
  await quickWorkout(member.page, BENCH, [{ weight: "40", reps: "10" }]);
  await member.page.goto(`/clubs/${club.id}`);
  await expect(card.getByText("Выполнено")).toBeVisible();
  await card.getByRole("button", { name: "Открыть сундук" }).click();
  await member.page.getByRole("dialog", { name: "Сундук задания" }).getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(member.page.getByRole("dialog", { name: "Награда получена" })).toContainText("+75 XP");
});

test("CLUB privacy: shares in %, EACH: others' progress hidden; outsider sees only the total", async ({ browser }) => {
  const a = await clubPlayer(browser);
  const b = await clubPlayer(browser);
  const outsider = await clubPlayer(browser);
  const club = await createClub(a.login);
  for (const p of [a, b]) await joinClub(p.login, club.id, new Date(Date.now() - 3600_000));
  const clubTask = await createClubTask(club.id, { type: "REPS", mode: "CLUB", target: 100, exerciseName: BENCH });
  const each = await createClubTask(club.id, { type: "WORKOUTS", mode: "EACH", target: 1 });
  await quickWorkout(a.page, BENCH, [{ weight: "40", reps: "10" }]);
  await quickWorkout(b.page, BENCH, [
    { weight: "40", reps: "10" },
    { weight: "40", reps: "10" },
    { weight: "40", reps: "10" },
  ]);
  expect((await clubTaskOf(clubTask)).amount).toBe(40);
  expect((await clubTaskRewards(each)).length).toBe(2);

  await a.page.goto(`/clubs/${club.id}?tab=tasks`);
  const cardClub = a.page.getByRole("article", { name: /Клубом: 100 повторов/ });
  await expect(cardClub.getByText("40 / 100")).toBeVisible();
  const top = cardClub.getByRole("list", { name: "Лучшие вкладчики" });
  await expect(top.getByText("75 %")).toBeVisible();
  await expect(top.getByText(/повтор/)).toHaveCount(0);
  await expect(cardClub.getByText("Твой вклад: 25 %")).toBeVisible();
  const cardEach = a.page.getByRole("article", { name: "Каждому: 1 тренировка за 7 дней" });
  await expect(cardEach.getByText("Выполнили: 2")).toBeVisible();

  await outsider.page.goto(`/clubs/${club.id}?tab=tasks`);
  const outClub = outsider.page.getByRole("article", { name: /Клубом: 100 повторов/ });
  await expect(outClub.getByText("40 / 100")).toBeVisible();
  await expect(outClub.getByRole("list", { name: "Лучшие вкладчики" })).toHaveCount(0);
  await expect(outsider.page.getByText(/Выполнили/)).toHaveCount(0);
});

test("weekly chest limit and cancel", async ({ browser }) => {
  const admin = await clubPlayer(browser);
  const club = await createClub(admin.login);
  await joinClub(admin.login, club.id, new Date(Date.now() - 3600_000));
  const t1 = await createClubTask(club.id, { type: "WORKOUTS", mode: "EACH", target: 1 });
  const t2 = await createClubTask(club.id, { type: "WORKOUTS", mode: "EACH", target: 2 });
  const t3 = await createClubTask(club.id, { type: "WORKOUTS", mode: "EACH", target: 3 });
  for (const t of [t1, t2, t3]) await rewardFor(t, admin.login);
  await openRewards(t1, admin.login);
  await openRewards(t2, admin.login);
  await admin.page.goto(`/clubs/${club.id}?tab=tasks`);
  await expect(admin.page.getByRole("article", { name: "Каждому: 3 тренировки за 7 дней" }).getByText("Откроется с понедельника")).toBeVisible();

  // Отмена: сундук за выполненное остаётся, новый вклад не пишется
  await admin.page.goto(`/clubs/${club.id}/manage`);
  const row = admin.page.getByRole("region", { name: "Задания клуба" }).getByRole("listitem").filter({ hasText: "Каждому: 3 тренировки за 7 дней" });
  await row.getByRole("button", { name: "Отменить" }).click();
  await admin.page.getByRole("alertdialog").getByRole("button", { name: "Отменить задание" }).click();
  await expect.poll(async () => (await clubTaskOf(t3)).cancelledAt).not.toBeNull();
  await quickWorkout(admin.page, BENCH, [{ weight: "40", reps: "10" }]);
  expect((await clubTaskOf(t3)).hits).toBe(0);
  await admin.page.goto(`/clubs/${club.id}?tab=tasks`);
  const archived = admin.page.getByRole("region", { name: "Архив" }).getByRole("article", { name: "Каждому: 3 тренировки за 7 дней" });
  await expect(archived.getByText("Отменено")).toBeVisible();
  await expect(archived.getByText("Откроется с понедельника")).toBeVisible();
});
