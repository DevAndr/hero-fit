import { expect, test } from "@playwright/test";
import { addFlagUser, coinBalance, coinTx, enableCoach, idOf, linkCoach, setTimeZone } from "./db";
import { quickWorkout, registerUser } from "./helpers";

// График «Монеты» на /stats — при флаге shop (списком на пользователя), только на своей статистике

const SETS = [
  { weight: "60", reps: "10" },
  { weight: "60", reps: "10" },
  { weight: "60", reps: "10" },
];

test("coins chart shows earned coins by source", async ({ page }) => {
  const me = await registerUser(page);
  await setTimeZone(me.login);
  await addFlagUser("shop", me.login);
  await page.goto("/stats");
  // Монеты есть только с тренировками: до первой — пустая статистика без графика
  await expect(page.getByRole("region", { name: "Монеты" })).toHaveCount(0);

  await quickWorkout(page, "Жим штанги лёжа", SETS);
  await page.goto("/stats");
  // Кроме тренировки первая тренировка даёт ачивки (и, может, уровень) — сверяем с журналом
  const tx = await coinTx(me.login);
  const earned = tx.filter((t) => t.amount > 0 && t.reason !== "RETRO").reduce((sum, t) => sum + t.amount, 0);
  expect(tx.filter((t) => t.reason === "WORKOUT").map((t) => t.amount)).toEqual([10]);
  const coins = page.getByRole("region", { name: "Монеты" });
  await expect(coins.getByTestId("coins-summary")).toHaveText(`+${earned} за 12 недель · баланс ${await coinBalance(me.login)}`);
  await expect(coins.getByRole("list", { name: "Источники" }).getByRole("listitem").first()).toHaveText("Тренировки");
  await expect(coins.getByRole("table")).toContainText(`${earned}: Тренировки 10`);
});

test("without the shop flag there is no coins chart", async ({ page }) => {
  await registerUser(page);
  await quickWorkout(page, "Жим штанги лёжа", SETS);
  await page.goto("/stats");
  await expect(page.getByRole("region", { name: "Тренды по неделям" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Монеты" })).toHaveCount(0);
});

test("coach does not see the client's coins", async ({ page, browser }) => {
  const client = await registerUser(page);
  await addFlagUser("shop", client.login);
  await quickWorkout(page, "Жим штанги лёжа", SETS);

  const ctx = await browser.newContext();
  const coachPage = await ctx.newPage();
  const coach = await registerUser(coachPage);
  await addFlagUser("shop", coach.login);
  await enableCoach(coach.login, `c${Date.now().toString(36)}`);
  await linkCoach(coach.login, client.login);
  await coachPage.goto(`/coach/clients/${await idOf(client.login)}?tab=stats`);
  await expect(coachPage.getByRole("region", { name: "Тренды по неделям" })).toBeVisible();
  await expect(coachPage.getByRole("region", { name: "Монеты" })).toHaveCount(0);
  await ctx.close();
});
