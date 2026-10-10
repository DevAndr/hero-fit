import { expect, test } from "@playwright/test";
import { createUserRow, makeFriends, mondayWeeksAgo, seedRecapWeek, seedWorkouts, userId, withDb } from "./db";
import { E2E_TZ } from "./tz";
import { quickWorkout, registerUser, uniqueLogin } from "./helpers";

test("new user sees goals with progress and an empty list", async ({ page }) => {
  await registerUser(page);
  await page.goto("/achievements");
  await expect(page.getByText("Получено: 0")).toBeVisible();
  await expect(page.getByLabel("Цель: Первая тренировка")).toContainText("0 / 1");
  await expect(page.getByLabel("Цель: 3 тренировки в неделю")).toContainText("0 / 3");
  await expect(page.getByLabel("Цель: В ударе")).toContainText("0 / 2"); // 2 недели подряд
  await expect(page.getByText("Пока пусто")).toBeVisible();
});

test("more than 4 sets in an exercise → achievement, toast once, XP added", async ({ page }) => {
  await registerUser(page);
  const sets = Array.from({ length: 5 }, () => ({ weight: "60", reps: "10" }));
  await quickWorkout(page, "Шраги со штангой", sets);

  const section = page.locator("section").filter({ hasText: "Новые ачивки" });
  await expect(section).toContainText("Сет-герой: Шраги со штангой");
  await expect(section).toContainText("+15 XP");
  await expect(section).toContainText("Первая тренировка");
  // 5 подходов, 50 повторов, 3000 кг → 50 + 25 + 10 + 15 = 100 XP, + 15 «Сет-герой» + 21 «Первая тренировка»
  await expect(page.getByTestId("xp-earned")).toHaveText("+136 XP");
  await expect(page.getByText("100 за тренировку + 36 за ачивки")).toBeVisible();

  await expect(page.getByText("🏆 Сет-герой: Шраги со штангой")).toBeVisible();
  await page.goto("/achievements");
  await expect(page.getByText("Получено: 2")).toBeVisible();
  await expect(page.getByRole("article", { name: "Сет-герой: Шраги со штангой" })).toBeVisible();
  await expect(page.getByText("🏆 Сет-герой")).toHaveCount(0); // уже просмотрена — тост не повторяется
});

test("5th workout, weight progress and streak achievements are generated from history", async ({ page }) => {
  const { login } = await registerUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [
    { weight: 100, reps: 5, sets: 3 },
    { weight: 100, reps: 5, sets: 3 },
    { weight: 105, reps: 5, sets: 3 },
    { weight: 110, reps: 5, sets: 3 },
  ]);
  await withDb(async (db) => {
    const id = await userId(db, login);
    // Прошлая неделя засчитана (серия 1); две последние тренировки — на этой неделе, новая станет третьей
    await db.query(
      `update "User" set "timeZone" = 'UTC', "currentStreak" = 1, "longestStreak" = 1,
         "lastStreakWeek" = to_char(date_trunc('week', now() AT TIME ZONE 'UTC') - interval '7 days', 'YYYY-MM-DD')
       where id = $1`,
      [id],
    );
    await db.query(
      `update "Workout" w set "finishedAt" = now() - make_interval(mins => r.n), "startedAt" = now() - make_interval(mins => r.n + 60)
       from (select id, row_number() over (order by "finishedAt" desc)::int as n from "Workout" where "userId" = $1) r
       where w.id = r.id and r.n <= 2`,
      [id],
    );
  });

  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "130", reps: "3" }]);

  const section = page.locator("section").filter({ hasText: "Новые ачивки" });
  // Старт 100 кг → 130 кг: по ачивке за каждые +5 кг (+5 … +30)
  const weightTitles = [5, 10, 15, 20, 25, 30].map((kg) => `Жим штанги лёжа: +${kg} кг`);
  const titles = [
    "Первая тренировка",
    "Разогрев",
    "3 тренировки в неделю", // первая засчитанная неделя
    ...weightTitles,
    "В ударе", // 2 недели подряд
    "Поднял слона", // 6,6 т за всё время
    "Жим лёжа: 120 кг",
    "Клуб сотки: жим лёжа",
    "Коллекционер: 10", // выдана следующим кругом — из уже выданных
  ];
  for (const title of titles) {
    await expect(section.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(section.getByText("Жим штанги лёжа: +35 кг")).toHaveCount(0);
  await expect(section.getByText("Жим лёжа: 140 кг")).toHaveCount(0);
  await expect(page.getByTestId("streak")).toContainText("2");
  // 1 стартовая + 1 плановая (раз в 4 недели); «В ударе» (2 недели) заморозку не даёт
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Streak" })).toContainText("Заморозки: 2");
  await page.goBack();

  await page.goto("/achievements");
  // Точное число не проверяем: «Жаворонок»/«Сова» зависят от времени запуска теста
  for (const title of titles) await expect(page.getByRole("article", { name: title, exact: true })).toBeVisible();
  // Ближайшая цель по весу: +35 кг (сейчас +30 кг)
  await expect(page.getByLabel("Цель: Жим штанги лёжа: +35 кг")).toContainText("30 кг / 35 кг");
  await expect(page.getByLabel("Цель: Втянулся")).toContainText("5 / 10");
});

test("own exercise, body weight and base lifts give achievements outside of a workout", async ({ page }) => {
  test.slow(); // много шагов с пересчётом ачивок — под полной параллельной нагрузкой на грани 30 с
  await registerUser(page);

  // «Изобретатель» — сразу после создания своего упражнения
  await page.goto("/exercises");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Новое упражнение" }).click();
  await dialog.getByLabel("Название").fill("Жим Ларсена");
  await dialog.getByRole("button", { name: "Грудь", exact: true }).click();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("🏆 Изобретатель")).toBeVisible();

  // 1RM = 100 × (1 + 5/30) ≈ 116,7 кг; без веса тела цели «к весу тела» нет
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "100", reps: "5" }]);
  await page.goto("/achievements");
  await expect(page.getByRole("article", { name: "Клуб сотки: жим лёжа" })).toBeVisible();
  await expect(page.getByLabel("Цель: Жим лёжа: 120 кг")).toContainText("100 кг / 120 кг");
  await expect(page.getByText(/веса тела/)).toHaveCount(0);

  // Вес тела 90 кг → 116,7 / 90 = ×1,3: получена ×1, следующая цель ×1,25
  await page.goto("/settings");
  const bodyWeight = page.getByRole("region", { name: "Вес тела" });
  await bodyWeight.getByLabel("Вес тела, кг").fill("90");
  await bodyWeight.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("🏆 Жим лёжа: ×1 веса тела")).toBeVisible();
  await expect(page.getByText("🏆 Жим лёжа: ×1,25 веса тела")).toBeVisible();
  await page.goto("/achievements");
  await expect(page.getByLabel("Цель: Жим лёжа: ×1,5 веса тела")).toContainText("129.6% / 150%");
});

test("daily login streak in the user's time zone", async ({ page }) => {
  const { login } = await registerUser(page);
  // Вчерашний календарный день в поясе e2e (timezoneId в playwright.config)
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(
    new Date(Date.now() - 24 * 3600 * 1000),
  );
  await withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(`update "User" set "lastLoginDay" = $2, "loginStreak" = 2 where id = $1`, [id, yesterday]);
  });

  await page.reload();
  await expect(page.getByText("🏆 3 дня подряд в приложении")).toBeVisible();
  await page.reload();
  await page.goto("/achievements");
  await expect(page.getByLabel("Цель: Неделя в игре")).toContainText("3 / 7");
});

test("league place from the weekly recap → achievement", async ({ page }) => {
  const me = await registerUser(page);
  const friend = uniqueLogin();
  await createUserRow(friend);
  await makeFriends(me.login, `Me_${me.login.slice(-8)}`, friend, `Fr_${friend.slice(-8)}`);
  const week = mondayWeeksAgo(3);
  const press = (day: number, xp: number) => ({ day, time: "19:00", exercise: "Жим штанги лёжа", weight: 100, reps: 5, sets: 3, xp });
  await seedRecapWeek(me.login, week, [press(0, 300), press(2, 300)]);
  await seedRecapWeek(friend, week, [press(1, 100)]);

  // Снимок итогов создаётся при открытии — вместе с ним выдаётся ачивка за место
  await page.goto(`/recap/${week}`);
  await expect(page.getByRole("region", { name: "Лига друзей" })).toContainText("1-е место");
  await page.goto("/achievements");
  await expect(page.getByRole("article", { name: "Чемпион лиги" })).toBeVisible();
  await expect(page.getByLabel("Цель: Чемпион лиги ×5")).toContainText("1 / 5");
});
