import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { WhoopApiWorkout } from "../lib/whoop/types";
import { addFlagUser, latestWorkout, seedWorkouts, whoopUserIdOf, whoopWorkoutCount } from "./db";
import { PASSWORD, registerUser } from "./helpers";
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

  await card(page).getByRole("button", { name: "Отключить WHOOP" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Данные WHOOP в Hero Fit удалятся");
  await confirm.getByRole("button", { name: "Отключить" }).click();
  await expect(card(page)).toContainText("Не подключён");
  expect(await whoopWorkoutCount(login)).toBe(0);
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
