import { expect, test } from "@playwright/test";
import { mondayWeeksAgo, userId, withDb } from "./db";
import { registerUser } from "./helpers";

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
