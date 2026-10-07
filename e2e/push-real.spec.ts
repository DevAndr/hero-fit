import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { userId, withDb } from "./db";
import { registerUser } from "./helpers";

/**
 * Настоящий push через FCM: подписка в браузере → сервер → Google → service worker → уведомление.
 * Нужен интернет, поэтому только по запросу: E2E_REAL_PUSH=1 npm run test:e2e -- push-real
 * (обычный контекст Playwright — как инкогнито, где Chrome не поддерживает Push API, поэтому persistent-профиль).
 */
test.skip(!process.env.E2E_REAL_PUSH, "E2E_REAL_PUSH=1 — проверка с настоящим push-сервисом");
test.skip(({ isMobile }) => isMobile, "достаточно одного прогона");

const shownNotifications = (page: Page) =>
  page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title));

test("real push loop: subscribe, test push shown by SW, rest push scheduled/cancelled, logout forgets device", async ({
  baseURL,
}) => {
  test.setTimeout(120_000);
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "hf-push-")), {
    channel: "chromium",
    headless: true,
    baseURL,
    locale: "ru-RU",
  });
  await ctx.grantPermissions(["notifications"], { origin: baseURL });
  const page = await ctx.newPage();
  try {
    const { login } = await registerUser(page);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Включить push" }).click();
    // Первая регистрация браузера в FCM бывает долгой (замерено > 15 с)
    await expect(page.getByTestId("push-status")).toHaveText("Push включён на этом устройстве.", { timeout: 60_000 });
    await page.reload();
    await expect(page.getByText("Устройств с push на аккаунте: 1")).toBeVisible();

    // Сервер → FCM → service worker → системное уведомление
    await page.getByRole("button", { name: "Отправить тестовое" }).click();
    await expect(page.getByText("Тестовое уведомление отправлено")).toBeVisible();
    await expect.poll(() => shownNotifications(page), { timeout: 30_000 }).toContain("Hero Fit 💪");

    // Таймер отдыха планирует push на момент окончания и отменяет его по «Пропустить»
    await page.goto("/training");
    await page.getByRole("button", { name: /Пустая тренировка/ }).click();
    await page.getByRole("button", { name: "Добавить упражнение" }).click();
    await page.getByLabel("Поиск упражнения").fill("Шраги");
    await page.getByRole("dialog").getByRole("button", { name: /^Шраги со штангой/ }).click();
    await page.getByRole("button", { name: /^Добавить \(/ }).click();
    const block = page.getByRole("region", { name: "Шраги со штангой" });
    await block.getByLabel("Повторы, подход 1").fill("10");
    await block.getByRole("button", { name: "Подход 1 выполнен" }).click();
    await expect(page.getByRole("timer")).toBeVisible();

    const restRow = () =>
      withDb(async (db) => {
        const { rows } = await db.query(
          `select "sendAt", "sentAt", "cancelledAt" from "ScheduledPush" where key = $1`,
          [`rest:${await userId(db, login)}`],
        );
        return rows[0] as { sendAt: Date; sentAt: Date | null; cancelledAt: Date | null } | undefined;
      });
    await expect.poll(async () => Boolean((await restRow())?.sendAt)).toBe(true);
    expect((await restRow())!.cancelledAt).toBeNull();

    await page.getByRole("button", { name: "Пропустить отдых" }).click();
    await expect.poll(async () => Boolean((await restRow())?.cancelledAt)).toBe(true);

    // Выход отвязывает устройство: push этого аккаунта сюда больше не придут
    await page.getByRole("button", { name: "Меню профиля" }).click();
    await page.getByRole("menuitem", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const devices = await withDb(
      async (db) =>
        (await db.query(`select count(*)::int c from "PushSubscription" where "userId" = $1`, [await userId(db, login)]))
          .rows[0].c,
    );
    expect(devices).toBe(0);
  } finally {
    await ctx.close();
  }
});
