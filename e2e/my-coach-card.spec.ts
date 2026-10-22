import { expect, test } from "@playwright/test";
import { coachCommentOn, coachProfile, enableCoach, linkCoach, seedCoachAssignment } from "./db";
import { quickWorkout, registerUser } from "./helpers";

test("client sees «Мой тренер»: page link, time together, program week and new comments", async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const coach = await registerUser(await ctx.newPage());
  await ctx.close();
  const nick = `coach${Date.now().toString(36)}`;
  await enableCoach(coach.login, nick);
  await coachProfile(coach.login, { about: "Тренирую силовые и помогаю не бросить зал. ".repeat(3), publish: true });

  const client = await registerUser(page);
  await linkCoach(coach.login, client.login, new Date(Date.now() - 10 * 86_400_000));
  await seedCoachAssignment(coach.login, client.login, "Сила");
  await quickWorkout(page, "Жим штанги лёжа", [{ weight: "50", reps: "5" }]);
  const workoutId = new URL(page.url()).pathname.split("/").pop()!;
  await coachCommentOn(coach.login, client.login, workoutId);

  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Мой тренер" });
  await expect(card.getByRole("link", { name: nick })).toHaveAttribute("href", `/trainer/${nick}`);
  await expect(card).toContainText("вместе 10 дней");
  await expect(card).toContainText("Программа «Сила» · неделя 1/8");

  await card.getByRole("link", { name: "1 новый комментарий" }).click();
  await expect(page).toHaveURL(new RegExp(`/workouts/${workoutId}$`));
  // Сводка открыта — комментарий прочитан
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Мой тренер" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Мой тренер" }).getByText(/новы[йх] комментари/)).toHaveCount(0);
});

test("unpublished coach page: name without a link; no coach — no card", async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const coach = await registerUser(await ctx.newPage());
  await ctx.close();
  const nick = `coach${Date.now().toString(36)}`;
  await enableCoach(coach.login, nick);

  const client = await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Мой тренер" })).toHaveCount(0);

  await linkCoach(coach.login, client.login);
  await page.reload();
  const card = page.getByRole("region", { name: "Мой тренер" });
  await expect(card.getByText(nick, { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: nick })).toHaveCount(0);
  await expect(card).toContainText("начали сегодня");
});
