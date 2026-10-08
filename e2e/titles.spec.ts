import { expect, test } from "@playwright/test";
import { mondayWeeksAgo, userId, withDb } from "./db";
import { pickOption, registerUser } from "./helpers";

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
  await expect(page.getByTestId("bestiary-legend")).toContainText("звёзды у 1 из 4 боссов");
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
