import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, errorGroupByMessage, insertErrorGroup, linkTelegram, makeAdmin, resolveErrorGroup } from "./db";
import { registerUser } from "./helpers";
import { TELEGRAM_FAKE_URL } from "./telegram-server";

/** Метка без цифр и hex: отпечаток вырезает числа и id, а сообщение должно быть уникальным на прогон. */
const tag = () => Array.from({ length: 10 }, () => "ghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 20)]).join("");

/** Необработанная ошибка в браузере — её ловит ErrorReporter. */
const throwInBrowser = (page: Page, message: string, type = "Error") =>
  page.evaluate(([m, t]) => {
    const Ctor = t === "TypeError" ? TypeError : Error;
    setTimeout(() => {
      throw new Ctor(m);
    });
  }, [message, type]);

const group = async (message: string) => (await errorGroupByMessage(message))[0];

/** Бросать, пока отчёт не дойдёт: слушатель вешается после гидратации; на странице сообщение уходит один раз. */
async function reported(page: Page, message: string, count: number) {
  await expect(async () => {
    await throwInBrowser(page, message);
    expect((await group(message))?.count).toBe(count);
  }).toPass({ timeout: 15_000 });
}

// makeAdmin переименовывает глобального админа — по очереди и только на desktop
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Админ один на прогон");
});

test("admin sees open groups, resolves and reopens", async ({ page }) => {
  const message = `e2e admin boom ${Date.now()}`;
  const id = await insertErrorGroup({ message, source: "SERVER", count: 3 });
  const me = await registerUser(page);
  await makeAdmin(me.login);
  expect(E2E_ADMIN).toBeTruthy();

  await page.goto("/admin/errors");
  const row = page.getByRole("link", { name: new RegExp(message) });
  await expect(row).toContainText("Сервер");
  await expect(row).toContainText("3");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/admin/errors/${id}$`));
  await expect(page.getByText("at e2e (/app/lib/e2e.ts:1:1)")).toBeVisible();

  await page.getByRole("button", { name: "Решено" }).click();
  await expect(page.getByRole("button", { name: "Открыть снова" })).toBeVisible();
  await page.goto("/admin/errors");
  await expect(page.getByRole("link", { name: new RegExp(message) })).toHaveCount(0);
  await page.goto("/admin/errors?tab=resolved");
  await expect(page.getByRole("link", { name: new RegExp(message) })).toBeVisible();

  await page.goto(`/admin/errors/${id}`);
  await page.getByRole("button", { name: "Открыть снова" }).click();
  await expect(page.getByRole("button", { name: "Решено" })).toBeVisible();
  await page.goto("/admin/errors");
  await expect(page.getByRole("link", { name: new RegExp(message) })).toBeVisible();
});

test("non-admin gets 404 on error pages", async ({ page }) => {
  const id = await insertErrorGroup({ message: "e2e hidden", source: "CLIENT", count: 1 });
  await registerUser(page);
  expect((await page.goto("/admin/errors"))?.status()).toBe(404);
  expect((await page.goto(`/admin/errors/${id}`))?.status()).toBe(404);
});

test("browser error is grouped and a repeat reopens a resolved group", async ({ page }) => {
  const message = `e2e browser boom ${tag()}`;
  await registerUser(page);
  await page.goto("/dashboard");
  await reported(page, message, 1);
  expect((await group(message)).source).toBe("CLIENT");
  // Повтор на той же странице не уходит (одно сообщение — один раз)
  await throwInBrowser(page, message);
  await page.waitForTimeout(500);
  expect((await group(message)).count).toBe(1);
  // После перезагрузки — второй отчёт
  await page.reload();
  await reported(page, message, 2);

  await resolveErrorGroup(message);
  await page.reload();
  await reported(page, message, 3);
  expect((await group(message)).resolved).toBe(false);
  expect(await errorGroupByMessage(message)).toHaveLength(1);
});

test("noise is dropped", async ({ page }) => {
  const noise = `Failed to fetch ${tag()}`;
  const real = `e2e real ${tag()}`;
  await registerUser(page);
  await page.goto("/dashboard");
  await reported(page, real, 1);
  await throwInBrowser(page, noise, "TypeError");
  await page.waitForTimeout(500);
  expect(await errorGroupByMessage(`TypeError: ${noise}`)).toHaveLength(0);
});

test("server error: recorded once with a Telegram alert to the admin; a flood keeps 50 events", async ({ page, request }) => {
  const me = await registerUser(page);
  await makeAdmin(me.login);
  const chat = String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  await linkTelegram(E2E_ADMIN, chat);

  const t = tag();
  const message = `e2e server boom ${t}`;
  expect((await request.get(`/api/e2e/boom?tag=${t}`)).status()).toBe(500);
  await expect.poll(async () => (await group(message))?.source).toBe("SERVER");
  await expect
    .poll(async () => {
      const calls = (await (await fetch(`${TELEGRAM_FAKE_URL}/calls?chat_id=${chat}`)).json()) as { method: string; params: { text?: string } }[];
      return calls.filter((c) => c.method === "sendMessage" && c.params.text?.includes(message)).map((c) => c.params.text?.split("\n")[0]);
    })
    .toEqual(["🔴 Новая ошибка"]);

  for (let i = 0; i < 59; i++) await request.get(`/api/e2e/boom?tag=${t}`);
  await expect.poll(async () => (await group(message))?.count).toBe(60);
  expect((await group(message)).events).toBe(50);
});

test("error boundary: a crashed page shows a friendly screen, recorded once as a server error", async ({ page }) => {
  const t = tag();
  await registerUser(page);
  await page.goto(`/e2e-boom?tag=${t}`);
  await expect(page.getByText("Что-то пошло не так")).toBeVisible();
  await expect(page.getByRole("button", { name: "Обновить" })).toBeVisible();
  const message = `e2e page boom ${t}`;
  await expect.poll(async () => (await group(message))?.source).toBe("SERVER");
  await page.waitForTimeout(1000); // браузерный отчёт (если бы ушёл) успел бы дойти
  const all = await errorGroupByMessage(message);
  expect(all).toHaveLength(1);
});

test("intake guards: foreign origin, oversized body", async ({ request, baseURL }) => {
  const evil = await request.post("/api/errors", { headers: { Origin: "https://evil.example" }, data: { message: "x" } });
  expect(evil.status()).toBe(403);
  const big = await request.post("/api/errors", { headers: { Origin: baseURL! }, data: { message: "x", stack: "y".repeat(9000) } });
  expect(big.status()).toBe(413);
  const ok = await request.post("/api/errors", { headers: { Origin: baseURL! }, data: { message: `e2e intake ${tag()}` } });
  expect(ok.status()).toBe(204);
});
