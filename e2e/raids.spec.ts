import { expect, test } from "@playwright/test";
import { raidOf } from "./db";
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
