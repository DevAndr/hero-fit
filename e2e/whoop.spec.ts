import { createHmac, randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect, test, type Page } from "@playwright/test";
import type { WhoopApiRecovery, WhoopApiSleep, WhoopApiWorkout } from "../lib/whoop/types";
import {
  addFlagUser,
  coachAssignOnce,
  coachTarget,
  coachTemplate,
  createUserRow,
  enableCoach,
  expireWhoopToken,
  insertWhoopSleep,
  latestWorkout,
  linkCoach,
  resetWhoopSync,
  seedWorkouts,
  setTimeZone,
  setWhoopScopes,
  whoopLastSyncAt,
  whoopNeedsReauth,
  whoopScopes,
  whoopSleepRow,
  whoopSleepCount,
  whoopUserIdOf,
  whoopWorkoutCount,
} from "./db";
import { PASSWORD, registerUser } from "./helpers";
import { E2E_TZ_OFFSET } from "./tz";
import { WHOOP_FAKE_URL } from "./whoop-server";

// У фейкового WHOOP глобальный /__control/reuse-next — параллельные тесты перехватили бы его
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "фейковый WHOOP общий — только desktop");

/** Активность WHOOP в форме API v2; без `SCORED` — без `score`. */
function whoopActivity(
  id: string,
  start: Date,
  end: Date,
  o: { state?: string; avgHr?: number; maxHr?: number; strain?: number; kJ?: number } = {},
): WhoopApiWorkout {
  const state = o.state ?? "SCORED";
  return {
    id,
    start: start.toISOString(),
    end: end.toISOString(),
    sport_name: "weightlifting",
    score_state: state,
    ...(state === "SCORED"
      ? {
          score: {
            strain: o.strain ?? 9.4,
            average_heart_rate: o.avgHr ?? 121,
            max_heart_rate: o.maxHr ?? 164,
            kilojoule: o.kJ ?? 1250,
            percent_recorded: 100,
            zone_durations: {
              zone_zero_milli: 60_000,
              zone_one_milli: 600_000,
              zone_two_milli: 900_000,
              zone_three_milli: 600_000,
              zone_four_milli: 120_000,
              zone_five_milli: 0,
            },
          },
        }
      : {}),
  };
}

/** user_id для заранее подготовленного аккаунта WHOOP — вне диапазона счётчика фейка (он от Date.now()). */
const presetWhoopUser = () => 9_000_000_000_000_000 + Math.floor(Math.random() * 1e12);

async function control(path: string, init?: RequestInit) {
  const res = await fetch(`${WHOOP_FAKE_URL}/__control/${path}`, init);
  expect(res.ok).toBe(true);
  return res;
}

const reuseNext = (user: string | number) => control(`reuse-next?user=${user}`, { method: "POST" });
const putWorkouts = (user: number, list: WhoopApiWorkout[]) =>
  control(`workouts?user=${user}`, { method: "PUT", body: JSON.stringify(list), headers: { "content-type": "application/json" } });
const setExpiresIn = (seconds: number) => control(`expires?seconds=${seconds}`, { method: "POST" });
const setApiDelay = (ms: number) => control(`api-delay?ms=${ms}`, { method: "POST" });
const isRevoked = async (user: string | number) => ((await (await control(`revoked?user=${user}`)).json()) as { revoked: boolean }).revoked;

async function flaggedUser(page: Page) {
  const user = await registerUser(page);
  await addFlagUser("whoop", user.login);
  return user;
}

/** /devices → «Подключить WHOOP» → согласие → «Продолжить» (OAuth фейка сразу возвращает обратно). */
async function connectWhoop(page: Page) {
  if (!page.url().endsWith("/devices")) await page.goto("/devices");
  await page.getByRole("button", { name: "Подключить WHOOP" }).click();
  const dialog = page.getByRole("dialog");
  const go = dialog.getByRole("link", { name: "Продолжить" });
  await expect(go).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Согласен на обработку данных о здоровье" }).click();
  await expect(go).toBeEnabled();
  await go.click();
}

const card = (page: Page) => page.getByRole("region", { name: "WHOOP" });

test("подключение по согласию", async ({ page }) => {
  const { login } = await flaggedUser(page);

  // Без галочки в диалоге маршрут не пускает
  expect((await page.request.get("/api/whoop/connect", { maxRedirects: 0 })).status()).toBe(400);

  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /Браслеты и часы/ })).toContainText("Не подключены");
  await page.getByRole("link", { name: /Браслеты и часы/ }).click();
  await expect(page).toHaveURL(/\/devices$/);
  await expect(page.getByRole("heading", { name: "Браслеты и часы" })).toBeVisible();
  await expect(card(page)).toContainText("Не подключён");

  await page.getByRole("button", { name: "Подключить WHOOP" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("только вы");
  await expect(dialog.getByRole("link", { name: /политик/i })).toHaveAttribute("href", "/privacy");
  await page.keyboard.press("Escape");

  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  await expect(page.getByText("WHOOP подключён", { exact: true })).toBeVisible();
  await expect(card(page).getByText(/^Подключён с /)).toBeVisible();
  expect(await whoopUserIdOf(login)).not.toBeNull();

  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /Браслеты и часы/ })).toContainText("WHOOP подключён");
});

test("без флага карточки нет", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Браслеты и часы/ })).toHaveCount(0);
  expect((await page.goto("/devices"))?.status()).toBe(404);
  expect((await page.request.get("/api/whoop/connect?consent=1", { maxRedirects: 0 })).status()).toBe(404);
});

test("чужой аккаунт WHOOP", async ({ page }) => {
  const first = await flaggedUser(page);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  const whoopId = await whoopUserIdOf(first.login);
  expect(whoopId).not.toBeNull();

  await page.context().clearCookies();
  const second = await flaggedUser(page);
  await reuseNext(whoopId!);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=taken$/);
  await expect(page.getByText("Этот аккаунт WHOOP уже подключён к другому профилю")).toBeVisible();
  await expect(card(page)).toContainText("Не подключён");
  expect(await whoopUserIdOf(second.login)).toBeNull();
  expect(await whoopUserIdOf(first.login)).toBe(whoopId);
  // Попытка второго не отозвала доступ первого (отзыв в WHOOP снимает все токены аккаунта)
  expect(await isRevoked(whoopId!)).toBe(false);

  // Токены первого живы: отключение обновляет его токен (expires_in: 1) и отзывает доступ от его имени —
  // с отозванными токенами refresh не прошёл бы и отзыва не было бы
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Логин или email").fill(first.login);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await page.goto("/devices");
  await card(page).getByRole("button", { name: "Отключить WHOOP" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Отключить" }).click();
  await expect(card(page)).toContainText("Не подключён");
  expect(await isRevoked(whoopId!)).toBe(true);
});

test("подключение сохраняет новые scope", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  const scopes = (await whoopScopes(login)) ?? "";
  expect(scopes.split(" ")).toEqual(expect.arrayContaining(["read:recovery", "read:sleep", "read:workout", "offline"]));
});

test("переподключение другого аккаунта удаляет сны", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  await insertWhoopSleep(login, { end: new Date() });
  expect(await whoopSleepCount(login)).toBe(1);

  // Тот же аккаунт WHOOP — сон остаётся
  const same = (await whoopUserIdOf(login))!;
  await reuseNext(same);
  await page.goto("/api/whoop/connect?consent=1");
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  expect(await whoopSleepCount(login)).toBe(1);

  // Другой аккаунт — сны прежнего удалены
  await reuseNext(9_000_000_000_000 + Math.floor(Math.random() * 1e9));
  await page.goto("/api/whoop/connect?consent=1");
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  expect(await whoopUserIdOf(login)).not.toBe(same);
  expect(await whoopSleepCount(login)).toBe(0);
});

test("callback с чужим state — ошибка, подключения нет", async ({ page }) => {
  const { login } = await flaggedUser(page);
  // Настоящий state в cookie (как после «Продолжить»), но в callback пришёл другой
  expect((await page.request.get("/api/whoop/connect?consent=1", { maxRedirects: 0 })).status()).toBe(307);
  await page.goto("/api/whoop/callback?code=x&state=bad");
  await expect(page).toHaveURL(/\/devices\?whoop=error$/);
  await expect(page.getByText("Не удалось подключить WHOOP")).toBeVisible();
  await expect(card(page)).toContainText("Не подключён");
  expect(await whoopUserIdOf(login)).toBeNull();
});

test("отключение удаляет данные", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = presetWhoopUser();
  const now = Date.now();
  await putWorkouts(whoopId, [
    whoopActivity(randomUUID(), new Date(now - 2 * 86_400_000), new Date(now - 2 * 86_400_000 + 3_600_000)),
    whoopActivity(randomUUID(), new Date(now - 86_400_000), new Date(now - 86_400_000 + 3_600_000)),
  ]);
  await reuseNext(whoopId);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  expect(await whoopUserIdOf(login)).toBe(String(whoopId));
  // История грузится в after() — дождаться, чтобы загрузка не дописала строки после отключения
  await expect.poll(() => whoopWorkoutCount(login)).toBe(2);
  await insertWhoopSleep(login, { end: new Date() });

  await card(page).getByRole("button", { name: "Отключить WHOOP" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Данные WHOOP в Hero Fit удалятся");
  await confirm.getByRole("button", { name: "Отключить" }).click();
  await expect(card(page)).toContainText("Не подключён");
  expect(await whoopWorkoutCount(login)).toBe(0);
  expect(await whoopSleepCount(login)).toBe(0);
  expect(await whoopUserIdOf(login)).toBeNull();
  expect(await isRevoked(whoopId)).toBe(true);
});

test("история за 30 дней", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 3);
  const w = await latestWorkout(login);

  // 26 активностей — больше одной страницы (25): совпадающая с тренировкой — самая старая, т. е. на второй странице
  const whoopId = presetWhoopUser();
  const later = Array.from({ length: 25 }, (_, i) => {
    const start = new Date(w.finishedAt.getTime() + (i + 1) * 10 * 60_000);
    return whoopActivity(randomUUID(), start, new Date(start.getTime() + 5 * 60_000));
  });
  await putWorkouts(whoopId, [whoopActivity(randomUUID(), w.startedAt, w.finishedAt), ...later]);
  await reuseNext(whoopId);

  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  await expect.poll(() => whoopWorkoutCount(login)).toBe(26);
});

/** Подключить WHOOP с заранее заданными активностями и дождаться загрузки истории (она идёт в after()). */
async function connectWith(page: Page, login: string, list: WhoopApiWorkout[]) {
  const whoopId = presetWhoopUser();
  await putWorkouts(whoopId, list);
  await reuseNext(whoopId);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  await expect.poll(() => whoopWorkoutCount(login)).toBe(list.length);
  // История (активности и сны) идёт в after() callback и кончается отметкой lastSyncAt — ждём её, иначе она гонится с вебхуками тестов
  await expect.poll(() => whoopLastSyncAt(login)).not.toBeNull();
  return whoopId;
}

const tile = (page: Page, name: string) => card(page).getByRole("group", { name, exact: true });

test("пульс в старой сводке", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 3);
  const w = await latestWorkout(login);
  await connectWith(page, login, [whoopActivity(randomUUID(), w.startedAt, w.finishedAt, { avgHr: 140, maxHr: 172, strain: 12.3, kJ: 1500 })]);

  await page.goto(`/workouts/${w.id}`);
  await expect(tile(page, "Средний пульс")).toContainText("140");
  await expect(tile(page, "Макс. пульс")).toContainText("172");
  await expect(tile(page, "Strain")).toContainText("12,3");
  await expect(tile(page, "Ккал")).toContainText("359");
  const zones = card(page).getByRole("table");
  await expect(zones).toBeAttached();
  await expect(zones).toContainText("Зона 2");
  await expect(zones).toContainText("15 мин");
  await expect(card(page)).not.toContainText("активностям WHOOP");
});

test("обработка → Обновить", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 1, { finishedAt: [new Date(Date.now() - 3_600_000)] });
  const w = await latestWorkout(login);
  const activityId = randomUUID();
  const whoopId = await connectWith(page, login, [whoopActivity(activityId, w.startedAt, w.finishedAt, { state: "PENDING_SCORE" })]);

  await page.goto(`/workouts/${w.id}`);
  await expect(card(page)).toContainText("WHOOP ещё обрабатывает тренировку");

  await putWorkouts(whoopId, [whoopActivity(activityId, w.startedAt, w.finishedAt, { avgHr: 133 })]);
  await resetWhoopSync(login);
  await card(page).getByRole("button", { name: "Обновить" }).click();
  await expect(tile(page, "Средний пульс")).toContainText("133");

  // Сразу ещё раз — ограничение по времени, а не «переподключите»
  await card(page).getByRole("button", { name: "Обновить" }).click();
  await expect(card(page)).toContainText("Обновить можно через минуту");
  await expect(card(page)).not.toContainText("Переподключите WHOOP");
  await expect(tile(page, "Средний пульс")).toContainText("133");
});

test("WHOOP не записал активность", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 3);
  const w = await latestWorkout(login);
  await connectWith(page, login, []);

  await page.goto(`/workouts/${w.id}`);
  await expect(card(page)).toContainText("WHOOP не записал активность в это время");
  await expect(card(page)).toContainText("можно запускать активность в WHOOP вручную");
});

test("тренировка старше загруженной истории — карточки нет", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 1, { finishedAt: [new Date(Date.now() - 40 * 86_400_000)] });
  const w = await latestWorkout(login);
  await connectWith(page, login, []);

  await page.goto(`/workouts/${w.id}`);
  await expect(page.getByText("Жим штанги лёжа").first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("две активности в одной тренировке", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 3);
  const w = await latestWorkout(login);
  const mid = new Date((w.startedAt.getTime() + w.finishedAt.getTime()) / 2);
  await connectWith(page, login, [
    whoopActivity(randomUUID(), w.startedAt, mid, { maxHr: 160 }),
    whoopActivity(randomUUID(), mid, w.finishedAt, { maxHr: 175 }),
  ]);

  await page.goto(`/workouts/${w.id}`);
  await expect(card(page)).toContainText("по 2 активностям WHOOP");
  await expect(tile(page, "Макс. пульс")).toContainText("175");
});

/** Подписанный вебхук WHOOP; `sign: false` — с неверной подписью. */
async function sendWhoopWebhook(request: APIRequestContext, body: object, sign = true) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const signature = sign ? createHmac("sha256", "e2e-whoop-secret").update(ts + raw).digest("base64") : "AAAA";
  return request.post("/api/whoop/webhook", {
    data: raw,
    headers: { "content-type": "application/json", "x-whoop-signature": signature, "x-whoop-signature-timestamp": ts },
  });
}

test("вебхук добавляет, обновляет и удаляет активность", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 3 }], 1, { finishedAt: [new Date(Date.now() - 3_600_000)] });
  const w = await latestWorkout(login);
  const whoopId = await connectWith(page, login, []);
  const activityId = randomUUID();
  await putWorkouts(whoopId, [whoopActivity(activityId, w.startedAt, w.finishedAt, { avgHr: 128 })]);

  const event = { user_id: whoopId, id: activityId, type: "workout.updated", trace_id: randomUUID() };
  expect((await sendWhoopWebhook(page.request, event)).status()).toBe(204);
  await expect.poll(() => whoopWorkoutCount(login)).toBe(1);
  await page.goto(`/workouts/${w.id}`);
  await expect(tile(page, "Средний пульс")).toContainText("128");

  // Повтор того же вебхука не плодит строки
  expect((await sendWhoopWebhook(page.request, event)).status()).toBe(204);
  await page.waitForTimeout(1500);
  expect(await whoopWorkoutCount(login)).toBe(1);

  expect((await sendWhoopWebhook(page.request, { ...event, type: "workout.deleted" })).status()).toBe(204);
  await expect.poll(() => whoopWorkoutCount(login)).toBe(0);
});

// Refresh ротируется: без блокировки два одновременных refresh сожгли бы подключение (второй получил бы 400 → needsReauth).
// Пауза API фейка — токен проверяется после того, как соседний запрос уже ротировал его: при expires_in 1 первый получает 401,
// и повтор не должен заново ротировать токен, с которым сейчас идёт второй (иначе оба упрутся в 401 и одна строка пропадёт)
for (const expiresIn of [3600, 1]) {
  test(`одновременные вебхуки при истёкшем токене (expires_in ${expiresIn})`, async ({ page }) => {
    const { login } = await flaggedUser(page);
    await setExpiresIn(expiresIn);
    try {
      const whoopId = await connectWith(page, login, []);
      const now = Date.now();
      const a = whoopActivity(randomUUID(), new Date(now - 7_200_000), new Date(now - 6_000_000));
      const b = whoopActivity(randomUUID(), new Date(now - 3_600_000), new Date(now - 2_400_000));
      await putWorkouts(whoopId, [a, b]);
      await expireWhoopToken(login);
      await setApiDelay(700);

      const results = await Promise.all(
        [a, b].map((x) => sendWhoopWebhook(page.request, { user_id: whoopId, id: x.id, type: "workout.updated", trace_id: randomUUID() })),
      );
      expect(results.map((r) => r.status())).toEqual([204, 204]);
      await expect.poll(() => whoopWorkoutCount(login)).toBe(2);
      expect(await whoopNeedsReauth(login)).toBe(false);
    } finally {
      await setApiDelay(0);
      await setExpiresIn(1);
    }
  });
}

test("вебхук: неверная подпись и чужой user_id", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  const activityId = randomUUID();
  await putWorkouts(whoopId, [whoopActivity(activityId, new Date(Date.now() - 7_200_000), new Date(Date.now() - 3_600_000))]);

  const event = { user_id: whoopId, id: activityId, type: "workout.updated", trace_id: randomUUID() };
  expect((await sendWhoopWebhook(page.request, event, false)).status()).toBe(401);
  expect((await page.request.post("/api/whoop/webhook", { data: JSON.stringify(event) })).status()).toBe(401);

  const unknown = await sendWhoopWebhook(page.request, { ...event, user_id: presetWhoopUser() });
  expect(unknown.status()).toBe(204);
  await page.waitForTimeout(1500);
  expect(await whoopWorkoutCount(login)).toBe(0);

  // Подписанный, но не JSON — 204
  const raw = "not json";
  const ts = String(Date.now());
  const res = await page.request.post("/api/whoop/webhook", {
    data: raw,
    headers: { "x-whoop-signature": createHmac("sha256", "e2e-whoop-secret").update(ts + raw).digest("base64"), "x-whoop-signature-timestamp": ts },
  });
  expect(res.status()).toBe(204);
});

test("«Мои данные»: выгрузка с согласием и активностью, без токенов", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = presetWhoopUser();
  const now = Date.now();
  await putWorkouts(whoopId, [whoopActivity(randomUUID(), new Date(now - 86_400_000), new Date(now - 86_400_000 + 3_600_000))]);
  await reuseNext(whoopId);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  await expect.poll(() => whoopWorkoutCount(login)).toBe(1);

  const res = await page.request.get("/account/export/json");
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).not.toMatch(/accessToken|refreshToken/);
  const data = JSON.parse(text);
  expect(data.whoop.whoopUserId).toBe(String(whoopId));
  expect(typeof data.whoop.consentAt).toBe("string");
  expect(typeof data.whoop.connectedAt).toBe("string");
  expect(data.whoop.workouts).toHaveLength(1);
  expect(data.whoop.workouts[0]).toMatchObject({ sportName: "weightlifting", avgHr: 121, maxHr: 164 });
  expect(data.whoop.workouts[0].userId).toBeUndefined();
});

test("«Мои данные»: без подключения whoop — null", async ({ page }) => {
  await flaggedUser(page);
  const data = await (await page.request.get("/account/export/json")).json();
  expect(data.whoop).toBeNull();
});

test("удаление аккаунта отзывает доступ WHOOP и стирает активности", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = presetWhoopUser();
  const now = Date.now();
  await putWorkouts(whoopId, [whoopActivity(randomUUID(), new Date(now - 86_400_000), new Date(now - 86_400_000 + 3_600_000))]);
  await reuseNext(whoopId);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);
  await expect.poll(() => whoopWorkoutCount(login)).toBe(1);
  expect(await isRevoked(whoopId)).toBe(false);

  await page.goto("/settings");
  await page.getByRole("region", { name: "Удаление аккаунта" }).getByRole("button", { name: "Удалить аккаунт" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Удалить аккаунт?" });
  await dialog.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);

  expect(await whoopWorkoutCount(login)).toBe(0);
  expect(await whoopUserIdOf(login)).toBeNull();
  expect(await isRevoked(whoopId)).toBe(true);
});

// --- сон и восстановление ---

const H = 3_600_000;

/** Сон WHOOP в форме API v2: 8 ч сна (light 4 + slow wave 2 + REM 2), `cycleId` связывает с восстановлением. */
function whoopSleepApi(id: string, cycleId: number, end: Date, o: { nap?: boolean } = {}): WhoopApiSleep {
  return {
    id,
    cycle_id: cycleId,
    start: new Date(end.getTime() - 8.5 * H).toISOString(),
    end: end.toISOString(),
    nap: o.nap ?? false,
    score_state: "SCORED",
    score: {
      stage_summary: { total_light_sleep_time_milli: 4 * H, total_slow_wave_sleep_time_milli: 2 * H, total_rem_sleep_time_milli: 2 * H },
      sleep_needed: { baseline_milli: 8 * H, need_from_sleep_debt_milli: 0, need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 },
      sleep_performance_percentage: 95,
    },
  };
}

function whoopRecoveryApi(sleepId: string, cycleId: number, pct: number): WhoopApiRecovery {
  return {
    cycle_id: cycleId,
    sleep_id: sleepId,
    score_state: "SCORED",
    score: { user_calibrating: false, recovery_score: pct, resting_heart_rate: 52, hrv_rmssd_milli: 88.5 },
  };
}

const putSleeps = (user: number, body: { sleeps: WhoopApiSleep[]; recoveries: WhoopApiRecovery[] }) =>
  control(`sleeps?user=${user}`, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

/** Сколько запросов этого пользователя фейк получил на путь с таким префиксом. */
async function fakeRequests(user: number, path: string): Promise<number> {
  const res = await control(`requests?user=${user}&path=${encodeURIComponent(path)}`);
  return ((await res.json()) as { count: number }).count;
}

test("история снов при подключении", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = presetWhoopUser();
  const now = Date.now();
  const a = randomUUID();
  const b = randomUUID();
  await putSleeps(whoopId, {
    sleeps: [
      whoopSleepApi(a, whoopId + 1, new Date(now - 30 * H)),
      whoopSleepApi(b, whoopId + 2, new Date(now - 6 * H)),
      whoopSleepApi(randomUUID(), whoopId + 3, new Date(now - 3 * H), { nap: true }),
    ],
    recoveries: [whoopRecoveryApi(a, whoopId + 1, 82), whoopRecoveryApi(b, whoopId + 2, 41)],
  });
  await reuseNext(whoopId);
  await connectWhoop(page);
  await expect(page).toHaveURL(/\/devices\?whoop=connected$/);

  await expect.poll(() => whoopSleepCount(login)).toBe(2);
  await expect.poll(async () => (await whoopSleepRow(login, a))?.recoveryPct).toBe(82);
  expect((await whoopSleepRow(login, b))?.recoveryPct).toBe(41);
  expect((await whoopSleepRow(login, a))?.sleepMs).toBe(8 * H);
});

test("старое подключение не ходит за снами", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  const sleepId = randomUUID();
  await putSleeps(whoopId, { sleeps: [whoopSleepApi(sleepId, whoopId + 1, new Date(Date.now() - 2 * H))], recoveries: [whoopRecoveryApi(sleepId, whoopId + 1, 70)] });
  await setWhoopScopes(login, "read:workout read:profile offline");
  const sleepBefore = await fakeRequests(whoopId, "/v2/activity/sleep");
  const recoveryBefore = await fakeRequests(whoopId, "/v2/recovery");
  const cycleBefore = await fakeRequests(whoopId, "/v2/cycle");

  for (const type of ["sleep.updated", "recovery.updated"]) {
    expect((await sendWhoopWebhook(page.request, { user_id: whoopId, id: sleepId, type, trace_id: randomUUID() })).status()).toBe(204);
  }
  await page.waitForTimeout(1500);
  expect(await fakeRequests(whoopId, "/v2/activity/sleep")).toBe(sleepBefore);
  expect(await fakeRequests(whoopId, "/v2/recovery")).toBe(recoveryBefore);
  expect(await fakeRequests(whoopId, "/v2/cycle")).toBe(cycleBefore);
  expect(await whoopSleepCount(login)).toBe(0);
  expect(await whoopNeedsReauth(login)).toBe(false);
});

test("sleep.updated добавляет сон", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  const sleepId = randomUUID();
  await putSleeps(whoopId, { sleeps: [whoopSleepApi(sleepId, whoopId + 1, new Date(Date.now() - 2 * H))], recoveries: [whoopRecoveryApi(sleepId, whoopId + 1, 64)] });
  expect((await sendWhoopWebhook(page.request, { user_id: whoopId, id: sleepId, type: "sleep.updated", trace_id: randomUUID() })).status()).toBe(204);
  await expect.poll(() => whoopSleepCount(login)).toBe(1);
  // сон пришёл без восстановления — его подтягивает recovery.updated
  expect((await whoopSleepRow(login, sleepId))?.sleepMs).toBe(8 * H);
});

test("recovery.updated раньше сна", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  const sleepId = randomUUID();
  await putSleeps(whoopId, { sleeps: [whoopSleepApi(sleepId, whoopId + 1, new Date(Date.now() - 2 * H))], recoveries: [whoopRecoveryApi(sleepId, whoopId + 1, 77)] });
  expect(await whoopSleepCount(login)).toBe(0);

  expect((await sendWhoopWebhook(page.request, { user_id: whoopId, id: sleepId, type: "recovery.updated", trace_id: randomUUID() })).status()).toBe(204);
  await expect.poll(() => whoopSleepCount(login)).toBe(1);
  await expect.poll(async () => (await whoopSleepRow(login, sleepId))?.recoveryPct).toBe(77);
});

test("sleep.deleted удаляет сон", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  const sleepId = await insertWhoopSleep(login, { end: new Date(Date.now() - 2 * H) });
  expect(await whoopSleepCount(login)).toBe(1);
  expect((await sendWhoopWebhook(page.request, { user_id: whoopId, id: sleepId, type: "sleep.deleted", trace_id: randomUUID() })).status()).toBe(204);
  await expect.poll(() => whoopSleepCount(login)).toBe(0);
});

test("recovery.deleted очищает восстановление, сон остаётся", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  const sleepId = await insertWhoopSleep(login, { end: new Date(Date.now() - 2 * H), recoveryPct: 70 });
  expect((await whoopSleepRow(login, sleepId))?.recoveryPct).toBe(70);
  expect((await sendWhoopWebhook(page.request, { user_id: whoopId, id: sleepId, type: "recovery.deleted", trace_id: randomUUID() })).status()).toBe(204);
  await expect.poll(async () => (await whoopSleepRow(login, sleepId))?.recoveryPct).toBeNull();
  const row = await whoopSleepRow(login, sleepId);
  expect(row).not.toBeNull();
  expect(row?.restingHr).toBeNull();
  expect(row?.hrvMs).toBeNull();
});

// --- карточка «Восстановление» на дашборде ---

const recoveryCard = (page: Page) => page.getByRole("region", { name: "Восстановление WHOOP" });
/** Конец сна «сегодня» в поясе e2e: прогон стартует около 12:00 местного, час назад — то же утро. */
const sleptAt = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H);

test("плашка у старого подключения → «Разрешить» открывает согласие", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setWhoopScopes(login, "read:workout read:profile offline");

  await page.goto("/dashboard");
  await expect(recoveryCard(page)).toContainText("WHOOP может показывать сон и восстановление");
  await recoveryCard(page).getByRole("button", { name: "Разрешить" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("только вы");
  await expect(dialog.getByRole("link", { name: "Продолжить" })).toBeDisabled();
});

test("карточка: восстановление посчитано", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: 78, hrvMs: 58, restingHr: 52, sleepMs: 7 * H + 20 * 60_000, performancePct: 86 });

  await page.goto("/dashboard");
  const c = recoveryCard(page);
  await expect(c).toContainText("78 %");
  await expect(c).toContainText("58 мс");
  await expect(c).toContainText("52 уд/мин");
  await expect(c).toContainText("7 ч 20 мин · 86 %");
  await expect(c).toContainText("можно тяжёлую тренировку");
});

test("карточка: WHOOP считает", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: null, sleepMs: 7 * H + 20 * 60_000 });

  await page.goto("/dashboard");
  await expect(recoveryCard(page)).toContainText("WHOOP считает…");
  await expect(recoveryCard(page)).toContainText("7 ч 20 мин");
});

test("карточка: за сегодня данных нет", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(25), recoveryPct: 64 });

  await page.goto("/dashboard");
  await expect(recoveryCard(page)).toContainText("Данных за сегодня пока нет · вчера: 64 %");
});

test("карточка: совет про HRV", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  for (let i = 1; i <= 7; i++) await insertWhoopSleep(login, { end: sleptAt(1 + 24 * i), recoveryPct: 70, hrvMs: 50 });
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: 70, hrvMs: 40 });

  await page.goto("/dashboard");
  await expect(recoveryCard(page)).toContainText("HRV ниже твоей нормы");
});

test("карточка: «Обновить» догружает сон, повтор — ограничение", async ({ page }) => {
  const { login } = await flaggedUser(page);
  const whoopId = await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(25), recoveryPct: 64 });
  const sleepId = randomUUID();
  await putSleeps(whoopId, { sleeps: [whoopSleepApi(sleepId, whoopId + 1, sleptAt(1))], recoveries: [whoopRecoveryApi(sleepId, whoopId + 1, 78)] });
  await resetWhoopSync(login);

  await page.goto("/dashboard");
  await expect(recoveryCard(page)).toContainText("Данных за сегодня пока нет");
  await recoveryCard(page).getByRole("button", { name: "Обновить" }).click();
  await expect(recoveryCard(page)).toContainText("78 %");
  await expect(recoveryCard(page)).toContainText("52 уд/мин");

  await recoveryCard(page).getByRole("button", { name: "Обновить" }).click();
  await expect(page.getByText("Обновить можно через минуту")).toBeVisible();
});

// --- зона на экране тренировки и «Облегчить» ---

const SQUAT = "Приседания со штангой";
const LEG_PRESS = "Жим ногами";
const zoneLine = (page: Page) => page.getByRole("region", { name: "Восстановление WHOOP" });
/** Дата в поясе e2e через n дней, «YYYY-MM-DD». */
const localDate = (n: number) => new Date(Date.now() + E2E_TZ_OFFSET * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

/** Три одинаковые тренировки с жимом ногами 100 кг — подсказка «Пора увеличить вес». */
const seedLegPress = (login: string) =>
  seedWorkouts(login, LEG_PRESS, [
    { weight: 100, reps: 10, sets: 3 },
    { weight: 100, reps: 10, sets: 3 },
    { weight: 100, reps: 10, sets: 3 },
  ], 4);

test("тренировка: красная зона — строка, «Облегчить» не трогает задание тренера, «Вернуть»", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: 21 });
  await seedLegPress(login);
  // Шаблон тренера: присед с заданием 60 кг и жим ногами без задания (вес — как в прошлый раз)
  const coach = `e2e_whoopcoach_${randomUUID().slice(0, 8)}`;
  await createUserRow(coach);
  await enableCoach(coach, `wc_${randomUUID().slice(0, 8)}`);
  const templateId = await coachTemplate(coach, "Ноги — база");
  await linkCoach(coach, login);
  await coachTarget(login, templateId, SQUAT, { weight: 60 });
  await coachAssignOnce(coach, login, templateId, "Ноги — база", localDate(2));

  await page.goto("/training");
  await expect(zoneLine(page)).toContainText("Восстановление 21 % — лёгкий день");
  await expect(zoneLine(page).getByRole("button", { name: "Облегчить" })).toHaveCount(0);
  await page.getByRole("region", { name: "От тренера" }).getByRole("button", { name: "Начать «Ноги — база»" }).click();

  const squat = page.getByRole("region", { name: SQUAT });
  const press = page.getByRole("region", { name: LEG_PRESS });
  await expect(zoneLine(page)).toContainText("Восстановление 21 % — лёгкий день");
  await expect(press.getByLabel("Вес, подход 1")).toHaveValue("100");
  await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("60");
  // Красная зона — как «устал»: прибавку не предлагаем
  await expect(press.getByTestId("progression-hint")).toHaveCount(0);

  await zoneLine(page).getByRole("button", { name: "Облегчить" }).click();
  for (let i = 1; i <= 3; i++) await expect(press.getByLabel(`Вес, подход ${i}`)).toHaveValue("90");
  await expect(squat.getByLabel("Вес, подход 1")).toHaveValue("60");
  await expect(zoneLine(page).getByRole("button", { name: "Облегчить" })).toHaveCount(0);

  await expect(page.getByText("Облегчено")).toBeVisible();
  await page.getByRole("button", { name: "Вернуть" }).click();
  for (let i = 1; i <= 3; i++) await expect(press.getByLabel(`Вес, подход ${i}`)).toHaveValue("100");

  // Один раз за тренировку — и после перезагрузки
  await expect(page.getByTestId("save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(zoneLine(page)).toBeVisible();
  await expect(zoneLine(page).getByRole("button", { name: "Облегчить" })).toHaveCount(0);
});

test("тренировка: зелёная зона — подсказка прибавки видна, «Облегчить» нет", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: 80 });
  await seedLegPress(login);

  await page.goto("/training");
  await expect(zoneLine(page)).toContainText("Восстановление 80 % — можно тяжело");
  await page.getByRole("button", { name: /Повторить «Seed»/ }).click();
  const press = page.getByRole("region", { name: LEG_PRESS });
  await expect(press.getByTestId("progression-hint")).toHaveText("Пора увеличить вес: 100 → 102,5 кг");
  await expect(zoneLine(page)).toContainText("80 %");
  await expect(zoneLine(page).getByRole("button", { name: "Облегчить" })).toHaveCount(0);
});

test("тренировка: жёлтая зона — держи веса, подсказки прибавки нет, «Облегчить» нет", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: 50 });
  await seedLegPress(login);

  await page.goto("/training");
  await expect(zoneLine(page)).toContainText("Восстановление 50 % — держи текущие веса");
  await page.getByRole("button", { name: /Повторить «Seed»/ }).click();
  const press = page.getByRole("region", { name: LEG_PRESS });
  await expect(press.getByLabel("Вес, подход 1")).toHaveValue("100");
  await expect(zoneLine(page)).toContainText("Восстановление 50 % — держи текущие веса");
  await expect(press.getByTestId("progression-hint")).toHaveCount(0);
  await expect(zoneLine(page).getByRole("button", { name: "Облегчить" })).toHaveCount(0);
});

test("тренировка: красная зона, но в чек-ине «Отлично» — подсказка прибавки снова видна", async ({ page }) => {
  const { login } = await flaggedUser(page);
  await addFlagUser("smart_coach", login);
  await connectWith(page, login, []);
  await setTimeZone(login);
  await insertWhoopSleep(login, { end: sleptAt(1), recoveryPct: 21 });
  await seedLegPress(login);

  await page.goto("/training");
  await page.getByRole("button", { name: /Повторить «Seed»/ }).click();
  const press = page.getByRole("region", { name: LEG_PRESS });
  await expect(press.getByTestId("progression-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Начать", exact: true }).click();
  // Зона не отвечает за пользователя: чек-ин всё равно спрашивает, явный выбор важнее зоны
  const checkin = page.getByRole("region", { name: "Как ты сегодня?" });
  await checkin.getByRole("button", { name: "Отлично" }).click();
  await expect(press.getByTestId("progression-hint")).toHaveText("Пора увеличить вес: 100 → 102,5 кг");
});
