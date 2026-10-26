import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  activeWorkoutId,
  addFlagUser,
  makeFriends,
  notificationTitles,
  seedTogether,
  setPrivacy,
  shiftSession,
  shiftWorkoutStart,
  togetherBonuses,
  togetherSessionOf,
  withDb,
} from "./db";
import { addToWorkout, registerUser } from "./helpers";

// Совместная тренировка (спека 2026-10-26-train-together): флаг — списком пользователей (addFlagUser), поэтому параллельно.
// Два контекста — логика от ширины экрана не зависит, только desktop.
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Два контекста — только desktop");
});

const SQUAT = "Приседания со штангой";
const BENCH = "Жим штанги лёжа";
const nickOf = (prefix: string, login: string) => `${prefix}_${login.slice(-8)}`;

type Player = { page: Page; login: string; nick: string };

/** Два друга с флагом together. */
async function pair(browser: Browser, page: Page, flag = true): Promise<[Player, Player]> {
  const ctx = await browser.newContext();
  const page2 = await ctx.newPage();
  const [a, b] = await Promise.all([registerUser(page, "Хозяин"), registerUser(page2, "Гость")]);
  const host = { page, login: a.login, nick: nickOf("Host", a.login) };
  const guest = { page: page2, login: b.login, nick: nickOf("Guest", b.login) };
  await makeFriends(host.login, host.nick, guest.login, guest.nick);
  if (flag) {
    await addFlagUser("together", host.login);
    await addFlagUser("together", guest.login);
  }
  return [host, guest];
}

async function startWorkout(page: Page, login: string, exercise: string) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, [exercise]);
  await page.getByRole("button", { name: "Начать", exact: true }).click();
  // Черновик уходит на сервер с задержкой — перезагрузка раньше потеряла бы упражнение
  await expect
    .poll(() =>
      withDb(async (db) => {
        const { rows } = await db.query(
          `select 1 from "WorkoutExercise" we join "Workout" w on w.id = we."workoutId" join "User" u on u.id = w."userId" where u.login = $1 and w.status = 'IN_PROGRESS'`,
          [login],
        );
        return rows.length;
      }),
    )
    .toBeGreaterThan(0);
}

async function doneSet(page: Page, exercise: string, n: number, weight: string, reps: string) {
  const block = page.getByRole("region", { name: exercise });
  await block.getByLabel(`Вес, подход ${n}`).fill(weight);
  await block.getByLabel(`Повторы, подход ${n}`).fill(reps);
  await block.getByRole("button", { name: `Подход ${n} выполнен` }).click();
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

async function invite(host: Player, guest: Player) {
  await host.page.getByRole("button", { name: "Вместе", exact: true }).click();
  const dialog = host.page.getByRole("dialog", { name: "Позвать друга" });
  await dialog.getByRole("listitem").filter({ hasText: guest.nick }).getByRole("button", { name: "Позвать" }).click();
  await expect(host.page.getByText(`Ждём ${guest.nick}…`)).toBeVisible();
  return (await togetherSessionOf(host.login))!.id;
}

test("invite → accept with a running workout → partner bar updates after a set → cheer arrives", async ({ page, browser }) => {
  test.slow();
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  const id = await invite(host, guest);
  expect(await notificationTitles(guest.login)).toContain(`${host.nick} в зале`);

  await startWorkout(guest.page, guest.login, BENCH);
  await expect(guest.page.getByRole("link", { name: `${host.nick} зовёт тренироваться` })).toBeVisible();
  await guest.page.goto(`/together/${id}`);
  await guest.page.getByRole("button", { name: "Присоединиться" }).click();
  await expect(guest.page).toHaveURL(/\/training$/);
  await expect(guest.page.getByRole("region", { name: "Партнёр" })).toContainText(`Вместе с ${host.nick}`);

  const hostBar = host.page.getByRole("region", { name: "Партнёр" });
  await expect(hostBar).toContainText(`Вместе с ${guest.nick}`, { timeout: 15_000 });
  await doneSet(guest.page, BENCH, 1, "60", "8");
  await expect(hostBar).toContainText(`${BENCH} · 1 из 3 подходов`, { timeout: 15_000 });

  await guest.page.getByRole("button", { name: "Отправить 👊" }).click();
  await expect(host.page.getByText(`${guest.nick} прислал 👊`)).toBeVisible({ timeout: 15_000 });
  const s = await togetherSessionOf(guest.login);
  expect(s).toMatchObject({ status: "ACTIVE", guestWorkoutId: await activeWorkoutId(guest.login) });
});

test("accept without a workout → start screen → the started workout is linked", async ({ page, browser }) => {
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  const id = await seedTogether(host.login, guest.login, { status: "INVITED", hostWorkoutId: await activeWorkoutId(host.login) });
  await guest.page.goto("/dashboard");
  await guest.page.getByRole("region", { name: "Приглашение потренироваться" }).getByRole("link", { name: "Присоединиться" }).click();
  await expect(guest.page).toHaveURL(new RegExp(`/together/${id}$`));
  await guest.page.getByRole("button", { name: "Присоединиться" }).click();
  await expect(guest.page.getByRole("region", { name: "Совместная тренировка" })).toContainText(`Тренировка с ${host.nick}`);
  await guest.page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(guest.page, [BENCH]);
  await guest.page.getByRole("button", { name: "Начать", exact: true }).click();
  await expect.poll(async () => (await togetherSessionOf(guest.login))?.guestWorkoutId).toBe(await activeWorkoutId(guest.login));
});

test("decline; invite expires after 15 minutes", async ({ page, browser }) => {
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  const hostWorkout = await activeWorkoutId(host.login);
  const first = await seedTogether(host.login, guest.login, { status: "INVITED", hostWorkoutId: hostWorkout });
  await guest.page.goto(`/together/${first}`);
  await guest.page.getByRole("button", { name: "Отклонить" }).click();
  await expect(guest.page.getByText("Приглашение отклонено")).toBeVisible();
  expect((await togetherSessionOf(host.login))?.status).toBe("DECLINED");
  await expect.poll(() => notificationTitles(host.login)).toContain(`${guest.nick} не сможет сейчас`);

  // Снова позвать с той же тренировкой можно; через 15 минут приглашение истекает
  const second = await invite(host, guest);
  await shiftSession(second, { created: 15 });
  await guest.page.goto(`/together/${second}`);
  await expect(guest.page.getByText("Приглашение истекло")).toBeVisible();
  await expect(host.page.getByRole("button", { name: "Вместе", exact: true })).toBeVisible({ timeout: 15_000 });
});

test("leave the session — no bonus for anyone", async ({ page, browser }) => {
  test.slow();
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  await startWorkout(guest.page, guest.login, BENCH);
  const [hw, gw] = [await activeWorkoutId(host.login), await activeWorkoutId(guest.login)];
  await seedTogether(host.login, guest.login, { status: "ACTIVE", hostWorkoutId: hw, guestWorkoutId: gw });
  await Promise.all([shiftWorkoutStart(hw!, 30), shiftWorkoutStart(gw!, 30)]);

  await host.page.reload();
  await host.page.getByRole("button", { name: "Совместная тренировка" }).click();
  await host.page.getByRole("menuitem", { name: "Выйти из сессии" }).click();
  await expect(host.page.getByRole("button", { name: "Вместе", exact: true })).toBeVisible();
  expect(await togetherSessionOf(host.login)).toMatchObject({ status: "ENDED", endReason: "left" });

  await guest.page.reload();
  await doneSet(guest.page, BENCH, 1, "60", "8");
  await finish(guest.page);
  await doneSet(host.page, SQUAT, 1, "100", "5");
  await finish(host.page);
  expect(await togetherBonuses(host.login)).toEqual([]);
  expect(await togetherBonuses(guest.login)).toEqual([]);
  await expect(host.page.getByRole("region", { name: "Вместе с партнёром" })).toContainText("Кто-то вышел из сессии — бонуса нет");
});

test("bonus for both after the second finishes; second bonus the same day — none", async ({ page, browser }) => {
  test.slow();
  const [host, guest] = await pair(browser, page);
  const together = async () => {
    await startWorkout(host.page, host.login, SQUAT);
    await startWorkout(guest.page, guest.login, BENCH);
    const [hw, gw] = [await activeWorkoutId(host.login), await activeWorkoutId(guest.login)];
    await seedTogether(host.login, guest.login, { status: "ACTIVE", hostWorkoutId: hw, guestWorkoutId: gw });
    await Promise.all([shiftWorkoutStart(hw!, 30), shiftWorkoutStart(gw!, 30)]);
    await Promise.all([host.page.reload(), guest.page.reload()]);
    await doneSet(host.page, SQUAT, 1, "100", "5");
    await doneSet(guest.page, BENCH, 1, "60", "8");
    await finish(host.page);
    await expect(host.page.getByRole("region", { name: "Вместе с партнёром" })).toContainText(`Бонус придёт, когда ${guest.nick} закончит`);
    await finish(guest.page);
  };

  await together();
  const [hb, gb] = [await togetherBonuses(host.login), await togetherBonuses(guest.login)];
  expect(hb).toHaveLength(1);
  expect(gb).toHaveLength(1);
  await expect(guest.page.getByRole("region", { name: "Вместе с партнёром" })).toContainText(`+${gb[0]} XP за тренировку вместе`);
  await expect.poll(() => notificationTitles(host.login)).toContain(`+${hb[0]} XP — тренировка с ${guest.nick}`);

  await together();
  expect(await togetherBonuses(host.login)).toHaveLength(1);
  expect(await togetherBonuses(guest.login)).toHaveLength(1);
  await expect(guest.page.getByRole("region", { name: "Вместе с партнёром" })).toContainText("Бонус за совместную тренировку сегодня уже был");
});

test("two tabs accept at once — one session, no error", async ({ page, browser }) => {
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  const id = await seedTogether(host.login, guest.login, { status: "INVITED", hostWorkoutId: await activeWorkoutId(host.login) });
  const tab2 = await guest.page.context().newPage();
  await Promise.all([guest.page.goto(`/together/${id}`), tab2.goto(`/together/${id}`)]);
  await Promise.all([
    guest.page.getByRole("button", { name: "Присоединиться" }).click(),
    tab2.getByRole("button", { name: "Присоединиться" }).click(),
  ]);
  await expect(guest.page).toHaveURL(/\/training$/);
  await expect(tab2).toHaveURL(/\/training$/);
  expect((await togetherSessionOf(guest.login))?.status).toBe("ACTIVE");
});

test("partner hides weights — no weights in the API response", async ({ page, browser }) => {
  const [host, guest] = await pair(browser, page);
  await setPrivacy(guest.login, { hideWeights: true });
  await startWorkout(host.page, host.login, SQUAT);
  await startWorkout(guest.page, guest.login, BENCH);
  const id = await seedTogether(host.login, guest.login, {
    status: "ACTIVE",
    hostWorkoutId: await activeWorkoutId(host.login),
    guestWorkoutId: await activeWorkoutId(guest.login),
  });
  await doneSet(guest.page, BENCH, 1, "77,5", "8");
  await expect
    .poll(async () => (await (await host.page.request.get(`/api/together/${id}`)).json()).partner?.current?.doneSets)
    .toBe(1);
  const body = await (await host.page.request.get(`/api/together/${id}`)).text();
  expect(body).not.toContain("77.5");
  expect(JSON.parse(body).partner.hideWeights).toBe(true);
});

test("flag off — no «Вместе» button, /together/<id> is 404", async ({ page, browser }) => {
  const [host, guest] = await pair(browser, page, false);
  await startWorkout(host.page, host.login, SQUAT);
  await expect(host.page.getByRole("region", { name: SQUAT })).toBeVisible();
  await expect(host.page.getByRole("button", { name: "Вместе", exact: true })).toHaveCount(0);
  const id = await seedTogether(host.login, guest.login, { status: "INVITED", hostWorkoutId: await activeWorkoutId(host.login) });
  const res = await guest.page.goto(`/together/${id}`);
  expect(res?.status()).toBe(404);
  expect((await host.page.request.get(`/api/together/${id}`)).status()).toBe(404);
});

test("partner deletes the account mid-session — the bar goes away", async ({ page, browser }) => {
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  await startWorkout(guest.page, guest.login, BENCH);
  await seedTogether(host.login, guest.login, { status: "ACTIVE", hostWorkoutId: await activeWorkoutId(host.login), guestWorkoutId: await activeWorkoutId(guest.login) });
  await host.page.reload();
  const bar = host.page.getByRole("region", { name: "Партнёр" });
  await expect(bar).toContainText(`Вместе с ${guest.nick}`);
  await withDb((db) => db.query(`delete from "User" where login = $1`, [guest.login]));
  await expect(bar).toHaveCount(0, { timeout: 15_000 });
  await expect(host.page.getByRole("button", { name: "Вместе", exact: true })).toBeVisible();
});

test("the one who finished first is free: no join banner, a new workout has no old partner bar", async ({ page, browser }) => {
  test.slow();
  const [host, guest] = await pair(browser, page);
  await startWorkout(host.page, host.login, SQUAT);
  await startWorkout(guest.page, guest.login, BENCH);
  await seedTogether(host.login, guest.login, { status: "ACTIVE", hostWorkoutId: await activeWorkoutId(host.login), guestWorkoutId: await activeWorkoutId(guest.login) });
  await guest.page.reload();
  await doneSet(guest.page, BENCH, 1, "60", "8");
  await finish(guest.page);

  await guest.page.goto("/training");
  await expect(guest.page.getByRole("button", { name: /Пустая тренировка/ })).toBeVisible();
  await expect(guest.page.getByRole("region", { name: "Совместная тренировка" })).toHaveCount(0);
  await startWorkout(guest.page, guest.login, SQUAT);
  await expect(guest.page.getByRole("button", { name: "Вместе", exact: true })).toBeVisible();
  await expect(guest.page.getByRole("region", { name: "Партнёр" })).toHaveCount(0);
  expect((await togetherSessionOf(host.login))?.status).toBe("ACTIVE");
});
