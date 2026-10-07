import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { userId, withDb } from "./db";
import { quickWorkout, registerUser } from "./helpers";
import { startPushService } from "./push-server";

const runTick = (request: APIRequestContext) =>
  request.get("/api/cron/notifications", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });

async function addSubscription(login: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  await withDb(async (db) => {
    await db.query(`insert into "PushSubscription" (id, "userId", endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)`, [
      randomUUID(),
      await userId(db, login),
      sub.endpoint,
      sub.p256dh,
      sub.auth,
    ]);
  });
}

/** Время — с часов Node (как у сервера), а не now() из БД: не зависим от рассинхрона часов Docker. */
async function setDueStreak(login: string, hoursAgo: number) {
  await withDb(async (db) => {
    await db.query(
      `update "User" set "currentStreak" = 4, "longestStreak" = 4, "lastStreakAt" = $2 where id = $1`,
      [await userId(db, login), new Date(Date.now() - hoursAgo * 3_600_000)],
    );
  });
}

test("PWA assets are public; cron endpoint requires the secret", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: "Hero Fit", display: "standalone" });

  const icon = await request.get("/pwa-icon/192");
  expect(icon.headers()["content-type"]).toBe("image/png");

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  expect((await request.get("/api/cron/notifications")).status()).toBe(401);
});

test("streak reminder: encrypted push delivered once, shown in the bell", async ({ page, request }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addSubscription(login, push);
    await setDueStreak(login, 45.5); // до дедлайна (48 ч) — 2,5 часа → «осталось 3 ч»

    await runTick(request);
    await expect.poll(() => push.received.length).toBe(1);
    const [msg] = push.received;
    expect(msg.payload).toMatchObject({
      type: "STREAK",
      title: "Не потеряй streak! 🔥",
      body: "Серия 4 — осталось 3 ч, чтобы её продлить.",
      url: "/training",
    });
    expect(String(msg.headers.authorization)).toMatch(/^vapid t=.+, k=.+/);
    expect(msg.headers["content-encoding"]).toBe("aes128gcm");

    // Повторный тик (и фоновый воркер) — без дубля
    await runTick(request);
    await page.waitForTimeout(6000);
    expect(push.received).toHaveLength(1);

    await page.reload();
    await expect(page.getByTestId("unread-count")).toHaveText("1");
    await page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(page.getByRole("menuitem", { name: /Не потеряй streak!/ })).toContainText("осталось 3 ч");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("unread-count")).toHaveCount(0);
  } finally {
    await push.close();
  }
});

test("background worker sends due rest push by itself; cancelled ones are not sent", async ({ page }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addSubscription(login, push);
    await withDb(async (db) => {
      const uid = await userId(db, login);
      await db.query(
        `insert into "ScheduledPush" (id, "userId", type, key, title, body, url, "sendAt")
         values ($1, $2, 'REST', $3, 'Отдых окончен 💪', 'Следующий подход: Жим', '/training', $4)`,
        [randomUUID(), uid, `rest:${uid}`, new Date(Date.now() - 1000)],
      );
      await db.query(
        `insert into "ScheduledPush" (id, "userId", type, title, body, "sendAt", "cancelledAt")
         values ($1, $2, 'REST', 'Отменён', '—', $3, $3)`,
        [randomUUID(), uid, new Date(Date.now() - 1000)],
      );
    });

    // Без вызова cron: фоновый воркер из instrumentation.ts тикает каждые 5 секунд.
    await expect.poll(() => push.received.length, { timeout: 15_000 }).toBe(1);
    expect(push.received[0].payload).toMatchObject({ type: "REST", title: "Отдых окончен 💪", tag: "hero-fit-rest" });
    expect(push.received[0].headers.urgency).toBe("high");
  } finally {
    await push.close();
  }
});

test("new achievement → push + feed entry", async ({ page, request }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addSubscription(login, push);
    await quickWorkout(page, "Шраги со штангой", Array.from({ length: 5 }, () => ({ weight: "60", reps: "10" })));

    await runTick(request);
    await expect.poll(() => push.received.map((r) => r.payload.title)).toContain("🏆 Сет-герой: Шраги со штангой");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(page.getByRole("menuitem", { name: /Сет-герой: Шраги со штангой/ })).toBeVisible();
  } finally {
    await push.close();
  }
});

test("settings: preferences persist; disabled streak reminders are not sent", async ({ page, request }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addSubscription(login, push);
    await page.goto("/settings");
    await expect(page.getByText("Устройств с push на аккаунте: 1")).toBeVisible();

    const streakSwitch = page.getByRole("switch", { name: "Не потеряй streak" });
    await expect(streakSwitch).toBeChecked();
    await streakSwitch.click();
    await expect(streakSwitch).not.toBeChecked();
    await expect
      .poll(() =>
        withDb(async (db) => (await db.query(`select "notifyStreak" from "User" where login = $1`, [login])).rows[0].notifyStreak),
      )
      .toBe(false);
    await page.reload();
    await expect(page.getByRole("switch", { name: "Не потеряй streak" })).not.toBeChecked();

    await setDueStreak(login, 45.5);
    await runTick(request);
    await page.waitForTimeout(1500);
    expect(push.received).toHaveLength(0);
  } finally {
    await push.close();
  }
});

test("dead subscriptions (410 Gone) are removed", async ({ page, request }) => {
  const push = await startPushService({ status: 410 });
  try {
    const { login } = await registerUser(page);
    await addSubscription(login, push);
    await setDueStreak(login, 45.5);
    await runTick(request);
    await expect.poll(() => push.received.length).toBe(1);
    await expect
      .poll(() =>
        withDb(async (db) => (await db.query(`select count(*)::int c from "PushSubscription" where endpoint = $1`, [push.endpoint])).rows[0].c),
      )
      .toBe(0);
  } finally {
    await push.close();
  }
});
