# Растяжка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новый вид упражнений «Растяжка» под флагом `stretching`: каталог по зонам, раздел `/stretching`, сессии растяжки и заминка, отсчёт «Держать», цели «Регулярность», «Удержание», «Навык».

**Architecture:** `ExerciseKind.STRETCH` — подход на время (`durationSec`), сессия растяжки — обычная `Workout` с флажком `stretchOnly`, проставляемым при завершении. Игровые счётчики отсекают `stretchOnly`; цели — три новых `GoalType` в существующем движке целей; замеры навыка — `StretchMeasurement`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + PostgreSQL, Zod, Tailwind + shadcn (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-stretching-design.md`

## Global Constraints

- Ветка `feat/stretching` от `release/2027-11-stretching`; в конце — `git merge --no-ff` в релизную ветку (не делать без согласия пользователя).
- После смены схемы — `npx prisma generate`; новая миграция одна на фичу или по задаче — проверить SQL: частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не удалять.
- Флаг `stretching`: `description: "Растяжка: вид упражнений, раздел /stretching, цели по растяжке"`, `expires: "2027-06-30"`.
- Без флага: растяжка скрыта в каталогах/пикерах/замене, пункта меню нет, `/stretching` → `notFound()`, в форме упражнения и в `NewGoal` нет растяжки. История, сводки, статистика, уже поставленные цели — показываются всегда.
- XP сессии растяжки: `15 + floor(stretchSec / 60)`, максимум 60; растяжка внутри силовой: +1 XP за минуту в общем лимите 600; рекорд +25 (`PR_XP`).
- Односторонние (`perSide`): время подхода = одна сторона; `stretchSec` считает ×2; текст «30 с × 2» / «1:30 × 2».
- Тексты — по-русски, без «STRETCH»: «Растяжка», «Держать», «Другая сторона», «каждая сторона», «Записать замер», «Осталось 12 см», «2 из 4 недель».
- Цвета — только семантические токены; новые числовые поля ввода тренировки — с `selectOnFocus`; учитывать «уменьшить движение» (отсчёт без бесконечных анимаций).
- Новая связь с `User` → «Мои данные» и удаление аккаунта (`lib/account/*`, `e2e/account-data.spec.ts`).
- e2e: даты только через `E2E_TZ`/`localAt`; флаг — пользователю через `setFlag("stretching", { enabled: true, percent: 0, userIds: [id] })` (сверить сигнатуру в `e2e/db.ts`); глобальный флаг — `mode: "serial"`, только desktop.
- Общение и отчёты субагентов — только по-русски.

## Review Focus

1. **Тренировка из растяжки + силовой, где силовые подходы не отмечены** — `stretchOnly` считается по *выполненным* упражнениям, пустые силовые удаляются при завершении → это сессия растяжки (не засчитывается в серию). Тест в Task 5.
2. **Отсчёт «Держать» при свёрнутой вкладке/заблокированном экране** — подход должен отметиться по реальному времени (`endsAt`), а не по числу тиков. Тест чистой `holdState` с «прыжком» времени в Task 4.
3. **Выключение флага при активной цели растяжки** — карточка цели и её прогресс остаются на `/goals`, тик не роняет цель из-за флага. Тест в Task 10.
4. **Неделя цели «Регулярность» на стыке поясов** — тренировка в воскресенье 23:30 по местному времени засчитывается в эту неделю, а не в следующую. Тест `weekDone` с `Etc/GMT-3` в Task 10.
5. **Повторный замер навыка в тот же день** — заменяет, а не дублирует (`@@unique([goalId, date])` + upsert); замер 0 сразу закрывает цель один раз (условный `updateMany`). Тесты в Task 11.

---

### Task 1: Схема, флаг, правила видов

**Files:**
- Modify: `prisma/schema.prisma` (enum `ExerciseKind`, новый `StretchZone`, `Exercise`, `Workout`, `GoalType`, новый `StretchUnit`, `Goal`, новая модель `StretchMeasurement`, связи в `User`/`Goal`; `XpReason` + `STRETCH_SESSION`)
- Create: миграция `prisma/migrations/<ts>_stretching/` (через `npx prisma migrate dev --name stretching --create-only`, проверить SQL, затем `migrate dev`)
- Modify: `lib/flags/registry.ts`
- Modify: `lib/workouts/kinds.ts`, `lib/workouts/kinds.test.ts`
- Modify: `lib/workouts/schema.ts` (`workoutTotals`), его тест
- Create: `lib/stretching/zones.ts`, `lib/stretching/zones.test.ts`
- Modify: `lib/account/export.ts` (+ queries), удаление аккаунта — проверить каскад; `lib/account/*.test.ts`

**Interfaces:**
- Produces:
  - `ExerciseKindName = "REPS" | "TIME" | "CARDIO" | "STRETCH"`; `isTimed` → true для `STRETCH`; `isStretch(kind): boolean`.
  - `timedSetText(kind, s, perSide?: boolean)` — у `STRETCH`: `"45 с"` при < 60 с, иначе `formatClock`; с `perSide` — `" × 2"`.
  - `workoutTotals(exercises: { kind?; perSide?: boolean; sets }[])` → прежние поля + `stretchSec: number`; `workSec` растяжку **не** включает.
  - `STRETCH_ZONES: readonly StretchZone[]` (порядок спеки), `stretchZoneLabel(z): string`, `primaryZone(zones): StretchZone | null`.
  - Prisma: `Exercise.stretchZones`, `Exercise.perSide`, `Workout.stretchOnly`, `Goal.stretchUnit`, `Goal.stretchSkill`, `Goal.skillTitle`, `StretchMeasurement { id, userId, goalId, date, cm Decimal(5,1), createdAt }`, `XpReason.STRETCH_SESSION`.

- [ ] **Step 1: Тесты** — `kinds.test.ts`: `isTimed("STRETCH") === true`; `isDoneSet("STRETCH", { reps: 0, durationSec: 30, completedAt: 1 }) === true`; `timedSetText("STRETCH", { durationSec: 45 }) === "45 с"`; `timedSetText("STRETCH", { durationSec: 90 }, true) === "1:30 × 2"`. `schema.test.ts`: тренировка из растяжки 2×30 с (`perSide: true`) + планка 60 с → `stretchSec === 120`, `workSec === 60`, `reps === 0`. `zones.test.ts`: 10 зон, `stretchZoneLabel("HAMSTRINGS") === "Задняя поверхность бедра"`, `primaryZone([]) === null`.
- [ ] **Step 2:** `npx vitest run lib/workouts lib/stretching` — FAIL.
- [ ] **Step 3:** Схема по спеке (раздел «Данные») + `XpReason.STRETCH_SESSION`; миграция; `npx prisma generate`; флаг в реестре; код `kinds.ts`, `workoutTotals`, `zones.ts`. Экспорт «Мои данные»: упражнения — `kind`, `stretchZones`, `perSide`; цели — новые поля; раздел `stretchMeasurements: { skill, date, cm }[]`.
- [ ] **Step 4:** `npx vitest run` и `npm run typecheck` — PASS (исчерпывающие `switch` по `ExerciseKind` — `STRETCH` ведёт себя как `TIME`; по `GoalType` — новые типы `goalSchema` ещё не принимает, в `switch` прогресса и текстов временно вернуть `0`/`""`, их заменят Task 9–11).
- [ ] **Step 5:** Коммит `feat(stretching): schema, flag, stretch kind rules`.

### Task 2: Сид — упражнения и программы

**Files:**
- Modify: `prisma/seed.ts` (тип `SeedExercise`: `kind?: "TIME" | "CARDIO" | "STRETCH"`, `zones?: StretchZone[]`, `perSide?: boolean`; массив упражнений; программы)
- Create: `lib/stretching/seed-data.ts` (массив растяжки — чтобы тест мог проверить), `lib/stretching/seed-data.test.ts`

**Interfaces:**
- Produces: `STRETCH_SEED: { name: string; zones: StretchZone[]; perSide?: boolean; restSec: 15 }[]`; программы «Утренняя растяжка» и «Заминка после силовой» (`userId = null`).

- [ ] **Step 1: Тест** — `STRETCH_SEED.length >= 18`; каждая из `STRETCH_ZONES` — основная (`zones[0]`) хотя бы у одного; имена уникальны и не пересекаются с силовыми из сида; у «Голубь», «Выпад на сгибатели бедра», «Растяжка квадрицепса стоя» — `perSide: true`.
- [ ] **Step 2:** `npx vitest run lib/stretching` — FAIL.
- [ ] **Step 3:** Данные + сид (идемпотентный upsert как у остальных; `muscleGroups: []`). Программы — 6–8 упражнений, 2 подхода по 30 с.
- [ ] **Step 4:** тест PASS; `npm run db:seed` дважды — без ошибок и дублей.
- [ ] **Step 5:** Коммит `feat(stretching): seed stretches and programs`.

### Task 3: Каталог и своё упражнение

**Files:**
- Modify: `lib/exercises/queries.ts:41-46` (`listExercises`: `STRETCH` — только при `isEnabled("stretching", userId)`), остальные выборки каталога/кандидатов замены, где фильтруется `workout_formats` (найти `grep -rn "workout_formats" lib components app`)
- Modify: `lib/exercises/schema.ts`, `lib/exercises/actions.ts:28-45`, `components/exercises/exercise-form-dialog.tsx`
- Modify: страница `/exercises` и `useExerciseFilter` — чип «Растяжка», группировка растяжки по основной зоне
- Modify: скрытие программ из одной растяжки без флага (запрос готовых программ/шаблонов)
- Modify: `lib/assistant/rules.ts` `replacementCandidates` — у `STRETCH` совпадение по основной зоне
- Test: `lib/exercises/schema.test.ts`, `lib/assistant/rules.test.ts`

**Interfaces:**
- Consumes: Task 1 (`STRETCH_ZONES`, `primaryZone`).
- Produces: `exerciseSchema` принимает `kind: "STRETCH"` с `stretchZones` (≥ 1) и `perSide`; у `STRETCH` `muscleGroups` должен быть пуст, у прочих `stretchZones` пуст.

- [ ] **Step 1: Тесты** — схема: `STRETCH` без зон → ошибка «Выбери хотя бы одну зону»; `STRETCH` с `muscleGroups: ["LEGS"]` → ошибка; `REPS` со `stretchZones` → ошибка. `replacementCandidates` для растяжки с зоной `HIPS` предлагает только растяжку с основной `HIPS`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализация; форма при флаге — вид «Растяжка»: вместо групп мышц — чекбоксы зон, галочка «Одностороннее (каждая сторона)». Флаг для формы — `useFlag("stretching")`, на сервере — `isEnabled`.
- [ ] **Step 4:** unit PASS, `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Коммит `feat(stretching): catalog and custom stretch exercises`.

### Task 4: Тренировка — ввод и «Держать»

**Files:**
- Create: `lib/stretching/hold.ts`, `lib/stretching/hold.test.ts`
- Create: `components/training/hold-timer.tsx`
- Modify: `components/training/exercise-block.tsx` (ветка `STRETCH`: колонка «Время», подпись «каждая сторона», кнопка ▶ «Держать»), `components/training/workout-state.ts` (действие отметки подхода с временем — переиспользовать существующее изменение `durationSec` + `toggleComplete`)
- Reuse: звук/вибрация/уведомление таймера отдыха (найти модуль таймера отдыха: `grep -rln "RestTimer" components lib`)

**Interfaces:**
- Produces:
  - `holdTarget(set: { durationSec: number | null }, prev: number | null): number` — введённое → прошлое → 30.
  - `startHold(now: number, sec: number, perSide: boolean): HoldRun` где `HoldRun = { phases: { side: "first" | "second" | null; endsAt: number }[]; pauseMs: 5000 }`.
  - `holdState(run: HoldRun, now: number): { phase: number; leftSec: number; pausing: boolean; done: boolean }` — от `endsAt`, а не от тиков.
  - `stoppedSec(run: HoldRun, now: number): number | null` — фактически удержанное за текущую сторону, `null` если < 5 с.

- [ ] **Step 1: Тесты** — `holdTarget({durationSec: null}, 40) === 40`, `(null, null) === 30`; `startHold(0, 30, true)`: две фазы, вторая заканчивается в `30_000 + 5_000 + 30_000`; `holdState(run, 31_000).pausing === true`; **прыжок времени** `holdState(run, 10 * 60_000).done === true`; `stoppedSec(startHold(0,30,false), 4_000) === null`, `(…, 12_400) === 12`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Чистые функции; `HoldTimer` — диалог/плашка с крупным отсчётом (`aria-live="polite"` раз в 5 с и на смене стороны), «Стоп», «Отмена»; тост «Другая сторона»; в конце — сигнал таймера отдыха, подход получает `durationSec = sec`, отмечается выполненным, далее обычный отдых. Поле «Время» у растяжки — `parseClock` без `bareMinutes`, с `selectOnFocus`.
- [ ] **Step 4:** unit PASS; ручная проверка в `npm run dev` (флаг себе в `/admin/flags`).
- [ ] **Step 5:** Коммит `feat(stretching): stretch sets and hold countdown`.

### Task 5: Завершение — `stretchOnly`, XP, рекорды, сводка

**Files:**
- Modify: `lib/workouts/finish.ts` (≈117: итоги; 140: чистка; 152–159: рекорды), `lib/progress/xp.ts`, `lib/progress/records.ts` (`bestOfTimed` для `STRETCH` — только `MAX_DURATION`)
- Modify: читатели XP-события тренировки: `grep -rn "WORKOUT_COMPLETED" lib app components` — сводка, история, лента, `lib/social/queries.ts:282` — принимать и `STRETCH_SESSION`
- Modify: `components/workouts/workout-summary-view.tsx` (вид сессии растяжки)
- Test: `lib/progress/xp.test.ts`, `lib/progress/records.test.ts`, `lib/workouts/stretch-only.test.ts`

**Interfaces:**
- Produces:
  - `isStretchOnly(exercises: { kind: ExerciseKindName; sets: … }[]): boolean` в `lib/workouts/kinds.ts` — есть выполненные подходы и все упражнения с выполненными подходами — `STRETCH`.
  - `stretchSessionXp(stretchSec: number): number` = `min(60, 15 + floor(stretchSec / 60))`.
  - `workoutXp({ …, stretchSec?: number })` — +`floor(stretchSec / 60)` для смешанных.
  - `FinishMeta.stretchOnly?: true`, `FinishMeta.stretchSec?: number`.
- [ ] **Step 1: Тесты** — `isStretchOnly`: растяжка выполнена + силовое без отмеченных подходов → `true`; + одно отмеченное силовое → `false`; пусто → `false`. `stretchSessionXp(0) === 15`, `(600) === 25`, `(3600) === 60`. `workoutXp({ sets: 4, reps: 40, volume: 2000, stretchSec: 300 })` = прежнее + 5. Рекорды `STRETCH`: `bestOfSets([{durationSec: 45,…},{durationSec: 60,…}], "STRETCH")` → только `MAX_DURATION: 60` (без дистанции/темпа).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** В `finishWorkout`: после чистки невыполненных — `stretchOnly`; XP: сессия → `stretchSessionXp`, событие `XpReason.STRETCH_SESSION` (та же `meta`), иначе — прежнее с `stretchSec`; `Workout.stretchOnly` пишется в той же транзакции. Для `stretchOnly` **не вызывать** `applyWeekCredit`, босса, рейд, клуб, together-бонус, «N тренировок»-ачивки (найти вызовы в `finish.ts`). Сводка сессии: время, «Растяжка: N мин», упражнения, рекорды, цели, XP; без объёма, повторов, босса, серии.
- [ ] **Step 4:** unit PASS; `npm run typecheck`.
- [ ] **Step 5:** Коммит `feat(stretching): stretch sessions — xp, records, summary`.

### Task 6: Игровые счётчики без сессий растяжки

**Files (каждый — условие `stretchOnly = false` / `"stretchOnly" = false` там, где считаются тренировки для игры или «тренировок всего»):**
- `lib/progress/streak-db.ts` (`countWeekWorkouts`, `recomputeStreak`), `lib/notifications/reminders.ts` (через данные streak)
- `lib/boss/queries.ts`, `lib/guild/queries.ts` (рейды), `lib/club/queries.ts`, `lib/club/public-queries.ts`, `lib/achievements/engine.ts` (счётчики тренировок/подходов), `lib/recap/queries.ts`, `lib/recap/tick.ts`, `lib/dashboard/queries.ts`, `lib/dashboard/v3-queries.ts` (полоса недели — сессия растяжки отмечается отдельно «растяжка», не «тренировка»), `lib/together/snapshot.ts`, `lib/campaigns/conditions.ts` (последняя тренировка — **считать** растяжку активностью: человек вернулся), `lib/social/queries.ts` (лига: `LEAGUE_REASONS` без `STRETCH_SESSION`; лента — запись «Растяжка · N мин»)
- Не трогать: `lib/account/export-queries.ts`, `lib/admin/metrics-queries.ts` (метрики — все тренировки), `lib/shop/retro-db.ts`, `lib/whoop/actions.ts`, `lib/stats/strength-queries.ts` (растяжка там и так не участвует — проверить)
- Test: e2e `e2e/stretching.spec.ts` (создать здесь, расширять в следующих задачах)

**Interfaces:**
- Consumes: `Workout.stretchOnly` (Task 1/5).

- [ ] **Step 1: e2e** `stretch session does not count toward the week, a lift with a cool-down does` — пользователь с флагом; через UI завершает сессию из одной растяжки → счётчик недели в шапке/герое дашборда не изменился, в ленте друга — «Растяжка»; затем силовая с заминкой → счётчик +1.
- [ ] **Step 2:** `npm run build && npm run test:e2e -- stretching` — FAIL.
- [ ] **Step 3:** Условия по списку. Для каждого изменённого запроса с unit-тестом — дополнить тест строкой со `stretchOnly: true`.
- [ ] **Step 4:** e2e PASS, `npm test`.
- [ ] **Step 5:** Коммит `feat(stretching): stretch sessions stay out of game counters`.

### Task 7: Статистика

**Files:**
- Modify: `lib/stats/queries.ts` (блок «Кардио» ≈362–370 — без `STRETCH`; счётчики тренировок/часов — без `stretchOnly`; новый `getStretchStats`), страница `/stats` и компонент блока «Растяжка» (`components/stats/stretch-card.tsx`)
- Modify: страница упражнения `/stats/exercises/[id]` и `components/stats/exercise-progress-*` — `STRETCH` как `TIME`
- Test: `lib/stats/stretch.test.ts` (чистая `topZones`)

**Interfaces:**
- Produces: `getStretchStats(userId, tz): Promise<{ week: { minutes: number; sessions: number }; days7: …; days30: …; topZones: { zone: StretchZone; minutes: number }[] }>`; чистая `topZones(rows: { zones: StretchZone[]; sec: number }[], n = 3)` — минуты по основной зоне, по убыванию.
- [ ] **Step 1:** Тест `topZones` (основная — первая зона; равенство — порядок `STRETCH_ZONES`).
- [ ] **Step 2:** FAIL. **Step 3:** Реализация; блок показывается при флаге или если в истории есть растяжка. **Step 4:** PASS + typecheck. **Step 5:** Коммит `feat(stretching): stats block`.

### Task 8: Меню и страница `/stretching`

**Files:**
- Modify: `components/app/nav.ts` (`STRETCH_NAV_ITEM = { href: "/stretching", label: "Растяжка", icon: StretchHorizontal, mobile: false }`), `components/app/nav-links.tsx` (после `/exercises` по `useFlag("stretching")`), меню профиля на телефоне — там, где выводятся пункты `mobile: false`
- Create: `app/(app)/stretching/page.tsx`, `components/stretching/stretch-start.tsx`, `components/stretching/stretch-catalog.tsx`
- Modify: `e2e/stretching.spec.ts`

**Interfaces:**
- Consumes: `getStretchStats` (Task 7, только `week`), `listExercises` (Task 3), `createWorkoutAction` (существующий; сверить параметры шаблона/пустой), цели — `GoalCard`/`NewGoal` (подключаются в Task 9–11; здесь — секция «Цели по растяжке» с пустым состоянием и кнопкой «Поставить цель»).
- [ ] **Step 1: e2e** — без флага: нет ссылки «Растяжка» в навигации, `/stretching` → 404, в каталоге `/exercises` нет «Складка стоя». С флагом: ссылка ведёт на `/stretching`; «Начать растяжку» → «Утренняя растяжка» → `/training` с упражнениями растяжки; «Держать» на первом подходе (время подхода вписать «3» — короткий отсчёт) → подход отмечен; завершить → сводка содержит «Растяжка», XP ≤ 60.
- [ ] **Step 2:** FAIL. **Step 3:** Реализация (активная тренировка уже есть → кнопка «Продолжить тренировку»). **Step 4:** `npm run build && npm run test:e2e -- stretching` PASS. **Step 5:** Коммит `feat(stretching): menu and /stretching page`.

### Task 9: Цель «Удержание» (`STRETCH_HOLD`)

**Files:**
- Modify: `lib/goals/rules.ts` (`goalSchema`: тип, `exerciseId` обязателен, `target` 10…600 шаг 1; тексты `goalTitle`/`goalValueText` — «Складка стоя — удержание 1:30», значение через `formatClock`), `lib/goals/queries.ts` (`getCurrentValues`: `PersonalRecord MAX_DURATION`; выбор упражнений для формы — `kind: "STRETCH"`), `lib/goals/actions.ts` (`createGoalAction`: упражнение своё/встроенное и `kind = STRETCH`; новые типы — только при `isEnabled("stretching")`), `lib/goals/apply.ts` (снимок/применение — как STRENGTH), `lib/goals/forecast*.ts` (по неделям рекорда удержания)
- Modify: `components/goals/new-goal-dialog.tsx` (группа «Растяжка» при флаге; проп `initialGroup?: "stretch"` для `/stretching`), `goal-card.tsx`
- Test: `lib/goals/rules.test.ts`, e2e

**Interfaces:**
- Produces: `goalSchema` с `type: "STRETCH_HOLD"`; `isStretchGoal(type: GoalType): boolean` (все три новых); `NewGoal` проп `initialGroup`.
- [ ] **Step 1: Тесты** — схема: без `exerciseId` → «Выбери упражнение»; `target: 5` → «От 10 до 600»; `goalValueText({type: "STRETCH_HOLD", …}, 90) === "1:30"`. e2e: цель «Складка стоя — 0:20», тренировка с подходом 25 с → в сводке блок «Цели» «выполнена».
- [ ] **Step 2–4:** FAIL → реализация → PASS. **Step 5:** Коммит `feat(stretching): hold goal`.

### Task 10: Цель «Регулярность» (`STRETCH_WEEKLY`)

**Files:**
- Create: `lib/goals/stretch-weekly.ts`, `lib/goals/stretch-weekly.test.ts`
- Modify: `lib/goals/rules.ts` (схема: `stretchUnit`, `target` — сессии 1…7 / минуты 5…300, `weeks` 2…12 → `deadline` вычисляется сервером; тексты «3 растяжки в неделю · 4 недели», прогресс «2 из 4 недель», «эта неделя: 1/3»), `lib/goals/queries.ts` (суммы по неделям одним SQL: сессии — тренировки с выполненным подходом `STRETCH`; минуты — сумма с ×2 у `perSide`), `lib/goals/apply.ts` (достижение при закрытии последней недели), `lib/goals/tick.ts` + `tick-rules.ts` (провал после недели без нормы, `GOAL_FAIL_GRACE_MS`; текст «Неделя без растяжки — цель «…» не выполнена»), `components/goals/*`
- Test: unit + e2e (`runTick(request, now, "goals")` — сверить имя шага в `TICK_STEPS`)

**Interfaces:**
- Produces:
  - `stretchWeeks(createdAt: Date, weeks: number, tz: string): { start: string; end: string }[]` — понедельники/воскресенья; первая — текущая, если постановка пн…чт, иначе следующая.
  - `weeklyDeadline(createdAt, weeks, tz): string` — воскресенье последней недели.
  - `weekDone(unit: StretchUnit, target: number, week: { sessions: number; sec: number }): boolean`.
  - `weeklyStatus(weeks, sums: Map<string, {sessions, sec}>, today: string, target, unit): { done: number; total: number; current: { value: number; target: number } | null; failedWeek: string | null; achieved: boolean }`.
- [ ] **Step 1: Тесты** — постановка в чт → первая неделя текущая, в пт → следующая; `weeklyDeadline(…, 4, …)` — воскресенье 4-й недели; минуты: `sec: 3540`, target 60 → `false`, `3600` → `true`; **воскресенье 23:30 в `Etc/GMT-3`** попадает в эту неделю; `failedWeek` — первая прошедшая неделя без нормы; текущая незакрытая неделя провалом не считается. Выключенный флаг: `getCurrentValues` и тик не зависят от флага (тест на уровне чистой функции — флаг в неё не передаётся).
- [ ] **Step 2–4:** FAIL → реализация → PASS; e2e: история недели в `e2e/db.ts` (SQL), `runTick` → цель провалена, уведомление.
- [ ] **Step 5:** Коммит `feat(stretching): weekly goal`.

### Task 11: Цель «Навык» (`STRETCH_SKILL`) и замеры

**Files:**
- Create: `lib/stretching/skills.ts` (+ test), `lib/goals/stretch-actions.ts`, `components/goals/stretch-measure.tsx` (форма «Записать замер» + график 90 дней — по образцу `BodyWeightBlock`)
- Modify: `lib/goals/rules.ts` (схема: `stretchSkill` из списка или `skillTitle` 1…60; `startCm` 0,5…200 шаг 0,5; цель — 0; `canCreate`: одна активная на навык; тексты «Осталось 12 см»), `lib/goals/queries.ts` (значение — последний замер), `lib/goals/forecast*.ts` (ниже — лучше), `lib/account/*` (если не сделано в Task 1)
- Test: unit + e2e

**Interfaces:**
- Produces:
  - `STRETCH_SKILLS: Record<"SPLIT_LEFT" | "SPLIT_RIGHT" | "SPLIT_SIDE" | "FOLD_STANDING" | "FOLD_SEATED" | "BRIDGE", { title: string; measure: string }>` (названия и мерки — из спеки).
  - `logStretchMeasurementAction(goalId: string, cm: number): Promise<{ ok: true; achieved: boolean } | { ok: false; error: string }>` — своя активная цель `STRETCH_SKILL`, upsert по `[goalId, date]` (местный день), при `cm === 0` — `markAchieved` (условный `updateMany`) + уведомление `GOAL`.
- [ ] **Step 1: Тесты** — `STRETCH_SKILLS.SPLIT_SIDE.title === "Поперечный шпагат"`; схема: ни навыка, ни названия → ошибка; `startCm: 0` → ошибка; `canCreate` — вторая активная `FOLD_STANDING` запрещена, `FOLD_SEATED` — можно. e2e: цель «Ладони в пол в наклоне», старт 10 см → «Записать замер» 6 → «Осталось 6 см»; повтор в тот же день 4 → один замер в графике, «Осталось 4 см»; 0 → цель выполнена, сундук; «Мои данные» содержат `stretchMeasurements`; удаление аккаунта проходит.
- [ ] **Step 2–4:** FAIL → реализация → PASS.
- [ ] **Step 5:** Коммит `feat(stretching): skill goal and measurements`.

### Task 12: Документация и полный прогон

**Files:**
- Modify: `docs/features/training.md` (новый пункт «Растяжка» по образцу «Кардио»: флаг, модели, правила, e2e; в пункте «Цели» — три новых типа), `docs/features/game.md` (сессии растяжки не в серии/боссе/рейдах/лиге)
- [ ] **Step 1:** Обновить документы.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное (e2e cardio/goals/dashboard/account-data — без регрессий).
- [ ] **Step 3:** Коммит `docs(stretching): feature docs`; слияние в `release/2027-11-stretching` — только после согласия пользователя.
