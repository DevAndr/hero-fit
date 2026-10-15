import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, goblinRows, spawnGoblin, withDb } from "./db";
import { addToWorkout, registerUser } from "./helpers";

// Флаг — списком на пользователя; сценарии на desktop (как другие флаговые)
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Флаговые сценарии — на desktop");
});

const bench = (page: Page) => page.getByRole("region", { name: "Жим штанги лёжа" });
const complete = (page: Page, n: number) => bench(page).getByRole("button", { name: `Подход ${n} выполнен` }).click();
const banner = (page: Page) => page.getByRole("status", { name: "Золотой гоблин" });

/** Идущая тренировка с одним выполненным подходом (жим 60×10), черновик на сервере. */
async function startedWorkout(page: Page) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await bench(page).getByLabel("Вес, подход 1").fill("60");
  await bench(page).getByLabel("Повторы, подход 1").fill("10");
  await complete(page, 1);
  await page.getByRole("timer", { name: "Таймер отдыха" }).getByRole("button", { name: "Пропустить отдых" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\/\w+$/);
}

const xpOf = (login: string, reason: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int n from "XpEvent" x join "User" u on u.id = x."userId" where u.login = $1 and x.reason = $2`,
      [login, reason],
    );
    return rows[0].n;
  });

test("caught: 3 sets in 10 minutes → chest once, achievement, rare bestiary", async ({ page, context }) => {
  const me = await registerUser(page);
  await addFlagUser("golden_goblin", me.login);
  await startedWorkout(page);
  await spawnGoblin(me.login);
  // Второй гоблин для той же тренировки база не примет
  await expect(spawnGoblin(me.login)).rejects.toThrow();
  await page.reload();
  await expect(banner(page)).toContainText("Золотой гоблин! 3 подхода за 10 минут");
  await expect(banner(page)).toContainText("Подходы: 0/3");
  await expect(page.getByTestId("goblin-timer")).toHaveText(/^(10:00|9:5\d)$/);

  // Подход, отмеченный до появления, не в счёт — нужны ещё три
  await complete(page, 2);
  await complete(page, 3);
  await bench(page).getByRole("button", { name: "Подход", exact: true }).click();
  await complete(page, 4);
  await expect(banner(page)).toContainText("Пойман! Сундук ждёт в итогах тренировки");

  await finish(page);
  const block = page.getByRole("region", { name: "Золотой гоблин" });
  await expect(block).toContainText("Золотой гоблин пойман!");
  const second = await context.newPage();
  await second.goto(page.url());

  await block.getByRole("button", { name: "Открыть сундук гоблина" }).click();
  await page.getByRole("button", { name: "Открыть сундук", exact: true }).click();
  await expect(page.getByTestId("chest-reward")).toHaveText("+150 XP");
  await page.getByRole("button", { name: "Забрать" }).click();
  await expect(block).toContainText("Сундук открыт · +150 XP");

  // Вторая вкладка не заберёт сундук ещё раз
  await second.getByRole("region", { name: "Золотой гоблин" }).getByRole("button", { name: "Открыть сундук гоблина" }).click();
  await second.getByRole("button", { name: "Открыть сундук", exact: true }).click();
  await expect(second.getByText("Сундук гоблина уже открыт")).toBeVisible();
  expect(await xpOf(me.login, "GOBLIN_REWARD")).toBe(1);
  expect(await goblinRows(me.login)).toEqual([{ caught: true, opened: true }]);
  expect(
    await withDb(async (db) =>
      (await db.query(`select 1 from "UserAchievement" a join "User" u on u.id = a."userId" where u.login = $1 and a.code = 'goblin:1'`, [me.login])).rowCount,
    ),
  ).toBe(1);

  await page.goto("/achievements?tab=bestiary");
  await expect(page.getByRole("heading", { name: "Редкие" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Золотой гоблин" })).toContainText("Встречен: 1 · Пойман: 1");
});

test("escaped: spawned 11 minutes ago → «ушёл», no chest", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("golden_goblin", me.login);
  await startedWorkout(page);
  await spawnGoblin(me.login, 11);
  await page.reload();
  await expect(banner(page)).toContainText("Гоблин ушёл…");
  await complete(page, 2);
  await complete(page, 3);
  await finish(page);
  const block = page.getByRole("region", { name: "Золотой гоблин" });
  await expect(block).toContainText("Золотой гоблин ушёл");
  await expect(block.getByRole("button", { name: "Открыть сундук гоблина" })).toHaveCount(0);
  expect(await goblinRows(me.login)).toEqual([{ caught: false, opened: false }]);
});

test("without the flag: no banner, no catch, no summary block, no rare section", async ({ page }) => {
  const me = await registerUser(page);
  await startedWorkout(page);
  await spawnGoblin(me.login);
  await page.reload();
  await expect(bench(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  for (const n of [2, 3]) await complete(page, n);
  await bench(page).getByRole("button", { name: "Подход", exact: true }).click();
  await complete(page, 4);
  await finish(page);
  await expect(page.getByRole("region", { name: "Золотой гоблин" })).toHaveCount(0);
  expect(await goblinRows(me.login)).toEqual([{ caught: false, opened: false }]);
  await page.goto("/achievements?tab=bestiary");
  await expect(page.getByRole("heading", { name: "Редкие" })).toHaveCount(0);
});

test("cancelling the workout removes its goblin", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("golden_goblin", me.login);
  await startedWorkout(page);
  await spawnGoblin(me.login);
  await page.getByRole("button", { name: "Действия с тренировкой" }).click();
  await page.getByRole("menuitem", { name: "Отменить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отменить тренировку" }).click();
  await expect.poll(() => goblinRows(me.login)).toEqual([]);
});
