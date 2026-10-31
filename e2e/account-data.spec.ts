import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  addFlagUser,
  alertDismissalCount,
  createAlert,
  dismissAlertFor,
  feedbackRows,
  campaignSendCount,
  createCampaign,
  seedFeedback,
  coachRecapCounts,
  linkCoach,
  mondayWeeksAgo,
  seedCoachRecap,
  errorEventUsers,
  clubAdminLogin,
  courseCount,
  clubOf,
  coinTx,
  equipItem,
  setCoins,
  userItems,
  createClub,
  createTelegramUser,
  guildOf,
  joinClub,
  makeFriends,
  notificationTitles,
  recapLeagueNicks,
  respectCount,
  seedRecordWorkout,
  idOf,
  insertWhoopConnection,
  insertWhoopSleep,
  whoopSleepCount,
  userExists,
  visitDays,
  withDb,
  latestWorkout,
  seedTogether,
  setNutritionProfile,
  addFoodEntry,
} from "./db";
import { createGuild, guildName, inviteUrl, nickOf, player } from "./guild-helpers";
import { PASSWORD, quickWorkout, registerUser } from "./helpers";
import { mockTelegram } from "./telegram-webapp";

// Мои данные: выгрузка и удаление аккаунта (спека 2026-10-13-account-data-design); игроков несколько — --workers=8

test("export: nutrition profile is in the JSON", async ({ page }) => {
  const me = await registerUser(page);
  await setNutritionProfile(me.login, { heightCm: 180, birthYear: 1996, activityLevel: "MODERATE", nutritionGoal: "LOSE" });
  await page.goto("/settings");
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.profile).toMatchObject({ heightCm: 180, birthYear: 1996, activityLevel: "MODERATE", nutritionGoal: "LOSE" });
});

test("export: food diary is in the JSON", async ({ page }) => {
  const me = await registerUser(page);
  await addFoodEntry(me.login, { date: "2026-10-30", meal: "BREAKFAST", name: "Овсянка", kcal: 300, protein: 10 });
  await page.goto("/settings");
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.food).toEqual([expect.objectContaining({ date: "2026-10-30", meal: "BREAKFAST", name: "Овсянка", kcal: 300, protein: 10 })]);
});

test("export: JSON has the workout and no secrets, CSV opens in Excel", async ({ page }) => {
  const me = await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "62,5", reps: "8" }]);
  await page.goto("/settings");
  const block = page.getByRole("region", { name: "Мои данные" });

  const [json] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
  expect(json.suggestedFilename()).toMatch(new RegExp(`^hero-fit-${me.login}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  const text = await readFile((await json.path())!, "utf8");
  expect(text).not.toContain("passwordHash");
  const data = JSON.parse(text);
  expect(data.version).toBe(1);
  expect(data.profile.login).toBe(me.login);
  expect(data.profile).toHaveProperty("signupLanding");
  expect(data.profile).toHaveProperty("signupReferrer");
  expect(data.profile).toHaveProperty("signupUtmSource");
  expect(data.profile).toHaveProperty("signupUtmCampaign");
  expect(data.workouts[0].exercises[0].name).toBe("Жим штанги лёжа");
  expect(typeof data.shop.coins).toBe("number");
  expect(Array.isArray(data.shop.items)).toBe(true);

  const [csv] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Тренировки (CSV)" }).click()]);
  const rows = await readFile((await csv.path())!, "utf8");
  expect(rows.startsWith("﻿Дата;Тренировка;Упражнение;Подход;Разминка;Вес, кг;Повторы;RIR;Время, с;Дистанция, м\r\n")).toBe(true);
  expect(rows).toContain(";Жим штанги лёжа;1;нет;62,5;8;");

  expect((await page.request.get("/account/export/xml")).status()).toBe(404);
});

test("stretch course: export lists it, deletion removes it", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("stretching", me.login);
  await addFlagUser("stretch_course", me.login);
  await page.goto("/stretching");
  const card = page.getByRole("region", { name: "Курс «Сесть на шпагат»" });
  await card.getByRole("button", { name: "Начать курс" }).click();
  const dialog = page.getByRole("dialog", { name: "Начать курс" });
  await dialog.getByRole("radio", { name: "Поперечный шпагат" }).click();
  await dialog.getByLabel("Сейчас, см до пола").fill("25");
  await dialog.getByRole("button", { name: "Начать курс" }).click();
  await expect(dialog).toBeHidden();
  expect(await courseCount(me.login)).toBe(1);

  await page.goto("/settings");
  const block = page.getByRole("region", { name: "Мои данные" });
  const [json] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.stretchCourses[0].skill).toBe("SPLIT_SIDE");
  expect(data.stretchCourses[0]).not.toHaveProperty("id");
  expect(data.stretchCourses[0]).not.toHaveProperty("userId");

  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(me.login)).toBe(false);
  expect(await courseCount(me.login)).toBe(0);
});

/** Удалить аккаунт из настроек; `secret` — пароль или логин (учётка без пароля). */
async function deleteAccount(page: Page, secret: string, field: "Пароль" | "Логин" = "Пароль") {
  await page.goto("/settings");
  await page.getByRole("region", { name: "Удаление аккаунта" }).getByRole("button", { name: "Удалить аккаунт" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Удалить аккаунт?" });
  await dialog.getByLabel(field, { exact: true }).fill(secret);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  return dialog;
}

const nickname = (login: string) =>
  withDb(async (db) => (await db.query<{ nickname: string }>(`select nickname from "User" where login = $1`, [login])).rows[0].nickname);

test("delete: wrong password is refused and throttled like sign-in", async ({ page }) => {
  const me = await registerUser(page);
  const dialog = await deleteAccount(page, "wrong-password");
  await expect(dialog.getByText("Неверный пароль")).toBeVisible();
  expect(await userExists(me.login)).toBe(true);
  for (let i = 0; i < 4; i++) {
    await dialog.getByLabel("Пароль", { exact: true }).fill(`wrong-${i}`);
    await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
    await expect(dialog.getByText(/Неверный пароль|Слишком много попыток/)).toBeVisible();
  }
  // Блокировка тем же счётчиком, что вход: даже верный пароль — отказ
  await dialog.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(dialog.getByText(/Слишком много попыток — попробуйте через \d+ мин/)).toBeVisible();
  expect(await userExists(me.login)).toBe(true);
});

test("delete: the account is gone, sign-in fails", async ({ page }) => {
  const me = await registerUser(page);
  const id = await idOf(me.login);
  // Журнал заходов удаляется вместе с аккаунтом
  expect(await visitDays({ id })).not.toHaveLength(0);
  // Неудача пишет логин в счётчик входа — после удаления его там быть не должно
  const dialog = await deleteAccount(page, "wrong-password");
  await expect(dialog.getByText("Неверный пароль")).toBeVisible();
  await dialog.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await expect(page.getByText("Аккаунт удалён. Спасибо, что тренировались с Hero Fit")).toBeVisible();
  expect(await userExists(me.login)).toBe(false);
  expect(await visitDays({ id })).toEqual([]);
  expect(
    await withDb(async (db) => (await db.query(`select 1 from "LoginThrottle" where key in ($1, $2)`, [`id:${me.login}`, `id:${me.email}`])).rowCount),
  ).toBe(0);
  await page.goto("/login");
  await page.getByLabel("Логин или email").fill(me.login);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
});

test("shop: export lists purchases and coin history; delete passes with items and ledger", async ({ page }) => {
  const me = await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "62,5", reps: "8" }]);
  await setCoins(me.login, 777);
  await equipItem(me.login, "frame", "frame:bronze");
  expect((await userItems(me.login)).length).toBeGreaterThan(0);
  const before = (await coinTx(me.login)).length;
  await page.goto("/settings");
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.shop.coins).toBe(777);
  expect(data.shop.items.map((i: { code: string }) => i.code)).toContain("frame:bronze");
  expect(data.shop.coinHistory.length).toBe(before);
  expect(JSON.stringify(data.shop.coinHistory)).not.toContain("workout:");
  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(me.login)).toBe(false);
});

test("guild leader deletes: the guild goes to the member; alone — the guild is gone", async ({ browser }) => {
  const a = await player(browser, "Аня");
  const b = await player(browser, "Боря");
  const name = guildName(a.login);
  await createGuild(a.page, name);
  await b.page.goto(await inviteUrl(a.page));
  await b.page.getByRole("button", { name: "Вступить" }).click();
  await expect(b.page).toHaveURL(/\/guild$/);

  await a.page.goto("/settings");
  await a.page.getByRole("region", { name: "Удаление аккаунта" }).getByRole("button", { name: "Удалить аккаунт" }).click();
  await expect(a.page.getByRole("alertdialog").getByText(`Гильдия «${name}» перейдёт к ${nickOf(b.login, "Бо")}`)).toBeVisible();
  await a.page.getByRole("alertdialog").getByRole("button", { name: "Отмена" }).click();
  await deleteAccount(a.page, PASSWORD);
  await expect(a.page).toHaveURL(/deleted=1/);
  expect((await guildOf(b.login))?.name).toBe(name);
  await expect.poll(() => notificationTitles(b.login)).toContain(`Ты теперь глава гильдии «${name}»`);

  const c = await player(browser, "Вика");
  const alone = guildName(c.login);
  await createGuild(c.page, alone);
  await deleteAccount(c.page, PASSWORD);
  await expect(c.page).toHaveURL(/deleted=1/);
  expect(await withDb(async (db) => (await db.query(`select 1 from "Guild" where name = $1`, [alone])).rowCount)).toBe(0);
});

test("club admin deletes: the approved club goes to the oldest member, the pending application is removed", async ({ browser }) => {
  const admin = await player(browser, "Ада");
  const member = await player(browser, "Мира");
  await addFlagUser("clubs", admin.login);
  await addFlagUser("clubs", member.login);
  const clubName = `Удаляемый ${randomUUID().slice(0, 6)}`;
  const club = await createClub(admin.login, { name: clubName });
  const pending = await createClub(admin.login, { status: "PENDING" });
  await joinClub(admin.login, club.id, new Date(Date.now() - 7200_000));
  await joinClub(member.login, club.id, new Date(Date.now() - 3600_000));

  await deleteAccount(admin.page, PASSWORD);
  await expect(admin.page).toHaveURL(/deleted=1/);
  expect(await clubAdminLogin(club.id)).toBe(member.login);
  expect(await clubOf(member.login)).toBe(club.id);
  await expect.poll(() => notificationTitles(member.login)).toContain(`Ты теперь админ клуба «${clubName}»`);
  expect(await withDb(async (db) => (await db.query(`select 1 from "Club" where id = $1`, [pending.id])).rowCount)).toBe(0);
});

test("friend's weekly recap shows «Удалённый игрок» instead of the nickname", async ({ browser }) => {
  const me = await player(browser, "Дима");
  const friend = await player(browser, "Ира");
  const [myNick, friendNick] = await Promise.all([nickname(me.login), nickname(friend.login)]);
  await makeFriends(me.login, myNick, friend.login, friendNick);
  const data = {
    version: 1,
    week: "2026-09-07",
    league: {
      place: 2,
      of: 2,
      xp: 50,
      rows: [
        { nickname: myNick, xp: 90, place: 1, me: false },
        { nickname: friendNick, xp: 50, place: 2, me: true },
      ],
    },
  };
  await withDb((db) =>
    db.query(`insert into "WeeklyRecap" (id, "userId", week, data, "createdAt") select $1, id, '2026-09-07', $2::jsonb, now() from "User" where login = $3`, [
      randomUUID(),
      JSON.stringify(data),
      friend.login,
    ]),
  );
  await deleteAccount(me.page, PASSWORD);
  await expect(me.page).toHaveURL(/deleted=1/);
  const nicks = await recapLeagueNicks(friend.login);
  expect(nicks).toContain("Удалённый игрок");
  expect(nicks).not.toContain(myNick);
  expect(nicks).toContain(friendNick);
});

test("passwordless Telegram account confirms with its login", async ({ page }) => {
  const id = String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const login = await createTelegramUser(id);
  await mockTelegram(page, { id, firstName: "Тг" });
  await page.goto("/tg");
  await expect(page).toHaveURL(/\/dashboard$/);
  const dialog = await deleteAccount(page, "not-my-login", "Логин");
  await expect(dialog.getByText("Логин не совпадает")).toBeVisible();
  await dialog.getByLabel("Логин", { exact: true }).fill(login);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect.poll(() => userExists(login)).toBe(false);
});

/** Своё упражнение пользователя (минуя UI). */
async function ownExercise(login: string, name: string): Promise<string> {
  const id = randomUUID();
  await withDb((db) =>
    db.query(
      `insert into "Exercise" (id, "userId", name, "muscleGroups", "isBodyweight", "defaultRestSec", "createdAt", "updatedAt")
       select $1, id, $2, array['CHEST']::"MuscleGroup"[], false, 90, now(), now() from "User" where login = $3`,
      [id, name, login],
    ),
  );
  return id;
}

/** Завершённая тренировка с упражнением и рекорд по нему (минуя UI). */
async function workoutWith(login: string, exerciseId: string) {
  await withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(`select id from "User" where login = $1`, [login]);
    const uid = rows[0].id;
    const [w, we, set] = [randomUUID(), randomUUID(), randomUUID()];
    await db.query(
      `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
       values ($1, $2, 'Своё', 'COMPLETED', now() - interval '2 hours', now() - interval '1 hour', 3600, 400, 1, 10, now(), now())`,
      [w, uid],
    );
    await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 0, 90)`, [we, w, exerciseId]);
    await db.query(`insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "isWarmup", "completedAt") values ($1, $2, 0, 40, 10, false, now())`, [set, we]);
    await db.query(`insert into "PersonalRecord" (id, "userId", "exerciseId", type, value, "setId", "achievedAt") values ($1, $2, $3, 'MAX_WEIGHT', 40, $4, now())`, [
      randomUUID(),
      uid,
      exerciseId,
      set,
    ]);
  });
}

test("own exercise used in own workout and template does not block deletion", async ({ page }) => {
  const me = await registerUser(page);
  const ex = await ownExercise(me.login, `Моё ${randomUUID().slice(0, 6)}`);
  await workoutWith(me.login, ex);
  await withDb(async (db) => {
    const t = randomUUID();
    await db.query(`insert into "WorkoutTemplate" (id, "userId", name, "createdAt", "updatedAt") select $1, id, 'Мой шаблон', now(), now() from "User" where login = $2`, [t, me.login]);
    await db.query(`insert into "TemplateExercise" (id, "templateId", "exerciseId", "order", "targetSets", "targetReps") values ($1, $2, $3, 0, 3, 10)`, [randomUUID(), t, ex]);
  });
  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(me.login)).toBe(false);
});

test("coach's own exercise in a client's history: the client keeps the workout and the record", async ({ browser }) => {
  const coach = await player(browser, "Тренер");
  const client = await player(browser, "Клиент");
  const name = `Тренерское ${randomUUID().slice(0, 6)}`;
  const ex = await ownExercise(coach.login, name);
  await workoutWith(client.login, ex);
  await deleteAccount(coach.page, PASSWORD);
  await expect(coach.page).toHaveURL(/deleted=1/);
  const kept = await withDb(async (db) =>
    (
      await db.query<{ name: string; owner: string; archived: boolean; records: number }>(
        `select e.name, u.login as owner, e."archivedAt" is not null as archived,
                (select count(*) from "PersonalRecord" pr where pr."exerciseId" = e.id and pr."userId" = u.id)::int as records
         from "WorkoutExercise" we join "Workout" w on w.id = we."workoutId" join "User" u on u.id = w."userId" join "Exercise" e on e.id = we."exerciseId"
         where u.login = $1`,
        [client.login],
      )
    ).rows,
  );
  expect(kept).toEqual([{ name, owner: client.login, archived: true, records: 1 }]);
});

test("delete: error events stay without the user", async ({ page, baseURL }) => {
  const me = await registerUser(page);
  const message = `e2e deleted user boom ${Array.from({ length: 10 }, () => "ghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 20)]).join("")}`;
  const res = await page.request.post("/api/errors", { headers: { Origin: baseURL! }, data: { message } });
  expect(res.status()).toBe(204);
  const id = await idOf(me.login);
  expect(await errorEventUsers(message)).toEqual([id]);
  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  expect(await errorEventUsers(message)).toEqual([null]);
});

test("coach program: the coach and then the client delete their accounts", async ({ browser }) => {
  const coach = await player(browser, "Тренер");
  const client = await player(browser, "Клиент");
  const [coachId, clientId] = [await idOf(coach.login), await idOf(client.login)];
  await withDb(async (db) => {
    const t = randomUUID();
    const p = randomUUID();
    const a = randomUUID();
    await db.query(`insert into "WorkoutTemplate" (id, "userId", name, "updatedAt") values ($1, $2, 'Программа', now())`, [t, coachId]);
    await db.query(`insert into "CoachProgram" (id, "coachId", name, weeks, "stepKind", "stepValue", "updatedAt") values ($1, $2, 'Сила', 8, 'PERCENT', 2.5, now())`, [p, coachId]);
    await db.query(`insert into "CoachProgramDay" (id, "programId", weekday, "templateId", time) values ($1, $2, 0, $3, '18:00')`, [randomUUID(), p, t]);
    await db.query(
      `insert into "ProgramAssignment" (id, "clientId", "coachId", "programId", name, "startDate", weeks, "stepKind", "stepValue", "deloadPct") values ($1, $2, $3, $4, 'Сила', '2026-10-12', 8, 'PERCENT', 2.5, 10)`,
      [a, clientId, coachId, p],
    );
    await db.query(`insert into "ProgramBase" ("assignmentId", "templateId", "exerciseId", weight) select $1, $2, id, 100 from "Exercise" where "userId" is null limit 1`, [a, t]);
    await db.query(
      `insert into "PlanSeries" (id, "userId", "templateId", title, weekday, time, "startDate", "endDate", "coachId", "programAssignmentId", "updatedAt") values ($1, $2, $3, 'Программа', 0, '18:00', '2026-10-12', '2026-12-06', $4, $5, now())`,
      [randomUUID(), clientId, t, coachId, a],
    );
  });
  await deleteAccount(coach.page, PASSWORD);
  await expect(coach.page).toHaveURL(/deleted=1/);
  // Назначение у клиента осталось без тренера — выгрузка и удаление не падают
  await client.page.goto("/settings");
  const [json] = await Promise.all([client.page.waitForEvent("download"), client.page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  expect(JSON.parse(await readFile((await json.path())!, "utf8")).programs).toEqual([expect.objectContaining({ name: "Сила", weeks: 8 })]);
  await deleteAccount(client.page, PASSWORD);
  await expect(client.page).toHaveURL(/deleted=1/);
  expect(await userExists(client.login)).toBe(false);
});

test("coach weekly recap: both exports, and the client's account deletion leaves the coach's snapshot", async ({ browser }) => {
  const coach = await player(browser, "Тренер");
  const client = await player(browser, "Клиент");
  await linkCoach(coach.login, client.login);
  await seedCoachRecap(coach.login, client.login, mondayWeeksAgo(1));

  const exportOf = async (page: Page) => {
    await page.goto("/settings");
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
    return JSON.parse(await readFile((await json.path())!, "utf8"));
  };
  const coachData = await exportOf(coach.page);
  expect(coachData.coachRecaps[0].week).toBe(mondayWeeksAgo(1));
  expect(coachData.coachRecaps[0].totals.clients).toBe(1);
  expect(coachData.coachRecaps[0].clients[0].client).toBe(nickOf(client.login, "Кл"));
  const clientData = await exportOf(client.page);
  expect(clientData.coachRecapsAboutMe[0].coach).toBe(nickOf(coach.login, "Тр"));
  expect(clientData.coachRecapsAboutMe[0].week).toBe(mondayWeeksAgo(1));

  const clientId = await idOf(client.login);
  await deleteAccount(client.page, PASSWORD);
  await expect(client.page).toHaveURL(/deleted=1/);
  expect(await coachRecapCounts(coach.login, clientId)).toEqual({ client: 0, recaps: 1 });
});

test("respects and kudos: both exports list them, the author's account deletion removes them", async ({ browser }) => {
  const author = await player(browser, "Автор");
  const friend = await player(browser, "Друг");
  const [aNick, fNick] = [nickOf(author.login, "Ав"), nickOf(friend.login, "Др")];
  await makeFriends(author.login, aNick, friend.login, fNick);
  const { workoutId, exerciseIds } = await seedRecordWorkout(author.login, [{ exercise: "Жим штанги лёжа", value: 100 }]);
  const exerciseId = exerciseIds["Жим штанги лёжа"];
  await withDb(async (db) => {
    const fid = (await db.query<{ id: string }>(`select id from "User" where login = $1`, [friend.login])).rows[0].id;
    await db.query(`insert into "RecordRespect" (id, "workoutId", "exerciseId", "userId") values ($1, $2, $3, $4)`, [randomUUID(), workoutId, exerciseId, fid]);
    await db.query(`insert into "Kudos" (id, "workoutId", "userId") values ($1, $2, $3)`, [randomUUID(), workoutId, fid]);
  });

  const exportOf = async (page: Page) => {
    await page.goto("/settings");
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
    const text = await readFile((await json.path())!, "utf8");
    return { text, data: JSON.parse(text) };
  };
  const given = await exportOf(friend.page);
  expect(given.data.respectsGiven).toEqual([expect.objectContaining({ exercise: "Жим штанги лёжа", to: aNick })]);
  expect(given.data.kudosGiven).toEqual([expect.objectContaining({ to: aNick })]);
  const received = await exportOf(author.page);
  expect(received.data.respectsReceived).toEqual([expect.objectContaining({ exercise: "Жим штанги лёжа", from: fNick })]);
  expect(received.data.kudosReceived).toEqual([expect.objectContaining({ from: fNick })]);
  expect(received.text).not.toContain(workoutId);

  await deleteAccount(author.page, PASSWORD);
  await expect(author.page).toHaveURL(/deleted=1/);
  expect(await respectCount(workoutId)).toBe(0);
  expect((await exportOf(friend.page)).data).toMatchObject({ respectsGiven: [], kudosGiven: [] });
});

test("coach's own exercise: a friend's respect for the client's record survives the coach's deletion", async ({ browser }) => {
  const coach = await player(browser, "Тренер");
  const client = await player(browser, "Клиент");
  const friend = await player(browser, "Друг");
  const cNick = nickOf(client.login, "Кл");
  await makeFriends(client.login, cNick, friend.login, nickOf(friend.login, "Др"));
  const name = `Тренерское ${randomUUID().slice(0, 6)}`;
  const ex = await ownExercise(coach.login, name);
  const { workoutId, exerciseIds } = await seedRecordWorkout(client.login, [{ exercise: name, value: 100 }], { exerciseOwner: coach.login });
  expect(exerciseIds[name]).toBe(ex);
  const fid = await idOf(friend.login);
  await withDb((db) => db.query(`insert into "RecordRespect" (id, "workoutId", "exerciseId", "userId") values ($1, $2, $3, $4)`, [randomUUID(), workoutId, ex, fid]));

  await deleteAccount(coach.page, PASSWORD);
  await expect(coach.page).toHaveURL(/deleted=1/);
  expect(await respectCount(workoutId)).toBe(1);

  // В ленте друга счётчик на месте, кнопка снимает и ставит респект без ошибки
  await friend.page.goto("/friends");
  const card = friend.page.getByRole("article", { name: `${cNick}: Рекордная` });
  const pressed = card.getByRole("button", { name: `Убрать респект у ${cNick} за ${name}` });
  await expect(pressed).toHaveAttribute("aria-pressed", "true");
  await expect(pressed).toHaveText("1");
  await pressed.click();
  await expect.poll(() => respectCount(workoutId)).toBe(0);
  await friend.page.reload();
  await card.getByRole("button", { name: `Дать респект ${cNick} за ${name}` }).click();
  await expect(card.getByRole("button", { name: `Убрать респект у ${cNick} за ${name}` })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => respectCount(workoutId)).toBe(1);
  await expect(friend.page.getByText("Рекорд не найден")).toHaveCount(0);
});

test("my data: favorite exercises are exported and go with the account", async ({ page }) => {
  const me = await registerUser(page);
  await page.goto("/exercises");
  await page.getByRole("button", { name: "В избранное: Жим ногами" }).first().click();
  await expect(page.getByRole("region", { name: "Избранное" })).toContainText("Жим ногами");

  await page.goto("/settings");
  const block = page.getByRole("region", { name: "Мои данные" });
  const [json] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.favoriteExercises).toEqual([{ exercise: "Жим ногами", createdAt: expect.any(String) }]);

  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(me.login)).toBe(false);
});

test("my data: whoop sleeps are exported and go with the account", async ({ page }) => {
  const me = await registerUser(page);
  await insertWhoopConnection(me.login);
  const sleepId = await insertWhoopSleep(me.login, { end: new Date(), recoveryPct: 72, hrvMs: 81 });
  expect(await whoopSleepCount(me.login)).toBe(1);

  await page.goto("/settings");
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.whoop.sleeps).toEqual([expect.objectContaining({ recoveryPct: 72, hrvMs: 81, calibrating: false })]);

  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(me.login)).toBe(false);
  // whoopSleepCount соединяется с User, которого уже нет, — считаем напрямую
  expect(await withDb(async (db) => (await db.query(`select 1 from "WhoopSleep" where id = $1`, [sleepId])).rowCount)).toBe(0);
});

test("alert dismissal does not block deletion", async ({ page }) => {
  const me = await registerUser(page);
  // Выключенное — соседние спеки его не видят
  const alert = await createAlert({ kind: "BANNER", body: "e2e-deleted", enabled: false });
  await dismissAlertFor(me.login, alert);
  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await userExists(me.login)).toBe(false);
  expect(await alertDismissalCount(alert)).toBe(0);
});

test("feedback: export lists it without the admin note; deletion removes it", async ({ page }) => {
  const me = await registerUser(page);
  const body = `Экспорт обращения ${randomUUID().slice(0, 6)}`;
  await seedFeedback(me.login, 1, { body, adminNote: "секретная_заметка" });
  await page.goto("/settings");
  const block = page.getByRole("region", { name: "Мои данные" });
  const [json] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const text = await readFile((await json.path())!, "utf8");
  expect(JSON.parse(text).feedback).toEqual([{ kind: "IDEA", body, status: "NEW", page: null, createdAt: expect.any(String) }]);
  expect(text).not.toContain("секретная_заметка");

  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await feedbackRows(body)).toHaveLength(0);
});


test("campaigns: export lists sends without ids, deletion removes them", async ({ page }) => {
  const me = await registerUser(page);
  const name = `Выгрузка ${randomUUID().slice(0, 6)}`;
  const campaignId = await createCampaign({ name, condition: "INACTIVE", days: 3, hour: 20, status: "ARCHIVED" });
  await withDb((db) =>
    db.query(`insert into "CampaignSend" (id, "campaignId", "userId", episode, "sentAt") select $1, $2, id, '2026-10-17', now() from "User" where login = $3`, [
      randomUUID(),
      campaignId,
      me.login,
    ]),
  );
  await page.goto("/settings");
  const block = page.getByRole("region", { name: "Мои данные" });
  const [json] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const text = await readFile((await json.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.campaignSends).toEqual([{ campaign: name, sentAt: expect.any(String), returnedAt: null }]);
  expect(data.pushDevices).toEqual([]);
  expect(data.profile.notifications.notifyComeback).toBe(true);
  expect(text).not.toContain(campaignId);

  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/deleted=1/);
  expect(await campaignSendCount(campaignId)).toBe(0);
});

test("train together: export lists the session; the partner's deletion removes the block from the summary", async ({ browser }) => {
  const host = await player(browser, "Вася");
  const guest = await player(browser, "Оля");
  await addFlagUser("together", host.login);
  const [hostNick, guestNick] = await Promise.all([nickname(host.login), nickname(guest.login)]);
  await makeFriends(host.login, hostNick, guest.login, guestNick);
  await quickWorkout(host.page, "Жим штанги лёжа", [{ weight: "60", reps: "8" }]);
  const workout = await latestWorkout(host.login);
  await seedTogether(host.login, guest.login, { status: "ACTIVE", hostWorkoutId: workout.id });

  await host.page.goto(`/workouts/${workout.id}`);
  await expect(host.page.getByRole("region", { name: "Вместе с партнёром" })).toContainText(`Вместе с ${guestNick}`);
  await host.page.goto("/settings");
  const [json] = await Promise.all([host.page.waitForEvent("download"), host.page.getByRole("region", { name: "Мои данные" }).getByRole("link", { name: "Все данные (JSON)" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data.trainingSessions).toEqual([expect.objectContaining({ role: "позвал", partner: guestNick, status: "ACTIVE", bonusXp: 0 })]);
  expect(data.cheersSent).toBe(0);

  await deleteAccount(guest.page, PASSWORD);
  await expect(guest.page).toHaveURL(/deleted=1/);
  await host.page.goto(`/workouts/${workout.id}`);
  await expect(host.page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(host.page.getByRole("region", { name: "Вместе с партнёром" })).toHaveCount(0);
});
