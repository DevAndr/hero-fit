import { expect, test } from "@playwright/test";
import { addFlagUser, createClub, createClubTask, joinClub, seedXpWorkout, setNickname, withDb } from "./db";
import { registerUser } from "./helpers";

// Карточка клуба на дашборде. Флаг clubs — списком на пользователя

const unique = () => Math.random().toString(36).slice(2, 7);
const card = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Клуб", exact: true });
const rewardFor = (taskId: string, login: string) =>
  withDb((db) =>
    db.query(`insert into "ClubTaskReward" (id, "taskId", "userId") select md5(random()::text), $1, id from "User" where login = $2`, [taskId, login]),
  );

test("member sees place, task progress and a waiting chest", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("clubs", me.login);
  await setNickname(me.login, `Карта${unique()}`);
  const club = await createClub(me.login, { name: `Железо ${unique()}`, city: "Казань" });
  await joinClub(me.login, club.id, new Date(Date.now() - 3600_000));
  await seedXpWorkout(me.login, { xp: 120 });
  await createClubTask(club.id, { type: "WORKOUTS", mode: "CLUB", target: 10 });
  const done = await createClubTask(club.id, {
    type: "WORKOUTS",
    mode: "EACH",
    target: 1,
    startsAt: new Date(Date.now() - 9 * 24 * 3600_000),
    endsAt: new Date(Date.now() - 2 * 24 * 3600_000),
  });
  await rewardFor(done, me.login);

  await page.goto("/dashboard");
  const c = card(page);
  await expect(c.getByText("· Казань")).toBeVisible();
  await expect(c.getByText("1-е место из 1 на этой неделе")).toBeVisible();
  await expect(c.getByText("Клубом: 10 тренировок за 7 дней")).toBeVisible();
  await expect(c.getByText(/0 \/ 10 тренировок/)).toBeVisible();
  await expect(c.getByText("Сундук ждёт")).toBeVisible();
  await c.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${club.id}\\?tab=tasks`));
});

test("member without weekly XP is not ranked yet", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("clubs", me.login);
  const club = await createClub(me.login);
  await joinClub(me.login, club.id);
  await page.goto("/dashboard");
  await expect(card(page).getByText("На этой неделе вы ещё не в рейтинге · в клубе 1")).toBeVisible();
});

test("without a club — invitation; with a pending application — its status", async ({ page }) => {
  const me = await registerUser(page);
  await addFlagUser("clubs", me.login);
  await page.goto("/dashboard");
  await expect(card(page).getByText("Найдите свой зал")).toBeVisible();

  const name = `Заявка ${unique()}`;
  await createClub(me.login, { status: "PENDING", name });
  await page.reload();
  await expect(card(page).getByText(`Заявка на клуб «${name}» на проверке.`)).toBeVisible();
});

test("without the flag there is no card", async ({ page }) => {
  await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Гильдия" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
