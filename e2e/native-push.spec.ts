import { expect, test, type Page } from "@playwright/test";
import { addFlagUser, addSubscription, withDb } from "./db";
import { registerUser } from "./helpers";
import { mockNativeApp } from "./native-mock";
import { startPushService } from "./push-server";

// Android-приложение (спека 2026-10-25-native-push-ntfy, этап 2): нативную часть подменяет mockNativeApp, «ntfy» —
// фейковый push-сервис на 127.0.0.1 (NTFY_URL сервера e2e — https://127.0.0.1). Мобильный проект эмулирует браузер,
// а не приложение, — только desktop. Флаг native_app — на пользователя, поэтому параллельно.
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Приложение мокается одинаково на любом экране");
});

const rows = (endpoint: string) =>
  withDb(async (db) => (await db.query<{ kind: string; appVersion: string | null }>(`select kind, "appVersion" from "PushSubscription" where endpoint = $1`, [endpoint])).rows);

const card = (page: Page) => page.getByRole("region", { name: "Push на этом устройстве" });

test("app: enabling push saves a UNIFIEDPUSH subscription and delivers a push", async ({ page }) => {
  const push = await startPushService();
  try {
    await mockNativeApp(page, { register: push });
    const { login } = await registerUser(page);
    await addFlagUser("native_app", login);
    await page.goto("/settings");
    await card(page).getByRole("button", { name: "Включить push" }).click();
    await expect(card(page).getByTestId("push-status")).toHaveText("Push включён на этом устройстве.");
    expect(await rows(push.endpoint)).toEqual([{ kind: "UNIFIEDPUSH", appVersion: "1.0.0" }]);
    await card(page).getByRole("button", { name: "Отправить тестовое" }).click();
    await expect.poll(() => push.received.length).toBe(1);
    await expect(page.getByText("Android 1.0.0 (play)")).toBeVisible();
  } finally {
    await push.close();
  }
});

test("app: ntfy on a foreign server — hint, nothing saved", async ({ page }) => {
  const endpoint = "https://ntfy.sh/upAbcdefghijkl";
  await mockNativeApp(page, { register: { endpoint, p256dh: "p", auth: "a" } });
  const { login } = await registerUser(page);
  await addFlagUser("native_app", login);
  await page.goto("/settings");
  await card(page).getByRole("button", { name: "Включить push" }).click();
  await expect(card(page).getByTestId("push-status")).toContainText("В ntfy выбран чужой сервер");
  await expect(card(page).getByText("https://127.0.0.1")).toBeVisible();
  expect(await rows(endpoint)).toEqual([]);
  // Регистрация на чужом сервере снята: после смены сервера в ntfy «Включить» получит новый адрес, а не прежний
  expect(await page.evaluate(() => (window as unknown as { __heroPush: { unregisterCalls: number } }).__heroPush.unregisterCalls)).toBe(1);
});

test("app: no distributor — install hint", async ({ page }) => {
  const endpoint = "https://127.0.0.1/upNoDistributor1";
  await mockNativeApp(page, { distributor: false, register: { endpoint, p256dh: "p", auth: "a" } });
  const { login } = await registerUser(page);
  await addFlagUser("native_app", login);
  await page.goto("/settings");
  await expect(card(page).getByTestId("push-status")).toContainText("Установите его");
  await expect(card(page).getByRole("link", { name: "ntfy в RuStore" })).toBeVisible();
  expect(await rows(endpoint)).toEqual([]);
});

test("app: without the native_app flag nothing is saved", async ({ page }) => {
  const push = await startPushService();
  try {
    await mockNativeApp(page, { register: push });
    await registerUser(page);
    await page.goto("/settings");
    await card(page).getByRole("button", { name: "Включить push" }).click();
    await expect(card(page).getByTestId("push-status")).toHaveText("Push на этом устройстве выключен.");
    expect(await rows(push.endpoint)).toEqual([]);
  } finally {
    await push.close();
  }
});

test("app: logout removes the subscription and unregisters", async ({ page }) => {
  const push = await startPushService();
  try {
    await mockNativeApp(page, { register: push });
    const { login } = await registerUser(page);
    await addFlagUser("native_app", login);
    await page.goto("/settings");
    await card(page).getByRole("button", { name: "Включить push" }).click();
    await expect.poll(async () => (await rows(push.endpoint)).length).toBe(1);
    await page.getByRole("button", { name: "Меню профиля" }).click();
    await page.getByRole("menuitem", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await rows(push.endpoint)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __heroPush: { unregisterCalls: number } }).__heroPush.unregisterCalls)).toBe(1);
  } finally {
    await push.close();
  }
});

test("app: dropped endpoint is removed on start", async ({ page }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addSubscription(login, push, "UNIFIEDPUSH");
    await mockNativeApp(page, { register: push, dropped: push.endpoint });
    await page.goto("/dashboard");
    await expect.poll(async () => (await rows(push.endpoint)).length).toBe(0);
  } finally {
    await push.close();
  }
});

test("app: ntfy removed — the saved subscription is dropped, not re-saved", async ({ page }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addFlagUser("native_app", login);
    await addSubscription(login, push, "UNIFIEDPUSH");
    await mockNativeApp(page, { distributor: false, saved: push, register: push });
    await page.goto("/settings");
    await expect(card(page).getByTestId("push-status")).toContainText("Установите его");
    await expect.poll(async () => (await rows(push.endpoint)).length).toBe(0);
    await expect(card(page).getByRole("button", { name: "Выключить на этом устройстве" })).toHaveCount(0);
  } finally {
    await push.close();
  }
});

test("app: undecryptable push — re-registers on start and saves the new endpoint", async ({ page }) => {
  const push = await startPushService();
  try {
    const { login } = await registerUser(page);
    await addFlagUser("native_app", login);
    await mockNativeApp(page, { permission: "granted", saved: push, register: push, reregister: true });
    await page.goto("/settings");
    await expect(card(page).getByTestId("push-status")).toHaveText("Push включён на этом устройстве.");
    expect(await page.evaluate(() => (window as unknown as { __heroPush: { registerCalls: number } }).__heroPush.registerCalls)).toBe(1);
    expect(await rows(push.endpoint)).toEqual([{ kind: "UNIFIEDPUSH", appVersion: "1.0.0" }]);
  } finally {
    await push.close();
  }
});

test("browser: no native hints", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  await expect(card(page)).toBeVisible();
  await expect(card(page)).not.toContainText("ntfy");
  await expect(page.getByText(/Android \d/)).toHaveCount(0);
});

test("assetlinks.json is public JSON", async ({ request }) => {
  const res = await request.get("/.well-known/assetlinks.json", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  expect(Array.isArray(await res.json())).toBe(true);
});
