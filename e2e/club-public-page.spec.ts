import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  clubOf,
  createClub,
  createClubTask,
  createUserRow,
  joinClub,
  publishClub,
  resetFlag,
  seedXpWorkout,
  setClubStatus,
  setFlag,
  setNickname,
} from "./db";
import { PASSWORD, registerUser, uniqueLogin } from "./helpers";

// Публичная страница клуба (спека 2026-10-12-club-public-page-design). Флаг clubs глобальный — serial и только desktop
test.describe.configure({ mode: "serial" });
const DESKTOP_ONLY = "глобальный флаг: проекты desktop и mobile идут параллельно";
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", DESKTOP_ONLY);
});
test.afterAll(async ({}, info) => {
  if (info.project.name === "desktop") await resetFlag("clubs");
});

const unique = () => Math.random().toString(36).slice(2, 7);
const FULL = { enabled: true, percent: 100 } as const;

async function guest(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Опубликованный клуб в «Казани» с админом-участником (страница вошедшего — `page`). */
async function publishedClub(page: Page, o: { name?: string } = {}) {
  const admin = await registerUser(page);
  const name = o.name ?? `Железо ${unique()}`;
  const club = await createClub(admin.login, { name, city: "Казань", address: "ул. Пушкина, 5" });
  await joinClub(admin.login, club.id, new Date(Date.now() - 3600_000));
  const citySlug = `kazan-${unique()}`;
  const { path } = await publishClub(club.id, { citySlug });
  return { admin, club, name, path, citySlug };
}

/** Участник клуба с ником и тренировкой после вступления. */
async function member(clubId: string) {
  const login = uniqueLogin();
  await createUserRow(login);
  const nick = `Ник${unique()}`;
  await setNickname(login, nick);
  await joinClub(login, clubId, new Date(Date.now() - 3600_000));
  await seedXpWorkout(login, { xp: 60 });
  return { login, nick };
}

test("open page: about, task, stats from 3 members, JSON-LD, city page, sitemap; kill switch hides it", async ({ page, browser, request }) => {
  await setFlag("clubs", FULL);
  const { club, name, path, citySlug, admin } = await publishedClub(page);
  await seedXpWorkout(admin.login, { xp: 60 });
  const second = await member(club.id);
  await createClubTask(club.id, { type: "WORKOUTS", mode: "CLUB", target: 10 });

  const g = await guest(browser);
  try {
    await g.page.goto(path);
    await expect(g.page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(g.page.getByText("ул. Пушкина, 5")).toBeVisible();
    await expect(g.page.getByText(/Просторный зал/)).toBeVisible();
    await expect(g.page.getByText("Клубом: 10 тренировок за 7 дней")).toBeVisible();
    await expect(g.page.getByText(/за неделю/)).toHaveCount(0);

    const third = await member(club.id);
    await g.page.reload();
    await expect(g.page.getByText("тренировки за неделю")).toBeVisible();
    for (const nick of [second.nick, third.nick]) await expect(g.page.getByText(nick)).toHaveCount(0);
    expect(await g.page.locator('script[type="application/ld+json"]').allTextContents()).toEqual(
      expect.arrayContaining([expect.stringContaining('"ExerciseGym"')]),
    );

    await g.page.goto(`/gym/${citySlug}`);
    await expect(g.page.getByRole("heading", { level: 1 })).toHaveText("Залы в Hero Fit — Казань");
    await expect(g.page.getByRole("link", { name })).toHaveAttribute("href", path);
  } finally {
    await g.context.close();
  }
  expect(await (await request.get("/sitemap.xml")).text()).toContain(`${path}<`);

  // Kill switch: флаг выключен целиком — страницы нет ни у гостя, ни в sitemap
  await setFlag("clubs", { enabled: false, percent: 100 });
  expect((await request.get(path)).status()).toBe(404);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(path);
  await setFlag("clubs", FULL);
});

test("guest joins from the public page through registration", async ({ page, browser }) => {
  test.slow();
  await setFlag("clubs", FULL);
  const { club, path } = await publishedClub(page);
  const g = await guest(browser);
  try {
    await g.page.goto(path);
    await g.page.getByRole("link", { name: "Вступить" }).first().click();
    await expect(g.page).toHaveURL(/\/register\?next=%2Fclubs%2Fjoin%2F/);
    const login = uniqueLogin();
    await g.page.getByLabel("Логин").fill(login);
    await g.page.getByLabel("Email").fill(`${login}@test.local`);
    await g.page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
    await g.page.getByLabel("Повторите пароль").fill(PASSWORD);
    await g.page.getByRole("checkbox", { name: /согласие на обработку персональных данных/ }).click();
    await g.page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(g.page).toHaveURL(/\/clubs\/join\/\w+$/, { timeout: 15_000 });
    // Новому игроку — сначала ник (до гидратации поле перезапишется подсказкой — ждём, что значение удержалось)
    const nick = g.page.getByRole("textbox", { name: "Ник" });
    const nickValue = `Гость${unique()}`;
    await expect(async () => {
      await nick.fill(nickValue);
      await expect(nick).toHaveValue(nickValue, { timeout: 500 });
    }).toPass();
    await g.page.getByRole("button", { name: "Сохранить" }).click();
    await g.page.getByRole("button", { name: "Вступить" }).click();
    await expect.poll(() => clubOf(login)).toBe(club.id);
  } finally {
    await g.context.close();
  }
});

test("hidden club: 404 for guests and for its admin", async ({ page, request }) => {
  await setFlag("clubs", FULL);
  const { club, path } = await publishedClub(page);
  await setClubStatus(club.id, "HIDDEN");
  expect((await request.get(path)).status()).toBe(404);
  expect((await page.goto(path))?.status()).toBe(404);
});
