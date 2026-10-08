import { expect, test } from "@playwright/test";
import { makeFriends, mondayWeeksAgo, seedRecapWeek, seedWorkouts, userId, withDb } from "./db";
import { addToWorkout, quickWorkout, registerUser } from "./helpers";

const count = (sql: string, login: string) =>
  withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query<{ n: number }>(sql, [id]);
    return Number(rows[0].n);
  });

test("boss card: full HP and a call to the first hit", async ({ page }) => {
  await registerUser(page);
  const card = page.getByTestId("boss-card");
  await expect(card).toContainText("1500 / 1500 HP");
  await expect(card).toContainText("ждёт. Первый подход — первый удар");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1500");
});

test("last week's workout does not hit this week's boss", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 5 }], 8);
  await page.reload();
  await expect(page.getByTestId("boss-card")).toContainText("1500 / 1500 HP");
});

test("defeating the boss: finish → victory, chest pays once", async ({ page, context }) => {
  const { login } = await registerUser(page);
  // 14 подходов этой недели + 1 в тренировке = 1500
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 14 }], 0);
  await quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }]);
  // Сводка: урон этой тренировки и победа
  const summary = page.getByTestId("boss-damage");
  await expect(summary).toContainText("Урон боссу: −100");
  await expect(summary).toContainText("Повержен!");

  await page.goto("/dashboard");
  const card = page.getByTestId("boss-card");
  await expect(card).toContainText("Повержен!");
  // Вторая вкладка открывает тот же сундук
  const other = await context.newPage();
  await other.goto("/dashboard");

  await card.getByRole("button", { name: "Открыть сундук босса" }).click();
  await page.getByRole("button", { name: "Открыть сундук", exact: true }).click();
  await expect(page.getByTestId("chest-reward")).toHaveText("+75 XP");
  await page.getByRole("button", { name: "Забрать" }).click();
  await expect(card.getByRole("button", { name: "Открыть сундук босса" })).toHaveCount(0);

  await other.getByTestId("boss-card").getByRole("button", { name: "Открыть сундук босса" }).click();
  await other.getByRole("button", { name: "Открыть сундук", exact: true }).click();
  await expect(other.getByText("Сундук босса уже открыт")).toBeVisible();

  expect(await count(`SELECT COUNT(*) n FROM "XpEvent" WHERE "userId" = $1 AND reason = 'BOSS_REWARD'`, login)).toBe(1);
  expect(await count(`SELECT COUNT(*) n FROM "Notification" WHERE "userId" = $1 AND type = 'BOSS'`, login)).toBe(1);
  // Уведомление ведёт в сводку победной тренировки — там сундук есть и после смены недели
  expect(await count(`SELECT COUNT(*) n FROM "Notification" WHERE "userId" = $1 AND type = 'BOSS' AND url LIKE '/workouts/%'`, login)).toBe(1);
  expect(await count(`SELECT COUNT(*) n FROM "BossWeek" WHERE "userId" = $1 AND "defeatedAt" IS NOT NULL`, login)).toBe(1);
  // Ачивка за первую победу
  expect(await count(`SELECT COUNT(*) n FROM "UserAchievement" WHERE "userId" = $1 AND code = 'boss:1'`, login)).toBe(1);
});

test.describe("week bounds", () => {
  test.use({ timezoneId: "Asia/Vladivostok" });

  test("week bounds follow the user's time zone", async ({ page }) => {
    const { login } = await registerUser(page);
    const tz = "Asia/Vladivostok";
    // Понедельник этой недели во Владивостоке (UTC+10, без перехода на летнее время)
    const local = new Date(Date.now() + 10 * 3_600_000);
    const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - ((local.getUTCDay() + 6) % 7)));
    const mondayLocal0010 = new Date(monday.getTime() - 10 * 3_600_000 + 10 * 60_000); // пн 00:10 местного = вс 14:10 UTC
    const sundayLocal2350 = new Date(monday.getTime() - 10 * 3_600_000 - 10 * 60_000); // вс 23:50 местного прошлой недели
    await withDb(async (db) => {
      const id = await userId(db, login);
      await db.query(`UPDATE "User" SET "timeZone" = $2 WHERE id = $1`, [id, tz]);
      await db.query(`DELETE FROM "BossWeek" WHERE "userId" = $1`, [id]);
    });
    await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 0);
    await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 5 }], 0);
    await withDb(async (db) => {
      const id = await userId(db, login);
      const { rows } = await db.query<{ id: string }>(`SELECT id FROM "Workout" WHERE "userId" = $1 ORDER BY "totalSets"`, [id]);
      await db.query(`UPDATE "Workout" SET "finishedAt" = $2, "startedAt" = $2 WHERE id = $1`, [rows[0].id, mondayLocal0010]);
      await db.query(`UPDATE "Workout" SET "finishedAt" = $2, "startedAt" = $2 WHERE id = $1`, [rows[1].id, sundayLocal2350]);
    });
    await page.reload();
    // Засчитан только понедельник: 3 подхода
    await expect(page.getByTestId("boss-card")).toContainText("1200 / 1500 HP · осталось ~12 подходов");
  });
});

test("set confirm hits the boss, unconfirm heals it, warmup does nothing", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const bench = page.getByRole("region", { name: "Жим штанги лёжа" });
  for (const i of [1, 2, 3]) {
    await bench.getByLabel(`Вес, подход ${i}`).fill("60");
    await bench.getByLabel(`Повторы, подход ${i}`).fill("8");
  }
  const bar = page.getByTestId("boss-bar");
  await expect(bar).toContainText("1500 / 1500 HP");

  await bench.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await expect(bar).toContainText("1400 / 1500 HP");
  await bench.getByRole("group", { name: "Запас повторов, подход 1" }).getByRole("button", { name: "Запас: до отказа" }).click();
  await expect(bar).toContainText("1350 / 1500 HP");
  await bench.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await expect(bar).toContainText("1500 / 1500 HP");

  // Разминка встаёт перед рабочими подходами — подход 1 теперь разминочный
  await bench.getByRole("button", { name: "Разминка", exact: true }).click();
  await expect(bench.getByLabel("Подход 1: разминка")).toBeVisible();
  await bench.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await expect(bar).toContainText("1500 / 1500 HP");
});

test("friend sees the boss victory in the feed and league", async ({ page, browser }) => {
  const me = await registerUser(page);
  const friendContext = await browser.newContext();
  const friendPage = await friendContext.newPage();
  const friend = await registerUser(friendPage);
  await makeFriends(me.login, me.login, friend.login, friend.login);
  await seedWorkouts(friend.login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 14 }], 0);
  await quickWorkout(friendPage, "Шраги со штангой", [{ weight: "60", reps: "10" }]);
  await friendContext.close();

  await page.goto("/friends");
  await expect(page.getByText(/^Босс повержен: /).first()).toBeVisible();
  await page.goto("/leaderboard");
  const row = page.getByRole("listitem").filter({ hasText: friend.login });
  await expect(row.getByTestId("league-boss")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "это вы" }).getByTestId("league-boss")).toHaveCount(0);
});

test("weekly recap shows the boss block", async ({ page }) => {
  const me = await registerUser(page);
  const week = mondayWeeksAgo(2);
  await seedRecapWeek(me.login, week, [{ day: 1, time: "19:00", exercise: "Жим штанги лёжа", weight: 60, reps: 8, sets: 3, xp: 80 }]);
  await withDb(async (db) => {
    const id = await userId(db, me.login);
    await db.query(`INSERT INTO "BossWeek" (id, "userId", week, "bossCode", hp) VALUES (gen_random_uuid()::text, $1, $2, 'golem', 1500)`, [id, week]);
  });
  await page.goto(`/recap/${week}`);
  const block = page.getByTestId("recap-boss");
  await expect(block).toContainText("Железный Голем ушёл");
  await expect(block).toContainText("Урон: 300 из 1500");
});

test("boss already defeated this week: the summary says so", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 16 }], 0);
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`UPDATE "BossWeek" SET "defeatedAt" = now() WHERE "userId" = $1`, [id]);
  });
  await quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }]);
  const summary = page.getByTestId("boss-damage");
  await expect(summary).toContainText("Урон боссу: −100");
  await expect(summary).toContainText("Уже повержен на этой неделе");
});

test("weekly recap: the chest of a defeated boss can be claimed there", async ({ page }) => {
  const me = await registerUser(page);
  const week = mondayWeeksAgo(2);
  await seedRecapWeek(me.login, week, [{ day: 1, time: "19:00", exercise: "Жим штанги лёжа", weight: 60, reps: 8, sets: 15, xp: 80 }]);
  await withDb(async (db) => {
    const id = await userId(db, me.login);
    await db.query(
      `INSERT INTO "BossWeek" (id, "userId", week, "bossCode", hp, "defeatedAt") VALUES (gen_random_uuid()::text, $1, $2, 'golem', 1500, now())`,
      [id, week],
    );
  });
  await page.goto(`/recap/${week}`);
  const block = page.getByTestId("recap-boss");
  await expect(block).toContainText("Повержен: Железный Голем");
  await block.getByRole("button", { name: "Открыть сундук босса" }).click();
  await page.getByRole("button", { name: "Открыть сундук", exact: true }).click();
  await expect(page.getByTestId("chest-reward")).toHaveText("+75 XP");
  await page.getByRole("button", { name: "Забрать" }).click();
  await expect(block.getByRole("button", { name: "Открыть сундук босса" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("recap-boss").getByRole("button", { name: "Открыть сундук босса" })).toHaveCount(0);
});
