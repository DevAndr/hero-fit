# Недельный streak — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить streak «окна по 24 часа» на недельный: серия — недели подряд с ≥ 3 тренировками, с заморозками, выкупом, напоминанием и единой лестницей ачивок.

**Architecture:** Вся логика — чистые функции нового модуля `lib/progress/weekly-streak.ts` (заменяет `streak.ts`), доступ к БД — `lib/progress/streak-db.ts`. Завершение тренировки считает тренировки недели SQL-запросом и засчитывает неделю; UI читает готовые поля `User` через `streakStatus`. Старые поля удаляются последней миграцией, когда потребителей не осталось.

**Tech Stack:** Next.js 16, Prisma 7 (`@/generated/prisma/client`), PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-weekly-streak-design.md`

## Global Constraints

- Неделя — пн 00:00 … вс 24:00 в `User.timeZone` (через `safeTimeZone`); ключ недели — дата понедельника `"YYYY-MM-DD"`.
- `STREAK_WEEK_TARGET = 3`, `FREEZE_GRANT_WEEKS = 4`, `MAX_FREEZES = 2`, `MAX_REWARD_FREEZES = 3`, `MIN_RESTORE_STREAK = 2`, `RESTORE_WINDOW_DAYS = 3`, `STREAK_REMINDER_HOUR = 12`.
- Цена выкупа: `min(500, 50 + 50 · серия)` XP, только из прогресса текущего уровня.
- Пороги ачивок `streakw:N`: `[2, 4, 8, 12, 26, 52]`, далее шаг 52; XP = 15·N; `freezeReward: 1` при N ≥ 4.
- Тексты — по-русски, существительные через `plural` (`lib/format.ts`).
- После каждой задачи: `npm run typecheck`, `npm run lint`, `npm test` — зелёные. e2e — `npm run build && npm run test:e2e -- <spec>`.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Уточнения к спеке (решены при планировании)

- Модуль называется `lib/progress/weekly-streak.ts`, старый `streak.ts` удаляется в задаче 8 (иначе конфликт имён на переходе).
- Выкуп не требует покрытых недель при расчёте статуса: он ставит `lastStreakWeek = предыдущая неделя` (серия «ждёт» текущую неделю) и пишет `StreakCoverWeek(RESTORE)` за пропущенные недели только как журнал. Поэтому `applyWeekCredit` и `streakStatus` не принимают список покрытых недель. Повторный выкуп запрещён, пока `weekKey(streakRestoredAt) > lastStreakWeek`.
- Напоминание тестируется e2e через тестовые часы: `GET /api/cron/notifications?now=<ISO>` принимается, только если `E2E_TEST_CLOCK=1` (задаётся в `playwright.config.ts`).

## Review Focus

1. Тренировка в воскресенье 23:30 по местному времени (UTC — уже понедельник) → считается в воскресную неделю, а не в следующую.
2. Серия засчитана в прошлую неделю, сейчас понедельник 00:05 → статус `pending` (0/3, 7 дней), не `lost` и не `frozen`.
3. Офлайн-тренировка с `finishedAt` в прошлой, уже засчитанной неделе → серия не меняется, счётчик недели не портит текущую.
4. Два параллельных нажатия «Восстановить» → XP списан один раз.
5. Пользователь в поясе UTC+14 / UTC−11 → неделя и «12:00» напоминания по его поясу.

Тесты на п. 1–3, 5 — в задачах 1–2, п. 4 — в задаче 5.

---

### Task 1: Календарь недель и перенос общих хелперов

**Files:**
- Create: `lib/progress/weekly-streak.ts`, `lib/progress/weekly-streak.test.ts`
- Modify: `lib/format.ts` (экспорт `plural`), `lib/achievements/definitions.ts` (импорт `plural` и `weeklyRuns` вместо локальных)

**Interfaces:**
- Produces:
  - `plural(n: number, one: string, few: string, many: string): string` — из `lib/format.ts`
  - `weekKey(date: Date, tz: string): string`
  - `addWeeks(week: string, n: number): string`
  - `weeksBetween(from: string, to: string): number` — `to − from` в неделях
  - `localMidnight(day: string, tz: string): Date` — момент 00:00 дня `"YYYY-MM-DD"` в поясе
  - `daysLeftInWeek(now: Date, tz: string): number` — 1…7, включая сегодня (вс → 1, пн → 7)
  - `localHour(now: Date, tz: string): number`
  - `weeklyRuns(weeks: string[], currentWeek: string): { best: number; current: number }` — перенос из `definitions.ts` без изменений

- [ ] **Step 1: Тесты** (`weekly-streak.test.ts`):
  - `weekKey(new Date("2026-10-11T20:30:00Z"), "Europe/Moscow")` (вс 23:30 МСК) → `"2026-10-05"`; `weekKey(new Date("2026-10-11T21:30:00Z"), "Europe/Moscow")` (пн 00:30) → `"2026-10-12"`.
  - `weekKey(new Date("2026-10-12T05:00:00Z"), "Pacific/Pago_Pago")` (UTC−11, вс 18:00) → `"2026-10-05"`; `"Pacific/Kiritimati"` (UTC+14) для `2026-10-11T10:30:00Z` (пн 00:30) → `"2026-10-12"`.
  - `addWeeks("2026-10-05", -1)` → `"2026-09-28"`; `weeksBetween("2026-09-28", "2026-10-12")` → `2`.
  - `localMidnight("2026-10-08", "Europe/Moscow").toISOString()` → `"2026-10-07T21:00:00.000Z"`.
  - `daysLeftInWeek` для сб 15:00 UTC → `2`, для пн → `7`, для вс → `1`.
  - `weeklyRuns` — перенести существующие тесты из `lib/achievements/definitions.test.ts` (если есть) сюда.
- [ ] **Step 2:** `npx vitest run lib/progress/weekly-streak.test.ts` — FAIL (нет модуля).
- [ ] **Step 3:** Реализовать. `weekKey` — `dayKey` из `lib/daily-login.ts` + день недели через `Intl.DateTimeFormat(..., { weekday: "short" })`, арифметика дат — по UTC-полудню ключа. `localMidnight` — подбор смещения пояса через `Intl` (две итерации на случай перехода DST).
- [ ] **Step 4:** Перенести `plural` в `lib/format.ts`, `weeklyRuns` — в `weekly-streak.ts`; `definitions.ts` импортирует оба. `npm test` — PASS.
- [ ] **Step 5:** Коммит `feat(streak): week calendar helpers for the weekly streak`.

### Task 2: Правила недельной серии

**Files:**
- Modify: `lib/progress/weekly-streak.ts`, `lib/progress/weekly-streak.test.ts`

**Interfaces:**
- Consumes: хелперы задачи 1.
- Produces:
  - константы из Global Constraints
  - `type WeeklyStreakState = { currentStreak: number; longestStreak: number; lastStreakWeek: string | null; streakFreezes: number; freezeGrantedAt: Date | null }`
  - `grantFreeze(state: WeeklyStreakState, now: Date): WeeklyStreakState` — если `freezeGrantedAt` нет или прошло ≥ 28 суток: `+1`, пока `< MAX_FREEZES`; `freezeGrantedAt = now` в любом случае
  - `applyWeekCredit(state: WeeklyStreakState, week: string): WeeklyStreakState & { frozenWeeks: string[]; extended: boolean; reset: boolean }`
  - `type StreakUserFields = { currentStreak: number; lastStreakWeek: string | null; streakFreezes: number; weekWorkouts: number; weekWorkoutsKey: string | null }`
  - `type StreakStatus = { state: "none" } | { state: "done"; streak: number } | { state: "pending"; streak: number; count: number; needed: number; daysLeft: number } | { state: "frozen"; streak: number; count: number; needed: number; daysLeft: number; freezesNeeded: number } | { state: "lost"; streak: number }`
  - `streakStatus(user: StreakUserFields, now: Date, tz: string): StreakStatus`
  - `streakValue(status: StreakStatus): number` — 0 для `none`/`lost`, иначе `streak`
  - `restoreCost(streak: number): number`
  - `type RestoreOffer = { streak: number; cost: number; expiresAt: Date }`
  - `restoreOffer(user: StreakUserFields & { streakRestoredAt: Date | null }, now: Date, tz: string): RestoreOffer | null`

Алгоритм `applyWeekCredit`: неделя `≤ lastStreakWeek` → без изменений, `extended: false`. `lastStreakWeek = null` → серия 1. Иначе пропущенные = недели строго между; их число ≤ `streakFreezes` → серия +1, заморозки −n, `frozenWeeks` = эти недели; иначе серия 1, `reset: true`, заморозки не тратятся. `longestStreak = max`.

`streakStatus`: нет `lastStreakWeek` или серия 0 → `none`; `cur = weekKey(now)`; `count = weekWorkoutsKey === cur ? weekWorkouts : 0`; `lastStreakWeek ≥ cur` → `done`; пропущено `weeksBetween(last, cur) − 1`: 0 → `pending`, ≤ заморозок → `frozen`, иначе `lost`. `needed = max(0, 3 − count)`.

`restoreOffer`: серия ≥ 2, статус `lost`, `cur === addWeeks(last, streakFreezes + 2)`, `now < localMidnight(четверг cur)`, и не (`streakRestoredAt` и `weekKey(streakRestoredAt) > lastStreakWeek`).

- [ ] **Step 1: Тесты** (`describe("applyWeekCredit")`, `"streakStatus"`, `"restoreOffer"`, `"grantFreeze"`):
  - первая неделя → `{ currentStreak: 1, extended: true }`; та же неделя повторно → `extended: false`;
  - соседняя неделя → +1; пропуск 1 при 1 заморозке → +1, `streakFreezes: 0`, `frozenWeeks: ["2026-09-28"]`; пропуск 2 при 1 заморозке → `currentStreak: 1, reset: true, streakFreezes: 1`;
  - неделя раньше `lastStreakWeek` (офлайн задним числом) → без изменений;
  - `streakStatus`: засчитано на этой неделе → `done`; прошлая неделя, пн 00:05 МСК, 0 тренировок → `pending { count: 0, needed: 3, daysLeft: 7 }`; `weekWorkoutsKey` прошлой недели при `weekWorkouts: 2` → `count: 0`; пропуск 1 при 1 заморозке → `frozen { freezesNeeded: 1 }`; пропуск 1 при 0 → `lost`;
  - `restoreCost(2)` → 150, `restoreCost(12)` → 500;
  - `restoreOffer`: потеряна, среда → оффер, `expiresAt` = четверг 00:00 местного; четверг 00:01 → `null`; серия 1 → `null`; неделей позже `lostWeek` → `null`; `streakRestoredAt` в текущей неделе при `lastStreakWeek` = прошлая → `null`;
  - `grantFreeze`: 27 суток → без выдачи; 28 → +1; при 2 → остаётся 2; при 3 (награды) → 3.
- [ ] **Step 2:** `npx vitest run lib/progress/weekly-streak.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать по алгоритмам выше.
- [ ] **Step 4:** Тесты — PASS.
- [ ] **Step 5:** Коммит `feat(streak): weekly streak rules — credit, status, freezes, restore offer`.

### Task 3: Схема и пересчёт из истории

**Files:**
- Modify: `prisma/schema.prisma`, `package.json`
- Create: миграция `prisma/migrations/<ts>_weekly_streak/`, `lib/progress/streak-db.ts`, `prisma/migrate-weekly-streak.ts`

**Interfaces:**
- Consumes: `weekKey`, `weeklyRuns`, `MAX_REWARD_FREEZES`.
- Produces:
  - `User`: `lastStreakWeek String?`, `weekWorkouts Int @default(0)`, `weekWorkoutsKey String?`, `streakReminderDay String?` (старые `lastStreakAt`, `streakReminderFor` пока остаются)
  - `enum StreakCoverReason { FREEZE RESTORE }`, `model StreakCoverWeek` — как в спеке, `@@unique([userId, week])`, связь `User.streakCoverWeeks`
  - `countWeekWorkouts(client: Prisma.TransactionClient, userId: string, week: string, tz: string): Promise<number>` — `COMPLETED` с `date_trunc('week', ("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE tz)` = неделя (тот же приём, что `weekStats` в `lib/achievements/engine.ts`)
  - `recomputeStreak(client, userId: string, now: Date): Promise<void>` — недели с ≥ 3 тренировками → `weeklyRuns`; пишет `currentStreak = current`, `longestStreak = best`, `lastStreakWeek` = последняя такая неделя (или `null`), `weekWorkouts`/`weekWorkoutsKey` для текущей недели, `streakFreezes = min(streakFreezes, 3)`
  - `npm run db:migrate-streak` → `tsx prisma/migrate-weekly-streak.ts` (вызывает `recomputeStreak` для всех пользователей; посмотреть, чем запускается `prisma/seed.ts`, и использовать то же)

- [ ] **Step 1:** Изменить схему, `npx prisma migrate dev --name weekly_streak` — миграция создана, клиент сгенерирован.
- [ ] **Step 2:** Реализовать `streak-db.ts` и скрипт; добавить npm-скрипт.
- [ ] **Step 3:** Проверка на dev-базе: `npm run db:migrate-streak` дважды — без ошибок, второй прогон не меняет значения (`select login, "currentStreak", "lastStreakWeek", "weekWorkouts" from "User" where login like 'demo%'`).
- [ ] **Step 4:** `npm run typecheck && npm test` — PASS.
- [ ] **Step 5:** Коммит `feat(streak): schema for the weekly streak and recompute from history`.

### Task 4: Завершение тренировки и сводка

**Files:**
- Modify: `lib/workouts/finish.ts`, `app/(app)/workouts/[id]/page.tsx`, `e2e/training.spec.ts`

**Interfaces:**
- Consumes: `grantFreeze`, `applyWeekCredit`, `weekKey`, `countWeekWorkouts`, `safeTimeZone`.
- Produces: `FinishMeta` — добавлено `weekCount: number`; `usedFreezes = frozenWeeks.length`.

Порядок в транзакции: обновить `Workout` (статус, `finishedAt`) → `week = weekKey(now, tz)`, `count = countWeekWorkouts(...)` → `grantFreeze` → если `count ≥ 3`: `applyWeekCredit`, `createMany` `StreakCoverWeek(FREEZE)` по `frozenWeeks` (`skipDuplicates`) → `User.update` (`weekWorkouts`/`weekWorkoutsKey` только если `week ≥ weekWorkoutsKey` или ключа нет — тренировка задним числом не портит счётчик текущей недели) → ачивки → `meta`. `lastStreakAt` больше не пишется.

Сводка (`data-testid="streak"` — число недель), подпись:
- `streakReset` → «Серия прервалась — начинаем заново!»
- `usedFreezes` → «Серию спасла заморозка (N)»
- `streakExtended` → «Неделя засчитана — серия N {неделя}!»
- иначе, `weekCount < 3` → «Неделя: {count}/3 — ещё {3−count} {тренировка} до +1 к серии»
- иначе → «Неделя уже засчитана — серия продолжается.»

- [ ] **Step 1: e2e** в `training.spec.ts` — новый тест «three workouts in a week extend the weekly streak»: три тренировки подряд (как в существующем полном сценарии, по одному подходу); после 1-й — текст «Неделя: 1/3 — ещё 2 тренировки до +1 к серии», после 3-й — «Неделя засчитана — серия 1 неделя!» и `streak` = `1` (шапку проверяет задача 5: до неё она читает старые поля; e2e `dashboard` между задачами 4 и 5 может падать — это ожидаемо). Обновить ожидания старых тестов, где проверялась подпись «Серия продлена!…».
- [ ] **Step 2:** Реализовать `finish.ts` и сводку.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test`; `npm run build && npm run test:e2e -- training` — PASS.
- [ ] **Step 4:** Коммит `feat(streak): finishing a workout credits the week`.

### Task 5: Статус в UI, лига, лента, выкуп

**Files:**
- Modify: `lib/auth/dal.ts`, `components/app/app-shell.tsx`, `lib/dashboard/queries.ts`, `app/(app)/dashboard/page.tsx`, `lib/social/queries.ts`, `lib/social/feed.ts`, `components/social/activity-feed.tsx`, `lib/progress/actions.ts`, `e2e/dashboard.spec.ts`, `lib/social/feed.test.ts` (если есть)

**Interfaces:**
- Consumes: `streakStatus`, `streakValue`, `restoreOffer`, `weekKey`, `addWeeks`.
- Produces: `CurrentUser` содержит `StreakUserFields` + `timeZone`; `STREAK_WEEK_THRESHOLDS` экспортируется из `lib/achievements/definitions.ts` (задача 7 строит на нём лестницу; здесь — для `streakMilestone`, шаг 52).

Тексты карточки дашборда (`streak-message`):
- `none` — «Сделайте 3 тренировки за неделю, чтобы зажечь серию»
- `done` — «Неделя засчитана 🔥»
- `pending`/`frozen`, `needed ≥ daysLeft` — «Не потеряй streak! Ещё {needed} {тренировка} до конца недели»
- `pending` иначе — «Эта неделя: {count}/3 · осталось {daysLeft} {день}»
- `frozen` иначе — «Неделя пропущена — серию спасёт заморозка»
- `lost` — как сейчас (с оффером / без)

Под числом — подпись «{неделя} подряд», точки прогресса недели (`aria-label="Эта неделя: {count} из 3"`). Подсказка шапки: `done` — «Неделя засчитана», `pending`/`frozen` — «Эта неделя: {count}/3, осталось {daysLeft} {день}», прочее — «Streak — недели подряд с 3+ тренировками». Лента: «{N} {неделя} подряд в ударе».

Выкуп (`restoreStreakAction`): `restoreOffer(u, now, tz)`; `updateMany where { id, lastStreakWeek: u.lastStreakWeek, streakRestoredAt: u.streakRestoredAt }` → `lastStreakWeek = addWeeks(cur, -1)`, `streakRestoredAt = now`, `xp −cost`; `StreakCoverWeek(RESTORE)` на недели между старым `lastStreakWeek` и `cur` (`skipDuplicates`).

- [ ] **Step 1: e2e** `dashboard.spec.ts`: заменить `setStreak(login, hoursAgo, …)` на `setWeeklyStreak(login, { streak, lastWeeksAgo, freezes, weekCount })` — SQL с `to_char(date_trunc('week', now() AT TIME ZONE "timeZone") - make_interval(weeks => $n), 'YYYY-MM-DD')`. Сценарии: новый пользователь → «Сделайте 3 тренировки…»; `lastWeeksAgo: 1, weekCount: 1` → «Эта неделя: 1/3 · …» или «Не потеряй streak!…» (в зависимости от дня — проверять регэкспом `/Эта неделя: 1\/3|Не потеряй streak!/`), шапка = значение; `lastWeeksAgo: 3, freezes: 0` → «Серия прервалась…», 0; `lastWeeksAgo: 2, freezes: 1` → «…спасёт заморозка». Выкуп: `lastWeeksAgo: 2, freezes: 0, streak: 12` (неделя сгорания = текущая); оффер живёт только пн–ср, поэтому тест начинается с `test.skip(<сегодня по UTC чт–вс>, "окно выкупа — пн–ср")` (`timeZone` пользователя = `UTC`); граница окна покрыта unit-тестами `restoreOffer`. В тесте: кнопка → серия 12, XP списан; затем два параллельных `restoreStreakAction` (два клика через `Promise.all` до перерисовки) → в `XpEvent` ровно одна запись `STREAK_RESTORE`. Шапка: после трёх тренировок (сценарий из задачи 4) `header-streak` = `1`.
- [ ] **Step 2:** Реализовать изменения во всех файлах списка.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test`; `npm run build && npm run test:e2e -- dashboard friends leaderboard` — PASS.
- [ ] **Step 4:** Коммит `feat(streak): weekly status on dashboard, header, league and feed; weekly restore`.

### Task 6: Напоминание «Не потеряй streak!»

**Files:**
- Modify: `lib/notifications/reminders.ts`, `lib/notifications/reminders.test.ts`, `lib/notifications/service.ts`, `app/api/cron/notifications/route.ts`, `lib/env.ts`, `playwright.config.ts`, `e2e/notifications.spec.ts`

**Interfaces:**
- Consumes: `streakStatus`, `localHour`, `dayKey`, `STREAK_REMINDER_HOUR`, `plural`.
- Produces:
  - `shouldRemindStreak(user: StreakUserFields & { streakReminderDay: string | null }, now: Date, tz: string): { streak: number; needed: number } | null` — статус `pending`/`frozen`, `needed ≥ daysLeft`, `localHour ≥ 12`, `streakReminderDay !== dayKey(now, tz)`
  - `runNotificationTick(now?: Date)`; `processStreakReminders(now)`: кандидаты одним SQL (`notifyStreak`, `currentStreak > 0`, `extract(isodow from now AT TIME ZONE "timeZone") >= 5`, локальный час ≥ 12, `"streakReminderDay" IS DISTINCT FROM` локальная дата), дальше `shouldRemindStreak`; защита от дубля — `updateMany where { streakReminderDay: старое }`.
  - Текст: заголовок «Не потеряй streak! 🔥», тело «Серия {N} {неделя} — нужно ещё {needed} {тренировка} до конца воскресенья.», url `/training`.
  - `E2E_TEST_CLOCK` в `lib/env.ts` (`z.enum(["1"]).optional()`); роут принимает `?now=` только при `E2E_TEST_CLOCK === "1"`; `playwright.config.ts` → `webServer.env.E2E_TEST_CLOCK = "1"`.

- [ ] **Step 1: Unit** (`reminders.test.ts`): сб 15:00 UTC, 1/3 → `{ needed: 2 }`; сб 2/3 → `null`; вс 2/3 → `{ needed: 1 }`; сб 11:00 → `null`; `streakReminderDay` = сегодня → `null`; пт 0/3 → `{ needed: 3 }`; `done` → `null`; UTC+14 — локальная суббота при UTC-пятнице → срабатывает.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: e2e** `notifications.spec.ts`: `fakeNow` = суббота 15:00 UTC за 2–3 недели до сегодня; пользователь `timeZone = 'UTC'`, `currentStreak 4`, `lastStreakWeek` = неделя до `fakeNow`, `weekWorkouts 1`, `weekWorkoutsKey` = неделя `fakeNow`, `streakFreezes 0` (в реальном «сейчас» статус `lost` — фоновый воркер не пришлёт дубль); `runTick(request, fakeNow)` → один push с телом «Серия 4 недели — нужно ещё 2 тренировки до конца воскресенья.»; повторный тик и 6 с ожидания — без дубля; колокольчик содержит «нужно ещё 2». Тест «disabled streak reminders are not sent» — та же подготовка.
- [ ] **Step 4:** `npm run build && npm run test:e2e -- notifications` — PASS.
- [ ] **Step 5:** Коммит `feat(streak): weekly «don't lose your streak» reminder`.

### Task 7: Ачивки — единая лестница серии

**Files:**
- Modify: `lib/achievements/definitions.ts`, `lib/achievements/engine.ts`, `lib/achievements/*.test.ts`, `components/achievements/category.ts` (если показывает пороги в днях), `e2e/achievements.spec.ts`

**Interfaces:**
- Consumes: `STREAK_WEEK_THRESHOLDS`, `MAX_REWARD_FREEZES` (из `weekly-streak.ts`).
- Produces: лестница `streakw:N` (категория `STREAK`, названия из спеки, описание «Тренироваться 3+ раза в неделю {N} {неделя} подряд»); удалены `STREAK_THRESHOLDS`, `streakDef`, `WEEKS_THRESHOLDS`, лестница `weeks:N`, `bestWeeklyRun`/`currentWeeklyRun` (и их SQL в `weekStats` — групповую часть оставить); `freezeSaves` = `count(*) from "StreakCoverWeek" where reason = 'FREEZE'`.

- [ ] **Step 1: Unit:** `longestStreak: 4, currentStreak: 4` → получены `streakw:2`, `streakw:4`, цель `streakw:8`; `streakw:4` даёт `freezeReward: 1`, `streakw:2` — нет; `longestStreak: 104` → есть `streakw:104`; ни одного кода `streak:`/`weeks:` в выдаче.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: e2e** `achievements.spec.ts`: подготовка `currentStreak = 1, longestStreak = 1, lastStreakWeek` = прошлая неделя, `weekWorkouts 2` за эту неделю → третья тренировка → в сводке ачивка «В ударе» (`streakw:2`), `streak` = `2`; ожидание «Заморозки: N» пересчитать по новым лимитам.
- [ ] **Step 4:** `npm test`; `npm run build && npm run test:e2e -- achievements` — PASS.
- [ ] **Step 5:** Коммит `feat(achievements): one weekly streak ladder replaces day streak and «Стабильность»`.

### Task 8: Сид, удаление старого, документация

**Files:**
- Modify: `prisma/seed.ts`, `prisma/schema.prisma`, `CLAUDE.md`
- Create: миграция `<ts>_drop_day_streak`
- Delete: `lib/progress/streak.ts`, `lib/progress/streak.test.ts`

- [ ] **Step 1:** Сид: история `demo.masha` — по 3 тренировки в каждую из 4 прошлых недель и 3 в текущую (распределить между началом текущей недели по UTC и `now − 1h`; последняя — свежая, с рекордом и ачивкой как сейчас); в `meta` последней — `streak` из пересчёта, `streakExtended: true`, `weekCount: 3`. После создания истории всех демо-пользователей — `recomputeStreak`. Убрать запись `lastStreakAt`.
- [ ] **Step 2:** Удалить `lastStreakAt`, `streakReminderFor` из схемы, `npx prisma migrate dev --name drop_day_streak`; удалить `streak.ts` и его тест; `grep -rn "lastStreakAt\|streakReminderFor\|progress/streak\"" lib components app e2e prisma` — пусто.
- [ ] **Step 3:** `CLAUDE.md`: абзац «Streak (режим «в ударе») — механика» переписать под недели (правило, заморозки 1/4 недели до 2 + награды до 3, выкуп до четверга, `lib/progress/weekly-streak.ts`, `streak-db.ts`, `npm run db:migrate-streak`, `E2E_TEST_CLOCK`).
- [ ] **Step 4:** `npm run db:seed` дважды — без ошибок; лента `demo` показывает веху серии `demo.masha`.
- [ ] **Step 5:** Полная проверка: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — всё PASS (desktop + mobile).
- [ ] **Step 6:** Коммит `chore(streak): drop day-window streak fields; seed and docs for weekly streak`.
