import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { addFlagUser, createGoal, goalOf, goalsOf, makeFriends, mondayWeeksAgo, notificationTitles, notificationUrls, seedRecapWeek, seedStretchSessions, userExists, userId, withDb } from "./db";
import { addToWorkout, PASSWORD, registerUser, runTick } from "./helpers";
import { localAt } from "./tz";

const STRETCH = "Кошка-корова";
const LIFT = "Жим штанги лёжа";

/** Отметить первый подход растяжки: время удержания вручную и ✓. */
async function holdDone(page: Page, exercise: string, time: string) {
  const block = page.getByRole("region", { name: exercise });
  await block.getByLabel("Время, подход 1").fill(time);
  await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);
}

test("stretch session does not count toward the week, a lift with a cool-down does", async ({ page, browser }) => {
  test.slow(); // две регистрации (argon2) и две тренировки
  const a = await registerUser(page, "Гибкий");
  await addFlagUser("stretching", a.login);
  const other = await browser.newContext();
  const pageB = await other.newPage();
  try {
    const b = await registerUser(pageB, "Друг");
    const alpha = `Flex_${a.login.slice(-8)}`;
    await makeFriends(a.login, alpha, b.login, `Pal_${b.login.slice(-8)}`);
    // Прежний рекорд удержания 30 с: сессия ниже его побьёт (+25 XP за рекорд — не в лигу)
    await withDb(async (db) =>
      db.query(
        `insert into "PersonalRecord" (id, "userId", "exerciseId", type, value)
         select $1, $2, e.id, 'MAX_DURATION', 30 from "Exercise" e where e.name = $3 and e."userId" is null`,
        [randomUUID(), await userId(db, a.login), STRETCH],
      ),
    );

    // Сессия из одной растяжки: неделя серии не двигается
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await addToWorkout(page, [STRETCH]);
    await holdDone(page, STRETCH, "1:30");
    await finish(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("streak-week")).toHaveText("0/3 за неделю");

    // В ленте друга — «Растяжка · 1 мин» без объёма
    await pageB.goto("/friends");
    const card = pageB.getByRole("article", { name: new RegExp(`^${alpha}: `) });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("feed-stretch")).toHaveText("Растяжка · 1 мин");
    await expect(card.getByTestId("feed-volume")).toHaveCount(0);

    // Лига друзей: ни XP сессии, ни XP её рекорда
    await pageB.goto("/leaderboard");
    const row = pageB.getByRole("list", { name: "Места" }).getByRole("listitem").filter({ hasText: alpha });
    await expect(row.getByTestId("league-xp")).toHaveText("0 XP");

    // Силовая с заминкой — обычная тренировка: +1 к неделе (сессия растяжки в счёт не идёт)
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await addToWorkout(page, [LIFT, STRETCH]);
    const lift = page.getByRole("region", { name: LIFT });
    await lift.getByLabel("Вес, подход 1").fill("40");
    await lift.getByLabel("Повторы, подход 1").fill("10");
    await lift.getByRole("button", { name: "Подход 1 выполнен" }).click();
    await holdDone(page, STRETCH, "45");
    await finish(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("streak-week")).toHaveText("1/3 за неделю");
  } finally {
    await other.close();
  }
});

test("weekly recap: stretch minutes line from sessions and cool-downs", async ({ page }) => {
  const u = await registerUser(page, "Итоги_растяжки");
  const week = mondayWeeksAgo(2);
  // Силовая с заминкой (сессия растяжки сама итогов не создаёт) и сессия растяжки: 90 с + 60 с = 2,5 мин → «2 мин»
  const [lift] = await seedRecapWeek(u.login, week, [{ day: 1, time: "19:00", exercise: LIFT, weight: 60, reps: 5, sets: 3, xp: 80 }]);
  await withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [STRETCH]);
    const weId = randomUUID();
    await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 1, 30)`, [weId, lift.workoutId, rows[0].id]);
    await db.query(
      `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "durationSec", "isWarmup", "completedAt") values ($1, $2, 0, 0, 0, 90, false, now())`,
      [randomUUID(), weId],
    );
  });
  await seedStretchSessions(u.login, STRETCH, [localAt(week, "20:00", 2)], 60);
  await page.goto(`/recap/${week}`);
  await expect(page.getByTestId("recap-total-workouts")).toHaveText("1");
  await expect(page.getByTestId("recap-stretch")).toHaveText("Растяжка: 2 мин");
});

test("own one-sided stretch: zone and «each side», a set × 2, summary minutes count both sides", async ({ page }) => {
  const u = await registerUser(page, "Своя_растяжка");
  await addFlagUser("stretching", u.login);
  const name = `Голубь у стены ${u.login.slice(-6)}`;
  // Добавление прямо из каталога /stretching — вид «Растяжка» уже выбран, правка — в «Упражнениях»
  await page.goto("/stretching");
  const catalog = page.getByRole("region", { name: "Каталог растяжки" });
  await expect(catalog.getByRole("link", { name: "Изменить в «Упражнениях»" })).toHaveAttribute("href", "/exercises?group=STRETCH");
  await catalog.getByRole("button", { name: "Новое упражнение" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Растяжка" })).toBeChecked();
  await dialog.getByLabel("Название").fill(name);
  await dialog.getByRole("button", { name: "Тазобедренные", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Одностороннее (каждая сторона)" }).check();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
  await expect(catalog.getByRole("heading", { name })).toBeVisible();

  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, [name]);
  await expect(page.getByRole("region", { name })).toContainText("каждая сторона");
  await holdDone(page, name, "1:30");
  await finish(page);
  // Подход — «1:30 × 2», минуты растяжки — обе стороны: 2 × 1:30 = 3 мин
  await expect(page.getByRole("main").getByText("1:30 × 2", { exact: true })).toBeVisible();
  await expect(page.getByTestId("summary-stretch")).toContainText("3 мин");
});

test("without the flag there is no stretch menu, page or catalog entries", async ({ page }) => {
  await registerUser(page, "Без_флага");
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Растяжка" })).toHaveCount(0);
  const res = await page.goto("/stretching");
  expect(res?.status()).toBe(404);
  await page.goto("/exercises");
  await expect(page.getByRole("heading", { name: "Складка стоя" })).toHaveCount(0);
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const scope = desktop
    ? page.getByRole("complementary", { name: "Каталог упражнений" })
    : (await page.getByRole("button", { name: "Добавить упражнение" }).click(), page.getByRole("dialog"));
  await scope.getByLabel("Поиск упражнения").fill("Складка");
  await expect(scope).not.toContainText("Складка стоя");
});

test("stretching page: start a program, hold, finish, week numbers", async ({ page }) => {
  test.slow();
  const u = await registerUser(page, "Растяжка_стр");
  await addFlagUser("stretching", u.login);
  await page.goto("/dashboard");
  if ((page.viewportSize()?.width ?? 0) >= 1024) await page.getByRole("link", { name: "Растяжка" }).click();
  else {
    // На телефоне — в меню профиля
    await page.getByRole("button", { name: "Меню профиля" }).click();
    await page.getByRole("menuitem", { name: "Растяжка" }).click();
  }
  await expect(page).toHaveURL(/\/stretching$/);
  await expect(page.getByTestId("stretch-week-sessions")).toHaveText("0");
  await expect(page.getByRole("region", { name: "Цели по растяжке" })).toContainText("Поставить цель");
  await expect(page.getByRole("region", { name: "Каталог растяжки" }).getByRole("heading", { name: "Складка стоя" })).toBeVisible();

  await page.getByRole("button", { name: "Начать растяжку" }).click();
  await page.getByRole("button", { name: "Начать «Утренняя растяжка»" }).click();
  await expect(page).toHaveURL(/\/training/);
  const first = page.getByRole("region").filter({ has: page.getByLabel("Время, подход 1") }).first();
  await first.getByLabel("Время, подход 1").fill("3");
  await first.getByRole("button", { name: "Держать" }).first().click();
  await expect(first.getByRole("button", { name: "Подход 1 выполнен" })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  // Второй подход — вручную на минуту с лишним: 3 с отсчёта до целой минуты не дотягивают
  await first.getByLabel("Время, подход 2").fill("1:30");
  await first.getByRole("button", { name: "Подход 2 выполнен" }).click();
  await finish(page);
  await expect(page.getByRole("main").getByText("Растяжка", { exact: true }).first()).toBeVisible();
  const xp = await page.getByText(/^\+\d+ XP$/).first().innerText();
  expect(parseInt(xp.replace(/\D/g, ""), 10)).toBeLessThanOrEqual(60);

  await page.goto("/stretching");
  await expect(page.getByTestId("stretch-week-sessions")).toHaveText("1");
  await expect(page.getByTestId("stretch-week-minutes")).not.toHaveText("0");
});

test("hold goal: set from /stretching, reached by a stretch session, refused without the flag", async ({ page }) => {
  test.slow();
  const u = await registerUser(page, "Цель_удержание");
  // Без флага: страница недоступна, а цель не поставить и напрямую
  await page.goto("/goals");
  await page.getByRole("button", { name: "Новая цель" }).click();
  await expect(page.getByRole("dialog", { name: "Новая цель" }).getByRole("button", { name: "Растяжка" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await addFlagUser("stretching", u.login);
  await page.goto("/stretching");
  await page.getByRole("button", { name: "Поставить цель" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await dialog.getByRole("button", { name: "Удержание" }).click();
  await dialog.getByLabel("Поиск упражнения").fill("Складка стоя");
  await dialog.getByRole("radio", { name: "Складка стоя" }).click();
  await dialog.getByLabel(/^Цель, секунд/).fill("5");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("От 10 до 600");
  await dialog.getByLabel(/^Цель, секунд/).fill("0:20");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  const title = "Складка стоя — удержание 0:20";
  await expect(page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: title })).toContainText("0:00 / 0:20");

  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Складка стоя"]);
  await holdDone(page, "Складка стоя", "25");
  await finish(page);
  await expect(page.getByRole("region", { name: "Цели", exact: true })).toContainText(`Цель достигнута: ${title}`);
});

test("weekly goal: set from /stretching, a counted week from history, a week without stretching fails it by the tick", async ({ page, request }) => {
  test.slow();
  const u = await registerUser(page, "Цель_регулярность");
  await addFlagUser("stretching", u.login);

  // Постановка из /stretching: минуты, проверка нормы
  await page.goto("/stretching");
  await page.getByRole("button", { name: "Поставить цель" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await dialog.getByRole("button", { name: "Регулярность" }).click();
  await dialog.getByRole("radio", { name: "Минуты" }).click();
  await dialog.getByLabel("Минут в неделю").fill("4");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("От 5 до 300");
  await dialog.getByLabel("Минут в неделю").fill("30");
  await expect(dialog.getByLabel("Сколько недель")).toHaveValue("4");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  const created = page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: "30 минут растяжки в неделю · 4 недели" });
  await expect(created).toContainText("0 из 4 недель");

  // История: цель с понедельника 3 недели назад на 2 недели; первая — 2 сессии (засчитана), вторая — пусто.
  // Срок с форой уже прошёл — тик берёт цель в любой день недели (окно «после закрытия недели» — в unit-тестах)
  const start = mondayWeeksAgo(3);
  const sunday = new Date(Date.parse(`${mondayWeeksAgo(1)}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const id = await createGoal(u.login, {
    type: "STRETCH_WEEKLY",
    stretchUnit: "SESSIONS",
    target: 2,
    createdAt: localAt(start, "09:00"),
    deadline: sunday,
  });
  await seedStretchSessions(u.login, STRETCH, [localAt(start, "19:00"), localAt(start, "19:00", 2)]);
  const title = "2 растяжки в неделю · 2 недели";
  await page.goto("/goals");
  await expect(page.getByRole("region", { name: "Активные цели" }).getByRole("article", { name: title })).toContainText("1 из 2 недель");

  // Тик: неделя без нормы (и фора 24 ч) — провал, уведомление со ссылкой «Поставить снова»
  await runTick(request, new Date(), "goals");
  expect((await goalOf(id))?.status).toBe("FAILED");
  expect(await notificationTitles(u.login)).toContain(`Неделя без растяжки — цель «${title}» не выполнена`);
  expect(await notificationUrls(u.login)).toContain(`/goals?again=${id}`);
  // Поставленная в UI цель (её первая неделя ещё идёт или не началась) не тронута
  expect((await goalsOf(u.login)).map((g) => g.status)).toEqual(["FAILED", "ACTIVE"]);
  await page.goto(`/goals?again=${id}`);
  const again = page.getByRole("dialog", { name: "Новая цель" });
  await expect(again.getByRole("radio", { name: "Сессии" })).toBeChecked();
  await expect(again.getByLabel("Сессий в неделю")).toHaveValue("2");
  await expect(again.getByLabel("Сколько недель")).toHaveValue("2");
});

test("split programs: caution in the description, «Цель: …» opens the skill goal, the program starts", async ({ page }) => {
  const u = await registerUser(page, "Шпагат");
  await addFlagUser("stretching", u.login);
  await page.goto("/stretching");
  await page.getByRole("button", { name: "Начать растяжку" }).click();
  const start = page.getByRole("dialog", { name: "Начать растяжку" });
  await expect(start.getByRole("button", { name: "Начать «Шпагат: продольный»" })).toBeVisible();
  await expect(start).toContainText("не до боли");
  await start.getByRole("link", { name: "Цель: Поперечный шпагат" }).click();

  await expect(page).toHaveURL(/\/stretching\?skill=SPLIT_SIDE$/);
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await expect(dialog.getByRole("radio", { name: "Поперечный шпагат" })).toBeChecked();
  await dialog.getByLabel("Замер сейчас, см").fill("25");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: "Поперечный шпагат" })).toContainText("Осталось 25 см");

  await page.getByRole("button", { name: "Начать растяжку" }).click();
  await start.getByRole("button", { name: "Начать «Шпагат: поперечный»" }).click();
  await expect(page).toHaveURL(/\/training/);
  await expect(page.getByRole("region", { name: "Поперечный шпагат с опорой" })).toBeVisible();
});

test("skill goal: set, one measurement per day (a repeat replaces it), 0 reaches it with a chest; data export and account deletion", async ({ page }) => {
  test.slow();
  const u = await registerUser(page, "Цель_навык");
  await addFlagUser("stretching", u.login);

  await page.goto("/stretching");
  await page.getByRole("button", { name: "Поставить цель" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await dialog.getByRole("button", { name: "Навык" }).click();
  // Проверки: без навыка и с нулевым замером — отказ
  await dialog.getByLabel("Замер сейчас, см").fill("10");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Выбери навык или назови свой");
  await dialog.getByRole("radio", { name: "Ладони в пол в наклоне" }).click();
  await dialog.getByLabel("Замер сейчас, см").fill("0");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Замер — от 0,5 до 200 см, шаг 0,5");
  await dialog.getByLabel("Замер сейчас, см").fill("10");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();

  const title = "Ладони в пол в наклоне";
  const card = page.getByRole("region", { name: "Цели по растяжке" }).getByRole("article", { name: title });
  await expect(card).toContainText("Осталось 10 см");
  await expect(card).toContainText("Замеряйте раз в неделю в одно и то же время после разминки");

  // Вторая активная цель по тому же навыку — отказ
  await page.getByRole("button", { name: "Поставить цель" }).click();
  await dialog.getByRole("button", { name: "Навык" }).click();
  await dialog.getByRole("radio", { name: "Ладони в пол в наклоне" }).click();
  await dialog.getByLabel("Замер сейчас, см").fill("8");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Цель по этому навыку уже есть");
  await page.keyboard.press("Escape");

  // Замер, повтор в тот же день заменяет
  await card.getByLabel("Замер, см").fill("6");
  await card.getByRole("button", { name: "Записать замер" }).click();
  await expect(card).toContainText("Осталось 6 см");
  await card.getByLabel("Замер, см").fill("4");
  await card.getByRole("button", { name: "Записать замер" }).click();
  await expect(card).toContainText("Осталось 4 см");
  await expect(card.getByTestId("stretch-measurement")).toHaveCount(1);

  // Выгрузка «Мои данные»
  const exported = await (await page.request.get("/account/export/json")).json();
  expect(exported.stretchMeasurements).toEqual([{ skill: "FOLD_STANDING", date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), cm: 4 }]);

  // 0 — цель достигнута, сундук на /goals
  await card.getByLabel("Замер, см").fill("0");
  await card.getByRole("button", { name: "Записать замер" }).click();
  await expect(card).toBeHidden(); // достигнутая цель ушла с /stretching
  await page.goto("/goals");
  const done = page.getByRole("region", { name: "Активные цели" }).getByRole("article", { name: title });
  await expect(done).toContainText("Цель достигнута");
  await expect(done.getByRole("button", { name: "Открыть сундук" })).toBeVisible();
  expect(await notificationTitles(u.login)).toContain("🎯 Цель достигнута");

  // Удаление аккаунта уносит и замеры
  await page.goto("/settings");
  await page.getByRole("region", { name: "Удаление аккаунта" }).getByRole("button", { name: "Удалить аккаунт" }).click();
  const del = page.getByRole("alertdialog", { name: "Удалить аккаунт?" });
  await del.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await del.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  expect(await userExists(u.login)).toBe(false);
});
