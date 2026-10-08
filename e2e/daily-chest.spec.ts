import { expect, test } from "@playwright/test";
import { userId, withDb } from "./db";
import { registerUser } from "./helpers";

const userXp = (login: string) =>
  withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query<{ xp: number }>(`SELECT xp FROM "User" WHERE id = $1`, [id]);
    return rows[0].xp;
  });

test("daily chest: open once a day from the header, XP is credited", async ({ page }) => {
  const { login } = await registerUser(page);
  const before = await userXp(login);

  // Закрыли, не открыв, — значок в шапке остаётся
  await page.getByTestId("chest-button").click();
  const dialog = page.getByTestId("chest-dialog");
  await expect(dialog).toContainText("Ежедневный сундук");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByTestId("chest-button").click();
  await page.getByRole("button", { name: "Открыть сундук" }).click();
  const reward = page.getByTestId("chest-reward");
  await expect(reward).toHaveText(/^\+\d+ XP$/);
  const amount = Number((await reward.textContent())!.match(/\d+/)![0]);
  expect(amount).toBeGreaterThanOrEqual(5); // первый день: 5…10, редкий — ×3
  expect(amount).toBeLessThanOrEqual(30);

  await page.getByRole("button", { name: "Забрать" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("chest-button")).toHaveCount(0);

  const events = await withDb(async (db) => {
    const id = await userId(db, login);
    const { rows } = await db.query<{ amount: number }>(
      `SELECT amount FROM "XpEvent" WHERE "userId" = $1 AND reason = 'DAILY_LOGIN'`,
      [id],
    );
    return rows;
  });
  expect(events).toEqual([{ amount }]);
  expect(await userXp(login)).toBe(before + amount);

  // Повторно сегодня — сундука нет
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("chest-button")).toHaveCount(0);
});
