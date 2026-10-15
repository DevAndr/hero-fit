import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  addFlagUser,
  errorEventUsers,
  clubAdminLogin,
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
  idOf,
  userExists,
  visitDays,
  withDb,
} from "./db";
import { createGuild, guildName, inviteUrl, nickOf, player } from "./guild-helpers";
import { PASSWORD, quickWorkout, registerUser } from "./helpers";
import { mockTelegram } from "./telegram-webapp";

// Мои данные: выгрузка и удаление аккаунта (спека 2026-10-13-account-data-design); игроков несколько — --workers=8

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
  expect(data.workouts[0].exercises[0].name).toBe("Жим штанги лёжа");
  expect(typeof data.shop.coins).toBe("number");
  expect(Array.isArray(data.shop.items)).toBe(true);

  const [csv] = await Promise.all([page.waitForEvent("download"), block.getByRole("link", { name: "Тренировки (CSV)" }).click()]);
  const rows = await readFile((await csv.path())!, "utf8");
  expect(rows.startsWith("﻿Дата;Тренировка;Упражнение;Подход;Разминка;Вес, кг;Повторы;RIR\r\n")).toBe(true);
  expect(rows).toContain(";Жим штанги лёжа;1;нет;62,5;8;");

  expect((await page.request.get("/account/export/xml")).status()).toBe(404);
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
