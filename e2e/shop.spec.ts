import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, coinBalance, coinTx, equipItem, makeFriends, seedWorkouts, setCoins, setCoinsSince, setTimeZone, userItems, withDb } from "./db";
import { E2E_TZ, localAt } from "./tz";
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
        await expect(pageB.locator('[data-avatar="avatar:archer"]').first()).toBeVisible();
        await expect(pageB.locator('[data-nick-color="nick:lava"]').first()).toHaveText(alpha);
      }
      // В ленте друзей — карточка с тем же ником и аватаром
      await expect(pageB.getByRole("article", { name: new RegExp(`^${alpha}:`) }).locator('[data-avatar="avatar:archer"]')).toBeVisible();
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
      await expect(pageB.locator("[data-avatar]")).toHaveCount(0);
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

const WORKOUT = { weight: 60, reps: 10, sets: 3 };

test.describe("страница магазина", () => {
  test("shop shows balance, earn table and history", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    await page.goto("/shop");
    const balance = await coinBalance(login);
    expect(balance).toBeGreaterThanOrEqual(10);
    await expect(page.getByTestId("coin-balance")).toContainText(String(balance));
    await expect(page.getByTestId("coin-history").getByText("Тренировка", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Как заработать" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("cell", { name: /Ежедневный сундук/ })).toBeVisible();
    await expect(dialog.getByRole("cell", { name: /Новый уровень/ })).toBeVisible();
  });

  test("summary shows coins after a workout", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    const coins = page.getByTestId("summary-coins");
    await expect(coins).toContainText("Тренировка · +10");
    await expect(coins).toContainText(/\+\d+ монет/);
  });

  test("summary has no coin line without the flag", async ({ page }) => {
    await registerUser(page);
    await quickWorkout(page, "Жим штанги лёжа", SETS("60"));
    await expect(page.getByTestId("xp-earned")).toBeVisible();
    await expect(page.getByTestId("summary-coins")).toHaveCount(0);
  });

  test("not enough coins shows the shortfall", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await setCoins(login, 0);
    await page.goto("/shop?tab=avatar");
    await expect(page.getByTestId("shop-item-avatar:archer")).toContainText("Не хватает 150");
    await page.getByTestId("shop-item-avatar:archer").click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /Купить за 150/ })).toBeDisabled();
  });

  test("buy and equip an item", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await setCoins(login, 200);
    await page.goto("/shop?tab=avatar");
    await page.getByTestId("shop-item-avatar:archer").click();
    await page.getByRole("dialog").getByRole("button", { name: "Купить за 150" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Надеть" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Снять" })).toBeVisible();
    expect(await userItems(login)).toEqual(["avatar:archer"]);
    expect(await coinBalance(login)).toBe(50);
  });

  test("a new theme: buy, equip, the accent changes", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await setCoins(login, 700);
    await page.goto("/shop?tab=theme");
    const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
    const brand = await accent();
    const amber = page.getByTestId("shop-item-theme:amber");
    await expect(amber).toContainText("Янтарь");
    await amber.click();
    await page.getByRole("dialog").getByRole("button", { name: "Купить за 600" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Надеть" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Снять" })).toBeVisible();
    await expect.poll(accent).not.toBe(brand);
    expect(["#b45309", "#fbbf24"]).toContain(await accent());
    expect(await userItems(login)).toEqual(["theme:amber"]);
    expect(await coinBalance(login)).toBe(100);
  });

  test("free item is labelled free, not bought", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await page.goto("/shop?tab=avatar");
    await expect(page.getByTestId("shop-item-avatar:knight")).toContainText("Бесплатно");
    await expect(page.getByTestId("shop-item-avatar:knight")).not.toContainText("Куплено");
  });

  test("standard theme returns the brand accent", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await page.goto("/shop?tab=theme");
    const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
    const brand = await accent();
    const standard = page.getByTestId("shop-item-theme:default");
    await expect(standard).toContainText("Надето");

    await equipItem(login, "theme", "theme:ocean");
    await page.reload();
    expect(await accent()).not.toBe(brand);
    await expect(standard).toContainText("Бесплатно");
    await standard.click();
    await page.getByRole("dialog").getByRole("button", { name: "Надеть" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Надето" })).toBeDisabled();
    await expect.poll(accent).toBe(brand);
    await page.keyboard.press("Escape");
    await expect(standard).toContainText("Надето");
  });

  test("shop is 404 without the flag", async ({ page }) => {
    await registerUser(page);
    const res = await page.goto("/shop");
    expect(res?.status()).toBe(404);
  });
});

test.describe("стартовый баланс", () => {
  test("retro balance is granted once and the banner shows once", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await seedWorkouts(login, "Жим штанги лёжа", [WORKOUT, WORKOUT, WORKOUT], 5);
    const before = await coinBalance(login);

    await page.goto("/shop");
    const retro = (await coinTx(login)).filter((t) => t.reason === "RETRO");
    expect(retro).toHaveLength(1);
    expect(retro[0].amount).toBeGreaterThanOrEqual(30);
    expect(await coinBalance(login)).toBe(before + retro[0].amount);
    const banner = page.getByRole("status").filter({ hasText: "За прошлые тренировки начислено" });
    await expect(banner).toContainText(`${retro[0].amount} монет`);

    // Без закрытия плашка запоминается не сама по себе: после перезагрузки она на месте
    await page.reload();
    await expect(banner).toContainText(`${retro[0].amount} монет`);

    await banner.getByRole("button", { name: "Закрыть" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("coin-balance")).toBeVisible();
    await expect(page.getByText("За прошлые тренировки начислено")).toHaveCount(0);
    expect((await coinTx(login)).filter((t) => t.reason === "RETRO")).toHaveLength(1);
  });

  test("workout already paid by an event is not paid again by retro", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await seedWorkouts(login, "Жим штанги лёжа", [WORKOUT, WORKOUT, WORKOUT], 5);
    // Тренировка начата до выката, завершена офлайн задним числом: событие уже заплатило за неё
    await withDb((db) =>
      db.query(
        `insert into "CoinTx" (id, "userId", amount, reason, key, meta)
         select gen_random_uuid()::text, u.id, 10, 'WORKOUT'::"CoinReason", 'workout:' || (select id from "Workout" where "userId" = u.id order by "finishedAt" limit 1), '{}'::jsonb
         from "User" u where u.login = $1`,
        [login],
      ),
    );
    await page.goto("/shop");
    const retro = (await coinTx(login)).filter((t) => t.reason === "RETRO");
    expect(retro).toHaveLength(1);
    // Тренировок для retro остаётся две
    expect(retro[0].amount).toBe(20);
  });

  test("two tabs opening the shop first time give one retro record", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await seedWorkouts(login, "Жим штанги лёжа", [WORKOUT, WORKOUT], 4);
    const before = await coinBalance(login);
    const second = await page.context().newPage();
    try {
      await Promise.all([page.goto("/shop"), second.goto("/shop")]);
      const retro = (await coinTx(login)).filter((t) => t.reason === "RETRO");
      expect(retro).toHaveLength(1);
      expect(await coinBalance(login)).toBe(before + retro[0].amount);
    } finally {
      await second.close();
    }
  });

  test("workouts around local midnight count by local day", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await setTimeZone(login);
    await setCoinsSince(login, new Date());
    const day = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: E2E_TZ });
    // Один местный день, но (в поясе не UTC) разные дни по UTC: оплачиваются только 2
    await seedWorkouts(login, "Жим штанги лёжа", [WORKOUT, WORKOUT, WORKOUT], 3, {
      finishedAt: [localAt(day, "00:30"), localAt(day, "12:00"), localAt(day, "23:30")],
    });
    await page.goto("/shop");
    const retro = (await coinTx(login)).filter((t) => t.reason === "RETRO");
    expect(retro).toHaveLength(1);
    // 2 оплаченные тренировки по 10; XP не набирался — уровень 1, монет за уровни нет
    expect(retro[0].amount).toBe(20);
  });
});

test.describe("параллельные покупки", () => {
  test("two simultaneous purchases with one balance buy one item", async ({ page }) => {
    const { login } = await registerUser(page);
    await addFlagUser("shop", login);
    await setCoins(login, 150);
    const second = await page.context().newPage();
    try {
      await Promise.all([page.goto("/shop?tab=avatar"), second.goto("/shop?tab=avatar")]);
      for (const p of [page, second]) {
        await p.getByTestId("shop-item-avatar:archer").click();
        await expect(p.getByRole("dialog").getByRole("button", { name: "Купить за 150" })).toBeEnabled();
      }
      await Promise.all(
        [page, second].map((p) => p.getByRole("dialog").getByRole("button", { name: "Купить за 150" }).click()),
      );
      // Один выиграл — «Надеть»; второй получил отказ («Не хватает…», либо «Уже куплено», если успел увидеть покупку)
      const refused = async () => {
        const counts = await Promise.all([page, second].map((p) => p.getByRole("alert").filter({ hasText: /Не хватает|Уже куплено/ }).count()));
        return counts[0] + counts[1];
      };
      await expect.poll(refused).toBe(1);
      expect(await userItems(login)).toEqual(["avatar:archer"]);
      expect(await coinBalance(login)).toBe(0);
    } finally {
      await second.close();
    }
  });
});
