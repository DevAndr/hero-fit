import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  clubOf,
  clubSlug,
  createClub,
  createClubTask,
  createUserRow,
  joinClub,
  makeAdmin,
  publishClub,
  resetFlag,
  seedXpWorkout,
  setClubStatus,
  setFlag,
  setNickname,
  withDb,
} from "./db";
import { PASSWORD, registerUser, uniqueLogin } from "./helpers";

// Публичная страница клуба (спека 2026-10-12-club-public-page-design). Флаг clubs глобальный: файл идёт отдельным
// проектом clubs-global после desktop и mobile (playwright.config.ts), сценарии — по очереди
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await resetFlag("clubs");
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
    // Прогресс «всем клубом» при < 3 участниках выдал бы цифры конкретного человека
    await expect(g.page.getByText(/\d+ \/ 10/)).toHaveCount(0);

    const third = await member(club.id);
    await g.page.reload();
    await expect(g.page.getByText("тренировки за неделю")).toBeVisible();
    await expect(g.page.getByText(/\d+ \/ 10/)).toBeVisible();
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
  // …и у админа клуба нет предпросмотра: клубы выключены для всех
  expect((await page.goto(path))?.status()).toBe(404);
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

const LONG_ABOUT = "Зал у метро: три стойки для приседа, помосты, гантели до 50 кг и зона растяжки.";

/** Админ на странице управления публикует «О зале» через интерфейс; возвращает адрес страницы. */
async function publishViaUi(page: Page, clubId: string, about = LONG_ABOUT) {
  await page.goto(`/clubs/${clubId}/manage`);
  const section = page.getByRole("region", { name: "Публичная страница" });
  await section.getByLabel("О зале").fill(about);
  await section.getByRole("button", { name: "Сохранить" }).click();
  await expect(section.getByRole("button", { name: "Опубликовать" })).toBeEnabled();
  await section.getByRole("button", { name: "Опубликовать" }).click();
  await expect(section.getByRole("button", { name: "Снять с публикации" })).toBeVisible();
  const { slug, citySlug } = await clubSlug(clubId);
  return `/gym/${citySlug}/${slug}`;
}

test("flag by list: admin publishes and sees a noindex preview, guests get 404", async ({ page, request }) => {
  const admin = await registerUser(page);
  await setFlag("clubs", { enabled: true, percent: 0, logins: [admin.login] });
  const club = await createClub(admin.login, { name: `Предпросмотр ${unique()}`, city: "Казань" });

  await page.goto(`/clubs/${club.id}/manage`);
  const section = page.getByRole("region", { name: "Публичная страница" });
  await section.getByLabel("О зале").fill("Коротко о зале");
  await section.getByRole("button", { name: "Сохранить" }).click();
  await expect(section.getByText("Напишите о зале хотя бы 50 символов")).toBeVisible();
  await expect(section.getByRole("button", { name: "Опубликовать" })).toBeDisabled();
  // Пробелы по краям сервер всё равно срежет — «Сохранить» не загорается
  await expect(page.getByText("Сохранено")).toBeVisible();
  await section.getByLabel("О зале").fill("  Коротко о зале ");
  await expect(section.getByRole("button", { name: "Сохранить" })).toBeDisabled();

  const path = await publishViaUi(page, club.id);
  await expect(page.getByText("Страница появится в поиске, когда клубы откроются для всех")).toBeVisible();
  await page.goto(path);
  await expect(page.getByText("Страница пока не видна в поиске")).toBeVisible();
  // В предпросмотре вступить нельзя (join — только у открытой страницы)
  await expect(page.getByRole("link", { name: "Вступить" })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect((await request.get(path)).status()).toBe(404);
});

test("same name in the same city gets the street; renaming keeps the address", async ({ page }) => {
  const admin = await registerUser(page);
  await setFlag("clubs", FULL);
  const name = `Двойник ${unique()}`;
  const first = await createClub(admin.login, { name, city: "Казань", address: "ул. Пушкина, 5" });
  const second = await createClub(admin.login, { name, city: "Казань", address: "ул. Пушкина, 5" });
  const firstPath = await publishViaUi(page, first.id);
  const secondPath = await publishViaUi(page, second.id);
  expect(firstPath).toMatch(/^\/gym\/kazan\/dvoynik-\w+$/);
  expect(secondPath).toBe(`${firstPath}-pushkina`);

  await page.goto(`/clubs/${first.id}/manage`);
  await page.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Название").fill(`Переименован ${unique()}`);
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await clubSlug(first.id);
  expect(`/gym/${after.citySlug}/${after.slug}`).toBe(firstPath);
  await expect((await page.goto(firstPath))?.status()).toBe(200);
});

test("landing: clubs section, menu item and FAQ only when clubs are open to everyone", async ({ page, browser }) => {
  await resetFlag("clubs");
  // «Популярные города» — до 6: страницы публикует только этот файл, прошлые прогоны снимаем с публикации
  await withDb((db) => db.query(`update "Club" set "publishedAt" = null where "publishedAt" is not null`));
  const g = await guest(browser);
  try {
    await g.page.goto("/");
    await expect(g.page.locator("#clubs")).toHaveCount(0);
    await expect(g.page.getByRole("banner").getByRole("link", { name: "Клубы", exact: true })).toHaveCount(0);
    await expect(g.page.getByText("Как добавить свой зал?")).toHaveCount(0);
    expect((await g.page.locator('script[type="application/ld+json"]').allTextContents()).join()).not.toContain("Как добавить свой зал?");

    await setFlag("clubs", FULL);
    const { citySlug } = await publishedClub(page);
    // Клубы — вкладка секции «Вместе веселее»; ссылка /#clubs открывает её
    await g.page.goto("/#clubs");
    await expect(g.page.locator("#clubs")).toHaveCount(1);
    await expect(g.page.getByRole("banner").getByRole("link", { name: "Клубы", exact: true })).toBeVisible();
    await expect(g.page.getByText("Как добавить свой зал?")).toBeVisible();
    expect((await g.page.locator('script[type="application/ld+json"]').allTextContents()).join()).toContain("Как добавить свой зал?");
    const section = g.page.getByRole("tabpanel", { name: "Клубы залов" });
    await expect(section.locator(`a[href="/gym/${citySlug}"]`)).toBeVisible();
    await section.getByRole("link", { name: "Найти свой зал" }).click();
    await expect(g.page).toHaveURL(/\/register\?next=%2Fclubs$/);
  } finally {
    await g.context.close();
  }
});

test("moderator unpublishes with a reason: 404, notification, republish keeps the address", async ({ page, browser, request }) => {
  await setFlag("clubs", FULL);
  const { club, name, path, admin } = await publishedClub(page);
  const modPage = await (await browser.newContext()).newPage();
  const moderator = await registerUser(modPage);
  await makeAdmin(moderator.login);

  await modPage.goto(`/admin/clubs?tab=approved&q=${encodeURIComponent(name)}`);
  const card = modPage.getByRole("article", { name });
  await expect(card.getByText(/Просторный зал/)).toBeVisible();
  await expect(card.getByRole("link", { name: "Страница зала" })).toHaveAttribute("href", path);
  await card.getByRole("button", { name: "Снять с публикации" }).click();
  const dialog = modPage.getByRole("dialog");
  await dialog.getByLabel("Причина").fill("Реклама в описании");
  await dialog.getByRole("button", { name: "Снять с публикации" }).click();
  await expect(dialog).toHaveCount(0);

  expect((await request.get(path)).status()).toBe(404);
  const titles = await withDb(async (db) =>
    (await db.query<{ title: string }>(`select n.title from "Notification" n join "User" u on u.id = n."userId" where u.login = $1`, [admin.login])).rows.map(
      (r) => r.title,
    ),
  );
  expect(titles).toContain(`Страница клуба «${name}» снята с публикации: Реклама в описании`);

  await page.goto(`/clubs/${club.id}/manage`);
  await page.getByRole("region", { name: "Публичная страница" }).getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByRole("region", { name: "Публичная страница" }).getByRole("button", { name: "Снять с публикации" })).toBeVisible();
  const after = await clubSlug(club.id);
  expect(`/gym/${after.citySlug}/${after.slug}`).toBe(path);
  expect((await request.get(path)).status()).toBe(200);
});
