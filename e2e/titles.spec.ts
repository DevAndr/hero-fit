import { expect, test } from "@playwright/test";
import { makeFriends, mondayWeeksAgo, seedWorkouts, userId, withDb } from "./db";
import { pickOption, quickWorkout, registerUser } from "./helpers";

/** Победа над боссом `code` n недель назад (строка BossWeek напрямую). */
const bossWin = (login: string, code: string, weeksAgo: number) =>
  withDb(async (db) => {
    const id = await userId(db, login);
    await db.query(
      `INSERT INTO "BossWeek" (id, "userId", week, "bossCode", hp, "defeatedAt") VALUES (gen_random_uuid()::text, $1, $2, $3, 1500, now())`,
      [id, mondayWeeksAgo(weeksAgo), code],
    );
  });

test("bestiary: one golem win", async ({ page }) => {
  const { login } = await registerUser(page);
  await bossWin(login, "golem", 2);

  await page.goto("/achievements");
  await expect(page.getByRole("heading", { name: "Ближайшие цели" })).toBeVisible();

  await page.getByRole("link", { name: "Бестиарий" }).click();
  await expect(page).toHaveURL(/tab=bestiary/);
  const golem = page.getByTestId("bestiary-golem");
  await expect(golem).toContainText("Железный Голем");
  await expect(golem).toContainText("Побед: 1");
  await expect(golem.getByLabel("1 звезда из 3")).toBeVisible();
  await expect(golem.getByTestId("title-earned")).toHaveText(["Гроза Голема"]);
  await expect(page.getByTestId("bestiary-troll")).toContainText("???");
  await expect(page.getByText("На арене сейчас")).toHaveCount(1);
  await expect(page.getByTestId("bestiary-legend")).toContainText("звёзды у 1 из 12 боссов");
});

test("bestiary: a defeated boss opens details, an unknown one does not", async ({ page }) => {
  const { login } = await registerUser(page);
  await bossWin(login, "golem", 2);
  await page.goto("/achievements?tab=bestiary");

  await expect(page.getByTestId("bestiary-troll").getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "Железный Голем: подробнее" }).click();

  const dialog = page.getByRole("dialog", { name: "Железный Голем" });
  await expect(dialog).toContainText("ржавых грифов");
  await expect(dialog).toContainText("Побед1");
  await expect(dialog.getByRole("list", { name: "История боёв" }).getByRole("listitem")).toHaveCount(1);
  await expect(dialog.getByRole("listitem").filter({ hasText: "Гроза Голема" })).toContainText("получен");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Кошмар Голема" })).toContainText("1 / 3 победы");

  const viewer = dialog.getByRole("button", { name: "Рассмотреть поближе" });
  await viewer.click();
  await expect(dialog.getByRole("button", { name: "Уменьшить картинку" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(viewer).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("bestiary: the boss picture tilts after the mouse", async ({ page, isMobile }) => {
    test.skip(isMobile, "наклон — только мышью");
    const { login } = await registerUser(page);
    await bossWin(login, "golem", 2);
    await page.goto("/achievements?tab=bestiary");
    await page.getByRole("button", { name: "Железный Голем: подробнее" }).click();

    const viewer = page.getByTestId("boss-viewer");
    const box = (await viewer.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await expect(viewer).toHaveAttribute("data-tilt", "");
    await expect(viewer).toHaveCSS("transform", /matrix3d/);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200);
    await expect(viewer).not.toHaveAttribute("data-tilt");
  });
});

const titleCode = (login: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ titleCode: string | null }>(`SELECT "titleCode" FROM "User" WHERE login = $1`, [login]);
    return rows[0].titleCode;
  });

test("title: pick in settings — only unlocked titles", async ({ page }) => {
  const { login } = await registerUser(page);
  await bossWin(login, "golem", 2);
  await withDb(async (db) =>
    db.query(
      `INSERT INTO "UserAchievement" (id, "userId", code, category, title, description, threshold, "seenAt")
       VALUES (gen_random_uuid()::text, $1, 'streakw:12', 'STREAK', 'В ударе', '12 недель', 12, now())`,
      [await userId(db, login)],
    ),
  );

  await page.goto("/settings#title");
  const block = page.locator("#title");
  const trigger = block.getByRole("combobox", { name: "Титул" });
  await trigger.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Без титула", "Гроза Голема", "Железная воля"]);
  await page.getByRole("option", { name: "Гроза Голема", exact: true }).click();
  await expect(page.getByText("Титул сохранён")).toBeVisible();
  await expect.poll(() => titleCode(login)).toBe("boss:golem:1");

  await page.reload();
  await expect(page.locator("#title")).toContainText("· Гроза Голема");

  await pickOption(page, page.locator("#title").getByRole("combobox", { name: "Титул" }), "Без титула");
  await expect.poll(() => titleCode(login)).toBeNull();
});

test("title: nothing unlocked yet", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  const block = page.locator("#title");
  await expect(block).toContainText("Титулы открываются за победы над боссами и вершины ачивок");
  await expect(block.getByRole("link", { name: "Бестиарий" })).toHaveAttribute("href", "/achievements?tab=bestiary");
});

const setTitle = (login: string, code: string) =>
  withDb((db) => db.query(`UPDATE "User" SET "titleCode" = $2 WHERE login = $1`, [login, code]));

test("friend sees my title in the league, feed and friends list", async ({ page, browser }) => {
  const me = await registerUser(page);
  const friendContext = await browser.newContext();
  const friendPage = await friendContext.newPage();
  const friend = await registerUser(friendPage);
  await makeFriends(me.login, me.login, friend.login, friend.login);
  await bossWin(friend.login, "golem", 2);
  await setTitle(friend.login, "boss:golem:1");
  await setTitle(me.login, "boss:golem:1");
  await seedWorkouts(friend.login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 0);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 0);
  await friendContext.close();

  await page.goto("/leaderboard");
  const friendRow = page.getByRole("listitem").filter({ hasText: friend.login });
  await expect(friendRow.getByTestId("member-title")).toHaveText("Гроза Голема");
  await expect(page.getByRole("listitem").filter({ hasText: "это вы" }).getByTestId("member-title")).toHaveText("Гроза Голема");

  await page.goto("/friends");
  await expect(page.getByRole("article", { name: new RegExp(`^${friend.login}:`) })).toContainText("Гроза Голема");
  await expect(page.getByRole("article", { name: new RegExp(`^${me.login}:`) })).toContainText("Гроза Голема");
  await expect(page.getByTestId("friend-row").filter({ hasText: friend.login })).toContainText("Гроза Голема");
});

/** Код босса текущей недели (BossWeek создаёт дашборд после регистрации). */
const currentBoss = (login: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ bossCode: string }>(
      `SELECT "bossCode" FROM "BossWeek" WHERE "userId" = $1 ORDER BY week DESC LIMIT 1`,
      [await userId(db, login)],
    );
    return rows[0].bossCode;
  });

test("first boss win unlocks a title in the summary", async ({ page }) => {
  const { login } = await registerUser(page);
  // 14 подходов этой недели + 1 в тренировке = 1500 HP
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 14 }], 0);
  await quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }]);
  const unlocked = page.getByTestId("boss-title-unlocked");
  await expect(unlocked).toContainText(/Открыт титул «Гроза .+»/);
  await expect(unlocked.getByRole("link", { name: "Выбрать" })).toHaveAttribute("href", "/settings#title");

  await page.reload();
  await expect(page.getByTestId("boss-title-unlocked")).toContainText(/Открыт титул «Гроза .+»/);
});

test("second win over the same boss unlocks nothing", async ({ page }) => {
  const { login } = await registerUser(page);
  await expect(page.getByTestId("boss-card")).toBeVisible();
  await bossWin(login, await currentBoss(login), 5);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 14 }], 0);
  await quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }]);
  await expect(page.getByTestId("boss-damage")).toContainText("Повержен!");
  await expect(page.getByTestId("boss-title-unlocked")).toHaveCount(0);
});
