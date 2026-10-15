# Мониторинг ошибок — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ошибки сервера и браузера пишутся в свою БД группами, админ видит их в `/admin/errors` и получает Telegram о новых и вернувшихся.

**Architecture:** чистые функции (`lib/errors/*`: отпечаток, шум, лимит, решение об оповещении, схема) → запись `recordError` (Prisma, транзакция) → два входа: `onRequestError` в `instrumentation.ts` и `POST /api/errors` от `ErrorReporter`/границ ошибок. Оповещение — `callBot` админам. Админка — серверные страницы с `requireAdmin`.

**Tech Stack:** Next.js 16 (App Router, `instrumentation.ts`), Prisma 7 + PostgreSQL, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-error-monitoring-design.md`

## Global Constraints

- Ветка `feat/error-monitoring` от `release/2026-11-ux`; в конце — `--no-ff` в релизную ветку.
- Персональные данные: только `userId`, путь **без query**, User-Agent, версия. Ни тела запроса, ни cookie, ни логина.
- Тело `/api/errors` ≤ 8 КБ; `message` ≤ 1000, `stack` ≤ 6000, `path` ≤ 300, `version` ≤ 30.
- Лимит приёма — 30 отчётов в минуту на ключ (`userId`, иначе IP).
- Событий на группу — не больше 50; хранение — 30 дней.
- Оповещение — не чаще раза в час на группу и не больше 20 в час всего.
- В браузере — не больше 10 отчётов за жизнь страницы, одно сообщение — один раз.
- Ошибка внутри мониторинга никогда не выбрасывается наружу — только `console.error`.
- Новая связь с `User` → проверить удаление аккаунта (`lib/account/*`, `e2e/account-data.spec.ts`); SQL новой миграции — проверить, что не удалены частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- Тексты интерфейса — по-русски, как в спеке.

## Review Focus

1. **Ошибка в самом мониторинге / БД недоступна** — запрос пользователя не должен падать или зависать из-за `recordError`/Telegram. Тест: `recordError` с отказавшим `db` не бросает (Task 2).
2. **Лавина одинаковых ошибок** (цикл рендера, 1000 пользователей) — одна группа, счётчик растёт, событий ≤ 50, одно оповещение. Тест: 60 записей одной ошибки → 50 событий, `count = 60` (Task 2); `shouldAlert` второй раз в течение часа — `false` (Task 1).
3. **Query-строка с токеном** (`/reset-password?token=…`) не попадает в БД. Тест: `stripQuery` и путь в записи без `?` (Task 1, Task 3).
4. **Серверная ошибка дублируется браузером** через границу ошибок — с `digest` клиент не шлёт. Тест: e2e страница `e2e-boom` даёт одну группу «Сервер», ни одной «Браузер» (Task 5).
5. **Удаление аккаунта** с событиями ошибок не падает, события остаются с `userId = null` (Task 5).

---

### Task 1: Чистые функции `lib/errors/*`

**Files:**
- Create: `lib/errors/fingerprint.ts`, `lib/errors/noise.ts`, `lib/errors/limit.ts`, `lib/errors/alert.ts`, `lib/errors/schema.ts`
- Test: `lib/errors/fingerprint.test.ts`, `lib/errors/noise.test.ts`, `lib/errors/limit.test.ts`, `lib/errors/alert.test.ts`, `lib/errors/schema.test.ts`

**Interfaces:**
- Produces:
  - `type ErrorInput = { source: "SERVER" | "CLIENT"; message: string; stack: string | null; path: string | null; version: string | null; userAgent: string | null; userId: string | null }` (`schema.ts`)
  - `fingerprint(e: { source; message; stack }): string` — SHA-1 hex (`node:crypto`), `normalizeMessage(m: string): string`, `topFrame(stack: string | null): string`
  - `isNoise(e: { message: string; stack: string | null }): boolean`
  - `createLimiter({ max: number; windowMs: number }): { hit(key: string, now?: number): boolean }` — `true`, если в пределах лимита
  - `shouldAlert(g: { isNew: boolean; reopened: boolean; alertedAt: Date | null }, now: Date, sentLastHour: number): boolean`; константы `ALERT_GROUP_INTERVAL_MS = 3_600_000`, `ALERT_HOURLY_MAX = 20`
  - `clientReportSchema` (Zod: `message`, `stack?`, `path?`, `version?` с лимитами из Global Constraints), `stripQuery(path: string): string`, `MAX_BODY_BYTES = 8192`

- [ ] **Step 1: Тесты**
  - `fingerprint`: `"Workout cmv6ndv1f000644pkar2gh0ns not found"` и `"Workout cmv7aaaaaaaaaaaaaaaaaaaaaa not found"` при одном стеке — равны; `"limit 30 exceeded"`/`"limit 45 exceeded"` — равны; стеки `at f (/_next/static/chunks/a1b2c3.js:1:200)` и `at f (/_next/static/chunks/ffee99.js:1:900)` — равны; разные `topFrame` — различны; `SERVER` vs `CLIENT` при прочем равном — различны; `topFrame` пропускает строки с `node_modules` и `node:internal`, без своих строк берёт первую.
  - `isNoise` — `true` для каждого текста из спеки («Failed to fetch», «NetworkError when attempting to fetch resource», «Load failed», «The network connection was lost», «ResizeObserver loop limit exceeded», «ResizeObserver loop completed with undelivered notifications», «Script error.» без стека, сообщение с `AbortError`, стек только из `chrome-extension://`); `false` для `TypeError: x is undefined` со своим стеком.
  - `createLimiter({max: 30, windowMs: 60_000})`: 30 `hit("a", t)` — `true`, 31-й — `false`; `hit("b", t)` — `true`; через 60 001 мс `hit("a")` — снова `true`.
  - `shouldAlert`: новая, `alertedAt=null`, `sent=0` → `true`; не новая и не reopened → `false`; reopened и `alertedAt` 30 мин назад → `false`, 61 мин → `true`; `sentLastHour=20` → `false`.
  - `clientReportSchema`: `message` 1001 символ — ошибка; без `message` — ошибка; валидное — ok. `stripQuery("/reset-password?token=abc")` → `"/reset-password"`, `stripQuery("/a#b")` → `"/a"`.
- [ ] **Step 2:** `npx vitest run lib/errors` — FAIL (модулей нет).
- [ ] **Step 3:** Реализовать по интерфейсам. Нормализация сообщения: cuid/uuid/hex ≥ 8 → `<id>` (сначала id, потом числа), числа → `<n>`, строки в кавычках > 20 символов → `<s>`. Строка стека: убрать `:line:col`, `chunks/<что угодно>.js` → `chunks/<chunk>`.
- [ ] **Step 4:** `npx vitest run lib/errors` — PASS.
- [ ] **Step 5:** commit `feat(errors): fingerprint, noise filter, limiter, alert rule, report schema`.

### Task 2: Модель, миграция, `recordError`, срок хранения

**Files:**
- Modify: `prisma/schema.prisma` (модели из спеки; у `User` — `errorEvents ErrorEvent[]`)
- Create: миграция `prisma/migrations/<ts>_error_monitoring/` (`npx prisma migrate dev --name error_monitoring --create-only`, проверить SQL на частичные индексы, затем `npm run db:migrate`)
- Create: `lib/errors/record.ts` (server-only), Test: `lib/errors/record.test.ts` (мок `db` по образцу существующих тестов с `vi.mock("@/lib/db")`; если таких нет — интеграционная проверка — e2e в Task 5, здесь только тест «не бросает» здесь)
- Modify: `lib/notifications/service.ts` (`runNotificationTick` — вызов `pruneErrors(now)` раз в сутки: метка последнего запуска в памяти процесса)

**Interfaces:**
- Consumes: `ErrorInput`, `fingerprint` (Task 1)
- Produces: `recordError(input: ErrorInput, now?: Date): Promise<{ groupId: string; isNew: boolean; reopened: boolean; alertedAt: Date | null } | null>` (`null` — запись не удалась); `pruneErrors(now: Date): Promise<void>`; константы `MAX_EVENTS_PER_GROUP = 50`, `RETENTION_DAYS = 30`.

- [ ] **Step 1: Тесты** — `recordError` при `db.$transaction`, бросающем ошибку: возвращает `null`, не бросает, `console.error` вызван.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Схема + миграция. `recordError`: транзакция — найти группу по отпечатку; нет — создать (`isNew`); есть и `resolvedAt` не null — `resolvedAt = null` (`reopened`); `count + 1`, `lastSeen`, `path`, `version`; вставить событие; удалить события группы кроме последних 50 по `at`; `users` = `count(distinct "userId")` по событиям группы (raw SQL). Сообщение и стек — обрезать до лимитов перед записью.
- [ ] **Step 4:** `npx vitest run lib/errors` — PASS; `npm run typecheck`.
- [ ] **Step 5:** commit `feat(errors): ErrorGroup/ErrorEvent, recordError, 30-day retention`.

### Task 3: Сервер — `onRequestError` и оповещения

**Files:**
- Create: `lib/errors/report.ts` (server-only), `lib/errors/notify.ts` (server-only)
- Modify: `instrumentation.ts` (экспорт `onRequestError`, импорт `lib/errors/report` динамически внутри, только `NEXT_RUNTIME === "nodejs"`)

**Interfaces:**
- Consumes: `recordError`, `isNoise`, `stripQuery`, `shouldAlert`, `verifyAccessToken` (`lib/auth/tokens.ts`), `ACCESS_COOKIE` (`lib/auth/cookies.ts`), `callBot` (`lib/telegram/api.ts`), `isAdminLogin` (`lib/auth/admin-login.ts`), `env.ADMIN_LOGINS`, `env.APP_URL`
- Produces: `reportServerError(err: unknown, request: { path: string; headers: Record<string, string | string[]> }): Promise<void>`; `reportError(input: ErrorInput): Promise<void>` (общий путь: шум → запись → оповещение; используется и в Task 5); `notifyAdmins(group: { id: string; source; message; path; version }, kind: "new" | "back"): Promise<void>`.

- [ ] **Step 1: Тест** `lib/errors/report.test.ts`: `reportServerError` с `digest: "NEXT_REDIRECT;…"`, `"NEXT_NOT_FOUND"`, `"NEXT_HTTP_ERROR_FALLBACK;404"` — `recordError` не вызывается (мок); с обычной ошибкой и `path: "/reset-password?token=x"` — вызывается с `path: "/reset-password"`, `source: "SERVER"`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация. Cookie — разобрать заголовок `cookie` (строка или массив). Админы для оповещения — `User` с `telegramChatId` не null, логин проходит `isAdminLogin`. Счётчик «оповещений за час» — в памяти процесса. Текст сообщения — из спеки; ссылка `${APP_URL}/admin/errors/<id>`. `onRequestError` не ждёт Telegram (`void notifyAdmins(...).catch(console.error)`), но ждёт `recordError`.
- [ ] **Step 4:** PASS; `npm run typecheck && npm run lint`.
- [ ] **Step 5:** commit `feat(errors): capture server errors via onRequestError, Telegram alerts to admins`.

### Task 4: Админка `/admin/errors`

**Files:**
- Create: `app/(app)/admin/errors/page.tsx`, `app/(app)/admin/errors/[id]/page.tsx`, `lib/errors/queries.ts`, `lib/errors/actions.ts` (`resolveErrorAction(id: string, resolved: boolean)` — `requireAdmin`, `revalidatePath`)
- Modify: `components/app/user-menu.tsx` (пункт «Ошибки» с иконкой `Bug` после «Флаги»), `e2e/db.ts` (`insertErrorGroup(p: { message: string; source: "SERVER" | "CLIENT"; count: number; resolved?: boolean }): Promise<string>` — SQL-вставка группы и одного события)
- Test: `e2e/errors.spec.ts` (desktop, `mode: "serial"` — `makeAdmin`)

**Interfaces:**
- Consumes: модели Task 2, `requireAdmin` (`lib/auth/admin.ts`), `formatDuration` (`lib/format.ts`) для «N назад», `makeAdmin`/`E2E_ADMIN` (`e2e/db.ts`)
- Produces: `getErrorGroups(tab: "open" | "resolved"): Promise<GroupRow[]>`, `getErrorGroup(id: string): Promise<GroupDetail | null>`

- [ ] **Step 1: e2e** — «admin sees open groups, resolves and reopens»: `insertErrorGroup({ message: "e2e admin boom", source: "SERVER", count: 3 })` → админ на `/admin/errors` видит строку с «e2e admin boom», «Сервер», 3 → открывает карточку, видит стек → «Решено» → строка во вкладке «Решённые» → «Открыть снова» → снова «Открытые». «non-admin gets 404» для `/admin/errors` и `/admin/errors/<id>`.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/errors.spec.ts --project=desktop` — FAIL.
- [ ] **Step 3:** Страницы по спеке: вкладки через `searchParams.tab` (как `/admin/clubs`), до 100 строк, сортировка `lastSeen desc`; карточка — стек в `<pre className="whitespace-pre-wrap">`, последние 50 событий, время в поясе админа, браузер кратко (`Chrome`/`Safari`/`Firefox`/`Telegram` по подстроке UA), ник пользователя ссылкой. Неизвестный id → `notFound()`.
- [ ] **Step 4:** e2e PASS; `npm run typecheck && npm run lint`.
- [ ] **Step 5:** commit `feat(errors): admin pages for error groups`.

### Task 5: Браузер — `/api/errors`, `ErrorReporter`, границы ошибок, тестовые маршруты; тексты и удаление аккаунта

**Files:**
- Create: `app/api/errors/route.ts`, `components/errors/error-reporter.tsx`, `components/errors/send-report.ts` (клиентская отправка с лимитом страницы), `app/(app)/error.tsx`, `app/global-error.tsx`
- Create (тестовые): `app/api/e2e/boom/route.ts`, `app/(app)/e2e-boom/page.tsx` — без `E2E_ERROR_ROUTE === "1"` → 404 / `notFound()`
- Modify: `app/layout.tsx` (`<ErrorReporter />`), `playwright.config.ts` (`E2E_ERROR_ROUTE: "1"` в `webServer.env`), `lib/env.ts` при необходимости, `app/(marketing)/privacy/page.tsx` (абзац из спеки), `deploy/README.md` (раздел «Мониторинг» из спеки), `docs/features/platform.md` (пункт «Мониторинг ошибок» со ссылкой на спеку)
- Test: `e2e/errors.spec.ts` (дописать), `e2e/account-data.spec.ts`

**Interfaces:**
- Consumes: `clientReportSchema`, `MAX_BODY_BYTES`, `createLimiter`, `reportError` (Task 3), админка (Task 4), `verifyAccessToken`, `makeAdmin`/`E2E_ADMIN` (`e2e/db.ts`), фейковый Telegram `GET ${TELEGRAM_FAKE_URL}/calls?chat_id=…`
- Produces: `sendErrorReport(e: { message: string; stack?: string }): void` (клиент); data-testid нет — e2e ищет по тексту.

- [ ] **Step 1: e2e-тесты** (`e2e/errors.spec.ts`):
  - «browser error is grouped, resolved and reopened»: пользователь → `page.evaluate(() => setTimeout(() => { throw new Error("e2e boom 1") }))` дважды (с перезагрузкой между, т.к. на странице одно сообщение шлётся один раз) → админ на `/admin/errors` видит строку `e2e boom <n>` со счётчиком 2 → открывает, «Решено» → строка во вкладке «Решённые» → ещё раз ошибка → снова «Открытые».
  - «server error: one server group, no browser duplicate, alert in Telegram»: админ с привязанным Telegram (как в `e2e/telegram.spec.ts`) → открыть `/e2e-boom` → видно «Что-то пошло не так» и кнопка «Обновить» → в `/admin/errors` одна группа с источником «Сервер» и сообщением `e2e server boom`, групп «Браузер» с ним нет → `/calls?chat_id=…` содержит `sendMessage` с «Новая ошибка».
  - «noise is dropped»: `throw new TypeError("Failed to fetch")` → в админке нет.
  - «delete: error events stay without user» (`e2e/account-data.spec.ts`): пользователь шлёт ошибку браузера, удаляет аккаунт → в БД (`withDb`) событие с этим сообщением есть и `userId is null`.
  - «guards»: `fetch("/api/errors", { headers: { Origin: "https://evil.example" } })` из Node — 403; тело 9 КБ — 413.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/errors.spec.ts e2e/account-data.spec.ts --workers=8` — FAIL.
- [ ] **Step 3:** Реализация. Route: проверка `content-length`/длины текста ≤ `MAX_BODY_BYTES` → 413; `Origin` (иначе `Referer`) с хостом `new URL(env.APP_URL).host` → иначе 403; лимит `createLimiter({ max: 30, windowMs: 60_000 })` → 429; Zod → 400; `reportError({ source: "CLIENT", path: stripQuery(path), userAgent: заголовок, version, userId })` → 204. `ErrorReporter` — `useEffect` с `addEventListener("error" | "unhandledrejection")`, шум отбрасывает и на клиенте (`isNoise` — чистая, импортируемая). Границы — отправляют, только если у `error` нет `digest`. Тексты: «Что-то пошло не так», «Обновить», «В кабинет». Если удаление аккаунта (`lib/account/*`) чистит связанные строки явно — убедиться, что `ErrorEvent` не мешает (FK `SET NULL`).
- [ ] **Step 4:** e2e PASS; `npm run typecheck && npm run lint`.
- [ ] **Step 5:** commit `feat(errors): browser error reporting, error boundaries, /api/errors, privacy and deploy docs`.

### Task 6: Финал

- [ ] **Step 1:** Полный прогон: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --workers=8` — всё зелёное (пропуски — только существующие desktop/mobile-only).
- [ ] **Step 2:** Ревью ветки, затем `git checkout release/2026-11-ux && git merge --no-ff feat/error-monitoring`, `git branch -d feat/error-monitoring`.
