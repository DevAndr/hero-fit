import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { addFlagUser, createGoal, goalOf, goalsOf, makeFriends, mondayWeeksAgo, notificationTitles, notificationUrls, seedStretchSessions, userId, withDb } from "./db";
import { addToWorkout, registerUser, runTick } from "./helpers";
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
