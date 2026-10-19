# WHOOP: сон, восстановление и советы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** сон и восстановление WHOOP хранятся у нас, показываются карточкой на дашборде с советами и влияют на экран тренировки (зона, «Облегчить»).

**Architecture:** новая модель `WhoopSleep` (строка на основной сон, в ней и восстановление) заполняется тем же путём, что `WhoopWorkout`: загрузка за период, вебхуки, «Обновить». Вся логика дня, зон и советов — чистые функции `lib/whoop/recovery.ts`; один запрос `getWhoopRecovery` отдаёт готовый вид дашборду, экрану тренировки и помощнику.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `after()`), Prisma 7 + PostgreSQL, Vitest, Playwright, Tailwind + shadcn (Base UI).

**Spec:** `docs/superpowers/specs/2026-10-19-whoop-recovery-design.md`

## Global Constraints

- Всё под существующим флагом `whoop` (`whoopAvailable(userId)`); новых флагов нет.
- Scope подключения: `read:workout read:profile read:recovery read:sleep offline`; `read:cycles` не запрашивать.
- Зоны: `≥ 67` green, `34…66` yellow, `≤ 33` red.
- Базовая линия — 7 предыдущих ночей с `recoveryScoreState = "SCORED"`, меньше 4 — нет базовой линии.
- Недосып — `sleepMs < 0.7 · needMs`; HRV — ниже базовой на 15 %+; пульс покоя — выше базового на 5+ уд/мин; хороший день — green, `performancePct ≥ 90`, HRV выше базовой.
- «Облегчить» — `−10 %`, округление вниз: шаг 1 кг до 20 кг, дальше 2,5 кг.
- Ошибки синхронизации в логи/мониторинг — только `name` (у `WhoopUnavailableError` — статус), никогда message/stack.
- Запись данных WHOOP — только в транзакции с `select … from "WhoopConnection" where "userId" = … for share` и сверкой `whoopUserId`.
- Дневной сон (`nap: true`) не сохраняется.
- Даты «сегодня» — в `safeTimeZone(user.timeZone)` через `dayKey` из `lib/daily-login.ts`.
- Цвета — только семантические токены; анимации — с учётом «уменьшить движение»; новые числовые поля ввода не появляются.
- Тексты интерфейса — по-русски, как в спеке.
- e2e WHOOP — `test.describe.configure({ mode: "serial" })`, только desktop.

## Review Focus

1. Сон, закончившийся после полуночи по UTC, но до полуночи по поясу пользователя (и наоборот) — должен относиться к суткам пользователя. → тест в Task 4 (`todaySleep` с `Etc/GMT-10` и `America/Los_Angeles`).
2. Вебхук `recovery.updated` пришёл раньше `sleep.updated` (строки сна ещё нет) — строка создаётся, восстановление не теряется. → e2e в Task 3.
3. Старое подключение без `read:recovery`: никакие запросы сна/восстановления не уходят в WHOOP (иначе 401 → `needsReauth` сломал бы пульс). → unit/e2e в Task 3 (счётчик запросов фейка = 0).
4. «Облегчить», затем человек вручную меняет вес подхода, затем «Вернуть» — ручная правка не затирается. → unit в Task 7.
5. Переподключение другого аккаунта WHOOP — сны прежнего аккаунта удаляются, как активности. → e2e в Task 1.

---

### Task 1: Схема, scope и очистка снов

**Files:**
- Modify: `prisma/schema.prisma` (модели `WhoopConnection`, `User`, новая `WhoopSleep`)
- Create: `prisma/migrations/<ts>_whoop_sleep/migration.sql` (через `npx prisma migrate dev --create-only --name whoop_sleep`)
- Modify: `lib/whoop/config.ts`, `lib/whoop/tokens.ts`, `app/api/whoop/callback/route.ts`, `lib/whoop/actions.ts` (`disconnectWhoopAction`)
- Modify: `e2e/whoop-server.ts` (scope из `/oauth/oauth2/auth` → в ответ токена и при refresh)
- Modify: `e2e/db.ts` (+ `whoopScopes`, `setWhoopScopes`, `whoopSleepCount`, `insertWhoopSleep(login, night)`)
- Test: `lib/whoop/tokens.test.ts` (новый, `parseTokenResponse`), `e2e/whoop.spec.ts`

**Interfaces:**
- Produces: `WHOOP_SCOPES = "read:workout read:profile read:recovery read:sleep offline"`; `WHOOP_LEGACY_SCOPES = "read:workout read:profile offline"`; `hasScope(scopes: string, scope: string): boolean` (в `config.ts`, без `server-only`-зависимостей — вынести в `lib/whoop/scopes.ts`, `config.ts` реэкспортирует); `WhoopTokenSet` += `scope: string | null`; экспорт `parseTokenResponse` для теста; модель `WhoopSleep` (поля — как в спеке, раздел «Данные»); `WhoopConnection.scopes String @default("")`.

- [ ] **Step 1:** тест `parseTokenResponse`: `{access_token:"a",refresh_token:"r",expires_in:60,scope:"read:sleep offline"}` → `scope === "read:sleep offline"`; без `scope` или с нестроковым → `scope === null`; прежние отказы (нет токена) по-прежнему бросают `WhoopUnavailableError`. И `hasScope("read:workout read:sleep", "read:sleep") === true`, `hasScope("read:sleepy", "read:sleep") === false`, `hasScope("", "read:sleep") === false`.
- [ ] **Step 2:** `npx vitest run lib/whoop/tokens.test.ts` → FAIL.
- [ ] **Step 3:** схема + миграция. В SQL миграции после `ADD COLUMN` дописать `UPDATE "WhoopConnection" SET "scopes" = 'read:workout read:profile offline';`. Проверить, что SQL миграции не удаляет частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`. `npx prisma migrate dev`.
- [ ] **Step 4:** `parseTokenResponse` → `scope`; `getAccessToken` при refresh пишет `scopes: next.scope` только если не `null`; callback пишет `scopes: tokens.scope ?? WHOOP_SCOPES`; при смене аккаунта WHOOP в той же транзакции — `db.whoopSleep.deleteMany`; `disconnectWhoopAction` — `whoopSleep.deleteMany` после удаления подключения (порядок как у активностей).
- [ ] **Step 5:** фейк: `GET /oauth/oauth2/auth` запоминает `scope` из query для кода; токен (`issue`) возвращает этот scope, refresh — scope исходного токена (хранить в `accessTokens`/`refreshTokens`).
- [ ] **Step 6:** e2e в `e2e/whoop.spec.ts`: «подключение сохраняет новые scope» — после подключения `whoopScopes(login)` содержит `read:recovery` и `read:sleep`; «переподключение другого аккаунта удаляет сны» — вставить сон SQL-ом (`insertWhoopSleep` в `e2e/db.ts`), подключить другой user_id, `whoopSleepCount(login) === 0`.
- [ ] **Step 7:** `npx vitest run lib/whoop` и `npm run typecheck` → PASS; `npm run build && npx playwright test e2e/whoop.spec.ts --project=desktop` → PASS.
- [ ] **Step 8:** commit `feat(whoop): sleep model and recovery/sleep scopes`.

### Task 2: Нормализация сна и восстановления

**Files:**
- Modify: `lib/whoop/types.ts`, `lib/whoop/map.ts`
- Test: `lib/whoop/map.test.ts`

**Interfaces:**
- Produces:
  - `WhoopApiSleep`, `WhoopApiRecovery` — поля из спеки («Ограничения WHOOP API»).
  - `WhoopSleepRow = { id; cycleId: string; start: Date; end: Date; sleepScoreState: WhoopScoreState; sleepMs: number|null; needMs: number|null; performancePct: number|null }`.
  - `WhoopRecoveryRow = { sleepId: string; recoveryScoreState: WhoopScoreState; recoveryPct: number|null; restingHr: number|null; hrvMs: number|null; calibrating: boolean }`.
  - `toWhoopSleep(s: WhoopApiSleep): WhoopSleepRow | null`, `toWhoopRecovery(r: WhoopApiRecovery): WhoopRecoveryRow | null`.

- [ ] **Step 1:** тесты: полный сон → `sleepMs` = light + slow wave + rem, `needMs` = сумма четырёх `sleep_needed`, `performancePct` округлён, `cycleId` — строка из числа; `nap: true` → `null`; нет `id`/битый `end` → `null`; `score_state: "PENDING_SCORE"` без `score` → поля `null`; строка вместо числа в стадии → `sleepMs: null`; восстановление: `hrvMs` без округления (`38.27`), `recoveryPct`/`restingHr` округлены, `user_calibrating: true` → `calibrating: true`, нет `sleep_id` → `null`.
- [ ] **Step 2:** `npx vitest run lib/whoop/map.test.ts` → FAIL.
- [ ] **Step 3:** реализация на существующих `num`/`int`/`date`; сумма с хотя бы одним нечисловым слагаемым → `null`.
- [ ] **Step 4:** тесты → PASS.
- [ ] **Step 5:** commit `feat(whoop): normalize sleep and recovery`.

### Task 3: Синхронизация снов и вебхуки

**Files:**
- Create: `lib/whoop/sleep-sync.ts`
- Modify: `app/api/whoop/callback/route.ts` (история снов в `after()`), `app/api/whoop/webhook/route.ts`
- Modify: `e2e/whoop-server.ts` (`/v2/activity/sleep`, `/v2/activity/sleep/:id`, `/v2/recovery`, `/v2/cycle/:id/recovery`, `PUT /__control/sleeps?user=` — тело `{ sleeps: WhoopApiSleep[]; recoveries: WhoopApiRecovery[] }`, `GET /__control/requests?path=` — счётчик запросов по префиксу пути; эндпоинты сна/восстановления без нужного scope у токена → 401)
- Modify: `e2e/db.ts` (+ `whoopSleepRow(login, id)`)
- Test: `e2e/whoop.spec.ts`

**Interfaces:**
- Consumes: `toWhoopSleep`, `toWhoopRecovery` (Task 2), `hasScope` (Task 1), `whoopGet` из `client.ts`.
- Produces:
  - `syncSleepRange(userId: string, from: Date, to: Date): Promise<void>` — читает `scopes`; без `read:sleep` — ничего; без `read:recovery` — только сон.
  - `syncSleepOne(userId, whoopUserId, sleepId): Promise<void>`, `syncRecoveryOne(userId, whoopUserId, sleepId): Promise<void>`.
  - `removeSleep(userId, sleepId)`, `clearRecovery(userId, sleepId)`.

- [ ] **Step 1:** e2e (падают):
  - «история снов при подключении» — фейку отдать 2 сна + 1 nap + 2 восстановления, подключить, дождаться `whoopSleepCount === 2`, у одного `recoveryPct` записан;
  - «старое подключение не ходит за снами» — `setWhoopScopes(login, legacy)`, вебхук `sleep.updated` → `GET /__control/requests?path=/v2/activity/sleep` = 0, `whoopNeedsReauth === false`;
  - «recovery.updated раньше сна» — подписанный вебхук `recovery.updated` по новому сну → строка есть, `recoveryPct` записан;
  - «sleep.deleted» → строки нет; «recovery.deleted» → `recoveryPct === null`, строка сна есть.

  Подпись вебхука — как в существующих тестах вебхука `workout.updated`.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/whoop.spec.ts --project=desktop` → новые FAIL.
- [ ] **Step 3:** `sleep-sync.ts` по образцу `sync.ts` (страницы по 25, `MAX_PAGES`, транзакция `FOR SHARE` со сверкой `whoopUserId`). `syncSleepRange`: сначала сны, затем восстановления, upsert восстановления — `updateMany` по `id = sleepId, userId` (сна нет — пропуск). `syncRecoveryOne`: сон по id (нет → `removeSleep`) → upsert сна → `/v2/cycle/{cycleId}/recovery` (404 → `clearRecovery`) → поля восстановления. Callback: в том же `after()` после `syncRange` — `syncSleepRange(30 дней)`.
- [ ] **Step 4:** вебхук принимает `sleep.updated|deleted`, `recovery.updated|deleted`; разбор и лог ошибок — как у `workout.*`.
- [ ] **Step 5:** e2e → PASS; `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 6:** commit `feat(whoop): sync sleep and recovery, webhooks`.

### Task 4: День, зоны, базовая линия и советы

**Files:**
- Create: `lib/whoop/recovery.ts`
- Test: `lib/whoop/recovery.test.ts`

**Interfaces:**
- Consumes: `GroupRecovery` (`lib/progress/recovery.ts`), `MUSCLE_GROUP_LABELS` (`lib/muscle-groups.ts`), `dayKey` (`lib/daily-login.ts`).
- Produces:
  - `type SleepNight = { end: Date; sleepScoreState: string; sleepMs: number|null; needMs: number|null; performancePct: number|null; recoveryScoreState: string|null; recoveryPct: number|null; restingHr: number|null; hrvMs: number|null; calibrating: boolean }`.
  - `type RecoveryZone = "green" | "yellow" | "red"`.
  - `recoveryZone(pct: number | null): RecoveryZone | null`.
  - `todaySleep(nights: SleepNight[], now: Date, timeZone: string): SleepNight | null`; `yesterdaySleep(...)` — то же для прошлых суток.
  - `baseline(nights: SleepNight[], today: SleepNight): { hrvMs: number; restingHr: number } | null` — 7 ночей до `today.end`.
  - `zoneText(zone: RecoveryZone): string` — тексты зон из спеки.
  - `type Advice = { id: "rhr" | "hrv" | "sleep" | "muscles" | "good-day"; tone: "warn" | "good"; text: string; href?: string }`.
  - `whoopAdvice(input: { today: SleepNight; yesterday: SleepNight | null; base: { hrvMs: number; restingHr: number } | null; muscles: GroupRecovery[] }): Advice[]` — по приоритету: rhr, hrv, sleep, muscles, good-day; good-day только без предупреждений.

- [ ] **Step 1:** тесты:
  - `recoveryZone`: 67 → green, 66 → yellow, 34 → yellow, 33 → red, `null` → `null`;
  - `todaySleep`: сон с `end` 2026-10-19T21:30Z при `Etc/GMT-10` — это 20-е, при `now` 2026-10-19T22:00Z он «сегодня»; при `America/Los_Angeles` и том же `now` сегодня — 19-е, сон тоже 19-го; сон с `end > now` не выбирается; из двух сегодняшних — с бо́льшим `end`;
  - `baseline`: 3 ночи → `null`; 8 ночей → берутся 7 последних до `today`, ночи с `recoveryScoreState !== "SCORED"` не считаются;
  - советы:
    - `sleepMs = 5h, needMs = 8h` → `sleep` с «Недоспал 3 ч» (форматом `formatDuration`);
    - вчера тоже < 70 % → текст «Второй день недосыпа — лучше лечь пораньше»;
    - HRV 40 при базе 50 → `hrv`; 43 → нет;
    - пульс 60 при базе 54 → `rhr` с «на 6»; 58 → нет;
    - `calibrating: true` или `base: null` → ни `hrv`, ни `rhr`;
    - yellow + LEGS `state: "fatigued"` → `muscles`, текст содержит «Ноги»; green + fatigued → нет;
    - green, 92 %, HRV выше базы, нет предупреждений → `good-day` с `href: "/training"`;
    - порядок `rhr, hrv, sleep`.
- [ ] **Step 2:** `npx vitest run lib/whoop/recovery.test.ts` → FAIL.
- [ ] **Step 3:** реализация. Тексты — дословно из спеки; в `muscles` — до двух групп в состоянии `fatigued` через `MUSCLE_GROUP_LABELS`, «… ещё восстанавливаются — сегодня лучше другие группы мышц».
- [ ] **Step 4:** тесты → PASS.
- [ ] **Step 5:** commit `feat(whoop): recovery zones and advice rules`.

### Task 5: Запрос вида восстановления

**Files:**
- Modify: `lib/whoop/queries.ts`

**Interfaces:**
- Consumes: всё из Task 4; `GroupRecovery[]` передаётся снаружи (дашборд и тренировка уже загружают `getMuscleRecovery`).
- Produces:
  ```ts
  export type WhoopRecoveryView =
    | { state: "no-access" }            // подключён, нет read:recovery
    | { state: "reauth" }               // needsReauth
    | { state: "empty"; yesterdayPct: number | null }
    | { state: "data"; zone: RecoveryZone | null; recoveryPct: number | null; pending: boolean; calibrating: boolean;
        hrvMs: number | null; restingHr: number | null; sleepMs: number | null; performancePct: number | null; advice: Advice[] };
  export function getWhoopRecovery(userId: string, timeZone: string, muscles: GroupRecovery[], now?: Date): Promise<WhoopRecoveryView | null>;
  ```
  `null` — флаг выключен или WHOOP не подключён. `pending` — восстановления ещё нет или `PENDING_SCORE`. Один `findMany` по `(userId, end ≥ now − 9 дней)`, `orderBy end desc`.

- [ ] **Step 1:** реализация (логика уже покрыта Task 4; здесь — только выборка и сборка). `npm run typecheck` → чисто.
- [ ] **Step 2:** commit `feat(whoop): recovery view query`.

### Task 6: Карточка на дашборде, «Разрешить» и «Обновить»

**Files:**
- Create: `components/dashboard/whoop-recovery-card.tsx` (сервер), `components/dashboard/whoop-refresh-button.tsx` (клиент), `components/whoop/recovery-ring.tsx` (кольцо, переиспользуется в Task 7), `components/whoop/allow-recovery-button.tsx` (клиент: открывает окно согласия)
- Modify: `components/devices/whoop-card.tsx` (вынести `ConsentDialog` в `components/whoop/consent-dialog.tsx`, экспорт; текст согласия — Task 9)
- Modify: `app/(app)/dashboard/page.tsx` (в `Promise.all` — после `getMuscleRecovery`: `getWhoopRecovery(user.id, userTz, recovery)`; карточка перед `<BodyMap>`)
- Modify: `lib/whoop/actions.ts` (+ `refreshWhoopRecoveryAction`)
- Modify: `app/globals.css` (токены `--recovery-green|yellow|red` в обеих темах + `--color-recovery-*`)
- Test: `e2e/whoop.spec.ts`

**Interfaces:**
- Consumes: `WhoopRecoveryView`, `getWhoopRecovery` (Task 5), `syncSleepRange` (Task 3), `syncRange`.
- Produces: `RecoveryRing({ pct: number | null; zone: RecoveryZone | null; size?: number })`; `ConsentDialog({ open, onOpenChange })`; `refreshWhoopRecoveryAction(): Promise<{ status: "ok" | "throttled" | "unavailable" | "reauth" }>` — троттлинг тем же условным `updateMany` по `lastSyncAt`, синхронизация тренировок и снов за 3 дня, `revalidatePath("/dashboard")`.

- [ ] **Step 1:** e2e (падают):
  - «плашка у старого подключения» — `setWhoopScopes(legacy)` → на `/dashboard` текст «WHOOP может показывать сон и восстановление», кнопка «Разрешить» открывает окно согласия;
  - «карточка — посчитано» — сегодняшний сон с `recoveryPct 78`, HRV 58, пульс 52, сон 7 ч 20 мин, 86 % → видны «78 %», «58 мс», «52 уд/мин», «7 ч 20 мин · 86 %», «можно тяжёлую тренировку»;
  - «считает» — сон без восстановления → «WHOOP считает…» и «7 ч 20 мин»;
  - «нет данных» — только вчерашний сон 64 % → «Данных за сегодня пока нет · вчера: 64 %»;
  - «советы» — 7 ночей HRV 50 и сегодня 40 → «HRV ниже твоей нормы»;
  - «Обновить» — фейку отдать сегодняшний сон, нажать «Обновить» → цифры появились; повторное нажатие сразу → тост троттлинга (тот же текст, что у «Обновить» в сводке тренировки, `components/workouts/whoop-card.tsx`).

  Даты — через `localAt`/`E2E_TZ`.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/whoop.spec.ts --project=desktop` → FAIL.
- [ ] **Step 3:** реализация по спеке, раздел «Интерфейс». Кольцо — SVG, `stroke-recovery-*`, анимация `stroke-dashoffset` один раз через `motion-safe:`. `aria-label` секции — «Восстановление WHOOP».
- [ ] **Step 4:** e2e → PASS; `npx playwright test e2e/dashboard*.spec.ts` → PASS (кабинет без WHOOP не изменился).
- [ ] **Step 5:** commit `feat(whoop): recovery card on dashboard`.

### Task 7: Зона на экране тренировки и «Облегчить»

**Files:**
- Create: `components/training/recovery-line.tsx`
- Modify: `components/training/workout-state.ts` (+ `lightenPlan`, действие `setWeights`)
- Modify: `components/training/workout-editor.tsx` (строка зоны, «Облегчить» + тост «Вернуть», скрытие значков прибавки, `wellbeing` для помощника)
- Modify: `components/training/start-screen.tsx`, `app/(app)/training/page.tsx` (загрузка `getWhoopRecovery` в обеих ветках, проп `whoop`)
- Test: `components/training/workout-state.test.ts`, `e2e/whoop.spec.ts`

**Interfaces:**
- Consumes: `WhoopRecoveryView` (Task 5), `RecoveryRing` (Task 6), `zoneText` (Task 4).
- Produces:
  - `lightenPlan(state: WorkoutState, skipExerciseIds: ReadonlySet<string>): { key: string; setKey: string; from: string; to: string }[]` — невыполненные, не разминка, не `isTimed(kind)`, `parseNumber(weight) > 0`, упражнение не в `skip`; `to` — `floor` по шагу (1 кг до 20 кг, дальше 2,5) от `0,9 · вес`; если `to ≤ 0` или `to ≥ from` — подход пропускается.
  - Действие `{ type: "setWeights"; weights: { key: string; setKey: string; weight: string; expect?: string }[] }` — ставит вес, только если подход есть, не выполнен и (при `expect`) его текущий вес равен `expect`.
  - Проп `whoop?: WhoopRecoveryView | null` у `WorkoutEditor` и `StartScreen`.

- [ ] **Step 1:** unit:
  - 100 → «90», 82,5 → «72,5», 15 → «13», 1 → пропуск;
  - выполненный подход, разминка, кардио и упражнение из `skip` не меняются;
  - `setWeights` с `expect`: если вес вручную изменён после «Облегчить», «Вернуть» его не трогает;
  - подход удалён → без ошибки.
- [ ] **Step 2:** `npx vitest run components/training/workout-state.test.ts` → FAIL.
- [ ] **Step 3:** реализация `lightenPlan` и `setWeights` → unit PASS.
- [ ] **Step 4:** e2e (падают):
  - красная зона (сон 21 %), тренировка из шаблона с упражнением от тренера и своим → строка «Восстановление 21 % — лёгкий день»;
  - «Облегчить» → вес своего 100 → 90, тренерского — без изменений, кнопки «Облегчить» больше нет;
  - тост «Облегчено · Вернуть» → 100;
  - значок «Пора увеличить вес» скрыт (подготовить 3 одинаковые тренировки через `e2e/db.ts`), а при зелёной зоне виден;
  - на стартовом экране строка зоны есть.

  Тренерский шаблон — хелперы из `e2e/db.ts`, как в существующих e2e тренера.
- [ ] **Step 5:** реализация:
  - `skip` — `Object.keys(targets)` (задания тренера);
  - «один раз» — `localStorage` `hf:lightened:<workoutId>`;
  - эффективное самочувствие `wellbeing ?? (zone yellow|red ? "TIRED" : null)` передаётся помощнику, значки `HintBadge` скрываются при эффективном `"TIRED"`;
  - на стартовом экране — только строка, без кнопки.
- [ ] **Step 6:** e2e → PASS; `npx playwright test e2e/training.spec.ts e2e/smart-coach.spec.ts` → PASS.
- [ ] **Step 7:** commit `feat(whoop): recovery zone in workout and lighten`.

### Task 8: Помощник «Как я восстановился?»

**Files:**
- Modify: `lib/assistant/actions.ts` (`askAssistantAction` + тема `"whoop"`), `lib/assistant/scenarios.ts` (кнопка меню), `components/assistant/assistant.tsx` (узел `whoop`), `app/(app)/layout.tsx` (проп `whoop={flags.includes("whoop")}` в `AssistantProvider`)
- Test: `e2e/smart-coach.spec.ts` или `e2e/whoop.spec.ts`

**Interfaces:**
- Consumes: `getWhoopRecovery`, `getMuscleRecovery`.
- Produces: `AssistantAnswer` += `whoop?: WhoopRecoveryView | null`; кнопка «Как я восстановился?» в меню — только при `whoop`.

- [ ] **Step 1:** e2e (падает): включены `smart_coach` и `whoop`, есть сегодняшний сон → в помощнике «Как я восстановился?» → текст с «Восстановление 78 %», HRV, пульсом, сном и всеми советами списком. Без подключения — «WHOOP не подключён» и кнопка-ссылка «Браслеты и часы» (`/devices`).
- [ ] **Step 2:** реализация. Состояния `no-access`/`reauth`/`empty` — короткий текст и ссылка на `/devices` или `/dashboard`.
- [ ] **Step 3:** e2e → PASS.
- [ ] **Step 4:** commit `feat(assistant): whoop recovery scenario`.

### Task 9: `/devices`, согласие, `/privacy`, «Мои данные», документация

**Files:**
- Modify: `components/whoop/consent-dialog.tsx` (текст согласия), `components/devices/whoop-card.tsx` (перечень данных и кнопка «Разрешить сон и восстановление»), `app/(app)/devices/page.tsx` + `lib/whoop/queries.ts` (`WhoopStatus` += `recovery: boolean`)
- Modify: `app/(marketing)/privacy/page.tsx` (раздел 8)
- Modify: `lib/account/export-queries.ts`, `lib/account/export.ts`, `lib/account/export.test.ts` (`whoop.sleeps`)
- Modify: `docs/features/training.md` (раздел WHOOP), `deploy/README.md` (scope в кабинете WHOOP)
- Test: `e2e/whoop.spec.ts`, `e2e/account-data.spec.ts`

**Interfaces:**
- Consumes: `hasScope` (Task 1).
- Produces: в выгрузке `whoop: { …, sleeps: { id, start, end, sleepMs, needMs, performancePct, recoveryPct, restingHr, hrvMs, calibrating }[] }`.

- [ ] **Step 1:** тесты (падают):
  - unit `export.test.ts` — `sleeps` проходит в выгрузку;
  - e2e `/devices`: у подключения «Тренировки, пульс, сон, восстановление», у старого — «Тренировки, пульс» и кнопка «Разрешить сон и восстановление»;
  - окно согласия содержит «вариабельность пульса (HRV)»;
  - `account-data.spec.ts`: выгрузка содержит `whoop.sleeps`, удаление аккаунта удаляет сны (`whoopSleepCount === 0`).
- [ ] **Step 2:** реализация. Тексты согласия и `/privacy` — перечень и цель из спеки, раздел «152-ФЗ».
- [ ] **Step 3:** обновить `docs/features/training.md` (модель `WhoopSleep`, `scopes`, `sleep-sync`, `recovery.ts`, вебхуки, карточка, «Облегчить», помощник, e2e-хелперы) и `deploy/README.md`.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → чисто; `npm run build && npx playwright test e2e/whoop.spec.ts e2e/account-data.spec.ts --workers=8` → PASS.
- [ ] **Step 5:** commit `feat(whoop): consent, privacy, export for sleep and recovery`.

### Task 10: Финальная проверка ветки

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` → всё зелёное (desktop + mobile).
- [ ] **Step 2:** влить `feat/whoop-recovery` в релизную ветку `--no-ff`; пункт «Что нового» (с `flag: "whoop"`) — при сборке релиза.
