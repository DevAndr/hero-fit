import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { telegramChat, telegramToken } from "./db";
import { registerUser } from "./helpers";
import { TELEGRAM_FAKE_URL } from "./telegram-server";

const SECRET = "e2e-telegram-secret-0123456789abcdef";

type Call = { method: string; params: { chat_id: number | string; text?: string; parse_mode?: string; reply_markup?: unknown } };

/** Уникальный chat id на тест: фейковый Bot API общий для всех воркеров. */
const newChat = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));

let updateId = 0;
async function tgUpdate(request: APIRequestContext, chatId: string, text: string, { secret = SECRET as string | null, type = "private" } = {}) {
  return request.post("/api/telegram/webhook", {
    headers: secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {},
    data: { update_id: ++updateId, message: { message_id: 1, chat: { id: Number(chatId), type }, from: { id: Number(chatId), username: "hero_tg" }, text } },
  });
}

async function tgCalls(chatId: string): Promise<Call[]> {
  const res = await fetch(`${TELEGRAM_FAKE_URL}/calls?chat_id=${chatId}`);
  return (await res.json()) as Call[];
}

const replies = async (chatId: string) => (await tgCalls(chatId)).filter((c) => c.method === "sendMessage").map((c) => c.params.text ?? "");

async function startLink(page: Page) {
  // Настоящий t.me не открываем — достаточно, что вкладка ушла на ссылку бота
  await page.context().route("https://t.me/**", (route) => route.fulfill({ body: "telegram" }));
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Telegram" });
  const popup = page.waitForEvent("popup");
  await card.getByRole("button", { name: "Подключить" }).click();
  const tab = await popup;
  await tab.waitForURL(/^https:\/\/t\.me\/hero_fit_e2e_bot\?start=[A-Za-z0-9_-]{32}$/);
  await tab.close();
  return card;
}

test("link via /start token", async ({ page, request }) => {
  const { login } = await registerUser(page);
  const card = await startLink(page);
  const token = await telegramToken(login);
  expect(token).toBeTruthy();

  const chat = newChat();
  expect((await tgUpdate(request, chat, `/start ${token}`)).status()).toBe(200);
  expect((await replies(chat))[0]).toMatch(/^Готово, .+! Сюда будут приходить уведомления Hero Fit$/);
  expect(await telegramChat(login)).toBe(chat);

  await page.reload();
  await expect(card.getByText("Подключён @hero_tg")).toBeVisible();
  await expect(card.getByRole("switch", { name: "Присылать в Telegram" })).toBeChecked();
});

test("token is single-use; concurrent starts link once", async ({ page, request }) => {
  const { login } = await registerUser(page);
  await startLink(page);
  const token = await telegramToken(login);
  const [a, b] = [newChat(), newChat()];

  await Promise.all([tgUpdate(request, a, `/start ${token}`), tgUpdate(request, b, `/start ${token}`)]);
  const texts = [...(await replies(a)), ...(await replies(b))];
  expect(texts.filter((t) => t.startsWith("Готово,"))).toHaveLength(1);
  expect(texts.filter((t) => t.startsWith("Ссылка устарела"))).toHaveLength(1);
  expect([a, b]).toContain(await telegramChat(login));
});

test("chat moves to the new account", async ({ browser, request }) => {
  const chat = newChat();
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const { login: a } = await registerUser(pageA);
  await startLink(pageA);
  await tgUpdate(request, chat, `/start ${await telegramToken(a)}`);
  expect(await telegramChat(a)).toBe(chat);

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const { login: b } = await registerUser(pageB);
  await startLink(pageB);
  await tgUpdate(request, chat, `/start ${await telegramToken(b)}`);
  expect(await telegramChat(a)).toBeNull();
  expect(await telegramChat(b)).toBe(chat);
  await ctxA.close();
  await ctxB.close();
});

test("/stop unlinks", async ({ page, request }) => {
  const { login } = await registerUser(page);
  const card = await startLink(page);
  const chat = newChat();
  await tgUpdate(request, chat, `/start ${await telegramToken(login)}`);

  await tgUpdate(request, chat, "/stop");
  expect((await replies(chat)).at(-1)).toBe("Уведомления отключены");
  expect(await telegramChat(login)).toBeNull();
  await page.reload();
  await expect(card.getByRole("button", { name: "Подключить" })).toBeVisible();
});

test("bot replies to bare /start, bad token and other text", async ({ request }) => {
  const chat = newChat();
  await tgUpdate(request, chat, "/start");
  await tgUpdate(request, chat, "/start nope");
  await tgUpdate(request, chat, "привет");
  expect(await replies(chat)).toEqual([
    "Привет! Это бот Hero Fit. Подключите уведомления в настройках приложения",
    "Ссылка устарела — нажмите «Подключить» в настройках ещё раз",
    "Я присылаю уведомления Hero Fit. Отключить — /stop",
  ]);
});

test("webhook rejects bad secret; ignores non-private and empty updates", async ({ request }) => {
  const chat = newChat();
  expect((await tgUpdate(request, chat, "/start", { secret: null })).status()).toBe(401);
  expect((await tgUpdate(request, chat, "/start", { secret: "wrong" })).status()).toBe(401);
  expect((await tgUpdate(request, chat, "/start x", { type: "group" })).status()).toBe(200);
  const empty = await request.post("/api/telegram/webhook", { headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET }, data: { update_id: 1 } });
  expect(empty.status()).toBe(200);
  expect(await tgCalls(chat)).toEqual([]);
});
