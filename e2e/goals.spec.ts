import { expect, test, type Browser, type Page } from "@playwright/test";
import { createGoal, enableCoach, goalOf, goalRewardXp, goalsOf, idOf, linkCoach, logWeight, makeFriends, mondayWeeksAgo, setPrivacy, withDb, userId } from "./db";
import { quickWorkout, registerUser, runTick } from "./helpers";
import { E2E_TZ } from "./tz";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: E2E_TZ }).format(new Date());
const daysFromToday = (n: number) => {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function newGoal(page: Page, type: string) {
  await page.getByRole("button", { name: "Новая цель" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await dialog.getByRole("button", { name: type, exact: true }).click();
  return dialog;
}

test("strength goal: create, achieve in a workout, open the chest once", async ({ page, context }) => {
  const { login } = await registerUser(page);
  await page.goto("/goals");
  await expect(page.getByText("Целей пока нет")).toBeVisible();

  const dialog = await newGoal(page, "Сила");
  await dialog.getByLabel("Поиск упражнения").fill("Жим штанги лёжа");
  await dialog.getByRole("radio", { name: "Жим штанги лёжа" }).click();
  await dialog.getByRole("radio", { name: "Рабочий вес" }).click();
  await dialog.getByLabel("Цель, кг").fill("60");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole("article", { name: "Жим штанги лёжа — 60 кг" });
  await expect(card).toContainText("0 / 60 кг");

  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "5" }]);

  await page.goto("/goals");
  const achieved = page.getByRole("article", { name: "Жим штанги лёжа — 60 кг" });
  await expect(achieved).toContainText("Цель достигнута");
  await achieved.getByRole("button", { name: "Открыть сундук" }).click();
  const chest = page.getByRole("dialog", { name: "Сундук цели" });
  await chest.getByRole("button", { name: "Открыть", exact: true }).click();
  const reward = page.getByRole("dialog", { name: "Награда получена" });
  await expect(reward).toContainText("+100 XP");
  await reward.getByRole("button", { name: "Забрать" }).click();
  expect(await goalRewardXp(login)).toBe(100);

  // Вторая вкладка — сундука уже нет, история пополнилась
  const other = await context.newPage();
  await other.goto("/goals");
  await expect(other.getByRole("button", { name: "Открыть сундук" })).toHaveCount(0);
  await expect(other.getByRole("region", { name: "История" })).toContainText("Жим штанги лёжа — 60 кг");
  const [goal] = await goalsOf(login);
  expect((await goalOf(goal.id))?.chestOpenedAt).not.toBeNull();
});

test("goal already reached is refused", async ({ page }) => {
  await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "5" }]);
  await page.goto("/goals");
  const dialog = await newGoal(page, "Сила");
  await dialog.getByLabel("Поиск упражнения").fill("Жим штанги лёжа");
  await dialog.getByRole("radio", { name: "Жим штанги лёжа" }).click();
  await dialog.getByRole("radio", { name: "Рабочий вес" }).click();
  await expect(dialog.getByText("Сейчас: 60 кг")).toBeVisible();
  await dialog.getByLabel("Цель, кг").fill("60");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByText("Уже достигнуто")).toBeVisible();
});

test("a refused body weight goal does not keep the weigh-in", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/goals");
  const dialog = await newGoal(page, "Вес тела");
  await dialog.getByLabel("Текущий вес, кг").fill("80");
  await dialog.getByLabel("Цель, кг").fill("80");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog.getByText("Уже достигнуто")).toBeVisible();
  const entries = await withDb(
    async (db) => (await db.query(`select 1 from "BodyWeightEntry" e join "User" u on u.id = e."userId" where u.login = $1`, [login])).rowCount,
  );
  expect(entries).toBe(0);
});

test("five active goals is the limit", async ({ page }) => {
  const { login } = await registerUser(page);
  for (let i = 1; i <= 5; i++) await createGoal(login, { type: "WORKOUTS", target: 10 * i });
  await page.goto("/goals");
  await expect(page.getByRole("button", { name: "Новая цель" })).toBeDisabled();
  await expect(page.getByText("Максимум 5 активных целей")).toBeVisible();
});

test("body weight goal is reached by a weigh-in", async ({ page }) => {
  const { login } = await registerUser(page);
  await logWeight(login, daysFromToday(-1), 90);
  await page.goto("/goals");
  const dialog = await newGoal(page, "Вес тела");
  await expect(dialog.getByText("Сейчас: 90 кг")).toBeVisible();
  await dialog.getByLabel("Цель, кг").fill("85");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByRole("article", { name: "Вес тела — 85 кг ↓" })).toBeVisible();

  const block = page.getByRole("region", { name: "Вес тела" });
  await block.getByLabel("Вес сегодня, кг").fill("84,8");
  await block.getByRole("button", { name: "Записать вес" }).click();
  await expect(page.getByText("🎯 Цель достигнута: Вес тела — 85 кг ↓")).toBeVisible();
  await expect(page.getByRole("article", { name: "Вес тела — 85 кг ↓" })).toContainText("Цель достигнута");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
  await expect(page.getByText("🎯 Цель достигнута", { exact: true })).toBeVisible();
});

test("postpone and delete a goal", async ({ page }) => {
  const { login } = await registerUser(page);
  await createGoal(login, { type: "WORKOUTS", target: 20, deadline: daysFromToday(30) });
  await page.goto("/goals");
  const card = page.getByRole("article", { name: "20 тренировок" });
  await expect(card).toContainText("осталось");

  await card.getByRole("button", { name: "Действия с целью" }).click();
  await page.getByRole("menuitem", { name: "Перенести срок" }).click();
  const dialog = page.getByRole("dialog", { name: "Срок цели" });
  await dialog.getByRole("button", { name: "Без срока" }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).not.toContainText("осталось");

  await card.getByRole("button", { name: "Действия с целью" }).click();
  await page.getByRole("menuitem", { name: "Удалить" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
  await expect(card).toBeHidden();
  await expect.poll(() => goalsOf(login)).toEqual([]);
});

test("goal on an archived own exercise still shows its name", async ({ page }) => {
  const { login } = await registerUser(page);
  await withDb(async (db) => {
    const uid = await userId(db, login);
    await db.query(
      `insert into "Exercise" (id, "userId", name, "muscleGroups", "archivedAt", "createdAt", "updatedAt") values (gen_random_uuid(), $1, 'Мой жим', '{CHEST}', now(), now(), now())`,
      [uid],
    );
  });
  await createGoal(login, { type: "STRENGTH", exerciseName: "Мой жим", target: 50 });
  await page.goto("/goals");
  await expect(page.getByRole("article", { name: "Мой жим — 50 кг" })).toBeVisible();
});

async function second(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

test("workout summary: goal reached with a chest, progress for the rest", async ({ page }) => {
  const { login } = await registerUser(page);
  await createGoal(login, { type: "STRENGTH", exerciseName: "Жим штанги лёжа", target: 60 });
  await createGoal(login, { type: "STRENGTH", exerciseName: "Жим штанги лёжа", target: 100 });
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "5" }]);
  const block = page.getByRole("region", { name: "Цели", exact: true });
  await expect(block).toContainText("🎯 Цель достигнута: Жим штанги лёжа — 60 кг");
  await expect(block.getByRole("button", { name: "Открыть сундук" })).toBeVisible();
  await expect(block).toContainText("Жим штанги лёжа — 100 кг: 0 → 60 %");
});

test("dashboard goals card", async ({ page }) => {
  const { login } = await registerUser(page);
  const empty = page.getByRole("region", { name: "Цели", exact: true });
  await expect(empty.getByRole("link", { name: /Поставь первую цель/ })).toHaveAttribute("href", "/goals");
  await createGoal(login, { type: "WORKOUTS", target: 20 });
  await page.reload();
  await expect(page.getByRole("region", { name: "Цели", exact: true })).toContainText("20 тренировок");
  await expect(page.getByRole("region", { name: "Цели", exact: true })).toContainText("0 %");
});

test("friends feed shows a reached goal, without kilograms when weights are hidden", async ({ page, browser }) => {
  const { login } = await registerUser(page, "Маша");
  const friend = await second(browser, "Боря");
  try {
    await makeFriends(login, `masha${Date.now() % 100000}`, friend.login, `borya${Date.now() % 100000}`);
    await createGoal(login, { type: "STRENGTH", exerciseName: "Жим штанги лёжа", target: 60 });
    await quickWorkout(page, "Жим штанги лёжа", [{ weight: "60", reps: "5" }]);

    await friend.page.goto("/friends");
    await expect(friend.page.getByText("Цель: Жим штанги лёжа — 60 кг")).toBeVisible();
    await setPrivacy(login, { hideWeights: true });
    await friend.page.reload();
    await expect(friend.page.getByText("Цель: Жим штанги лёжа", { exact: true })).toBeVisible();
    await expect(friend.page.getByText("Цель: Жим штанги лёжа — 60 кг")).toHaveCount(0);
  } finally {
    await friend.context.close();
  }
});

test("coach sees the client's goals", async ({ page, browser }) => {
  const { login } = await registerUser(page, "Клиент");
  const coach = await second(browser, "Тренер");
  try {
    await enableCoach(coach.login, `coach${Date.now() % 100000}`);
    await linkCoach(coach.login, login);
    await logWeight(login, daysFromToday(-1), 90);
    await createGoal(login, { type: "BODY_WEIGHT", target: 80, startValue: 90 });
    await coach.page.goto(`/coach/clients/${await idOf(login)}`);
    const goals = coach.page.getByRole("region", { name: "Цели клиента" });
    await expect(goals.getByRole("article", { name: "Вес тела — 80 кг ↓" })).toBeVisible();
    await expect(goals.getByRole("button", { name: "Действия с целью" })).toHaveCount(0);
  } finally {
    await coach.context.close();
  }
});

test("deadline passed: the tick fails the goal, «set again» reopens it", async ({ page, request }) => {
  const { login } = await registerUser(page);
  await createGoal(login, {
    type: "WORKOUTS",
    target: 20,
    deadline: daysFromToday(-3),
    createdAt: new Date(Date.now() - 10 * 86_400_000),
  });
  await runTick(request);
  await page.goto("/goals");
  const history = page.getByRole("region", { name: "История" });
  await expect(history).toContainText("Не успел · пройдено 0 %");
  await history.getByRole("link", { name: "Поставить снова" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая цель" });
  await expect(dialog.getByLabel("Цель, тренировок")).toHaveValue("20");
  await page.keyboard.press("Escape");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
  await expect(page.getByText("Срок цели вышел")).toBeVisible();
});

test("a lost streak counts as 0 for streak goals", async ({ page }) => {
  const { login } = await registerUser(page);
  await withDb((db) =>
    db.query(`update "User" set "currentStreak" = 10, "longestStreak" = 10, "lastStreakWeek" = $2 where login = $1`, [login, mondayWeeksAgo(6)]),
  );
  await page.goto("/goals");
  const dialog = await newGoal(page, "Серия");
  await expect(dialog.getByText("Сейчас: 0 недель")).toBeVisible();
  await dialog.getByLabel("Цель, недель").fill("8");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("article", { name: "Серия 8 недель" })).toContainText("0 / 8 недель");
});

test("after the deadline: a weigh-in doesn't complete the goal and the deadline can't be moved", async ({ page }) => {
  const { login } = await registerUser(page);
  await logWeight(login, daysFromToday(-5), 90);
  await createGoal(login, { type: "BODY_WEIGHT", target: 85, startValue: 90, deadline: daysFromToday(-1), createdAt: new Date(Date.now() - 10 * 86_400_000) });
  await page.goto("/goals");
  const card = page.getByRole("article", { name: "Вес тела — 85 кг ↓" });
  await expect(card).toContainText("срок вышел");

  await page.getByRole("region", { name: "Вес тела" }).getByLabel("Вес сегодня, кг").fill("84");
  await page.getByRole("region", { name: "Вес тела" }).getByRole("button", { name: "Записать вес" }).click();
  await expect(page.getByText("Вес записан")).toBeVisible();
  expect((await goalsOf(login))[0].status).toBe("ACTIVE");

  await card.getByRole("button", { name: "Действия с целью" }).click();
  await page.getByRole("menuitem", { name: "Перенести срок" }).click();
  const dialog = page.getByRole("dialog", { name: "Срок цели" });
  await dialog.getByRole("button", { name: "1 мес" }).click();
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog.getByText("Срок уже вышел")).toBeVisible();
});
