import { expect, test, type Page } from "@playwright/test";
import {
  addFlagUser,
  addSubscription,
  archiveAllCampaigns,
  campaignSends,
  createCampaign,
  createUserRow,
  E2E_ADMIN,
  linkTelegram,
  makeAdmin,
  mondayWeeksAgo,
  notificationTitles,
  notificationUrls,
  resetFlag,
  seedWorkouts,
  setCampaignSentAt,
  setFlag,
  setLastLoginDay,
  setNotifyComeback,
  setStreakState,
  setUserTimeZone,
  withDb,
} from "./db";
import { registerUser, runTick, uniqueLogin } from "./helpers";
import { startPushService } from "./push-server";
import { E2E_TZ, E2E_TZ_OFFSET, localAt } from "./tz";

// Флаг campaigns глобальный (список игроков переписывается в beforeAll) — файл идёт по очереди и только на desktop.
// Кампании — с часом 20/21, тик — тестовыми часами около 21:00 по местному: фоновый воркер сервера идёт по
// реальному времени (в e2e местное ≈ 12:xx) и эти кампании не отправит.
test.describe.configure({ mode: "serial" });

const DAY = 86_400_000;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const TODAY = new Date(Date.now() + E2E_TZ_OFFSET * 3_600_000).toISOString().slice(0, 10);
const tag = () => Math.random().toString(36).slice(2, 7);

let push: Awaited<ReturnType<typeof startPushService>>;

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") return;
  push = await startPushService();
  // Список флага — с чистого листа: игроки прошлых прогонов не съедают пачку отправок
  await setFlag("campaigns", { enabled: true, logins: [] });
});

test.afterAll(async ({}, info) => {
  if (info.project.name !== "desktop") return;
  await push?.close();
  await archiveAllCampaigns();
  await resetFlag("campaigns");
});

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Флаг campaigns глобальный");
  await archiveAllCampaigns();
});

/** Подписка на push в фейковом сервисе: у каждого игрока свой endpoint. */
async function subscribe(login: string) {
  await addSubscription(login, { endpoint: `${push.endpoint}/${login}`, p256dh: push.p256dh, auth: push.auth });
}

/** Игрок без UI: пояс e2e, зарегистрирован daysOld дней назад, с подпиской и во флаге (если не сказано иначе). */
async function player(o: { createdAt?: Date; lastLogin?: string | null; push?: boolean; flag?: boolean } = {}) {
  const login = uniqueLogin();
  await createUserRow(login);
  await withDb((db) =>
    db.query(`update "User" set "createdAt" = $2, "lastLoginDay" = $3::date where login = $1`, [
      login,
      o.createdAt ?? new Date(Date.now() - 30 * DAY),
      o.lastLogin === undefined ? null : o.lastLogin,
    ]),
  );
  if (o.push ?? true) await subscribe(login);
  if (o.flag ?? true) await addFlagUser("campaigns", login);
  return login;
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: /Уведомления/ }).click();
}

const episodes = async (login: string) => (await campaignSends(login)).map((s) => s.episode);

test("INACTIVE 3: once per series, again after a new visit and a new gap", async ({ page, request }) => {
  const title = `Вернись ${tag()}`;
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, title, body: "Три дня без зала" });
  const { login } = await registerUser(page);
  await setUserTimeZone(login, E2E_TZ);
  await withDb((db) => db.query(`update "User" set "createdAt" = $2 where login = $1`, [login, new Date(Date.now() - 30 * DAY)]));
  await subscribe(login);
  await addFlagUser("campaigns", login);
  await setLastLoginDay(login, shift(TODAY, -3));

  await runTick(request, localAt(TODAY, "21:05"));
  expect(await episodes(login)).toEqual([shift(TODAY, -3)]);
  await expect.poll(() => push.received.filter((r) => r.payload.title === title).length).toBe(1);
  expect(push.received.find((r) => r.payload.title === title)?.payload).toMatchObject({ type: "COMEBACK", url: "/training" });

  // Повторный тик — без повтора
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await episodes(login)).toEqual([shift(TODAY, -3)]);

  // Зашёл сегодня и снова пропал на 3 дня — новая серия
  await setLastLoginDay(login, TODAY);
  await runTick(request, localAt(TODAY, "21:05", 3));
  expect(await episodes(login)).toEqual([shift(TODAY, -3), TODAY]);

  // Лента колокольчика (сегодня уже засчитан — заход ничего не меняет)
  await page.reload();
  await openBell(page);
  await expect(page.getByRole("menuitem", { name: new RegExp(title) })).toHaveCount(2);
  await expect(page.getByRole("menuitem", { name: new RegExp(title) }).first()).toContainText("Три дня без зала");
});

test("before the campaign hour and after 22:00 nothing is sent", async ({ request }) => {
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  const login = await player({ lastLogin: shift(TODAY, -5) });
  await runTick(request, localAt(TODAY, "19:05"));
  expect(await campaignSends(login)).toHaveLength(0);

  // Положительный контроль: в окне тот же игрок получает
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await episodes(login)).toEqual([shift(TODAY, -5)]);

  // Верхняя граница: в 22:05 новый эпизод нового игрока не уходит
  const late = await player({ lastLogin: shift(TODAY, -5) });
  await runTick(request, localAt(TODAY, "22:05"));
  expect(await campaignSends(late)).toHaveLength(0);
});

test("NO_WORKOUT 5: visits but no workout for 5 days", async ({ request }) => {
  const title = `Потренируйся ${tag()}`;
  await createCampaign({ condition: "NO_WORKOUT", days: 5, hour: 20, title });
  const old = await player({ lastLogin: shift(TODAY, -1) });
  await seedWorkouts(old, "Жим штанги лёжа", [{ weight: 40, reps: 10, sets: 3 }], 0, { finishedAt: [localAt(shift(TODAY, -6), "10:00")] });
  const fresh = await player({ lastLogin: shift(TODAY, -1) });
  await seedWorkouts(fresh, "Жим штанги лёжа", [{ weight: 40, reps: 10, sets: 3 }], 0, { finishedAt: [localAt(shift(TODAY, -2), "10:00")] });
  const none = await player({ lastLogin: shift(TODAY, -1) });

  await runTick(request, localAt(TODAY, "21:05"));
  expect(await episodes(old)).toEqual([shift(TODAY, -6)]);
  expect(await notificationTitles(old)).toContain(title);
  expect(await campaignSends(fresh)).toHaveLength(0);
  expect(await campaignSends(none)).toHaveLength(0);
});

test("NEVER_TRAINED 2: registered 3 days ago without workouts", async ({ request }) => {
  await createCampaign({ condition: "NEVER_TRAINED", days: 2, hour: 20 });
  const idle = await player({ createdAt: localAt(shift(TODAY, -3), "10:00"), lastLogin: shift(TODAY, -3) });
  const trained = await player({ createdAt: localAt(shift(TODAY, -3), "10:00"), lastLogin: shift(TODAY, -1) });
  await seedWorkouts(trained, "Жим штанги лёжа", [{ weight: 40, reps: 10, sets: 3 }], 0, { finishedAt: [localAt(shift(TODAY, -1), "10:00")] });

  await runTick(request, localAt(TODAY, "21:05"));
  expect(await episodes(idle)).toEqual(["never"]);
  expect(await campaignSends(trained)).toHaveLength(0);
});

test("STREAK_LOST: only while the restore offer is open", async ({ request }) => {
  const title = `Серия сгорела ${tag()}`;
  await createCampaign({ condition: "STREAK_LOST", days: null, hour: 20, title, url: "/dashboard" });
  // Неделя сгорания — текущая (прошлая пропущена, заморозок нет); тик — в понедельник вечером, окно выкупа — до чт 00:00
  const monday = mondayWeeksAgo(0);
  const at = localAt(monday, "21:05");
  const lost = await player({ createdAt: new Date(at.getTime() - 60 * DAY), lastLogin: shift(monday, -8) });
  await setStreakState(lost, { currentStreak: 3, lastStreakWeek: shift(monday, -14), streakFreezes: 0, freezeGrantedAt: localAt(monday, "10:00") });
  // Сгорела ещё на прошлой неделе — выкуп уже недоступен
  const late = await player({ createdAt: new Date(at.getTime() - 60 * DAY), lastLogin: shift(monday, -8) });
  await setStreakState(late, { currentStreak: 3, lastStreakWeek: shift(monday, -21), streakFreezes: 0, freezeGrantedAt: localAt(monday, "10:00") });

  await runTick(request, at);
  expect(await episodes(lost)).toEqual([monday]);
  expect(await notificationTitles(lost)).toContain(title);
  expect(await notificationUrls(lost)).toContain("/dashboard");
  expect(await campaignSends(late)).toHaveLength(0);

  // Повторный тик — уже отправлено в эту неделю сгорания
  await runTick(request, localAt(monday, "21:30"));
  expect(await episodes(lost)).toEqual([monday]);
});

test("cap: one campaign per pass (larger N), the next one not earlier than in 24 h", async ({ request }) => {
  // Разные условия — эскалация не мешает, работает только лимит
  const never = await createCampaign({ condition: "NEVER_TRAINED", days: 2, hour: 20 });
  const seven = await createCampaign({ condition: "INACTIVE", days: 7, hour: 20 });
  const login = await player({ lastLogin: shift(TODAY, -8) });

  await runTick(request, localAt(TODAY, "20:05"));
  expect((await campaignSends(login)).map((s) => s.campaignId)).toEqual([seven]);

  // Окно отправки — 20:00…22:00, поэтому «через пару часов» — через час
  await runTick(request, localAt(TODAY, "21:05"));
  expect((await campaignSends(login)).map((s) => s.campaignId)).toEqual([seven]);

  await runTick(request, localAt(TODAY, "21:10", 1));
  expect((await campaignSends(login)).map((s) => s.campaignId)).toEqual([seven, never]);
});

test("escalation: a long gap gets only the largest N, smaller ones do not follow in the same series", async ({ request }) => {
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  await createCampaign({ condition: "INACTIVE", days: 7, hour: 20 });
  const fourteen = await createCampaign({ condition: "INACTIVE", days: 14, hour: 20 });
  const login = await player({ lastLogin: shift(TODAY, -30) });

  await runTick(request, localAt(TODAY, "21:05"));
  expect((await campaignSends(login)).map((s) => s.campaignId)).toEqual([fourteen]);

  // Лимит 24 ч уже не держит — держит эскалация: «7» и «3» в этом эпизоде не уходят
  await runTick(request, localAt(TODAY, "21:05", 1));
  await runTick(request, localAt(TODAY, "21:05", 2));
  expect((await campaignSends(login)).map((s) => s.campaignId)).toEqual([fourteen]);
});

test("escalation: 3 → 7 → 14 as the gap grows in one series", async ({ request }) => {
  const three = await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  const seven = await createCampaign({ condition: "INACTIVE", days: 7, hour: 20 });
  const fourteen = await createCampaign({ condition: "INACTIVE", days: 14, hour: 20 });
  const login = await player({ lastLogin: shift(TODAY, -3) });
  const ids = async () => (await campaignSends(login)).map((s) => s.campaignId);

  await runTick(request, localAt(TODAY, "21:05"));
  expect(await ids()).toEqual([three]);

  // День 7 без захода
  await runTick(request, localAt(TODAY, "21:05", 4));
  expect(await ids()).toEqual([three, seven]);

  // День 14 без захода
  await runTick(request, localAt(TODAY, "21:05", 11));
  expect(await ids()).toEqual([three, seven, fourteen]);
  expect(await episodes(login)).toEqual([shift(TODAY, -3), shift(TODAY, -3), shift(TODAY, -3)]);
});

test("opted out, no channels and channel mismatch: nothing sent", async ({ request }) => {
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, telegram: false });
  const optedOut = await player({ lastLogin: shift(TODAY, -5) });
  await setNotifyComeback(optedOut, false);
  const noChannels = await player({ lastLogin: shift(TODAY, -5), push: false });
  const telegramOnly = await player({ lastLogin: shift(TODAY, -5), push: false });
  await linkTelegram(telegramOnly, `9${Date.now()}`.slice(0, 15));

  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(optedOut)).toHaveLength(0);
  expect(await campaignSends(noChannels)).toHaveLength(0);
  expect(await notificationTitles(noChannels)).toHaveLength(0);
  expect(await campaignSends(telegramOnly)).toHaveLength(0);

  // Кампания с Telegram — дойдёт до игрока только с Telegram
  await archiveAllCampaigns();
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, push: false, telegram: true });
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(telegramOnly)).toHaveLength(1);
  expect(await campaignSends(noChannels)).toHaveLength(0);
});

test("player without the flag and a paused campaign: nothing sent", async ({ request }) => {
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, status: "PAUSED" });
  const flagged = await player({ lastLogin: shift(TODAY, -5) });
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(flagged)).toHaveLength(0);

  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  const unflagged = await player({ lastLogin: shift(TODAY, -5), flag: false });
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(unflagged)).toHaveLength(0);
  expect(await campaignSends(flagged)).toHaveLength(1);
});

test("returned: a counted visit within 48 h marks the send, an older send stays unmarked", async ({ page, request }) => {
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  const { login } = await registerUser(page);
  await setUserTimeZone(login, E2E_TZ);
  await withDb((db) => db.query(`update "User" set "createdAt" = $2 where login = $1`, [login, new Date(Date.now() - 30 * DAY)]));
  await subscribe(login);
  await addFlagUser("campaigns", login);

  // Отправка старше 48 ч — заход её не отмечает
  await setLastLoginDay(login, shift(TODAY, -3));
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(login)).toHaveLength(1);
  await setCampaignSentAt(login, new Date(Date.now() - 49 * 3_600_000));
  await setLastLoginDay(login, shift(TODAY, -1));
  await page.goto("/dashboard");
  expect((await campaignSends(login)).map((s) => s.returnedAt)).toEqual([null]);

  // Новая кампания: отправка свежая — засчитанный заход ставит returnedAt
  await archiveAllCampaigns();
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  // Другой эпизод: тот же эпизод закрыт отправкой архивной кампании того же условия (эскалация)
  await setLastLoginDay(login, shift(TODAY, -4));
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(login)).toHaveLength(2);
  await setLastLoginDay(login, shift(TODAY, -1));
  await page.goto("/dashboard");
  const sends = await campaignSends(login);
  expect(sends[0].returnedAt).toBeNull();
  expect(sends[1].returnedAt).not.toBeNull();
});

test("lastLoginDay null counts from the registration day; under 24 h — not a candidate", async ({ request }) => {
  await createCampaign({ condition: "INACTIVE", days: 1, hour: 20 });
  const twoDays = await player({ createdAt: localAt(shift(TODAY, -2), "10:00"), lastLogin: null });
  const newbie = await player({ createdAt: localAt(shift(TODAY, -1), "23:00"), lastLogin: null });

  await runTick(request, localAt(TODAY, "21:05"));
  expect(await episodes(twoDays)).toEqual([shift(TODAY, -2)]);
  expect(await campaignSends(newbie)).toHaveLength(0);
});

test("settings: the switch turns campaigns off for the player; without the flag there is no switch", async ({ page, request }) => {
  await createCampaign({ condition: "INACTIVE", days: 3, hour: 20 });
  const { login } = await registerUser(page);
  await setUserTimeZone(login, E2E_TZ);
  await withDb((db) => db.query(`update "User" set "createdAt" = $2 where login = $1`, [login, new Date(Date.now() - 30 * DAY)]));
  await subscribe(login);

  // Без флага переключателя нет
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "Не потеряй streak" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Напоминания вернуться" })).toHaveCount(0);

  // Во флаге — есть, включён по умолчанию; выключили — настройка сохранилась и рассылка не уходит
  await addFlagUser("campaigns", login);
  await page.reload();
  const toggle = page.getByRole("switch", { name: "Напоминания вернуться" });
  await expect(toggle).toBeChecked();
  await expect(page.getByText("Если давно не заходили или не тренировались")).toBeVisible();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(() => withDb(async (db) => (await db.query(`select "notifyComeback" from "User" where login = $1`, [login])).rows[0].notifyComeback))
    .toBe(false);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Напоминания вернуться" })).not.toBeChecked();

  await setLastLoginDay(login, shift(TODAY, -5));
  await runTick(request, localAt(TODAY, "21:05"));
  expect(await campaignSends(login)).toHaveLength(0);
});

test.describe("admin pages", () => {
  /** Новый админ (логин e2e_flag_admin) с флагом campaigns. */
  async function admin(page: Page, o: { flag?: boolean } = {}) {
    const { login } = await registerUser(page);
    await makeAdmin(login);
    if (o.flag ?? true) await addFlagUser("campaigns", E2E_ADMIN);
    return E2E_ADMIN;
  }
  const row = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name });

  test("create a draft, audience, test send to myself", async ({ page }) => {
    const name = `Админка ${tag()}`;
    const title = `Заголовок ${tag()}`;
    await player({ lastLogin: shift(TODAY, -5) });
    const me = await admin(page);

    await page.goto("/admin/campaigns");
    await page.getByRole("button", { name: "Меню профиля" }).click();
    await expect(page.getByRole("menuitem", { name: "Рассылки" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Создать" }).click();
    await page.getByLabel("Название").fill(name);
    await page.getByLabel("Условие").selectOption({ label: "Не заходил" });
    await page.getByLabel("Дней без захода").fill("3");
    await page.getByLabel("Заголовок").fill(title);
    await page.getByLabel("Текст").fill("Три дня без зала");
    await page.getByLabel("Ссылка").fill("/dashboard");
    await page.getByLabel("Час отправки").fill("20");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page).toHaveURL(/\/admin\/campaigns$/);
    const r = row(page, name);
    await expect(r).toContainText("Не заходил 3 дня");
    await expect(r.getByText("Черновик", { exact: true })).toBeVisible();

    await r.getByRole("link", { name }).click();
    await page.getByRole("button", { name: "Кто попадёт сейчас" }).click();
    const audience = page.getByRole("status").filter({ hasText: "Сейчас подходят" });
    await expect(audience).toBeVisible();
    expect(Number((await audience.innerText()).match(/\d+/)?.[0])).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Отправить себе" }).click();
    await expect(page.getByText("Отправлено вам")).toBeVisible();
    expect(await campaignSends(me)).toHaveLength(0);
    expect(await notificationTitles(me)).toContain(title);
  });

  test("launch, condition lock on a running campaign, pause and edit", async ({ page }) => {
    const name = `Запуск ${tag()}`;
    const id = await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, name, status: "DRAFT" });
    await player({ lastLogin: shift(TODAY, -5) });
    await admin(page);

    await page.goto(`/admin/campaigns/${id}`);
    await page.getByRole("button", { name: "Запустить" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Запустить рассылку?")).toBeVisible();
    await expect(dialog).toContainText(/Сейчас подходят \d+/);
    await dialog.getByRole("button", { name: "Запустить" }).click();
    await expect(page.getByText("Идёт", { exact: true })).toBeVisible();

    await page.getByLabel("Дней без захода").fill("4");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Условие меняется только у черновика или на паузе")).toBeVisible();

    await page.getByRole("button", { name: "Пауза" }).click();
    await expect(page.getByText("На паузе", { exact: true })).toBeVisible();
    await page.getByLabel("Дней без захода").fill("4");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Дней без захода")).toHaveValue("4");
  });

  test("list shows sent and returned counts", async ({ page, request }) => {
    const name = `Статистика ${tag()}`;
    await setFlag("campaigns", { enabled: true, logins: [] });
    await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, name, status: "ACTIVE" });
    const login = await player({ lastLogin: shift(TODAY, -5) });
    await runTick(request, localAt(TODAY, "21:05"));
    expect(await campaignSends(login)).toHaveLength(1);
    await withDb((db) => db.query(`update "CampaignSend" set "returnedAt" = now() where "userId" = (select id from "User" where login = $1)`, [login]));
    await admin(page);

    await page.goto("/admin/campaigns");
    const r = row(page, name);
    await expect(r.getByText("Идёт", { exact: true })).toBeVisible();
    await expect(r).toContainText("Отправлено 1");
    await expect(r).toContainText("Вернулись 1 · 100 %");
  });

  test("archive moves a row to the end without delete; a draft can be deleted", async ({ page }) => {
    const running = `Идущая ${tag()}`;
    const draft = `Черновик ${tag()}`;
    const runningId = await createCampaign({ condition: "INACTIVE", days: 3, hour: 20, name: running, status: "ACTIVE" });
    const draftId = await createCampaign({ condition: "INACTIVE", days: 5, hour: 20, name: draft, status: "DRAFT" });
    await admin(page);

    await page.goto(`/admin/campaigns/${runningId}`);
    await page.getByRole("button", { name: "В архив" }).click();
    await expect(page.getByText("Архив", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Удалить" })).toHaveCount(0);

    await page.goto("/admin/campaigns");
    const rows = page.getByRole("listitem");
    const names = await rows.allInnerTexts();
    const at = (n: string) => names.findIndex((t) => t.includes(n));
    expect(at(draft)).toBeGreaterThanOrEqual(0);
    expect(at(running)).toBeGreaterThan(at(draft));
    await expect(row(page, running).getByText("Архив", { exact: true })).toBeVisible();

    await page.goto(`/admin/campaigns/${draftId}`);
    await page.getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page).toHaveURL(/\/admin\/campaigns$/);
    await expect(row(page, draft)).toHaveCount(0);
  });

  test("non-admin gets 404; admin without the flag gets 404 and no menu item", async ({ page, browser }) => {
    await setFlag("campaigns", { enabled: true, logins: [] });
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await registerUser(other);
    expect((await other.goto("/admin/campaigns"))?.status()).toBe(404);
    await ctx.close();

    await admin(page, { flag: false });
    expect((await page.goto("/admin/campaigns"))?.status()).toBe(404);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Меню профиля" }).click();
    await expect(page.getByRole("menuitem", { name: "Метрики" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Рассылки" })).toHaveCount(0);
  });
});
