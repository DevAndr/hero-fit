import { expect, test } from "@playwright/test";
import { seedWorkouts, userId, withDb } from "./db";
import { quickWorkout, registerUser } from "./helpers";

/**
 * Недельная серия в поясе UTC: последняя засчитанная неделя — lastWeeksAgo недель назад, на этой неделе — weekCount тренировок.
 * Плановая заморозка только что выдана — статус считается ровно по freezes.
 */
async function setWeeklyStreak(
  login: string,
  { streak, lastWeeksAgo, freezes, weekCount = 0 }: { streak: number; lastWeeksAgo: number; freezes: number; weekCount?: number },
) {
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(
      `update "User" set "timeZone" = 'UTC', "currentStreak" = $2, "longestStreak" = greatest("longestStreak", $2),
         "lastStreakWeek" = to_char(date_trunc('week', now() AT TIME ZONE 'UTC') - make_interval(weeks => $3), 'YYYY-MM-DD'),
         "streakFreezes" = $4, "freezeGrantedAt" = now(), "weekWorkouts" = $5,
         "weekWorkoutsKey" = to_char(date_trunc('week', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
       where id = $1`,
      [id, streak, lastWeeksAgo, freezes, weekCount],
    );
  });
}

test("new user: prominent start button, level 1, empty states", async ({ page }) => {
  await registerUser(page);
  await expect(page.getByRole("main").getByRole("link", { name: "Начать тренировку" })).toBeVisible();
  await expect(page.getByTestId("xp-to-next")).toContainText("0 / 100 XP · до уровня 2: 100 XP");
  await expect(page.getByTestId("streak-value")).toHaveText("0");
  await expect(page.getByTestId("streak-message")).toHaveText("Сделайте 3 тренировки за неделю, чтобы зажечь серию");
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
  await setWeeklyStreak(login, { streak: 3, lastWeeksAgo: 1, freezes: 0, weekCount: 1 });
  await page.reload();

  const chart = page.getByRole("region", { name: "Объём тренировок" });
  await expect(chart).toContainText("5,7 т · тренировок: 3");
  // Ось — тонны, без «тыс.»
  const axis = chart.locator("svg.recharts-surface").first();
  await expect(axis).toContainText(/\d т/);
  await expect(axis).not.toContainText("тыс");
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
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("2,2 т", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await chart.getByRole("tab", { name: "30 дней" }).click();
  await expect(chart.locator("tbody tr")).toHaveCount(30);

  const stats = page.getByRole("region", { name: "Статистика" });
  await expect(stats).toContainText("Тренировок всего3");
  await expect(stats).toContainText("В зале за 7 дней3 ч");

  const last = page.getByRole("region", { name: "Последняя тренировка" });
  await expect(last).toContainText("2 200 кг");
  await expect(last).toContainText("Приседания со штангой");

  // Прошлая неделя засчитана, на этой — 1 из 3 (к концу недели — напоминание)
  await expect(page.getByTestId("streak-value")).toHaveText("3");
  await expect(page.getByTestId("streak-message")).toHaveText(/^(Эта неделя: 1\/3 · осталось \d дн(я|ей)|Не потеряй streak! Ещё 2 тренировки до конца недели)$/);
  await expect(page.getByLabel("Эта неделя: 1 из 3")).toBeVisible();
  await expect(page.getByTestId("streak-week")).toHaveText("1/3 за неделю");
  await expect(page.getByTestId("header-streak")).toHaveText("3");
});

test("lost and frozen streak states; header agrees", async ({ page }) => {
  const { login } = await registerUser(page);
  // Пропущены две недели без заморозок — сгорела ещё на прошлой неделе, выкупить уже нельзя
  await setWeeklyStreak(login, { streak: 5, lastWeeksAgo: 3, freezes: 0 });
  await page.reload();
  await expect(page.getByTestId("streak-value")).toHaveText("0");
  await expect(page.getByTestId("streak-message")).toHaveText("Серия прервалась — начните новую");
  await expect(page.getByRole("button", { name: /Вернуть/ })).toHaveCount(0);
  await expect(page.getByTestId("header-streak")).toHaveText("0");

  await setWeeklyStreak(login, { streak: 5, lastWeeksAgo: 2, freezes: 1 });
  await page.reload();
  await expect(page.getByTestId("streak-value")).toHaveText("5");
  await expect(page.getByTestId("streak-message")).toHaveText(/спасёт заморозка|Не потеряй streak!/);
  await expect(page.getByTestId("header-streak")).toHaveText("5");
});

async function setXp(login: string, xp: number, level: number) {
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`update "User" set xp = $2, level = $3 where id = $1`, [id, xp, level]);
  });
}

test("burned streak can be bought back with XP once; level does not drop", async ({ page }) => {
  // Выкуп — только в неделю сгорания до четверга; граница окна покрыта unit-тестами restoreOffer
  test.skip([0, 4, 5, 6].includes(new Date().getUTCDay()), "окно выкупа — пн–ср (UTC)");
  const { login } = await registerUser(page);
  // Серия 3 сгорела в начале этой недели (прошлая пропущена, заморозок нет); цена 50 + 50·3 = 200 XP
  await setWeeklyStreak(login, { streak: 3, lastWeeksAgo: 2, freezes: 0 });
  await setXp(login, 120, 2); // в уровне 2 всего 20 XP — не хватает
  await page.reload();
  // Срок — четверг 00:00 в поясе пользователя (UTC), а не сервера
  await expect(page.getByTestId("streak-message")).toHaveText("Серия сгорела — её можно вернуть до чт 00:00");
  await expect(page.getByText("Вернуть серию стоит 200 XP — в текущем уровне не хватает 180 XP")).toBeVisible();

  await setXp(login, 300, 2); // 200 XP в уровне 2
  await page.reload();
  await page.getByRole("button", { name: "Вернуть 3 недели за 200 XP" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Вернуть за 200 XP" }).click();
  await expect(page.getByText("Серия 3 недели снова горит 🔥")).toBeVisible();
  await expect(page.getByTestId("streak-value")).toHaveText("3");
  await expect(page.getByTestId("streak-message")).toHaveText(/^Эта неделя: 0\/3 · осталось \d дн(я|ей)$/);
  await expect(page.getByRole("button", { name: /Вернуть/ })).toHaveCount(0);

  await withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query(
      `select u.xp, u.level, (select sum(amount)::int from "XpEvent" x where x."userId" = u.id and reason = 'STREAK_RESTORE') as paid,
              (select count(*)::int from "StreakCoverWeek" c where c."userId" = u.id and reason = 'RESTORE') as covered
       from "User" u where u.id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ xp: 100, level: 2, paid: -200, covered: 1 });
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

test("new user after the first workout: the week shows 1/3 before any streak", async ({ page }) => {
  await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "40", reps: "10" }]);
  await page.goto("/dashboard");
  await expect(page.getByTestId("streak-value")).toHaveText("0");
  await expect(page.getByTestId("streak-week")).toHaveText("1/3 за неделю");
  await expect(page.getByTestId("streak-message")).toHaveText("Эта неделя: 1/3 — ещё 2 тренировки, и серия зажжётся");
});
