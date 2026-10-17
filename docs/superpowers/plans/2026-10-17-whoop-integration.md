# WHOOP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец подключает WHOOP в `/settings` по отдельному согласию и видит в сводке своей тренировки средний/макс. пульс, strain, ккал и зоны из совпавшей по времени активности WHOOP.

**Architecture:** Модуль `lib/whoop/*`: чистые функции (шифрование, подпись, перевод ответа, сопоставление) + серверные (клиент API с токенами под advisory lock, синхронизация). Маршруты `app/api/whoop/{connect,callback,webhook}`. Активности WHOOP хранятся урезанными строками `WhoopWorkout`; связь с `Workout` не хранится — сопоставление при показе. Всё под флагом `whoop` (по списку пользователей).

**Tech Stack:** Next.js 16 (route handlers, `after()` из `next/server`, server actions), Prisma 7 + PostgreSQL, Node `crypto` (AES-256-GCM, HMAC-SHA256), Vitest, Playwright, shadcn/Base UI.

**Spec:** `docs/superpowers/specs/2026-10-17-whoop-integration-design.md`

## Global Constraints

- Ветка `feat/whoop` (от `release/2026-11-polish`); по готовности — `--no-ff` в релизную ветку, отдельного MR нет.
- Отличие от спеки: флаг включается по списку пользователей (`addFlagUser`), не глобально — e2e идут параллельно, без `mode: "serial"`, только desktop.
- Флаг `whoop` в `lib/flags/registry.ts`, `expires: "2027-04-30"`. Без флага или без `WHOOP_CLIENT_ID` — UI скрыт, маршруты `/api/whoop/*` (кроме webhook) отвечают 404; webhook без `WHOOP_CLIENT_SECRET` — 404.
- Scope OAuth — ровно `"read:workout read:profile offline"`. `redirect_uri` — `${env.APP_URL}/api/whoop/callback`.
- Адреса WHOOP строятся от `WHOOP_API_URL` (по умолчанию `https://api.prod.whoop.com`): `/oauth/oauth2/auth`, `/oauth/oauth2/token`, API — `${WHOOP_API_URL}/developer${path}` (например, `https://api.prod.whoop.com/developer/v2/activity/workout`); в коде один хелпер `apiUrl(path)`, фейковый сервер отвечает по тем же путям.
- Данные WHOOP видит только владелец; не попадают в ленту, сторис, тренеру, рейтинги, XP, ачивки, логи и мониторинг ошибок (в `console.error`/`reportServerError` — только тип ошибки и статус, без тел ответов и токенов).
- Тексты UI — дословно из спеки (раздел «Карточка в сводке», диалог согласия).
- Цвета — только семантические токены `app/globals.css`; новые токены зон — для обеих тем.
- `/api/*` уже пропускается `proxy.ts` без редиректа — менять `proxy.ts` не нужно (спека упоминает его зря).
- «Что нового»: пункт с `flag: "whoop"` добавляется в PR релиза, не в этой ветке — записать в описание фичи для релиза.
- Проверки перед вливанием: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.

## Review Focus

1. **Ротация refresh-токена при гонке** — автодогрузка карточки и «Обновить» одновременно: второй refresh не должен разлогинить WHOOP. Фейковый сервер выдаёт `expires_in: 1` и инвалидирует старый refresh → каждый вызов идёт через refresh; e2e (Задание 5) жмёт «Обновить» сразу после автодогрузки и ждёт данных, а не «Переподключите WHOOP».
2. **История больше 25 активностей** — пагинация `next_token`. e2e (Задание 4): 26 активностей, совпадающая — самая старая.
3. **Тот же аккаунт WHOOP у второй нашей учётки** → `/settings?whoop=taken`, у первой подключение не тронуто. e2e (Задание 4) — фейковый сервер по cookie-подсказке отдаёт тот же `user_id`.
4. **Вебхук для неизвестного/отключённого `user_id` и повтор события** → 204, строк не добавилось / одна строка. e2e (Задание 6).
5. **Тренировка без `startedAt`/`finishedAt` или не `COMPLETED`** → карточки нет, `matchWhoop` не вызывается. Unit (Задание 2) — `matchWhoop` с пустым интервалом → `null`.

---

### Task 1: Окружение, флаг, модели, шифрование токенов

**Files:**
- Modify: `lib/env.ts`, `.env.example`, `lib/flags/registry.ts`, `prisma/schema.prisma` (модели + связи в `User`), `playwright.config.ts` (env сервера)
- Create: `prisma/migrations/<ts>_whoop/migration.sql` (через `npx prisma migrate dev --name whoop`; проверить, что SQL не удаляет частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`)
- Create: `lib/whoop/crypto.ts`, `lib/whoop/crypto.test.ts`, `lib/whoop/config.ts`

**Interfaces:**
- Produces:
  - `encryptToken(plain: string, keyB64: string): string` — формат `iv.tag.data` (base64url, IV 12 байт)
  - `decryptToken(enc: string, keyB64: string): string` — бросает при подмене
  - `lib/whoop/config.ts` (server-only): `whoopConfigured(): boolean` (заданы `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_TOKEN_KEY`), `WHOOP_SCOPES = "read:workout read:profile offline"`, `oauthUrl(path: "auth" | "token"): string`, `apiUrl(path: string): string`, `redirectUri(): string`
  - Prisma: `WhoopConnection`, `WhoopWorkout` — поля ровно как в спеке («Данные»); в `User`: `whoopConnection WhoopConnection?`, `whoopWorkouts WhoopWorkout[]`
  - Флаг `whoop`: `description: "WHOOP: пульс и strain из браслета в сводке тренировки"`

- [ ] **Step 1: Тест шифрования** — `crypto.test.ts`:
  - `decryptToken(encryptToken("abc", KEY), KEY) === "abc"`;
  - два шифрования одной строки дают разные результаты (случайный IV);
  - заменённый символ в части `data` → `decryptToken` бросает;
  - другой ключ → бросает.
  `KEY = Buffer.alloc(32, 7).toString("base64")`.
- [ ] **Step 2:** `npx vitest run lib/whoop/crypto.test.ts` → FAIL (модуля нет).
- [ ] **Step 3: Реализовать** `crypto.ts` на `createCipheriv("aes-256-gcm")`; ключ — `Buffer.from(keyB64, "base64")`, длина ≠ 32 → бросать.
- [ ] **Step 4: env** — в `lib/env.ts`: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_TOKEN_KEY` — `z.string().optional()`; `WHOOP_API_URL: z.url().default("https://api.prod.whoop.com")`; второй `.refine`: при `WHOOP_CLIENT_ID` обязательны секрет и ключ, ключ декодируется в 32 байта (`message: "WHOOP_TOKEN_KEY обязателен при WHOOP_CLIENT_ID (32 байта base64)"`). `.env.example` — пустые строки с комментарием «developer.whoop.com; ключ: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`».
- [ ] **Step 5: Схема и миграция**, `config.ts` (`apiUrl("/v2/...")` → `${WHOOP_API_URL}/developer/v2/...`), флаг.
- [ ] **Step 6: playwright.config.ts** — в env веб-сервера: `WHOOP_CLIENT_ID: "e2e-whoop-client"`, `WHOOP_CLIENT_SECRET: "e2e-whoop-secret"`, `WHOOP_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64")`, `WHOOP_API_URL: WHOOP_FAKE_URL` (константа появится в Задании 4 — пока строка `"http://localhost:3125"`).
- [ ] **Step 7:** `npx vitest run lib/whoop lib/flags && npm run typecheck` → PASS (тест реестра флагов проверяет `expires`).
- [ ] **Step 8: Commit** — `feat(whoop): env, flag, models, token encryption`.

### Task 2: Чистые функции — перевод ответа, подпись, сопоставление

**Files:**
- Create: `lib/whoop/types.ts`, `lib/whoop/map.ts`, `lib/whoop/signature.ts`, `lib/whoop/match.ts` + `*.test.ts` к трём последним

**Interfaces:**
- Produces:
  - `type WhoopScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE"`
  - `type WhoopWorkoutRow = { id: string; start: Date; end: Date; sportName: string; scoreState: WhoopScoreState; strain: number | null; avgHr: number | null; maxHr: number | null; kilojoule: number | null; zonesMs: number[] }`
  - `type WhoopApiWorkout` — форма ответа v2 (поля из спеки, `score` может отсутствовать)
  - `toWhoopWorkout(w: WhoopApiWorkout): WhoopWorkoutRow` — неизвестный `score_state` → `"UNSCORABLE"`; нет `score` → числа `null`, `zonesMs` = `[]`; зоны — `[zone_zero_milli … zone_five_milli]`, отсутствующая → 0
  - `verifyWhoopSignature(i: { body: string; signature: string | null; timestamp: string | null; secret: string; now: number }): boolean`
  - `type WhoopSummary = { avgHr: number | null; maxHr: number | null; strain: number; kcal: number | null; zonesMs: number[]; fragments: number }`
  - `type WhoopMatch = { kind: "data"; summary: WhoopSummary } | { kind: "pending" } | null`
  - `matchWhoop(workout: { startedAt: Date; finishedAt: Date }, candidates: WhoopWorkoutRow[]): WhoopMatch`
  - Константы в `match.ts`: `MIN_OVERLAP_MS = 5 * 60_000`, `MIN_OVERLAP_SHARE = 0.3`

- [ ] **Step 1: Тесты `signature.test.ts`** (`secret = "s"`, `body = '{"a":1}'`, `ts = "1700000000000"`, `sig = createHmac("sha256","s").update(ts + body).digest("base64")`):
  - верная при `now = 1700000000000` → `true`;
  - другое тело → `false`; `signature: null` → `false`; подпись другой длины → `false` (без исключения от `timingSafeEqual`);
  - `now = ts + 5*60_000 + 1` → `false`; `now = ts - 60_000 - 1` (метка из будущего) → `false`.
- [ ] **Step 2: Тесты `map.test.ts`**: полный ответ → `avgHr 140, maxHr 172, strain 12.3, kilojoule 1500, zonesMs [6 чисел]`, `start` — `Date`; без `score` и `PENDING_SCORE` → `strain: null, zonesMs: []`; `score_state: "WEIRD"` → `"UNSCORABLE"`.
- [ ] **Step 3: Тесты `match.test.ts`** (тренировка 10:00–11:00):
  - активность 10:05–10:55, SCORED → `kind: "data"`, `fragments: 1`, `kcal = Math.round(kJ / 4.184)`;
  - касание: 11:00–11:30 → `null`; пересечение 4 мин при длине активности 60 мин → `null`;
  - короткая активность 10:58–11:03 (пересечение 2 мин из 5 = 40 %) → подходит;
  - два фрагмента 10:00–10:20 (avg 120, max 150, strain 8, zones [1,1,1,1,1,1]) и 10:25–11:05 (avg 150, max 175, strain 11, zones [2,2,2,2,2,2]) → `avgHr = round((120·20 + 150·40) / 60) = 140`, `maxHr 175`, `strain 11`, `zonesMs [3,3,3,3,3,3]`, `fragments 2`;
  - единственная подходящая — `PENDING_SCORE` → `{ kind: "pending" }`; SCORED + PENDING → `data` по SCORED;
  - только `UNSCORABLE` → `null`;
  - у одной активности `avgHr: null` → в среднее идёт только другая;
  - `finishedAt <= startedAt` → `null` (Review Focus 5).
- [ ] **Step 4:** `npx vitest run lib/whoop` → FAIL.
- [ ] **Step 5: Реализовать** три модуля. Пересечение = `max(0, min(ends) − max(starts))`; подходит, если `overlap >= MIN_OVERLAP_MS || overlap >= MIN_OVERLAP_SHARE * длина активности`, при `overlap > 0`. Подпись: `timingSafeEqual` по буферам равной длины, иначе `false`.
- [ ] **Step 6:** `npx vitest run lib/whoop` → PASS.
- [ ] **Step 7: Commit** — `feat(whoop): mapping, webhook signature, workout matching`.

### Task 3: Клиент API, токены, синхронизация

**Files:**
- Create: `lib/whoop/tokens.ts`, `lib/whoop/client.ts`, `lib/whoop/sync.ts` (все `import "server-only"`)

**Interfaces:**
- Consumes: Task 1 (`encryptToken`/`decryptToken`, `oauthUrl`, `apiUrl`, `redirectUri`, `WHOOP_SCOPES`), Task 2 (`toWhoopWorkout`, `WhoopApiWorkout`)
- Produces:
  - `class WhoopReauthError extends Error`, `class WhoopUnavailableError extends Error`
  - `type WhoopTokenSet = { accessToken: string; refreshToken: string; expiresAt: Date }`
  - `exchangeCode(code: string): Promise<WhoopTokenSet>` (POST form: `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`)
  - `fetchProfileUserId(accessToken: string): Promise<string>` (`/v2/user/profile/basic` → `String(user_id)`)
  - `getAccessToken(userId: string): Promise<string>` — правила спеки: запас 60 с; иначе `db.$transaction` с `` tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"whoop:" + userId}))` ``, перечитать строку, refresh (`grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`, `scope=offline`), записать; 400/401 на refresh → `needsReauth = true` (вне откатываемой транзакции — отдельным `update` после неё) и `WhoopReauthError`; нет подключения или `needsReauth` → `WhoopReauthError`
  - `whoopGet<T>(userId: string, path: string, query?: Record<string, string>): Promise<T | null>` — 404 → `null`; 401 → один повтор после принудительного refresh; 429/5xx/таймаут 10 с (`AbortSignal.timeout(10_000)`) → `WhoopUnavailableError`
  - `revokeAccess(userId: string): Promise<void>` — `DELETE apiUrl("/v2/user/access")`, любые ошибки глотаются
  - `syncRange(userId: string, from: Date, to: Date): Promise<void>` — `GET /v2/activity/workout?start&end&limit=25[&nextToken]` до пустого `next_token`, upsert каждой строки (`toWhoopWorkout`, `userId`)
  - `syncOne(userId: string, whoopId: string): Promise<void>` — `GET /v2/activity/workout/{id}`; `null` → удалить строку
  - `removeOne(userId: string, whoopId: string): Promise<void>` — `deleteMany({ where: { id, userId } })`

- [ ] **Step 1: Реализовать** три модуля. Отдельных unit-тестов нет: логика проверяется e2e против фейкового сервера (Задания 4–6), включая ротацию (Review Focus 1). В ошибках — только статус: `new WhoopUnavailableError(\`whoop ${res.status}\`)`.
- [ ] **Step 2:** `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 3: Commit** — `feat(whoop): API client with token refresh lock and sync`.

### Task 4: Подключение и отключение в `/settings` + фейковый WHOOP

**Files:**
- Create: `e2e/whoop-server.ts`, `app/api/whoop/connect/route.ts`, `app/api/whoop/callback/route.ts`, `lib/whoop/actions.ts`, `lib/whoop/queries.ts`, `components/settings/whoop-card.tsx`, `e2e/whoop.spec.ts`
- Modify: `app/(app)/settings/page.tsx`, `playwright.config.ts` (третий `webServer` + `WHOOP_FAKE_URL`), `e2e/db.ts`

**Interfaces:**
- Consumes: Task 3 (`exchangeCode`, `fetchProfileUserId`, `revokeAccess`, `syncRange`), Task 1 (`encryptToken`, `whoopConfigured`, `oauthUrl`, `redirectUri`, `WHOOP_SCOPES`)
- Produces:
  - `getWhoopStatus(userId: string): Promise<{ connected: false } | { connected: true; since: Date; needsReauth: boolean }>` (`lib/whoop/queries.ts`)
  - `whoopAvailable(userId: string): Promise<boolean>` — `whoopConfigured() && isEnabled("whoop", userId)`
  - `disconnectWhoopAction(): Promise<void>` (`lib/whoop/actions.ts`, `"use server"`, `requireUser`) — `revokeAccess`, затем транзакция `whoopWorkout.deleteMany` + `whoopConnection.deleteMany`, `revalidatePath("/settings")`
  - Фейковый сервер (порт 3125, `WHOOP_FAKE_URL = "http://localhost:3125"`, запуск `npx tsx e2e/whoop-server.ts`, как `telegram-server.ts`):
    - `GET /oauth/oauth2/auth` → 302 на `redirect_uri?code=<uuid>&state=<state>`; для Review Focus 3: если перед этим вызван `POST /__control/reuse-next?user=<id>`, следующий код привязывается к этому `user_id`, иначе — новый `user_id` (счётчик с 1000)
    - `POST /oauth/oauth2/token` (form): `authorization_code` → токены; `refresh_token` → новые, старый refresh и access инвалидируются, неизвестный refresh → 400; всегда `expires_in: 1`
    - `GET /developer/v2/user/profile/basic`, `GET /developer/v2/activity/workout` (фильтр пересечения `start`/`end`, по убыванию `start`, `limit`, `nextToken` = смещение), `GET /developer/v2/activity/workout/:id`, `DELETE /developer/v2/user/access` → 204 + запись; неверный/устаревший access → 401
    - служебные: `PUT /__control/workouts?user=<id>` (тело — массив `WhoopApiWorkout`, заменяет), `GET /__control/revoked?user=<id>` → `{ revoked: boolean }`, `GET /health`
  - `e2e/db.ts`: `whoopUserIdOf(login: string): Promise<string | null>`, `whoopWorkoutCount(login: string): Promise<number>`, `latestWorkout(login: string): Promise<{ id: string; startedAt: Date; finishedAt: Date }>`; хелпер в спеке `whoopActivity(id: string, start: Date, end: Date, o?: { state?: string; avgHr?: number; maxHr?: number; strain?: number; kJ?: number }): WhoopApiWorkout`

- [ ] **Step 1: Фейковый сервер** и строка в `webServer` (`url: \`${WHOOP_FAKE_URL}/health\``).
- [ ] **Step 2: e2e-тесты подключения** (`whoop.spec.ts`, `test.describe.configure({ mode: "serial" })` не нужен — флаг по списку через `addFlagUser("whoop", login)`; только desktop: `test.skip(({ isMobile }) => isMobile)`):
  - «подключение по согласию»: `/settings` → «Подключить WHOOP» → в диалоге «Продолжить» недоступна до галочки «Согласен на обработку данных о здоровье» → после галочки — URL `/settings?whoop=connected`, карточка «Подключён»; `whoopUserIdOf(login)` не `null`;
  - «без флага карточки нет» — пользователь без `addFlagUser` не видит «WHOOP» в `/settings`, `GET /api/whoop/connect` → 404;
  - «чужой аккаунт WHOOP» (Review Focus 3): первый подключил; `reuse-next` с его `whoopUserId`; второй подключает → `/settings?whoop=taken`, у второго `whoopUserIdOf` = `null`, у первого — прежний;
  - «отключение удаляет данные»: подключить → «Отключить WHOOP» → подтвердить → карточка «Не подключён», `whoopWorkoutCount = 0`, `/__control/revoked` → `true`.
- [ ] **Step 3:** `npm run build && npx playwright test whoop --project=desktop` → FAIL.
- [ ] **Step 4: Маршруты.** `connect`: `requireUser` (без входа — редирект на `/login`), `whoopAvailable` иначе 404, `consent=1` обязателен (иначе 400), `state = randomBytes(16).toString("hex")` → cookie `hf_whoop_state` (`httpOnly`, `sameSite: "lax"`, `path: "/api/whoop"`, `maxAge: 600`, `secure` в production) и `hf_whoop_consent` = ISO-время согласия (те же атрибуты) → 302 на `oauthUrl("auth")` с `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`. `callback`: проверки и ветки — как в спеке («Подключение», п. 4); `consentAt` — из `hf_whoop_consent`; обе cookie стереть; история — `after(() => syncRange(user.id, now − 30 дн, now).catch(...))`; при `taken` — сначала сохранить токен во временную переменную и вызвать отзыв напрямую по нему (не через `revokeAccess(userId)`, у которого нет строки).
- [ ] **Step 5: Карточка `/settings`** (`WhoopCard`, рядом с `TelegramCard`, видна при `whoopAvailable`): состояния и диалог согласия — тексты из спеки; кнопка «Продолжить» — `<a href="/api/whoop/connect?consent=1">` с видом кнопки (`buttonVariants`), недоступна без галочки; отключение — диалог подтверждения «Отключить WHOOP? Данные WHOOP в Hero Fit удалятся». Тосты по `?whoop=connected|denied|taken|error`: «WHOOP подключён», «Подключение отменено», «Этот аккаунт WHOOP уже подключён к другому профилю», «Не удалось подключить WHOOP».
- [ ] **Step 6: История > 25** (Review Focus 2): тест «история за 30 дней»: `seedWorkouts` → `latestWorkout`; `PUT /__control/workouts` с 26 активностями, где совпадающая с тренировкой — самая старая, остальные — позже, не пересекаются → подключить → `whoopWorkoutCount` = 26 (`expect.poll`, история в `after()`).
- [ ] **Step 7:** `npm run build && npx playwright test whoop --project=desktop` → PASS.
- [ ] **Step 8: Commit** — `feat(whoop): connect with consent, disconnect, fake WHOOP for e2e`.

### Task 5: Карточка WHOOP в сводке и «Обновить»

**Files:**
- Create: `components/workouts/whoop-card.tsx` (client), `lib/whoop/card.ts`, `lib/whoop/card.test.ts`
- Modify: `lib/whoop/queries.ts`, `lib/whoop/actions.ts`, `components/workouts/workout-summary-view.tsx` (проп `wearable?: ReactNode`, выводится перед `feedback`), `app/(app)/workouts/[id]/page.tsx`, `app/globals.css` (токены `--zone-0` … `--zone-5`, обе темы), `e2e/whoop.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`matchWhoop`, `WhoopMatch`, `WhoopSummary`), Task 3 (`syncRange`, ошибки), Task 4 (`getWhoopStatus`, `whoopAvailable`)
- Produces:
  - `type WhoopCardState = { kind: "data"; summary: WhoopSummary } | { kind: "pending" } | { kind: "waiting" } | { kind: "none" } | { kind: "reauth" }`
  - `cardState(match: WhoopMatch, finishedAt: Date, now: Date, needsReauth: boolean): WhoopCardState` (`lib/whoop/card.ts`, чистая): `needsReauth` → `reauth`; `data`/`pending` — как есть; `null` и `now − finishedAt < 48 ч` → `waiting`, иначе `none`
  - `getWhoopCard(userId: string, w: { startedAt: Date | null; finishedAt: Date | null; status: string }): Promise<WhoopCardState | null>` (`queries.ts`) — `null`, если не `COMPLETED`, нет времени или нет подключения; кандидаты — `start < finishedAt && end > startedAt`
  - `refreshWhoopAction(workoutId: string): Promise<{ status: "ok"; card: WhoopCardState } | { status: "throttled" | "unavailable" | "reauth" }>` — своя `COMPLETED`; троттлинг: условный `updateMany` по `lastSyncAt < now − 60 с` (или `null`) — `count = 0` → `throttled`; `syncRange(startedAt − 30 мин, finishedAt + 30 мин)`; `WhoopReauthError` → `reauth`, `WhoopUnavailableError` → `unavailable`
  - `WhoopCard({ workoutId, initial }: { workoutId: string; initial: WhoopCardState })` — при `initial.kind === "waiting"` один раз вызывает `refreshWhoopAction` на монтировании

- [ ] **Step 1: Тест `card.test.ts`**: `needsReauth` важнее данных; `null` через 47 ч → `waiting`, через 49 ч → `none`; `pending` проходит как есть.
- [ ] **Step 2: e2e** в `whoop.spec.ts`:
  - «пульс в старой сводке»: тренировка 3 дня назад, активность avg 140 / max 172 / strain 12.3 / 1500 кДж → подключить → `/workouts/<id>`: «Средний пульс» 140, «Макс. пульс» 172, «Strain» «12,3», «Ккал» 359; таблица зон доступна по роли `table`;
  - «обработка → Обновить» + Review Focus 1: тренировка час назад, активность `PENDING_SCORE` → подключить → сводка «WHOOP ещё обрабатывает тренировку»; `PUT` той же активности `SCORED` → подождать 61 с нельзя — тест сбрасывает `lastSyncAt` хелпером `resetWhoopSync(login)` (`e2e/db.ts`) → «Обновить» → данные; затем сразу снова «Обновить» → «Обновить можно через минуту», а не «Переподключите WHOOP»;
  - «не записал»: тренировка 3 дня назад без активностей → текст «WHOOP не записал активность в это время…»;
  - «две активности»: подпись «по 2 активностям WHOOP».
- [ ] **Step 3:** `npx vitest run lib/whoop && npm run build && npx playwright test whoop --project=desktop` → FAIL.
- [ ] **Step 4: Реализовать** `card.ts`, `getWhoopCard`, `refreshWhoopAction`, `WhoopCard` (плитки как в сводке; strain — `toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 })`; полоса зон — `div` с долями `zonesMs`, подписи «Зона N · M мин», `div.sr-only` с таблицей), слот в странице: `wearable={await whoopAvailable(user.id) ? <WhoopSlot …/> : null}` — только на `/workouts/[id]` (страница уже только для владельца: `getWorkoutSummary(user.id, id)`).
- [ ] **Step 5:** те же команды → PASS.
- [ ] **Step 6: Commit** — `feat(whoop): heart rate and strain card in workout summary`.

### Task 6: Вебхук

**Files:**
- Create: `app/api/whoop/webhook/route.ts`
- Modify: `e2e/whoop.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`verifyWhoopSignature`), Task 3 (`syncOne`, `removeOne`)
- Produces: `POST /api/whoop/webhook` — `await req.text()` → подпись (`secret = env.WHOOP_CLIENT_SECRET`, `now = Date.now()`) иначе 401 → JSON `{ user_id, id, type }` (битый — 204) → подключение по `whoopUserId = String(user_id)` (нет — 204) → `after()`: `workout.updated` → `syncOne`, `workout.deleted` → `removeOne`; ошибки — `console.error("[whoop] webhook", type, (e as Error).name)` → 204

- [ ] **Step 1: e2e** (хелпер `sendWhoopWebhook(request, body)` в спеке — подпись `createHmac("sha256", "e2e-whoop-secret").update(ts + raw).digest("base64")`):
  - «вебхук добавляет активность»: подключить, тренировка час назад → `PUT` активности → вебхук `workout.updated` → `expect.poll(whoopWorkoutCount)` = 1 → сводка с пульсом;
  - повтор того же вебхука → по-прежнему 1 (Review Focus 4);
  - `workout.deleted` → 0;
  - неверная подпись → 401; неизвестный `user_id` → 204 и счётчик не меняется (Review Focus 4).
- [ ] **Step 2:** `npm run build && npx playwright test whoop --project=desktop` → FAIL.
- [ ] **Step 3: Реализовать** маршрут.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** — `feat(whoop): signed webhook for workout updates`.

### Task 7: «Мои данные», удаление аккаунта, политика, документация

**Files:**
- Modify: `lib/account/export.ts` (+ `export.test.ts`), `lib/account/export-queries.ts`, `lib/account/actions.ts`, `app/(marketing)/privacy/page.tsx`, `e2e/whoop.spec.ts`, `docs/features/training.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: Task 3 (`revokeAccess`)
- Produces: раздел выгрузки `whoop`: `ExportRaw.whoop: { connectedAt: Date; consentAt: Date; workouts: unknown[] } | null`; в `buildExport` — как есть (без токенов: запрос выбирает только `createdAt`, `consentAt` и строки `WhoopWorkout` без `userId`)

- [ ] **Step 1: Unit** — в `export.test.ts`: `"whoop"` есть в `EXPORT_SECTIONS`; в результате `buildExport` с `whoop` нет ключей `accessToken`/`refreshToken` ни на каком уровне.
- [ ] **Step 2: e2e**: «Мои данные» — после подключения JSON-выгрузка содержит `whoop.consentAt` и активность; «удаление аккаунта» — после удаления `whoopWorkoutCount` = 0 и `/__control/revoked` → `true`.
- [ ] **Step 3:** `npx vitest run lib/account && npm run build && npx playwright test whoop account-data --project=desktop` → FAIL.
- [ ] **Step 4: Реализовать**: раздел выгрузки; в `deleteAccountAction` — `await revokeAccess(user.id)` **до** транзакции (HTTP внутри транзакции нельзя), строки уходят каскадом; `/privacy` — раздел «Данные WHOOP» по спеке (состав, цель, отдельное согласие, хранение в РФ, срок — пока подключён, отзыв — «Отключить WHOOP», данные удаляются); `docs/features/training.md` — пункт «WHOOP» (модули, маршруты, флаг, e2e-сервер, что нужно в кабинете WHOOP); CLAUDE.md, «Сквозные правила» — к правилу про боль: «исключение — данные WHOOP: на сервере по отдельному согласию при подключении, удаляются при отключении».
- [ ] **Step 5:** → PASS; затем полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.
- [ ] **Step 6: Commit** — `feat(whoop): data export, account deletion, privacy policy, docs`.
