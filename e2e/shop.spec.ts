import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, coinBalance, coinTx, equipItem, makeFriends, withDb } from "./db";
import { addToWorkout, quickWorkout, registerUser } from "./helpers";

const SETS = (weight: string) => [
  { weight, reps: "10" },
  { weight, reps: "10" },
  { weight, reps: "10" },
];

test.describe("монеты за события", () => {
  test("workout pays 10 coins and records add 5", async ({ page }) => {
    const { login } = await registerUser(page);
    // Первый результат в упражнении — не рекорд
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    let tx = await coinTx(login);
    expect(tx.filter((t) => t.reason === "WORKOUT").map((t) => t.amount)).toEqual([10]);
    expect(tx.some((t) => t.reason === "RECORD")).toBe(false);

    await quickWorkout(page, "Жим штанги лёжа", SETS("80"));
    tx = await coinTx(login);
    expect(tx.filter((t) => t.reason === "RECORD").map((t) => t.amount)).toEqual([5]);
    expect(await coinBalance(login)).toBe(tx.reduce((s, t) => s + t.amount, 0));
  });

  test("third workout of the day pays nothing for the workout", async ({ page }) => {
    const { login } = await registerUser(page);
    for (let i = 0; i < 3; i++) await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    const tx = await coinTx(login);
    expect(tx.filter((t) => t.reason === "WORKOUT")).toHaveLength(2);
  });

  test("offline workout of yesterday counts against yesterday", async ({ page }) => {
    test.slow();
    const { login } = await registerUser(page);
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    expect((await coinTx(login)).filter((t) => t.reason === "WORKOUT")).toHaveLength(2);

    // Третья: старт 20 ч назад, финиш с устройства «14 ч назад» (clampClientTime пускает финиш до 24 ч) — это вчера
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await addToWorkout(page, ["Жим штанги лёжа"]);
    const block = page.getByRole("region", { name: "Жим штанги лёжа" });
    for (const i of [1, 2, 3]) {
      await block.getByLabel(`Вес, подход ${i}`).fill("60");
      await block.getByLabel(`Повторы, подход ${i}`).fill("10");
      await block.getByRole("button", { name: `Подход ${i} выполнен` }).click();
    }
    await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
    await withDb((db) =>
      db.query(
        `update "Workout" set "startedAt" = now() - interval '20 hours' where "userId" = (select id from "User" where login = $1) and status = 'IN_PROGRESS'`,
        [login],
      ),
    );
    await page.reload();
    await page.clock.setFixedTime(new Date(Date.now() - 14 * 3600_000));
    await finishFromEditor(page);

    const workouts = (await coinTx(login)).filter((t) => t.reason === "WORKOUT");
    expect(workouts).toHaveLength(3);
    const days = await withDb(async (db) => {
      const { rows } = await db.query<{ day: string }>(
        `select c.meta->>'day' as day from "CoinTx" c join "User" u on u.id = c."userId" where u.login = $1 and c.reason = 'WORKOUT' order by c."createdAt"`,
        [login],
      );
      return rows.map((r) => r.day);
    });
    expect(days[2]).not.toBe(days[0]);
  });

  test("repeat finish does not double coins", async ({ page }) => {
    const { login } = await registerUser(page);
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    const workoutId = new URL(page.url()).pathname.split("/").pop()!;
    const before = await coinTx(login);
    expect(before.filter((t) => t.key === `workout:${workoutId}`)).toHaveLength(1);

    // Повтор отправки: тренировка снова в процессе, второй финиш с теми же ключами начислений
    await withDb((db) => db.query(`update "Workout" set status = 'IN_PROGRESS', "finishedAt" = null where id = $1`, [workoutId]));
    await page.goto("/training");
    await finishFromEditor(page);

    const after = await coinTx(login);
    expect(after.filter((t) => t.key === `workout:${workoutId}`)).toHaveLength(1);
    expect(await coinBalance(login)).toBe(after.reduce((s, t) => s + t.amount, 0));
  });
});

async function finishFromEditor(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

test.describe("показ косметики", () => {
  test("friend sees my avatar and nick color in league, friends and feed", async ({ page, browser }) => {
    test.slow();
    const a = await registerUser(page, "Алекс");
    const other = await browser.newContext();
    const pageB = await other.newPage();
    try {
      const b = await registerUser(pageB, "Борис");
      const alpha = `Alpha_${a.login.slice(-8)}`;
      await makeFriends(a.login, alpha, b.login, `Bravo_${b.login.slice(-8)}`);
      await addFlagUser("shop", a.login);
      await equipItem(a.login, "avatar", "avatar:archer");
      await equipItem(a.login, "frame", "frame:gold");
      await equipItem(a.login, "nickColor", "nick:lava");
      await quickWorkout(page, "Жим штанги лёжа", SETS("60"));

      for (const path of ["/leaderboard", "/friends"]) {
        await pageB.goto(path);
        await expect(pageB.getByRole("img", { name: "Лучник" }).first()).toBeVisible();
        await expect(pageB.locator('[data-nick-color="nick:lava"]').first()).toHaveText(alpha);
      }
      // В ленте друзей — карточка с тем же ником и аватаром
      await expect(pageB.getByRole("article", { name: new RegExp(`^${alpha}:`) }).getByRole("img", { name: "Лучник" })).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test("owner without shop flag shows no cosmetics", async ({ page, browser }) => {
    test.slow();
    const a = await registerUser(page, "Алекс");
    const other = await browser.newContext();
    const pageB = await other.newPage();
    try {
      const b = await registerUser(pageB, "Борис");
      const alpha = `Alpha_${a.login.slice(-8)}`;
      await makeFriends(a.login, alpha, b.login, `Bravo_${b.login.slice(-8)}`);
      // Флаг у владельца не включён: предметы надеты, но не показываются
      await equipItem(a.login, "avatar", "avatar:archer");
      await equipItem(a.login, "nickColor", "nick:lava");
      await pageB.goto("/leaderboard");
      await expect(pageB.getByText(alpha)).toBeVisible();
      await expect(pageB.getByRole("img", { name: "Лучник" })).toHaveCount(0);
      await expect(pageB.locator("[data-nick-color]")).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test("theme changes the cabinet accent", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await equipItem(login, "theme", "theme:ocean");
    await page.goto("/dashboard");
    const { primary, dark } = await page.evaluate(() => ({
      primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      dark: document.documentElement.classList.contains("dark"),
    }));
    expect(primary).toBe(dark ? "#38bdf8" : "#0369a1");
  });
});
