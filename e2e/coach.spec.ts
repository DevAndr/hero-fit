import { expect, test, type Browser, type Page } from "@playwright/test";
import { activeCoachLinks, enableCoach, linkCoach, seedWorkouts, withDb } from "./db";
import { PASSWORD, quickWorkout, registerUser } from "./helpers";

/** Ник ≤ 20 символов и уникален между прогонами на одной тестовой базе: хвост логина с меткой времени. */
const nickOf = (login: string, p: string) => `${p.slice(0, 4)}_${login.replace(/^e2e_/, "").replace(/_/g, "").slice(-15)}`;

/** Второй пользователь в отдельном контексте. */
async function another(browser: Browser, name = "Клиент") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = await registerUser(page, name);
  return { context, page, ...user };
}

async function bell(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
}

test("coach mode needs a nickname, then shows the invite link", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Режим тренера" });
  await expect(card.getByText("Сначала задайте ник")).toBeVisible();
  await expect(card.getByRole("switch")).toBeDisabled();

  await page.goto("/friends");
  await page.getByLabel("Ник", { exact: true }).fill(nickOf(login, "Coach"));
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(`Вы — ${nickOf(login, "Coach")}`)).toBeVisible();

  await page.goto("/settings");
  await card.getByRole("switch").click();
  await expect(page.getByText("Режим тренера включён — раздел «Клиенты» в меню")).toBeVisible();
  await page.goto("/coach");
  await expect(page.getByTestId("coach-invite-link")).toContainText("/coach/join/");
});

test("client accepts via link after signing in; second visit says already linked", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  const coachNick = nickOf(coach.login, "Coach");
  const code = await enableCoach(coach.login, coachNick);

  const client = await another(browser);
  try {
    await client.context.clearCookies();
    await client.page.goto(`/coach/join/${code}`);
    await expect(client.page).toHaveURL(/\/login\?next=/);
    await client.page.getByLabel("Логин или email").fill(client.login);
    await client.page.getByLabel("Пароль").fill(PASSWORD);
    await client.page.getByRole("button", { name: "Войти" }).click();
    await expect(client.page.getByRole("heading", { name: `Тренер ${coachNick} просит доступ к вашим тренировкам` })).toBeVisible();
    await client.page.getByRole("button", { name: "Разрешить" }).click();
    await expect(client.page).toHaveURL(/\/dashboard$/);
    expect(await activeCoachLinks(client.login)).toEqual([coach.login]);

    await client.page.goto(`/coach/join/${code}`);
    await expect(client.page.getByRole("heading", { name: `Вы уже занимаетесь с ${coachNick}` })).toBeVisible();

    await bell(page);
    await expect(page.getByText("Новый клиент")).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("own and unknown invite codes", async ({ page }) => {
  const { login } = await registerUser(page);
  const code = await enableCoach(login, nickOf(login, "Coach"));
  await page.goto(`/coach/join/${code}`);
  await expect(page.getByRole("heading", { name: "Это ваша ссылка" })).toBeVisible();
  await page.goto("/coach/join/ZZZZZZZZ");
  await expect(page.getByRole("heading", { name: "Ссылка недействительна" })).toBeVisible();
});

test("switching coaches ends the old link and notifies the old coach", async ({ page, browser }) => {
  test.slow();
  const coachA = await registerUser(page, "Тренер А");
  await enableCoach(coachA.login, nickOf(coachA.login, "CoachA"));
  const coachB = await another(browser, "Тренер Б");
  const codeB = await enableCoach(coachB.login, nickOf(coachB.login, "CoachB"));
  const client = await another(browser);
  try {
    await linkCoach(coachA.login, client.login);
    await client.page.goto(`/coach/join/${codeB}`);
    await expect(client.page.getByText(`Сейчас ваш тренер — ${nickOf(coachA.login, "CoachA")}`)).toBeVisible();
    await client.page.getByRole("button", { name: "Разрешить" }).click();
    await expect(client.page).toHaveURL(/\/dashboard$/);
    expect(await activeCoachLinks(client.login)).toEqual([coachB.login]);

    await bell(page);
    await expect(page.getByText(/перешёл к другому тренеру/)).toBeVisible();
  } finally {
    await coachB.context.close();
    await client.context.close();
  }
});

test("client disconnects the coach in settings", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  const coachNick = nickOf(coach.login, "Coach");
  await enableCoach(coach.login, coachNick);
  const client = await another(browser);
  try {
    await linkCoach(coach.login, client.login);
    await client.page.goto("/settings");
    const card = client.page.getByRole("region", { name: "Мой тренер" });
    await expect(card).toContainText(coachNick);
    await card.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(await activeCoachLinks(client.login)).toEqual([]);

    await bell(page);
    await expect(page.getByText("Клиент отключил доступ", { exact: true })).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("«Клиенты» in the menu only for coaches", async ({ page }) => {
  const { login } = await registerUser(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Клиенты" })).toHaveCount(0);
  await enableCoach(login, nickOf(login, "Coach"));
  await page.reload();
  await page.getByRole("button", { name: "Меню профиля" }).click();
  await expect(page.getByRole("menuitem", { name: "Клиенты" })).toBeVisible();
});

async function setHideWeights(login: string) {
  await withDb((db) => db.query(`update "User" set "shareActivity" = true, "hideWeights" = true where login = $1`, [login]));
}

async function setClientNick(login: string, nick: string) {
  await withDb((db) => db.query(`update "User" set nickname = $2, "nicknameKey" = lower($2) where login = $1`, [login, nick]));
}

test("coach sees clients sorted with attention flags", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const fresh = await another(browser, "Свежий");
  const stale = await another(browser, "Пропавший");
  try {
    await setClientNick(fresh.login, nickOf(fresh.login, "Fresh"));
    await setClientNick(stale.login, nickOf(stale.login, "Stale"));
    await seedWorkouts(fresh.login, "Жим штанги лёжа", [{ weight: 50, reps: 8, sets: 3 }], 1);
    await seedWorkouts(stale.login, "Жим штанги лёжа", [{ weight: 50, reps: 8, sets: 3 }], 8);
    await linkCoach(coach.login, fresh.login);
    await linkCoach(coach.login, stale.login);

    await page.goto("/coach");
    const rows = page.getByRole("list", { name: "Клиенты" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(nickOf(stale.login, "Stale"));
    await expect(rows.nth(0)).toContainText("7+ дней без тренировок");
    await expect(rows.nth(1)).toContainText(nickOf(fresh.login, "Fresh"));
    await expect(rows.nth(1)).toContainText("вчера");
  } finally {
    await fresh.context.close();
    await stale.context.close();
  }
});

test("coach opens the client's workout with weights despite «hide weights»; tabs work", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  try {
    await setClientNick(client.login, nickOf(client.login, "Client"));
    await setHideWeights(client.login);
    await quickWorkout(client.page, "Жим штанги лёжа", [{ weight: "62.5", reps: "10" }]);
    await linkCoach(coach.login, client.login);

    await page.goto("/coach");
    await page.getByRole("link", { name: nickOf(client.login, "Client") }).click();
    await expect(page.getByRole("heading", { level: 1, name: nickOf(client.login, "Client") })).toBeVisible();
    await expect(page.getByTestId("body-map")).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Разделы клиента" });
    await tabs.getByRole("link", { name: "Тренировки" }).click();
    await page.getByRole("list", { name: "Тренировки клиента" }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/coach\/clients\/[^/]+\/workouts\//);
    await expect(page.getByText("62.5 × 10")).toBeVisible();
    await expect(page.getByText("625 кг")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сохранить как шаблон" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Поделиться" })).toHaveCount(0);

    await page.getByRole("link", { name: "Жим штанги лёжа" }).click();
    await expect(page).toHaveURL(/\/coach\/clients\/[^/]+\/exercises\//);
    await expect(page.getByRole("region", { name: "Личные рекорды" })).toBeVisible();

    await page.getByRole("link", { name: nickOf(client.login, "Client") }).first().click();
    await tabs.getByRole("link", { name: "Статистика" }).click();
    await expect(page.getByRole("heading", { name: "Прогресс по упражнениям" })).toBeVisible();
  } finally {
    await client.context.close();
  }
});

/** Адреса карточки, тренировки и упражнения клиента (как их видит его тренер). */
async function clientUrls(clientLogin: string) {
  return withDb(async (db) => {
    const { rows } = await db.query<{ uid: string; wid: string; eid: string }>(
      `select u.id as uid, w.id as wid, we."exerciseId" as eid from "User" u
       join "Workout" w on w."userId" = u.id join "WorkoutExercise" we on we."workoutId" = w.id
       where u.login = $1 and w.status = 'COMPLETED' limit 1`,
      [clientLogin],
    );
    const { uid, wid, eid } = rows[0];
    return [`/coach/clients/${uid}`, `/coach/clients/${uid}/workouts/${wid}`, `/coach/clients/${uid}/exercises/${eid}`];
  });
}

async function expectStatus(page: Page, urls: string[], status: number) {
  for (const url of urls) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(status);
  }
}

test("no link — 404 on every coach page; disconnect revokes access", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const stranger = await another(browser, "Чужой тренер");
  const client = await another(browser);
  try {
    await enableCoach(stranger.login, nickOf(stranger.login, "Stranger"));
    await seedWorkouts(client.login, "Жим штанги лёжа", [{ weight: 50, reps: 8, sets: 3 }], 1);
    await linkCoach(coach.login, client.login);
    const urls = await clientUrls(client.login);

    await expectStatus(page, urls, 200);
    await expectStatus(stranger.page, urls, 404);

    await client.page.goto("/settings");
    await client.page.getByRole("button", { name: "Отключить тренера" }).click();
    await client.page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
    await expect(client.page.getByText("Тренер больше не видит ваши тренировки")).toBeVisible();
    await expectStatus(page, urls, 404);
  } finally {
    await stranger.context.close();
    await client.context.close();
  }
});

test("coach removes a client", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  try {
    await setClientNick(client.login, nickOf(client.login, "Client"));
    await linkCoach(coach.login, client.login);
    await page.goto("/coach");
    await page.getByRole("link", { name: nickOf(client.login, "Client") }).click();
    await page.getByRole("button", { name: "Удалить клиента" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page).toHaveURL(/\/coach$/);
    await expect(page.getByRole("list", { name: "Клиенты" })).toHaveCount(0);

    await client.page.goto("/settings");
    await expect(client.page.getByRole("region", { name: "Мой тренер" })).toHaveCount(0);
    await bell(client.page);
    await expect(client.page.getByText("Тренер завершил работу", { exact: true })).toBeVisible();
  } finally {
    await client.context.close();
  }
});

test("coach mode off hides the clients section; on again restores it", async ({ page, browser }) => {
  test.slow();
  const coach = await registerUser(page, "Тренер");
  await enableCoach(coach.login, nickOf(coach.login, "Coach"));
  const client = await another(browser);
  try {
    await setClientNick(client.login, nickOf(client.login, "Client"));
    await linkCoach(coach.login, client.login);
    await page.goto("/settings");
    const sw = page.getByRole("region", { name: "Режим тренера" }).getByRole("switch");
    await sw.click();
    await expect(page.getByText("Режим тренера выключен")).toBeVisible();
    expect((await page.goto("/coach"))?.status()).toBe(404);

    await page.goto("/settings");
    await sw.click();
    await expect(page.getByText("Режим тренера включён — раздел «Клиенты» в меню")).toBeVisible();
    await page.goto("/coach");
    await expect(page.getByRole("list", { name: "Клиенты" })).toContainText(nickOf(client.login, "Client"));
  } finally {
    await client.context.close();
  }
});
