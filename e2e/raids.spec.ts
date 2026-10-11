import { expect, test } from "@playwright/test";
import { notificationUrls, raidOf, setRaidHp } from "./db";
import { raidRewardXp } from "../lib/raid/rules";
import { inviteUrl, player, twoInGuild, createGuild, guildName } from "./guild-helpers";
import { quickWorkout } from "./helpers";

const BENCH = "Жим штанги лёжа";

test("a guild member's workout hits the raid boss", async ({ browser }) => {
  test.slow();
  const { a, b } = await twoInGuild(browser);
  try {
    await quickWorkout(a.page, BENCH, [{ weight: "60", reps: "10" }, { weight: "60", reps: "10" }]);
    const raid = await raidOf(a.login);
    expect(raid).not.toBeNull();
    expect(raid!.damage).toBeGreaterThan(0);
    expect(raid!.hits).toEqual([{ login: a.login, damage: raid!.damage }]);
    expect(raid!.defeated).toBe(false);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("a workout before joining does not count, the next one does", async ({ browser }) => {
  test.slow();
  const a = await player(browser, "Аня");
  const b = await player(browser, "Боря");
  try {
    await createGuild(a.page, guildName(a.login));
    await quickWorkout(b.page, BENCH, [{ weight: "50", reps: "8" }]);
    await b.page.goto(await inviteUrl(a.page));
    await b.page.getByRole("button", { name: "Вступить" }).click();
    await expect(b.page).toHaveURL(/\/guild$/);
    await expect.poll(async () => (await raidOf(b.login))?.hits.some((h) => h.login === b.login) ?? false).toBe(false);

    await quickWorkout(b.page, BENCH, [{ weight: "50", reps: "8" }]);
    await expect.poll(async () => (await raidOf(b.login))?.hits.some((h) => h.login === b.login)).toBe(true);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("victory: chest for every hitter, MVP bonus, a leaver keeps the damage", async ({ browser }) => {
  test.slow();
  const { a, b } = await twoInGuild(browser);
  try {
    await quickWorkout(a.page, BENCH, [{ weight: "60", reps: "10" }, { weight: "60", reps: "10" }, { weight: "60", reps: "10" }]);
    const first = (await raidOf(a.login))!;
    await setRaidHp(a.login, first.damage + 1);
    await quickWorkout(b.page, BENCH, [{ weight: "40", reps: "10" }]);

    const raid = (await raidOf(a.login))!;
    expect(raid.defeated).toBe(true);
    expect(raid.mvp).toBe(a.login);

    for (const p of [a, b]) {
      await p.page.goto("/guild");
      const panel = p.page.getByRole("region", { name: "Рейд недели" });
      await expect(panel).toContainText("Повержен");
      const contrib = panel.getByRole("list", { name: "Вклад в рейд" });
      await expect(contrib.getByRole("listitem")).toHaveCount(2);
      await expect(contrib.getByRole("listitem").first().getByLabel("MVP")).toBeVisible();
    }
    expect(await notificationUrls(b.login)).toContain("/guild");

    await b.page.getByRole("button", { name: "Открыть сундук рейда" }).click();
    await b.page.getByRole("button", { name: "Открыть сундук", exact: true }).click();
    await expect(b.page.getByTestId("chest-reward")).toHaveText(`+${raidRewardXp(raid.hp, 2, false)} XP`);
    await b.page.reload();
    await expect(b.page.getByRole("button", { name: "Открыть сундук рейда" })).toHaveCount(0);

    await a.page.getByRole("button", { name: "Открыть сундук рейда" }).click();
    await a.page.getByRole("button", { name: "Открыть сундук", exact: true }).click();
    await expect(a.page.getByTestId("chest-reward")).toHaveText(`+${raidRewardXp(raid.hp, 2, true)} XP`);

    await a.page.goto("/dashboard");
    await expect(a.page.getByRole("region", { name: "Гильдия" })).toContainText("Рейд-босс повержен");

    // Боря уходит — его урон остаётся во вкладе
    await b.page.goto("/guild");
    await b.page.getByRole("button", { name: "Выйти из гильдии" }).click();
    await b.page.getByRole("alertdialog").getByRole("button", { name: "Выйти" }).click();
    await expect(b.page.getByRole("button", { name: "Создать гильдию" })).toBeVisible();
    await a.page.goto("/guild");
    await expect(a.page.getByRole("list", { name: "Вклад в рейд" }).getByRole("listitem").filter({ hasText: "бывший участник" })).toHaveCount(1);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
