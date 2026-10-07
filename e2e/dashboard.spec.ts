import { expect, test } from "@playwright/test";
import { seedWorkouts, userId, withDb } from "./db";
import { registerUser } from "./helpers";

async function setStreak(login: string, hoursAgo: number, streak: number, freezes: number) {
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(
      `update "User" set "currentStreak" = $2, "longestStreak" = greatest("longestStreak", $2),
         "lastStreakAt" = now() - make_interval(hours => $3), "streakFreezes" = $4 where id = $1`,
      [id, streak, hoursAgo, freezes],
    );
  });
}

test("new user: prominent start button, level 1, empty states", async ({ page }) => {
  await registerUser(page);
  await expect(page.getByRole("main").getByRole("link", { name: "Начать тренировку" })).toBeVisible();
  await expect(page.getByTestId("xp-to-next")).toContainText("0 / 100 XP · до уровня 2: 100 XP");
  await expect(page.getByTestId("streak-value")).toHaveText("0");
  await expect(page.getByTestId("streak-message")).toHaveText("Завершите тренировку, чтобы зажечь серию");
  await expect(page.getByText("За 7 дней тренировок не было")).toBeVisible();
  await expect(page.getByText("Здесь появится сводка вашей первой тренировки")).toBeVisible();
  await expect(page.getByLabel("Ближайшая ачивка").getByLabel(/^Цель:/)).toBeVisible();
});

test("history: volume chart 7/30 days, counters, last workout, streak reminder", async ({ page, isMobile }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(
    login,
    "Приседания со штангой",
    [
      { weight: 100, reps: 5, sets: 3 }, // 1500 кг
      { weight: 100, reps: 5, sets: 4 }, // 2000 кг
      { weight: 110, reps: 5, sets: 4 }, // 2200 кг
    ],
    3,
  );
  await setStreak(login, 30, 3, 0);
  await page.reload();

  const chart = page.getByRole("region", { name: "Объём тренировок" });
  await expect(chart).toContainText("5 700 кг · тренировок: 3");
  await expect(chart.locator(".recharts-bar-rectangle")).toHaveCount(3); // столбцы только у дней с тренировками
  await expect(chart.locator("tbody tr")).toHaveCount(7);
  await expect(chart.locator("table")).toContainText("2 200 кг");
  // Подсказка: наведение на десктопе, тап на телефоне (столбцы анимируются — повторяем до стабилизации)
  await chart.locator(".recharts-wrapper").scrollIntoViewIfNeeded();
  await expect(async () => {
    const box = (await chart.locator(".recharts-bar-rectangle").nth(2).boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    if (isMobile) await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("2 200 кг", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await chart.getByRole("tab", { name: "30 дней" }).click();
  await expect(chart.locator("tbody tr")).toHaveCount(30);

  const stats = page.getByRole("region", { name: "Статистика" });
  await expect(stats).toContainText("Тренировок всего3");
  await expect(stats).toContainText("В зале за 7 дней3 ч");

  const last = page.getByRole("region", { name: "Последняя тренировка" });
  await expect(last).toContainText("2 200 кг");
  await expect(last).toContainText("Приседания со штангой");

  // 30 ч после последней засчитанной → окно продления, до дедлайна 18 ч
  await expect(page.getByTestId("streak-value")).toHaveText("3");
  await expect(page.getByTestId("streak-message")).toHaveText("Не потеряй streak! Осталось 18 ч");
  await expect(page.getByTestId("header-streak")).toHaveText("3");
});

test("lost and frozen streak states; header agrees", async ({ page }) => {
  const { login } = await registerUser(page);
  // Сгорела больше 48 ч назад — выкупить уже нельзя
  await setStreak(login, 100, 5, 0);
  await page.reload();
  await expect(page.getByTestId("streak-value")).toHaveText("0");
  await expect(page.getByTestId("streak-message")).toHaveText("Серия прервалась — начните новую");
  await expect(page.getByRole("button", { name: /Вернуть/ })).toHaveCount(0);
  await expect(page.getByTestId("header-streak")).toHaveText("0");

  await setStreak(login, 60, 5, 1);
  await page.reload();
  await expect(page.getByTestId("streak-value")).toHaveText("5");
  await expect(page.getByTestId("streak-message")).toContainText("спасёт заморозка");
});

async function setXp(login: string, xp: number, level: number) {
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`update "User" set xp = $2, level = $3 where id = $1`, [id, xp, level]);
  });
}

test("burned streak can be bought back with XP once; level does not drop", async ({ page }) => {
  const { login } = await registerUser(page);
  // Серия 12 сгорела 2 ч назад (последняя тренировка 50 ч назад, заморозок нет); цена 50 + 12·10 = 170 XP
  await setStreak(login, 50, 12, 0);
  await setXp(login, 120, 2); // в уровне 2 всего 20 XP — не хватает
  await page.reload();
  await expect(page.getByTestId("streak-message")).toContainText("Серия сгорела — её можно вернуть до");
  await expect(page.getByText("Вернуть серию стоит 170 XP — в текущем уровне не хватает 150 XP")).toBeVisible();

  await setXp(login, 300, 2); // 200 XP в уровне 2
  await page.reload();
  await page.getByRole("button", { name: "Вернуть 12 дней за 170 XP" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Вернуть за 170 XP" }).click();
  await expect(page.getByText("Серия 12 дней снова горит 🔥")).toBeVisible();
  await expect(page.getByTestId("streak-value")).toHaveText("12");
  await expect(page.getByTestId("streak-message")).toHaveText("Не потеряй streak! Осталось 24 ч");
  await expect(page.getByRole("button", { name: /Вернуть/ })).toHaveCount(0);

  await withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query(
      `select u.xp, u.level, (select sum(amount)::int from "XpEvent" x where x."userId" = u.id and reason = 'STREAK_RESTORE') as paid
       from "User" u where u.id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ xp: 130, level: 2, paid: -170 });
  });
});

test("active workout turns the main button into «Продолжить»", async ({ page }) => {
  await registerUser(page);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await expect(page.getByLabel("Название тренировки")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("main").getByRole("link", { name: "Продолжить тренировку" })).toBeVisible();
  await expect(page.getByText("Тренировка «Тренировка» ждёт продолжения")).toBeVisible();
});
