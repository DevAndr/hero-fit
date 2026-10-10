# Telegram Mini App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hero Fit открывается в Telegram (`/tg`), человек входит или регистрируется в одно касание по подписанному `initData`, тренер приглашает ссылкой `t.me/<бот>?startapp=join_<код>`.

**Architecture:** Mini App — тот же сайт. `/tg` (клиентская страница) отправляет `Telegram.WebApp.initData` в `POST /api/telegram/auth`; сервер проверяет HMAC (чистая `verifyInitData`), находит аккаунт по `telegramChatId`, регистрирует новый без email/пароля или привязывает существующий по паролю, ставит cookies сессии (для Mini App — `SameSite=None; Partitioned`).

**Tech Stack:** Next.js 16 route handler + client component, Prisma 7, Zod, Vitest, Playwright (заглушка `telegram-web-app.js` через `page.route`).

**Spec:** `docs/superpowers/specs/2026-10-10-telegram-mini-app-design.md`

## Global Constraints

- Подпись: `secret = HMAC_SHA256(key="WebAppData", data=botToken)`, `hash = hex(HMAC_SHA256(key=secret, data=check_string))`, `check_string` — пары `key=value` без `hash`, по ключу, через `\n`; сравнение `timingSafeEqual`.
- `auth_date` — не старше 24 ч, не позже `now + 5 мин`.
- `startTarget`: `join_<код>`, код через `normalizeFriendCode` → `/coach/join/<код>`; иначе `/dashboard`.
- Аккаунт из Telegram: `login = "tg" + id`, `name` = `first_name` (+ " " + `last_name`), `telegramChatId = id`, `privacyAcceptedAt = now`, `onboardedAt` как в `registerAction` (`ONBOARDING_TOUR=off` → now).
- Cookies `embedded`-сессии: `sameSite: "none"`, `secure: true`, `partitioned: true`, остальное как сейчас.
- `X-Frame-Options: DENY` → `Content-Security-Policy: frame-ancestors 'self' https://web.telegram.org`.
- Тексты (дословно): «Входим через Telegram…»; «Не получилось войти. Откройте Hero Fit из Telegram заново»; «Привет, {имя}! Hero Fit — тренировки с уровнями, ачивками и боссами»; галочка «Согласен с политикой обработки персональных данных»; кнопки «Начать», «У меня уже есть аккаунт», «Войти и привязать Telegram»; ошибка «Неверный логин или пароль»; блок «Вход на сайте», успех «Теперь можно входить на сайте по email и паролю»; кнопка тренера «Заниматься в Telegram»; подпись «Ссылка для Telegram».
- Цели Метрики: `signup` (регистрация из Telegram), `telegram_open` (успешный вход в Mini App) — `telegram_open` добавить в `GOALS`.
- Тексты без рода.

## Review Focus

1. Аккаунт без пароля пробует войти на `/login` (логин `tg<id>`, любой пароль) или «Забыли пароль» — «Неверный логин или пароль» / нейтральный ответ, а не 500 (`verifyPassword(null)`). Тест — Task 2.
2. Двойное нажатие «Начать» (две параллельные регистрации одного Telegram) — один аккаунт, оба ответа `ok`. Тест — Task 3.
3. Привязка по паролю к аккаунту, у которого Telegram уже был другой, или когда этот Telegram у другого аккаунта — привязка переходит, старая снимается, без P2002. Тест — Task 3.
4. Ротация refresh `embedded`-сессии в `proxy.ts` сохраняет `SameSite=None; Partitioned` (иначе во фрейме web.telegram.org после 15 мин сессия теряется). Тест — Task 2 (unit `writeAuthCookies` с `embedded`) + Task 2 (`rotateRefreshToken` возвращает `embedded`).
5. «Вход на сайте» с уже занятым email — ошибка «Этот email уже зарегистрирован», не 500. Тест — Task 4.

---

### Task 1: Подпись initData, цель редиректа, атрибуты cookies

**Files:**
- Create: `lib/telegram/init-data.ts`, `lib/telegram/init-data.test.ts`
- Modify: `lib/auth/cookies.ts` (+ тест `lib/auth/cookies.test.ts`)

**Interfaces:**
- Produces:
  - `type TelegramUser = { id: number; firstName: string; lastName?: string; username?: string }`
  - `verifyInitData(initData: string, botToken: string, now: Date): { ok: true; user: TelegramUser; startParam: string | null; authDate: Date } | { ok: false; reason: "hash" | "expired" | "malformed" }`
  - `signInitData(fields: Record<string, string>, botToken: string): string` — собирает `initData` с правильным `hash` (тесты и e2e; без `server-only`).
  - `startTarget(startParam: string | null): string`
  - `authCookieOptions(embedded: boolean, kind: "access" | "refresh")` и `writeAuthCookies(store, tokens, { embedded = false } = {})` — `embedded` → `{ sameSite: "none", secure: true, partitioned: true }`.
  - `cookies.ts` не должен тянуть `server-only` в тест: вынести чистую `authCookieOptions` в `lib/auth/cookie-options.ts` (без `server-only`, `secure` для не-embedded — параметр `production: boolean`), `cookies.ts` реэкспортирует с `env.NODE_ENV`.

- [ ] **Step 1: Failing tests** `lib/telegram/init-data.test.ts`:
  - валидные данные: `signInitData({ auth_date: String(now/1000), user: JSON.stringify({ id: 42, first_name: "Маша", username: "masha" }), start_param: "join_ABCDEFGH", query_id: "q" }, "T")` → `verifyInitData(…, "T", now)` = `{ ok: true, user: { id: 42, firstName: "Маша", username: "masha" }, startParam: "join_ABCDEFGH" }` (+ `authDate`);
  - тот же `initData`, проверка токеном `"X"` → `{ ok: false, reason: "hash" }`; подмена `user` после подписи → `hash`;
  - `auth_date` на 24 ч + 1 с назад → `expired`; на 6 мин вперёд → `expired`; на 4 мин вперёд → ok;
  - без `hash` → `malformed`; без `user` (но подписано) → `malformed`; `user` не JSON → `malformed`;
  - `startTarget("join_ABCDEFGH")` → `/coach/join/ABCDEFGH`; `"join_abcdefgh"` → `/coach/join/ABCDEFGH`; `"join_../x"`, `"join_"`, `"other"`, `null` → `/dashboard`.
  - `lib/auth/cookies.test.ts`: `authCookieOptions(true, "access", false)` → `sameSite "none"`, `secure true`, `partitioned true`, `httpOnly true`, `path "/"`; `(false, "refresh", true)` → `sameSite "lax"`, `secure true`, без `partitioned`; `maxAge` access/refresh — `ACCESS_TTL_SEC`/`REFRESH_TTL_SEC`.
- [ ] **Step 2:** `npx vitest run lib/telegram/init-data lib/auth/cookies` — Expected: FAIL (нет модулей).
- [ ] **Step 3:** Реализовать (`URLSearchParams` для разбора; `createHmac` из `node:crypto`).
- [ ] **Step 4:** те же тесты + `npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(telegram): initData signature check, start target, embedded cookie options`.

### Task 2: Схема — аккаунт без email/пароля, сессия Mini App, фрейм

**Files:**
- Modify: `prisma/schema.prisma` (`User.email String? @unique`, `passwordHash String?`, `Session.embedded Boolean @default(false)`), миграция `telegram_mini_app` (через `prisma migrate diff`, как в прошлом плане)
- Modify: `lib/auth/session.ts` (`createSession(userId, meta, { embedded })`, `rotateRefreshToken` → в ok-результате `embedded: boolean`), `proxy.ts` (`writeAuthCookies(…, { embedded: result.embedded })`), `lib/auth/actions.ts` (`loginAction`: нет `passwordHash` → как неизвестный пользователь, с `burnPasswordCheck`; `forgotPasswordAction`, `resetPasswordAction` — без email/пароля не ломаются), места показа email (`app/(app)/settings/page.tsx`, `components/app/user-menu.tsx`, `components/app/app-shell.tsx` — проп `email: string | null`), `next.config.ts`
- Test: `e2e/telegram-app.spec.ts` (создать), `e2e/db.ts`

**Interfaces:**
- Consumes: Task 1 `writeAuthCookies(store, tokens, { embedded })`.
- Produces: `createSession(userId: string, meta?: ClientMeta, opts?: { embedded?: boolean }): Promise<IssuedTokens>`; `RotateResult` ok-ветка с `embedded: boolean`; `e2e/db.ts` `createTelegramUser(telegramId: string): Promise<string>` (SQL: аккаунт `tg<id>` без email/пароля, возвращает login).

- [ ] **Step 1: Failing e2e** `e2e/telegram-app.spec.ts`:
  - "passwordless account cannot sign in with a password": `createTelegramUser(id)` → `/login`, логин `tg<id>`, пароль `Secret123` → текст «Неверный логин или пароль».
  - "forgot password for a passwordless account answers neutrally": `/forgot-password` с несуществующим email → тот же ответ, что сейчас (проверить по `e2e/auth.spec.ts`), без 500.
  - "pages may be framed only by Telegram": `request.get("/")` → заголовок `content-security-policy` содержит `frame-ancestors 'self' https://web.telegram.org`, `x-frame-options` отсутствует.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/telegram-app.spec.ts --project=desktop` — Expected: FAIL (createTelegramUser падает на NOT NULL; заголовок DENY).
- [ ] **Step 3:** Реализовать схему, миграцию, правки из Files. Проверить все `findFirst/findUnique` по `email` — `email` теперь `string | null` (typecheck подскажет).
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test e2e/telegram-app.spec.ts e2e/auth.spec.ts` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(auth): passwordless accounts, Mini App sessions with partitioned cookies, Telegram may frame the site`.

### Task 3: `/tg` и `POST /api/telegram/auth`

**Files:**
- Create: `lib/telegram/mini-app.ts` (server-only), `app/api/telegram/auth/route.ts`, `app/(auth)/tg/page.tsx`, `components/telegram/mini-app-entry.tsx` (client)
- Modify: `proxy.ts` (`PUBLIC_PAGES` + `/tg`), `lib/analytics/goals.ts` (`telegram_open`), `e2e/telegram-app.spec.ts`, `e2e/db.ts`
- Create: `e2e/telegram-webapp.ts` (хелпер заглушки)

**Interfaces:**
- Consumes: `verifyInitData`, `signInitData`, `startTarget` (Task 1); `createSession(…, { embedded: true })`, `writeAuthCookies(…, { embedded: true })` (Task 2); `verifyPassword`, `burnPasswordCheck` (`lib/auth`); `queueGoal`.
- Produces:
  - Тело запроса: `{ initData: string; action: "auto" } | { initData; action: "register"; consent: true } | { initData; action: "link"; identifier: string; password: string }` (Zod).
  - Ответы: `200 { status: "ok"; to: string }` (cookies сессии выставлены), `200 { status: "new"; firstName: string }` (только `auto`), `400 { error: "consent" }`, `401 { error: "initData" }`, `401 { error: "credentials" }`, `404` при выключенной интеграции.
  - `lib/telegram/mini-app.ts`: `findByTelegram(id: number)`, `registerFromTelegram(user: TelegramUser): Promise<string>` (userId; P2002 по `login`/`telegramChatId` → вернуть существующего), `linkTelegramTo(userId: string, user: TelegramUser)` (снять `telegramChatId` у другого владельца, записать этому — в транзакции).
  - Клиент `MiniAppEntry`: читает `window.Telegram?.WebApp`; нет `initData` → `location.replace("/login")`; `auto` → `ok` → `location.replace(to)`; `new` → экран регистрации; после `register` → `Telegram.WebApp.requestWriteAccess?.()` (не ждать результата дольше 3 с) → переход. Скрипт — `<Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />` на странице `/tg`. `Telegram.WebApp.ready()` после загрузки.
  - `e2e/telegram-webapp.ts`: `mockTelegram(page, { id, firstName, startParam?, tamper? })` — `page.route("https://telegram.org/js/telegram-web-app.js", …)` отдаёт JS, задающий `window.Telegram = { WebApp: { initData, ready(){}, requestWriteAccess(cb){ cb?.(true) } } }`, где `initData = signInitData({...}, "e2e-token")`; `tamper` — портит `hash`.

- [ ] **Step 1: Failing e2e** в `e2e/telegram-app.spec.ts` (Telegram id — уникальные, как `newChat` в `telegram.spec.ts`):
  - "new person: consent → Начать → dashboard": `mockTelegram(page, { id, firstName: "Маша" })` → `/tg` → «Привет, Маша! Hero Fit — тренировки с уровнями, ачивками и боссами» → «Начать» недоступна/не отправляет без галочки → отметить → «Начать» → URL `/dashboard`; в БД `login = tg<id>`, `email` null, `passwordHash` null, `telegramChatId = id`.
  - "returning person goes straight to the dashboard": после первого — новая страница в том же контексте не нужна: новый контекст + `mockTelegram` тем же id → `/tg` → `/dashboard` без экрана регистрации.
  - "bot-linked account signs in automatically": `registerUser` + `linkTelegram(login, id)` → новый контекст, `mockTelegram(id)` → `/tg` → `/dashboard`, имя пользователя — прежнее (в меню/шапке логин этого аккаунта).
  - "existing account: sign in and link": новый контекст, `mockTelegram(id)` → «У меня уже есть аккаунт» → неверный пароль → «Неверный логин или пароль» → верный → «Войти и привязать Telegram» → `/dashboard`; `telegramChat(login) === id`.
  - "link moves Telegram from another account": `createTelegramUser(id)` уже есть; другой аккаунт привязывается тем же id через «У меня уже есть аккаунт» → у `tg<id>` `telegramChatId` null, у второго — id.
  - "double tap registers once": два параллельных `request.post("/api/telegram/auth", { data: { initData, action: "register", consent: true } })` → оба `status: "ok"`, в БД один пользователь с этим `telegramChatId`.
  - "coach invite via start_param": тренер (`enableCoach`, код из `ensureCoachCode` через страницу `/coach` или SQL) → `mockTelegram({ startParam: "join_" + code })` новый человек → «Начать» → экран согласия тренера (`/coach/join/<код>`).
  - "tampered initData shows the error": `mockTelegram({ tamper: true })` → «Не получилось войти. Откройте Hero Fit из Telegram заново».
  - "/tg in a plain browser goes to login": без `mockTelegram` (route отдаёт пустой JS) → `/login`.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/telegram-app.spec.ts --project=desktop` — Expected: новые тесты FAIL (404 на `/tg`).
- [ ] **Step 3:** Реализовать. `auto`/`link`/`register` при `ok` — `queueGoal("telegram_open")`, `register` — ещё `queueGoal("signup")`.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run build && npx playwright test e2e/telegram-app.spec.ts` — Expected: PASS (desktop + mobile).
- [ ] **Step 5:** Commit `feat(telegram): Mini App entry — sign in, sign up and link from Telegram`.

### Task 4: «Вход на сайте» для аккаунтов без пароля

**Files:**
- Create: `components/auth/site-login-form.tsx` (client), действие `setSiteLoginAction` в `lib/auth/actions.ts`
- Modify: `app/(app)/settings/page.tsx` (блок только при `passwordHash = null` — передать булев флаг, не хеш), `lib/auth/schemas.ts` (`siteLoginSchema` — `email` и `password` с теми же правилами, что `registerSchema`), `e2e/telegram-app.spec.ts`

**Interfaces:**
- Consumes: `registerSchema` правила email/пароля, `hashPassword`.
- Produces: `setSiteLoginAction(prev: FormState, formData: FormData): Promise<FormState>` — только если у пользователя нет `passwordHash` (иначе `{ message: "Пароль уже задан" }`); email занят → `errors.email = ["Этот email уже зарегистрирован"]` (и P2002); успех → `{ message: "Теперь можно входить на сайте по email и паролю" }` + `revalidatePath("/settings")`.

- [ ] **Step 1: Failing e2e**:
  - "set site login, then sign in on /login": регистрация через `/tg` (как в Task 3) → `/settings` → блок «Вход на сайте» → email `<login>@test.local`, пароль `Secret123` (и подтверждение, если в форме регистрации есть) → сообщение успеха → блока больше нет после reload → выход → `/login` с этим email и паролем → `/dashboard`.
  - "site login with a taken email": email существующего пользователя → «Этот email уже зарегистрирован».
- [ ] **Step 2:** `npm run build && npx playwright test e2e/telegram-app.spec.ts --project=desktop -g "site login"` — Expected: FAIL (нет блока).
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm run typecheck && npm run build && npx playwright test e2e/telegram-app.spec.ts` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(auth): passwordless accounts can add email and password for the website`.

### Task 5: Ссылки тренера, приватность, документация

**Files:**
- Create: `lib/telegram/links.ts` (`telegramJoinUrl`)
- Modify: `app/(app)/coach/page.tsx` (+ компонент приглашения — вторая ссылка «Ссылка для Telegram» с копированием), `app/(marketing)/trainer/[nick]/page.tsx` (кнопка «Заниматься в Telegram», `buttonVariants({ variant: "outline", size: "lg" })`, рядом с «Заниматься», только гостю/не клиенту), `app/(marketing)/privacy/page.tsx`, `deploy/README.md`, `CLAUDE.md`, `e2e/telegram-app.spec.ts`

**Interfaces:**
- Consumes: `env.TELEGRAM_BOT_USERNAME`, `telegramEnabled`.
- Produces: `telegramJoinUrl(code: string, botUsername: string | undefined): string | null` — `https://t.me/<бот>?startapp=join_<код>` или null без имени бота (чистая, unit-тест в `lib/telegram/links.test.ts`).

- [ ] **Step 1: Failing tests**: unit `telegramJoinUrl("ABCDEFGH", "hero_bot")` → `https://t.me/hero_bot?startapp=join_ABCDEFGH`, `(…, undefined)` → null; e2e "coach sees the Telegram invite link": `enableCoach` → `/coach` → текст «Ссылка для Telegram» и ссылка `https://t.me/hero_fit_e2e_bot?startapp=join_<код>`; "trainer page offers Telegram": опубликованная страница (`coachProfile`) гостю → ссылка «Заниматься в Telegram» с тем же href.
- [ ] **Step 2:** `npx vitest run lib/telegram/links && npm run build && npx playwright test e2e/telegram-app.spec.ts -g "Telegram invite|offers Telegram" --project=desktop` — Expected: FAIL.
- [ ] **Step 3:** Реализовать; `/privacy` — дополнить пункт Telegram: «При входе через Telegram мы получаем имя и username из профиля Telegram»; `deploy/README.md` — BotFather → Bot Settings → Configure Mini App → `https://<домен>/tg`; `CLAUDE.md` — строка про Mini App (точка входа, `verifyInitData`, `embedded`-сессии, аккаунты без пароля, «Вход на сайте», `telegramJoinUrl`, e2e `mockTelegram`/`createTelegramUser`).
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — Expected: всё зелёное.
- [ ] **Step 5:** Commit `feat(telegram): coach invite links for Telegram, privacy and docs`.
