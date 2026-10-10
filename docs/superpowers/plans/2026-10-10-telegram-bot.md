# Telegram-бот: привязка и уведомления — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Человек подключает Telegram в `/settings`, и уведомления Hero Fit (кроме таймера отдыха) приходят сообщением от бота с кнопкой «Открыть».

**Architecture:** Бот без библиотек — `fetch` к Bot API (`lib/telegram/api.ts`). Входящие — webhook `POST /api/telegram/webhook` → `handleUpdate` (привязка по одноразовому токену из `/start <token>`, `/stop`); в разработке те же обновления даёт опрос `getUpdates`. Исходящие — второй канал в `processDuePushes` рядом с Web Push.

**Tech Stack:** Next.js 16 route handler и server actions, Prisma 7, Zod, Vitest, Playwright (второй `webServer` — фейковый Bot API).

**Spec:** `docs/superpowers/specs/2026-10-10-telegram-bot-design.md`

## Global Constraints

- Без `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME` интеграция выключена: блок в настройках скрыт, отправки нет, webhook → 404.
- `TELEGRAM_API_URL` по умолчанию `https://api.telegram.org`; запрос — `${TELEGRAM_API_URL}/bot${token}/${method}`, таймаут 10 с.
- Тип `REST` в Telegram никогда не уходит.
- Токен привязки: base64url, 32 символа, живёт 15 минут, одноразовый.
- Тексты бота (дословно): привязка — «Готово, {имя}! Сюда будут приходить уведомления Hero Fit»; плохой токен — «Ссылка устарела — нажмите «Подключить» в настройках ещё раз»; `/stop` — «Уведомления отключены»; `/start` без токена — «Привет! Это бот Hero Fit. Подключите уведомления в настройках приложения»; прочий текст — «Я присылаю уведомления Hero Fit. Отключить — /stop». `{имя}` — ник, иначе логин, экранированный.
- Кнопка сообщения — «Открыть»; без кнопки при непубличном `APP_URL` (тот же критерий, что `isIndexable` по адресу: не https или localhost/127.0.0.1).
- `BigInt` (`telegramChatId`) никогда не уходит в клиентские компоненты и JSON.
- Тексты интерфейса без рода, как в остальном приложении.

## Review Focus

1. Два одновременных `/start` с одним токеном — привязывается ровно один раз (условный `updateMany` по `usedAt: null`). Тест — Task 2.
2. Отключил Telegram, а в очереди уже лежит запись — она не уходит: `chatId` и `notifyTelegram` читаются в момент отправки, не при постановке. Тест — Task 3.
3. Ник с `<`/`&` — ни ответ бота, ни уведомление не ломают HTML-разметку. Тест — Task 1 (`telegramMessage`, `escapeHtml`).
4. Обновление из группы/канала или без текста — игнорируется с 200, а не 500. Тест — Task 2.
5. Интеграция выключена (нет токена) — webhook 404, блок настроек не рендерится, `processDuePushes` не ходит в сеть. Тест — Task 1 (unit на `telegramEnabled`) и Task 2 (route при пустом env не проверить в e2e — покрыть unit на `webhookStatus`).

---

### Task 1: Схема, окружение и чистые функции

**Files:**
- Modify: `prisma/schema.prisma` (поля `User`, модель `TelegramLinkToken`), новая миграция `telegram_bot` (`npx prisma migrate dev --name telegram_bot`)
- Modify: `lib/env.ts`, `.env.example`
- Create: `lib/telegram/format.ts`, `lib/telegram/format.test.ts`, `lib/telegram/api.ts`

**Interfaces:**
- Produces:
  - `escapeHtml(s: string): string` — `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`.
  - `telegramMessage(p: { title: string; body: string; url?: string | null }, appUrl: string): { text: string; parse_mode: "HTML"; reply_markup?: { inline_keyboard: { text: string; url: string }[][] } }`.
  - `publicHttps(appUrl: string): boolean` — https и хост не localhost/127.0.0.1.
  - `linkTokenStatus(t: { expiresAt: Date; usedAt: Date | null } | null, now: Date): "ok" | "expired" | "used" | "missing"` (used важнее expired).
  - `newLinkToken(): string` — `randomBytes(24).toString("base64url")` (32 символа).
  - `telegramEnabled(e: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_BOT_USERNAME?: string }): boolean`.
  - `webhookStatus(e, secretHeader: string | null): 404 | 401 | 200` — 404 при выключенной интеграции, 401 при несовпадении секрета.
  - `lib/telegram/api.ts` (server-only): `callBot<T>(method: string, params: object): Promise<{ ok: true; result: T } | { ok: false; status: number; description: string }>` — никогда не бросает (сеть/таймаут → `{ ok: false, status: 0 }`).
  - Env: `TELEGRAM_BOT_TOKEN?`, `TELEGRAM_BOT_USERNAME?`, `TELEGRAM_WEBHOOK_SECRET?` (refine: обязателен при токене), `TELEGRAM_API_URL` (url, default `https://api.telegram.org`), `TELEGRAM_POLLING` (`on|off`, default `off`).
  - Prisma: `User.telegramChatId BigInt? @unique`, `telegramUsername String?`, `telegramLinkedAt DateTime?`, `notifyTelegram Boolean @default(true)`; `TelegramLinkToken { token String @id; userId; expiresAt; usedAt DateTime?; createdAt @default(now()); user onDelete: Cascade; @@index([userId]) }`.

- [ ] **Step 1: Write failing tests** `lib/telegram/format.test.ts`:
  - `telegramMessage({ title: "Новый план", body: "От <Coach> & Co", url: "/calendar" }, "https://hero-fit.ru")` → `text === "<b>Новый план</b>\nОт &lt;Coach&gt; &amp; Co"`, `parse_mode === "HTML"`, `reply_markup.inline_keyboard === [[{ text: "Открыть", url: "https://hero-fit.ru/calendar" }]]`.
  - без `url` → кнопка на `https://hero-fit.ru/dashboard`.
  - `appUrl = "http://localhost:3123"` → `reply_markup` отсутствует.
  - `linkTokenStatus`: `null` → missing; `usedAt` задан (и истёк) → used; `expiresAt <= now` → expired; иначе ok.
  - `newLinkToken()` — длина 32, `/^[A-Za-z0-9_-]+$/`, два вызова различны.
  - `telegramEnabled({})` → false, с обоими полями → true; `webhookStatus({}, "x")` → 404; с токеном и секретом `s`: `"s"` → 200, `null`/`"t"` → 401.
- [ ] **Step 2:** `npx vitest run lib/telegram` — Expected: FAIL (модуль не найден).
- [ ] **Step 3:** Реализовать `format.ts` (без `server-only`, чистый), `api.ts` (`AbortSignal.timeout(10_000)`, POST JSON), env, схему и миграцию; `.env.example` — четыре переменные с комментарием «бот — @BotFather; секрет — любая строка 32+ символа».
- [ ] **Step 4:** `npx vitest run lib/telegram` и `npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(telegram): schema, env and message formatting`.

### Task 2: Привязка — webhook, `handleUpdate`, настройки, фейковый Bot API

**Files:**
- Create: `lib/telegram/updates.ts` (server-only), `lib/telegram/actions.ts` ("use server"), `lib/telegram/queries.ts`, `app/api/telegram/webhook/route.ts`, `components/notifications/telegram-settings.tsx`, `e2e/telegram-server.ts`, `e2e/telegram.spec.ts`
- Modify: `app/(app)/settings/page.tsx`, `playwright.config.ts` (второй `webServer`, env сервера), `e2e/db.ts`

**Interfaces:**
- Consumes: Task 1 (`linkTokenStatus`, `newLinkToken`, `escapeHtml`, `callBot`, `telegramEnabled`, `webhookStatus`).
- Produces:
  - `handleUpdate(update: unknown): Promise<void>` — разбирает только `message` с `chat.type === "private"` и строковым `text`; `/start <token>` → привязка; `/start` → приветствие; `/stop` → отвязка; иначе подсказка. Ответ — `callBot("sendMessage", { chat_id, text, parse_mode: "HTML" })`.
  - `linkChat(token: string, chat: { id: number; username?: string }, now: Date): Promise<{ status: "ok"; name: string } | { status: "expired" | "used" | "missing" }>` — в транзакции: `telegramLinkToken.updateMany({ where: { token, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })`, count 0 → статус по `linkTokenStatus`; затем `user.updateMany({ where: { telegramChatId: id, NOT: { id: userId } }, data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null } })`, затем запись пользователю.
  - `unlinkTelegram(where: { userId } | { chatId: bigint }): Promise<void>` — обнуляет три поля.
  - `createTelegramLinkAction(): Promise<{ url: string } | { error: string }>` — `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`; `unlinkTelegramAction(): Promise<void>`; `setTelegramNotifyAction(on: boolean): Promise<void>`.
  - `getTelegramStatus(userId): Promise<{ enabled: false } | { enabled: true; linked: boolean; username: string | null; notify: boolean }>` — без `chatId`.
  - `<TelegramCard status={…} />` — «Подключить» (открывает url в новой вкладке), после подключения — «Подключён @username» (или «Подключён»), переключатель (role `switch`) «Присылать в Telegram», «Отключить»; `visibilitychange` → `router.refresh()`. Заголовок карточки — «Telegram».
  - Route: `POST` — `webhookStatus(env, header)`; ≠ 200 → `new Response(null, { status })`; иначе `await handleUpdate(await req.json().catch(() => null))` в try/catch с логом и всегда 200.
  - Фейковый Bot API (`e2e/telegram-server.ts`, запуск `npx tsx e2e/telegram-server.ts`, порт `3124`, HTTP): `POST /bot<любой токен>/<method>` → записывает `{ method, params }`, отвечает `{ ok: true, result: { message_id: n } }`; если `params.chat_id` в списке заблокированных — `403 { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }`; служебные: `GET /calls?chat_id=` (JSON вызовов этого чата), `POST /block?chat_id=`, `GET /health`.
  - `playwright.config.ts`: `webServer` — массив; env Next-сервера дополнить `TELEGRAM_BOT_TOKEN: "e2e-token"`, `TELEGRAM_BOT_USERNAME: "hero_fit_e2e_bot"`, `TELEGRAM_WEBHOOK_SECRET: "e2e-telegram-secret"`, `TELEGRAM_API_URL: "http://localhost:3124"`.
  - `e2e/db.ts`: `telegramToken(login): Promise<string>` (последний токен пользователя), `telegramChat(login): Promise<string | null>` (chatId строкой); в `e2e/telegram.spec.ts` хелперы `tgUpdate(request, chatId, text, { secret? })` (POST в webhook с заголовком) и `tgCalls(chatId)`.

- [ ] **Step 1: Write failing e2e** `e2e/telegram.spec.ts` (chat id в тестах — уникальные, например `Date.now() + random`):
  - "link via /start token": регистрация → `/settings` → карточка «Telegram» → «Подключить» → в БД появился токен → `tgUpdate(chat, "/start " + token)` → 200 → `tgCalls(chat)` содержит `sendMessage` с текстом, начинающимся с «Готово,» → `page.reload()` → видно «Подключён», переключатель «Присылать в Telegram» включён.
  - "token is single-use; concurrent starts link once": два параллельных `tgUpdate` с одним токеном с двух chat id → ровно у одного чата ответ «Готово», у другого — «Ссылка устарела…»; `telegramChat(login)` равен одному из них.
  - "chat moves to the new account": чат привязан к A → B привязывает тот же chat id → `telegramChat(A) === null`, `telegramChat(B) === chat`.
  - "/stop unlinks": после привязки `/stop` → ответ «Уведомления отключены», `telegramChat` null, в настройках снова «Подключить».
  - "webhook rejects bad secret; ignores non-private": без заголовка и с неверным → 401; `{ message: { chat: { id, type: "group" }, text: "/start x" } }` и `{ update_id: 1 }` → 200, вызовов нет.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/telegram.spec.ts --project=desktop` — Expected: FAIL (нет карточки / 404 на webhook).
- [ ] **Step 3:** Реализовать файлы из Interfaces. В настройках карточка — сразу после `PushDeviceCard`, рендерится только при `status.enabled`.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run build && npx playwright test e2e/telegram.spec.ts` — Expected: PASS (desktop + mobile).
- [ ] **Step 5:** Commit `feat(telegram): link account via bot /start token`.

### Task 3: Отправка уведомлений в Telegram

**Files:**
- Create: `lib/telegram/send.ts` (server-only)
- Modify: `lib/notifications/service.ts` (`processDuePushes`), `e2e/telegram.spec.ts`, `e2e/db.ts`

**Interfaces:**
- Consumes: `telegramMessage`, `publicHttps` (Task 1), `callBot`, `unlinkTelegram` (Task 2), `env.APP_URL`.
- Produces: `sendTelegramToUser(userId: string, p: { type: NotificationType; title: string; body: string; url: string | null }): Promise<{ sent: boolean }>` — выход без запроса, если интеграция выключена, `type === "REST"`, нет `telegramChatId` или `notifyTelegram = false` (читать из БД в момент отправки); 403 → `unlinkTelegram({ chatId })`; прочие ошибки — `console.error("[telegram] send failed", status, description)`.
  - `processDuePushes`: `Promise.allSettled(due.flatMap((p) => [sendPushToUser(p.userId, p), sendTelegramToUser(p.userId, p)]))`.
  - `e2e/db.ts`: `linkTelegram(login, chatId: string)` — прямой SQL привязки (быстрая подготовка).

- [ ] **Step 1: Write failing e2e** в `e2e/telegram.spec.ts`:
  - "notifications arrive in Telegram": `linkTelegram(login, chat)` → подготовить и запустить напоминание о streak так же, как тест «streak reminder» в `e2e/notifications.spec.ts` (`setDueStreak`, `runTick`; вынести эти хелперы в `e2e/db.ts`/`e2e/helpers.ts`, если они локальны в spec) → `expect.poll(() => tgCalls(chat))` содержит `sendMessage` с `text === "<b>Не потеряй streak! 🔥</b>\n" + <ожидаемый body из того теста>` и `parse_mode: "HTML"`, без `reply_markup` (APP_URL — localhost). Повторный тик — по-прежнему один вызов.
  - "rest timer and opted-out users get nothing": привязать → вставить SQL в `ScheduledPush` запись `REST` с `sendAt = now()` и `STREAK` для пользователя с `notifyTelegram = false` (второй пользователь) → `runTick` → через 6 с ни одного `sendMessage` у обоих чатов.
  - "unlinked before send — not sent": привязать → вставить `STREAK` запись с `sendAt` в будущем (+3 с) → «Отключить» в настройках → дождаться sendAt, `runTick` → вызовов нет.
  - "blocked bot unlinks": привязать → `POST /block?chat_id=` → вызвать отправку (как в первом тесте) → `expect.poll(() => telegramChat(login)).toBeNull()`.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/telegram.spec.ts --project=desktop` — Expected: новые тесты FAIL (нет вызовов `sendMessage`).
- [ ] **Step 3:** Реализовать `sendTelegramToUser` и подключить в `processDuePushes`.
- [ ] **Step 4:** `npm test && npm run build && npx playwright test e2e/telegram.spec.ts e2e/notifications.spec.ts` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(telegram): deliver notifications via bot`.

### Task 4: Webhook-команда, опрос для разработки, приватность, документация

**Files:**
- Create: `scripts/telegram-webhook.ts`
- Modify: `package.json` (`"telegram:webhook": "tsx scripts/telegram-webhook.ts"`), `lib/notifications/worker.ts` (или `instrumentation.ts`), `app/(marketing)/privacy/page.tsx`, `deploy/README.md`, `deploy/` compose env (передать переменные Telegram в `app`), `CLAUDE.md`

**Interfaces:**
- Consumes: `callBot`, `handleUpdate`, `telegramEnabled`.
- Produces:
  - Скрипт: при выключенной интеграции — выход с сообщением; иначе `callBot("setWebhook", { url: absoluteUrl(APP_URL, "/api/telegram/webhook"), secret_token, allowed_updates: ["message"] })`, печать результата, ненулевой код при `ok: false`.
  - Опрос: при `TELEGRAM_POLLING === "on"` и включённой интеграции воркер один раз вызывает `deleteWebhook`, затем цикл `getUpdates({ offset, timeout: 25 })` → `handleUpdate` для каждого, `offset = update_id + 1`; ошибка — пауза 5 с. Не запускается при `NOTIFICATIONS_WORKER=off`.
  - `/privacy`: пункт «Telegram» по тексту спеки (ID и username для уведомлений; текст уведомлений передаётся Telegram FZ-LLC, ОАЭ — трансграничная передача; отключить — в настройках или командой /stop).

- [ ] **Step 1:** Реализовать скрипт, опрос, правки privacy и deploy.
- [ ] **Step 2:** `TELEGRAM_BOT_TOKEN= npm run telegram:webhook` — Expected: сообщение «интеграция выключена», код 0.
- [ ] **Step 3:** `CLAUDE.md`: строка про Telegram-бота (файлы, webhook + `npm run telegram:webhook`, `TELEGRAM_POLLING`, REST не уходит, e2e — фейковый Bot API на 3124 и хелперы); `deploy/README.md`: создать бота в @BotFather, переменные в `.env` сервера, регистрация webhook — `curl` на `setWebhook` с теми же параметрами, что у скрипта (в standalone-образе нет `tsx`), либо `npm run telegram:webhook` локально с боевыми env.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — Expected: всё зелёное.
- [ ] **Step 5:** Commit `feat(telegram): webhook setup script, dev polling, privacy and docs`.
