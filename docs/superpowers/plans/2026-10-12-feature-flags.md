# Фича-флаги — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Флаги в БД с реестром в коде, процентом раскатки, списком пользователей и kill switch; админка `/admin/flags` для `ADMIN_LOGINS`; аналитика силы — под флагом `strength_analytics`.

**Architecture:** Чистые `flagOn`/`bucket` + реестр; сервер читает все строки `FeatureFlag` с кэшем в памяти процесса; layout отдаёт включённые флаги клиенту через контекст. Админ — по логину из env.

**Tech Stack:** Next.js 16, Prisma 7, Zod, Base UI (shadcn base-nova), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-feature-flags-design.md`

## Global Constraints

- Ветка `feat/feature-flags` от `release/2026-10-raids`; слияние — после решения пользователя.
- Нет строки или `enabled = false` → выключен для всех (включая список). Гость — только при `percent = 100`.
- `bucket` — FNV-1a 32 бита от `${key}:${userId}` по модулю 100.
- Кэш `FLAGS_CACHE_MS` (по умолчанию 10 000), e2e — `0`.
- Не-админ на `/admin/*` → 404 (`notFound()`).
- Серверный код проверяет флаг сам; `useFlag` — только для показа.
- Миграция не должна удалять частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.

## Review Focus

1. Флаг выключен, но пользователь в списке → выключен (kill switch сильнее списка) → тест в Task 1.
2. Рост процента 10 → 25: все, у кого было включено, остаются → тест в Task 1 (монотонность по bucket).
3. Админ ввёл несуществующий логин или дубль в список → понятная ошибка, без дублей → тест в Task 3 (e2e/Zod).
4. Уже собранный снимок итогов со `strength` при выключенном флаге → блок не показывается → тест в Task 4 (e2e).
5. Строка в БД с ключом, которого нет в реестре → не ломает `enabledFlags`, видна как «Устаревшие» → тест в Task 1 (`enabledFlags` фильтрует по реестру — чистая часть).

---

### Task 1: Ядро флагов

**Files:**
- Create: `prisma/migrations/<ts>_feature_flags/` (через `npx prisma migrate dev --name feature_flags`), `lib/flags/registry.ts`, `lib/flags/eval.ts`, `lib/flags/eval.test.ts`, `lib/flags/server.ts`
- Modify: `prisma/schema.prisma` (модель `FeatureFlag` по спеке), `lib/env.ts` (`ADMIN_LOGINS: z.string().optional()`, `FLAGS_CACHE_MS: z.coerce.number().int().min(0).default(10_000)`), `.env.example` (оба, закомментированы, с пояснением)

**Interfaces:**
- Produces:
  - `export const FLAGS = { strength_analytics: { description: "Аналитика силы: «Ты стал сильнее» в итогах и push, «Месяц к месяцу», прогноз целей", expires: "2026-12-31" } } as const` и `export type FlagKey = keyof typeof FLAGS`, `export const FLAG_KEYS: FlagKey[]`, `export function isFlagKey(k: string): k is FlagKey`
  - `export type FlagState = { enabled: boolean; percent: number; userIds: string[] }`
  - `export function bucket(key: string, userId: string): number` (0…99)
  - `export function flagOn(key: string, state: FlagState | null, userId: string | null): boolean`
  - `export function enabledKeys(states: Map<string, FlagState>, userId: string | null): FlagKey[]` — по реестру (строки не из реестра игнорируются)
  - `lib/flags/server.ts`: `getFlagStates(): Promise<Map<string, FlagState>>`, `invalidateFlags(): void`, `isEnabled(key: FlagKey, userId: string | null): Promise<boolean>`, `enabledFlags(userId: string | null): Promise<FlagKey[]>`

- [ ] **Step 1: Схема и миграция** — модель `FeatureFlag` по спеке; `npx prisma migrate dev --name feature_flags`; проверить SQL миграции (только CREATE TABLE); `npx prisma generate`.
- [ ] **Step 2: Падающие тесты** `eval.test.ts`:
  - `flagOn("x", null, "u")` → false; `{ enabled: false, percent: 100, userIds: ["u"] }` → false.
  - `{ enabled: true, percent: 0, userIds: ["u"] }` → true для "u", false для "v".
  - `percent: 100` → true для любого; гость (`null`) — true только при 100, при 99 — false.
  - `bucket` в 0…99, одинаков при повторе; для 1000 id доля `bucket < 25` в 20…30 %.
  - монотонность: для 200 id все включённые при 10 % включены при 25 %.
  - разные ключи: `bucket("a", id) !== bucket("b", id)` хотя бы для части из 50 id.
  - `enabledKeys(new Map([["strength_analytics", on100], ["old_flag", on100]]), "u")` → `["strength_analytics"]`.
  - реестр: каждый `expires` — валидная дата `YYYY-MM-DD` и не раньше сегодняшней (`new Date().toISOString().slice(0,10)`).
- [ ] **Step 3:** `npx vitest run lib/flags` — FAIL (нет модуля).
- [ ] **Step 4: Реализовать** `registry.ts`, `eval.ts` (FNV-1a: `h = 0x811c9dc5`, на каждый символ `h ^= code; h = Math.imul(h, 0x01000193) >>> 0`), `server.ts` (`import "server-only"`; модульные `cache: { at: number; states } | null`; `getFlagStates` — `db.featureFlag.findMany`, свежесть по `env.FLAGS_CACHE_MS`).
- [ ] **Step 5:** `npx vitest run lib/flags && npm run typecheck` — PASS.
- [ ] **Step 6: Commit** `feat(flags): registry, evaluation, server cache`.

---

### Task 2: Админ и контекст флагов

**Files:**
- Create: `lib/auth/admin.ts`, `lib/auth/admin.test.ts`, `components/flags/flags-provider.tsx`
- Modify: `lib/auth/dal.ts` (`CurrentUser.isAdmin: boolean` — из `isAdminLogin(login, env.ADMIN_LOGINS)`), `app/(app)/layout.tsx` (`FlagsProvider flags={await enabledFlags(user.id)}` вокруг содержимого `AppShell`), `components/app/user-menu.tsx` (пункт «Флаги» → `/admin/flags` при `user.isAdmin`, иконка `ToggleRight`)

**Interfaces:**
- Consumes: `enabledFlags`, `FlagKey` (Task 1).
- Produces: `export function isAdminLogin(login: string, adminLogins: string | undefined): boolean`; `export async function requireAdmin(): Promise<CurrentUser>`; `FlagsProvider({ flags: FlagKey[]; children })`, `useFlag(key: FlagKey): boolean`.

- [ ] **Step 1: Падающие тесты** `admin.test.ts`: `isAdminLogin("One", "one, two")` → true; `"three"` → false; `undefined`/`""` → false; пробелы и пустые элементы (`"one,,"`) не дают админа пустому логину.
- [ ] **Step 2:** `npx vitest run lib/auth/admin` — FAIL.
- [ ] **Step 3: Реализовать** `admin.ts` (`requireAdmin`: `requireUser()`, не админ → `notFound()`), `isAdmin` в `CurrentUser` (login уже читается в `dal.ts` — добавить в select, если нет), провайдер (`"use client"`, `createContext<ReadonlySet<FlagKey>>`), подключение в layout и меню.
- [ ] **Step 4:** `npx vitest run && npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(flags): admin by ADMIN_LOGINS, flags context`.

---

### Task 3: Страница `/admin/flags`

**Files:**
- Create: `lib/flags/actions.ts`, `lib/flags/schema.ts`, `lib/flags/schema.test.ts`, `app/(app)/admin/flags/page.tsx`, `components/flags/flag-card.tsx`
- Modify: `lib/flags/server.ts` (`getFlagsAdmin()`), `playwright.config.ts` (`FLAGS_CACHE_MS: "0"`, `ADMIN_LOGINS: "e2e_flag_admin"` в `env` webServer), `e2e/db.ts` (`setFlag`, `resetFlag`, `makeAdmin`)
- Test: `e2e/feature-flags.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`FLAGS`, `isFlagKey`, `invalidateFlags`, `getFlagStates`), Task 2 (`requireAdmin`).
- Produces:
  - `export const flagPatchSchema` (Zod): `{ enabled?: boolean; percent?: int 0…100; addUser?: string (trim, 1…40); removeUserId?: string }`, `MAX_FLAG_USERS = 100`
  - `saveFlagAction(key: string, patch: unknown): Promise<{ ok: true } | { ok: false; error: string }>`, `deleteStaleFlagAction(key: string): Promise<void>`
  - `getFlagsAdmin(): Promise<{ flags: { key: FlagKey; description: string; expires: string; expired: boolean; state: FlagState & { updatedAt: Date | null; updatedBy: string | null }; users: { id: string; label: string }[]; reach: number }[]; stale: string[] }>`
  - e2e: `setFlag(key: string, s: { enabled: boolean; percent?: number; logins?: string[] })`, `resetFlag(key: string)`, `makeAdmin(login: string)` (освобождает логин `e2e_flag_admin` у прежнего владельца — `login = 'e2e_old_' || id` — и переименовывает пользователя)

- [ ] **Step 1: Падающие тесты** `schema.test.ts`: `percent: 101` и `-1` и `2.5` — ошибка «Процент — от 0 до 100»; `addUser: "  "` — ошибка; валидный патч проходит.
- [ ] **Step 2:** `npx vitest run lib/flags/schema` — FAIL.
- [ ] **Step 3: Реализовать** схему и actions: `requireAdmin`; `isFlagKey` иначе `{ ok: false, error: "Неизвестный флаг" }`; `addUser` — поиск по `login` или `nicknameKey` (без регистра) → нет: «Пользователь не найден»; уже в списке — без дубля, `{ ok: true }`; > 100 — «Не больше 100 пользователей»; upsert, `updatedBy` = логин админа; `invalidateFlags()`; `console.info`; `revalidatePath("/", "layout")`. `getFlagsAdmin`: подписи пользователей — `nickname ?? login`; `reach` — `enabled ? round(active28 × percent / 100) + userIds.length : 0`, `active28` — число пользователей с завершённой тренировкой за 28 дней.
- [ ] **Step 4: UI** — страница (`requireAdmin`, заголовок «Флаги», карточки `FlagCard`, блок «Устаревшие» с кнопкой «Удалить строку»). `FlagCard` (`"use client"`, `article aria-label=<key>`): `Switch aria-label="Включён"`, кнопки процента (`aria-pressed`) и `Input aria-label="Процент"`, поле «Логин или ник» + «Добавить», список с кнопками «Убрать <label>», строка «Изменил: …», «Сейчас у ≈ N», «Пора удалить из кода» при `expired`; ошибки — `toast.error`.
- [ ] **Step 5: e2e** `feature-flags.spec.ts` (`test.describe.configure({ mode: "serial" })`, в `afterEach` — `resetFlag("strength_analytics")`):
  - «non-admin gets 404»: `registerUser` → `/admin/flags` → текст «404» / страница не найдена.
  - «admin rolls out strength_analytics to self and kills it»: `registerUser` → `makeAdmin(login)` → `/admin/flags` → в карточке `strength_analytics` добавить свой логин (флаг выключен) → `/stats` без региона «Месяц к месяцу» (тренировка сегодня — `seedWorkouts(..., 0)`) → включить «Включён» → `/stats` с регионом → выключить → снова без региона. Несуществующий логин → «Пользователь не найден».
  (Регион «Месяц к месяцу» появляется под флагом в Task 4 — до неё шаги «с регионом» падают; ожидаемо: этот сценарий закрывается в Task 4.)
- [ ] **Step 6:** `npx vitest run && npm run typecheck && npm run build && npx playwright test feature-flags -g "404" --workers=8` — PASS.
- [ ] **Step 7: Commit** `feat(flags): admin flags page`.

---

### Task 4: `strength_analytics` под флагом

**Files:**
- Modify: `lib/recap/queries.ts` (`loadRecapInput`: `strengthWeeks: []` при `!isEnabled("strength_analytics", userId)`), `components/recap/recap-view.tsx` и `components/recap/recap-card.tsx` (блок/строка — только при флаге смотрящего: проп `strength: boolean` от страниц `/recap/[week]` и дашборда через `isEnabled`), `components/stats/stats-view.tsx` (`month: MonthCompare | null`), `app/(app)/stats/page.tsx` и `app/(app)/coach/clients/[id]/page.tsx` (`getMonthCompare` только при флаге владельца статистики), `lib/goals/forecast-queries.ts` (пустой `Map` при выключенном флаге владельца целей)
- Modify: `e2e/strength-analytics.spec.ts` (`beforeEach`: `setFlag("strength_analytics", { enabled: true, percent: 100 })`; `afterEach`: `resetFlag`; `test.describe.configure({ mode: "serial" })` — флаг глобальный), `e2e/feature-flags.spec.ts` (полный сценарий из Task 3)
- Modify: `CLAUDE.md` — пункт про флаги (реестр, `flagOn`, кэш, `ADMIN_LOGINS`, `/admin/flags`, e2e-хелперы, правила жизненного цикла и «Премиум — не флаги»); в пункте про тренд силы — «под флагом `strength_analytics`».

**Interfaces:**
- Consumes: `isEnabled` (Task 1), `setFlag`/`resetFlag`/`makeAdmin` (Task 3).

- [ ] **Step 1: e2e RED** — добавить в `strength-analytics.spec.ts` тест «flag off hides the month card and recap block»: `resetFlag`, пользователь с тренировкой сегодня и недельной историей роста (как в первом тесте) → `/stats` без региона «Месяц к месяцу», `/recap/<week>` без региона «Сильнее» (снимок создаётся при открытии — `strength` не попадает); затем `setFlag(…100)` и уже собранный снимок прошлой недели другого пользователя со `strength` при выключенном флаге — блок скрыт (снимок собрать при включённом флаге, выключить, перезагрузить). Запустить на текущем билде — FAIL.
- [ ] **Step 2: Реализовать** проверки по списку файлов.
- [ ] **Step 3:** `npx vitest run && npm run typecheck && npm run lint && npm run build && npx playwright test strength-analytics feature-flags recap stats goals coach --workers=8` — PASS (в т.ч. полный сценарий админки).
- [ ] **Step 4: Commit** `feat(flags): strength analytics behind strength_analytics flag`, затем полный прогон `npm run test:e2e -- --workers=8` и commit документации, если ещё не в этом коммите.
