import { expect, test, type Page } from "@playwright/test";
import { addSubscription, linkTelegram, seedWorkouts, setFlag, resetFlag, setUserTimeZone, userId, withDb } from "./db";
import { addToWorkout, registerUser, runTick } from "./helpers";
import { startPushService } from "./push-server";
import { E2E_TZ, E2E_TZ_OFFSET, localAt } from "./tz";

// Флаг first_workout_reminder глобальный: включаем его не на всех (параллельные спеки получили бы диалог у своих новичков), а
// списком логинов этого файла. setFlag заменяет весь список — логины копятся между тестами (файл идёт по очереди, FLAGS_CACHE_MS=0).
test.describe.configure({ mode: "serial", timeout: 90_000 });

const DAY = 86_400_000;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const TODAY = new Date(Date.now() + E2E_TZ_OFFSET * 3_600_000).toISOString().slice(0, 10);
const TOMORROW = shift(TODAY, 1);

const flagged: string[] = [];

/** Новичок во флаге, в поясе e2e (диалог считает «завтра» и «сегодня вечером» по User.timeZone). */
async function newbie(page: Page) {
  const me = await registerUser(page);
  await setUserTimeZone(me.login, E2E_TZ);
  flagged.push(me.login);
  await setFlag("first_workout_reminder", { enabled: true, percent: 0, logins: flagged });
  return me;
}

const dialog = (page: Page) => page.getByRole("dialog");
const askDialog = (page: Page) => page.getByRole("dialog", { name: "Когда тренировка?" });

async function createDraft(page: Page) {
  await page.goto("/training");
  await page.getByRole("button", { name: /Пустая тренировка/ }).click();
}

const planRows = (login: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ date: string; time: string; emailReminder: boolean; planKey: string | null; asked: boolean }>(
      `select e.date, e.time, e."emailReminder", w."planKey", w."scheduleAskedAt" is not null as asked
       from "PlanEntry" e join "User" u on u.id = e."userId" left join "Workout" w on w."planKey" = 'e:' || e.id where u.login = $1`,
      [login],
    );
    return rows;
  });

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") return;
  await setFlag("first_workout_reminder", { enabled: true, percent: 0, logins: [] });
});

test.afterAll(async ({}, info) => {
  if (info.project.name !== "desktop") return;
  await resetFlag("first_workout_reminder");
});

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Флаг first_workout_reminder глобальный");
});

test("newbie: «Начинаю сейчас» closes the dialog and it does not come back", async ({ page }) => {
  const me = await newbie(page);
  await createDraft(page);
  await expect(askDialog(page)).toBeVisible();
  await askDialog(page).getByRole("button", { name: "Начинаю сейчас" }).click();
  await expect(dialog(page)).toBeHidden();

  await expect.poll(async () => withDb(async (db) => (await db.query(`select count(*)::int n from "Workout" w join "User" u on u.id = w."userId" where u.login = $1 and w."scheduleAskedAt" is not null and w."planKey" is null`, [me.login])).rows[0].n)).toBe(1);
  await page.reload();
  await expect(page.getByLabel("Название тренировки")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(await planRows(me.login)).toEqual([]);
});

test("newbie: pick tomorrow, email reminder → calendar entry bound to the draft", async ({ page }) => {
  const me = await newbie(page);
  await createDraft(page);
  await askDialog(page).getByRole("button", { name: "Завтра" }).click();
  const how = dialog(page);
  await expect(how.getByRole("heading", { name: "Как напомнить?" })).toBeVisible();
  await how.getByRole("checkbox", { name: new RegExp(`Напомнить на почту \\(${me.email}\\)`) }).click();
  await how.getByRole("button", { name: "Готово" }).click();
  await expect(dialog(page)).toBeHidden();

  await expect.poll(() => planRows(me.login)).toHaveLength(1);
  const [row] = await planRows(me.login);
  expect(row).toMatchObject({ date: TOMORROW, time: "19:00", emailReminder: true, asked: true });
  expect(row.planKey).toMatch(/^e:/);

  await page.goto(`/calendar?date=${TOMORROW}`);
  await expect(page.getByRole("button", { name: /19:00/ }).first()).toBeVisible();
});

test("a user with a completed workout gets no dialog", async ({ page }) => {
  const me = await newbie(page);
  await seedWorkouts(me.login, "Жим штанги лёжа", [{ weight: 40, reps: 10, sets: 3 }]);
  await createDraft(page);
  await expect(page.getByLabel("Название тренировки")).toBeVisible();
  // Признак гидратации: добавление упражнения работает только в ожившем редакторе, диалог к этому моменту уже появился бы
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await expect(dialog(page)).toHaveCount(0);
});

test("two tabs: the second «Готово» does not create a second entry", async ({ page }) => {
  const me = await newbie(page);
  await createDraft(page);
  await expect(askDialog(page)).toBeVisible();
  const second = await page.context().newPage();
  await second.goto("/training");
  await expect(askDialog(second)).toBeVisible();

  for (const p of [page, second]) {
    await askDialog(p).getByRole("button", { name: "Завтра" }).click();
    await dialog(p).getByRole("button", { name: "Готово" }).click();
    await expect(dialog(p)).toBeHidden();
  }
  expect(await planRows(me.login)).toHaveLength(1);
  const count = await withDb(async (db) => (await db.query(`select count(*)::int n from "PlanEntry" where "userId" = $1`, [await userId(db, me.login)])).rows[0].n);
  expect(count).toBe(1);
  await second.close();
});

test("hero: empty draft, draft with exercises and slot, running workout", async ({ page }) => {
  await newbie(page);
  await createDraft(page);
  await askDialog(page).getByRole("button", { name: "Начинаю сейчас" }).click();
  await expect(dialog(page)).toBeHidden();

  const hero = page.getByTestId("week-headline");
  const cta = (name: string) => page.getByRole("region", { name: "Сегодня" }).getByRole("link", { name });
  await page.goto("/dashboard");
  await expect(hero).toHaveText("Собери первую тренировку");
  await expect(cta("Собрать тренировку")).toBeVisible();

  await page.goto("/training");
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await page.goto("/dashboard");
  await expect(hero).toHaveText("Твоя тренировка готова");
  await expect(page.getByTestId("week-headline-detail")).toContainText("1 упражнение");
  await expect(cta("Начать тренировку")).toBeVisible();

  await page.goto("/training");
  await page.getByRole("button", { name: "Начать", exact: true }).click();
  await expect(page.getByRole("button", { name: "Завершить тренировку" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(cta("Продолжить тренировку")).toBeVisible();
  await expect(page.getByTestId("week-headline-detail")).toHaveCount(0);
});

test("hero shows the scheduled time of the draft", async ({ page }) => {
  await newbie(page);
  await createDraft(page);
  await askDialog(page).getByRole("button", { name: "Завтра" }).click();
  await dialog(page).getByRole("button", { name: "Готово" }).click();
  await expect(dialog(page)).toBeHidden();
  await addToWorkout(page, ["Жим штанги лёжа"]);
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await page.goto("/dashboard");
  await expect(page.getByTestId("week-headline")).toHaveText("Твоя тренировка готова");
  await expect(page.getByTestId("week-headline-detail")).toContainText("завтра в 19:00");
});

test("reminder with a draft: one PLAN notification to /training an hour before the slot, once", async ({ page, request }) => {
  const push = await startPushService();
  try {
    const me = await newbie(page);
    await addSubscription(me.login, { endpoint: `${push.endpoint}/${me.login}`, p256dh: push.p256dh, auth: push.auth });
    await linkTelegram(me.login, `8${Date.now()}`.slice(0, 15));
    await createDraft(page);
    await askDialog(page).getByRole("button", { name: "Завтра" }).click();
    await dialog(page).getByRole("button", { name: "Готово" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect.poll(() => planRows(me.login)).toHaveLength(1);

    // Слот — завтра в 19:00; окно напоминания 60 минут, тик за 55 минут до начала. Черновик (PLANNED) напоминание не глушит.
    const at = localAt(TOMORROW, "18:05");
    await runTick(request, at, "reminders");
    const plan = () =>
      withDb(async (db) =>
        (await db.query<{ url: string | null }>(`select url from "Notification" where "userId" = $1 and type = 'PLAN'`, [await userId(db, me.login)])).rows,
      );
    await expect.poll(plan).toEqual([{ url: "/training" }]);
    await expect.poll(() => push.received.filter((r) => r.payload.type === "PLAN").length).toBe(1);

    await runTick(request, at, "reminders");
    await page.waitForTimeout(500);
    expect(await plan()).toHaveLength(1);
    const sent = await withDb(async (db) => (await db.query(`select count(*)::int n from "PlanReminder" where "userId" = $1`, [await userId(db, me.login)])).rows[0].n);
    expect(sent).toBe(1);
  } finally {
    await push.close();
  }
});

test("a workout finished before its slot day closes the slot: no PLAN reminder on that day", async ({ page, request }) => {
  const me = await newbie(page);
  await createDraft(page);
  await askDialog(page).getByRole("button", { name: "Завтра" }).click();
  await dialog(page).getByRole("button", { name: "Готово" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => planRows(me.login)).toHaveLength(1);

  // Потренировался сегодня, хотя выбрал завтра
  await addToWorkout(page, ["Жим штанги лёжа"]);
  const block = page.getByRole("region", { name: "Жим штанги лёжа" });
  await block.getByLabel("Вес, подход 1").fill("40");
  await block.getByLabel("Повторы, подход 1").fill("10");
  await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
  await page.getByRole("button", { name: "Завершить тренировку" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Завершить" }).click();
  await expect(page).toHaveURL(/\/workouts\//);

  await runTick(request, localAt(TOMORROW, "18:05"), "reminders");
  const [plan, reminders] = await withDb(async (db) => {
    const uid = await userId(db, me.login);
    return [
      (await db.query(`select count(*)::int n from "Notification" where "userId" = $1 and type = 'PLAN'`, [uid])).rows[0].n,
      (await db.query(`select count(*)::int n from "PlanReminder" where "userId" = $1`, [uid])).rows[0].n,
    ];
  });
  expect({ plan, reminders }).toEqual({ plan: 0, reminders: 0 });
});
