import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  addFlagUser,
  clubAdminLogin,
  clubOf,
  createClub,
  createTelegramUser,
  guildOf,
  joinClub,
  makeFriends,
  notificationTitles,
  recapLeagueNicks,
  userExists,
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
  await deleteAccount(page, PASSWORD);
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await expect(page.getByText("Аккаунт удалён. Спасибо, что тренировались с Hero Fit")).toBeVisible();
  expect(await userExists(me.login)).toBe(false);
  await page.goto("/login");
  await page.getByLabel("Логин или email").fill(me.login);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
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
