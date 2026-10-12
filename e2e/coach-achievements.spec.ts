import { expect, test, type Browser } from "@playwright/test";
import { achievementCodes, coachProfile, coachTemplate, enableCoach, idOf, linkCoach, seedWorkouts } from "./db";
import { quickWorkout, registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами на одной тестовой базе: хвост логина с меткой времени. */
const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;
const DAY = 24 * 3600 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const ABOUT = "Работаю с новичками и силовыми: базовые движения, техника, понятный прогресс каждую неделю.";
const three = Array.from({ length: 3 }, () => ({ weight: 60, reps: 8, sets: 3 }));

async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

test("client with 3 workouts during the link — coach gets «Первый ученик» on /coach", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  try {
    await linkCoach(coach.login, client.login, daysAgo(10));
    const templateId = await coachTemplate(coach.login, "Ноги");
    await seedWorkouts(client.login, "Жим штанги лёжа", three, 5, { templateId });

    await page.goto("/coach");
    await expect(page.getByText("🏆 Первый ученик")).toBeVisible();
    const codes = await achievementCodes(coach.login);
    expect(codes).toContain("coachclients:1");
    expect(codes).not.toContain("coachworkouts:10");

    await page.goto("/achievements");
    await expect(page.getByRole("heading", { name: "Тренер" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Первый ученик" })).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("client workouts before the link don't count", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  try {
    await seedWorkouts(client.login, "Жим штанги лёжа", three, 10);
    await linkCoach(coach.login, client.login, daysAgo(2));
    await page.goto("/coach");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await achievementCodes(coach.login)).not.toContain("coachclients:1");
  } finally {
    await client.context.close();
  }
});

test("first comment to a client's workout — «Первый разбор»", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  try {
    await linkCoach(coach.login, client.login);
    await quickWorkout(client.page, "Жим штанги лёжа", [{ weight: "60", reps: "8" }]);
    const workoutId = client.page.url().split("/").at(-1)!;
    await page.goto(`/coach/clients/${await idOf(client.login)}/workouts/${workoutId}`);
    const general = page.getByRole("region", { name: "Комментарий тренера" });
    await general.getByLabel("Комментарий тренера").fill("Хорошо");
    await general.getByRole("button", { name: "Сохранить" }).click();
    await expect(general.getByLabel("Комментарий тренера")).toHaveCount(0);
    // Сохранение перерисовывает layout — тост сразу на этой же странице
    await expect(page.getByText("🏆 Первый разбор")).toBeVisible();
    expect(await achievementCodes(coach.login)).toContain("coachcomments:1");
  } finally {
    await client.context.close();
  }
});

test("trainer page shows coach awards; the switch hides them", async ({ page, browser }) => {
  const coach = await registerUser(page, "Тренер");
  const nick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, nick);
  const client = await another(browser);
  const guest = await browser.newContext();
  try {
    await linkCoach(coach.login, client.login, daysAgo(10));
    await seedWorkouts(client.login, "Жим штанги лёжа", three, 5);
    await coachProfile(coach.login, { about: ABOUT, publish: true });
    await page.goto("/coach"); // выдача «Первый ученик»
    await expect.poll(() => achievementCodes(coach.login)).toContain("coachclients:1");

    const visitor = await guest.newPage();
    await visitor.goto(`/trainer/${nick}`);
    const awards = visitor.getByRole("region", { name: "Награды тренера" });
    await expect(awards).toContainText("Первый ученик");
    await expect(awards).not.toContainText("На виду");

    await page.goto("/coach/page");
    await page.getByRole("switch", { name: "Показывать награды" }).click();
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: "О себе" })).toBeVisible();
    await expect(visitor.getByRole("heading", { name: "Награды тренера" })).toHaveCount(0);
  } finally {
    await guest.close();
    await client.context.close();
  }
});
