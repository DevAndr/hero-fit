# Календарь тренировок — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/calendar` «как Google Календарь» (неделя/месяц), планы с еженедельным повтором и исключениями, связь с тренировками, карточка на дашборде, напоминание «Сегодня по плану».

**Architecture:** Чистые функции в `lib/plans/` (разворот повторов, правки `one`/`following`, сопоставление со статусами, раскладка) покрыты unit-тестами; БД — `queries.ts`/`actions.ts`; UI — `components/calendar/*` на CSS Grid + `@dnd-kit`. Запуск тренировки из плана — через существующий `createWorkoutAction` (`source = "plan:<key>"`).

**Tech Stack:** Next.js 16, Prisma 7, Base UI/shadcn, `@dnd-kit/core`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-workout-calendar-design.md`

## Global Constraints

- Время плана — местное: `date "YYYY-MM-DD"`, `time "HH:MM"`, `durationMin` 15…240 шаг 15 (по умолчанию 60); пояс — `safeTimeZone(User.timeZone)`.
- `weekday`: 0 = пн … 6 = вс. Ключи вхождений: `s:<seriesId>:<originalDate>`, `e:<entryId>`.
- Слот сетки 30 мин; перетаскивание с привязкой к 30 мин; прокрутка к 7:00.
- `planReminderMin` ∈ {15, 30, 60, 120}, по умолчанию 60.
- Цвета — только семантические токены (`chart-1…5`, `primary`, `muted`); ссылки-кнопки — `<Link className={buttonVariants()}>`.
- После каждой задачи: `npm run typecheck`, `npm run lint`, `npm test`; e2e — `npm run build && npx playwright test <spec>`.
- Коммиты заканчиваются `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Решения при планировании

- Форма создания/правки — `Dialog` и на ПК, и на телефоне (поповера в `components/ui` нет; поведение то же).
- `startPlannedWorkoutAction` из спеки реализуется как ветка `source = "plan:<key>"` в `createWorkoutAction` — та же логика шаблона, активной тренировки и редиректа.

## Review Focus

1. Перенос вхождения серии на другую неделю — исчезает из старой недели и появляется в новой (диапазон чтения с запасом).
2. «Это и следующие» на первом вхождении серии — серия не остаётся с `endDate < startDate`.
3. Две завершённые тренировки в день с одним планом — план `done` один раз, вторая — «вне плана».
4. Пояс UTC+14 / UTC−11 — «сегодня», статус `missed` и окно напоминания по местному времени.
5. Удалённый/архивный шаблон у серии — план показывается с сохранённым названием, «Начать» открывает пустую тренировку с этим названием.

---

### Task 1: Разворот повторов — `lib/plans/expand.ts`

**Produces:** `type PlanSeriesRow = { id; templateId: string|null; title; weekday; time; durationMin; startDate; endDate: string|null }`, `type PlanEntryRow = { id; seriesId: string|null; originalDate: string|null; templateId: string|null; title; date; time; durationMin; cancelled }`, `type Occurrence = { key; seriesId: string|null; date; time; durationMin; templateId: string|null; title; recurring: boolean }`, `expandPlans(series, entries, from, to): Occurrence[]`, `addDays(date, n)`, `weekdayOf(date)` (0 = пн).

- [ ] Тесты (`expand.test.ts`): серия пн с `startDate` в середине диапазона → только даты ≥ `startDate`; `endDate` включительно; исключение-перенос (пн → вт той же недели) → ключ `s:<id>:<пн>`, дата вт; перенос на следующую неделю — в диапазоне следующей недели виден, в исходной нет; `cancelled` → нет; разовая запись → `e:<id>`, `recurring: false`; сортировка по дате и времени; недели через 2026-03-29 (DST) — даты верные.
- [ ] RED → реализация → GREEN → коммит `feat(calendar): expand weekly plan series with exceptions`.

### Task 2: Сопоставление, раскладка, сетка — `lib/plans/match.ts`, `lib/plans/layout.ts`

**Consumes:** `Occurrence`. **Produces:** `type DoneWorkout = { id; planKey: string|null; startedAt: Date; finishedAt: Date }`, `type PlanStatus = "done" | "missed" | "today" | "planned"`, `matchPlans(occurrences, workouts, today: string, tz): { occurrences: (Occurrence & { status; workoutId?: string })[]; extra: DoneWorkout[] }`; `layoutDay(events: { key; start: number; end: number }[]): Map<key, { col; cols }>` (минуты от полуночи); `monthGrid(month: "YYYY-MM"): string[]` (42 даты с пн); `minutesOf("HH:MM")`, `timeOf(minutes)`.

- [ ] Тесты: тренировка с `planKey` → `done` + `workoutId`; тренировка без `planKey` в тот же местный день → закрывает первое по времени невыполненное; вторая такая же → в `extra`; вчерашний без тренировки → `missed`; сегодня → `today`; будущее → `planned`; день по поясу (тренировка 22:30 UTC = следующий день в МСК); `layoutDay`: непересекающиеся → `cols 1`, два пересекающихся → `col 0/1, cols 2`, цепочка A∩B, B∩C, A∩̸C → 2 колонки; `monthGrid("2026-10")` → начинается `2026-09-28`, 42 дня.
- [ ] RED → реализация → GREEN → коммит `feat(calendar): plan status matching and calendar layout helpers`.

### Task 3: Правки `one`/`following` — `lib/plans/edit.ts`

**Produces:** `parsePlanKey(key): { kind: "series"; seriesId; date } | { kind: "entry"; entryId }`, `type PlanPatch = { date?; time?; durationMin?; templateId?: string|null; title? }`, `planEdit(target, scope, patch | null)` → список операций `PlanOp`: `{ op: "upsertException"; seriesId; originalDate; data; cancelled }` | `{ op: "endSeries"; seriesId; endDate }` | `{ op: "deleteSeries"; seriesId }` | `{ op: "deleteExceptionsFrom"; seriesId; fromDate }` | `{ op: "createSeries"; data }` | `{ op: "updateEntry"; entryId; data }` | `{ op: "deleteEntry"; entryId }`. `patch = null` — удаление. `target` — серия (строка) + вхождение (`Occurrence`) или разовая запись.

- [ ] Тесты: `one` + перенос → `upsertException` с полями вхождения, переопределёнными патчем; `one` + удаление → `upsertException cancelled`; `following` с D > `startDate` → `endSeries(D−1)`, `deleteExceptionsFrom(D)`, `createSeries` (новый `weekday` из новой даты, `startDate` = новая дата); `following` с D = `startDate` → `deleteSeries` + `createSeries`; `following` + удаление → `endSeries`/`deleteSeries` без `createSeries`; разовая запись → `updateEntry`/`deleteEntry`; `parsePlanKey` для обоих видов и мусора (→ `null`).
- [ ] RED → реализация → GREEN → коммит `feat(calendar): plan edit planning for one / following`.

### Task 4: Схема, чтение, действия

**Files:** `prisma/schema.prisma` (+ миграция, `npx prisma generate`), `lib/plans/schema.ts` (Zod), `lib/plans/queries.ts`, `lib/plans/actions.ts`, `lib/workouts/actions.ts` (`source = "plan:<key>"`).
**Produces:** модели из спеки, `Workout.planKey`, `User.notifyPlan`, `User.planReminderMin`, `NotificationType.PLAN`; `getCalendar(userId, from, to, tz)` → `{ occurrences, extra, templates: Record<id, { name; exercises: number }> }`; `getTodayPlan(userId, tz)` → `{ today: Occ[]; next: Occ | null; missedYesterday: Occ | null }`; `createPlanAction`, `updatePlanAction(key, scope, patch)`, `deletePlanAction(key, scope)` → `{ ok } | { ok: false; error }`; `getOccurrence(userId, key)`.

- [ ] Zod-тесты (`schema.test.ts`): время `"18:00"` ок, `"25:00"`/`"18:7"` — нет; длительность 15…240 шаг 15; `repeatWeekdays` 0…6 без повторов; дата — валидная `YYYY-MM-DD`.
- [ ] Схема + миграция; чтение — серии с `startDate ≤ to` и (`endDate` null или ≥ `from`), исключения и разовые записи с `date` в `[from − 7, to + 7]` или `originalDate` в `[from, to]`; тренировки `COMPLETED` с местным днём в диапазоне + активная с `planKey`.
- [ ] Действия применяют `planEdit` в транзакции; доступ — только свои серии/записи; шаблон — свой или встроенный. `createWorkoutAction`: `plan:<key>` → вхождение, шаблон (если есть и доступен) или пустая тренировка с названием, `planKey`.
- [ ] Коммит `feat(calendar): schema, queries and actions for plans`.

### Task 5: Страница `/calendar` — неделя, месяц, форма, карточка

**Files:** `app/(app)/calendar/page.tsx`, `components/calendar/{toolbar,week-view,day-strip,month-view,event-block,plan-dialog,event-card}.tsx`, `components/app/nav.ts`.

- [ ] e2e `e2e/calendar.spec.ts` (сначала, RED): «create a weekly plan from a slot» — открыть `/calendar`, на ПК клик по слоту «четверг 18:00» (на телефоне — день + «+ Запланировать»), выбрать шаблон «Push» (встроенный), повтор Пн + Чт, сохранить → событие «Push» в четверг этой недели и в понедельник следующей (‹ ›), в месяце — плашка «18:00 Push»; навигация: пункт «Календарь» в меню (на телефоне — в нижней панели, «Шаблоны» — нет).
- [ ] Реализация по спеке (раздел «Интерфейс»): URL `?view&date`, сетка недели `lg+`, полоска дней + день на телефоне, месяц, `Dialog` формы, карточка события с «Начать»/«Изменить»/«Удалить» (для повторяющегося — выбор «Только это / Это и следующие»), цвета по хэшу шаблона, подписи доступности.
- [ ] GREEN (desktop + mobile) → коммит `feat(calendar): week and month views with plan dialog`.

### Task 6: Перетаскивание (ПК)

**Files:** `components/calendar/week-dnd.tsx`.

- [ ] e2e (desktop): перетащить «Push» с четверга 18:00 на пятницу 10:00 → «Только это» → в пятницу 10:00 есть, в четверг нет, в понедельник следующей недели (серия) — есть; клавиатура: фокус на событии, пробел, стрелки, пробел — перенос.
- [ ] Реализация (`@dnd-kit`, привязка к 30 мин, `done` и вне плана не таскаются) → GREEN → коммит `feat(calendar): drag plans to another day and time`.

### Task 7: Начать из плана, статусы, дашборд, `/training`

**Files:** `components/calendar/event-card.tsx`, `components/dashboard/today-plan.tsx`, `app/(app)/dashboard/page.tsx`, `components/training/start-screen.tsx`, `lib/workouts/queries.ts` (`getStartOptions` + план).

- [ ] e2e: план на сегодня → на дашборде «Сегодня по плану: Push · HH:MM» → «Начать» → редактор с упражнениями Push → завершить → в календаре событие с ✔ и ссылкой на сводку; `/training` без активной тренировки показывает «По плану: Push» первым; план на вчера (через `e2e/db.ts`) → «Вчера были …».
- [ ] Реализация → GREEN → коммит `feat(calendar): start from plan, done status, dashboard and training shortcuts`.

### Task 8: Напоминание «Сегодня по плану» и настройки

**Files:** `lib/plans/reminders.ts` (+ тест), `lib/notifications/service.ts`, `lib/notifications/actions.ts`, `components/notifications/notification-settings.tsx`, `e2e/notifications.spec.ts`.

- [ ] Unit (`reminders.test.ts`, чистая `duePlanReminders(occurrences, sentKeys, now, tz, leadMin, hasActiveWorkout, doneKeys)`): начало в `(now, now + lead]` — да; уже прошло/позже окна — нет; отправленное/выполненное/при активной тренировке — нет; пояс UTC+14.
- [ ] Сервис: кандидаты одним SQL (см. спеку), `notify()` + `PlanReminder` в транзакции; текст «Сегодня по плану: <title> 💪» / «В HH:MM · N упражнений», url `/calendar?date=…`. Настройки: переключатель «Тренировка по плану» и выбор «За 15/30/60/120 мин» (исправить устаревшее описание streak-напоминания на недельное).
- [ ] e2e: план на «тестовое сегодня» + подписка → тик с `?now=` за 30 мин до начала → один push с текстом; повторный тик — без дубля.
- [ ] GREEN → коммит `feat(calendar): «today's plan» reminder and settings`.

### Task 9: Документация и полная проверка

- [ ] `CLAUDE.md`: абзац о календаре (модели, ключи, `expandPlans`/`planEdit`/`matchPlans`, `plan:<key>` в `createWorkoutAction`, напоминание, e2e-хелперы).
- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — всё зелёное → коммит `docs: workout calendar`.
