# Умная аналитика прогресса — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Тренд силы (лучший 1ПМ/повторы, 4 недели к 4) и три места показа: блок «Ты стал сильнее» в итогах недели + push, «Месяц к месяцу» в `/stats`, прогноз силовых целей и веса тела.

**Architecture:** Один SQL недельных лучших по упражнениям (`exerciseWeekBests`) + чистые функции (`strengthTrend`, `monthCompare`, `forecastGoal`) и тексты. Итоги недели хранят результат в снимке `RecapData.strength`; остальное считается на лету.

**Tech Stack:** Next.js 16, Prisma 7 (`$queryRaw`), recharts не трогаем, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-strength-analytics-design.md`

## Global Constraints

- Ветка `feat/strength-analytics`; куда вливать — решает пользователь (текущий релиз или следующий). Слияние — не в этом плане.
- Пороги: `TREND_MIN_SESSIONS = 2`, «сильнее» `pct ≥ 0.01`, «держишь» `pct ≥ -0.03`; свой вес — `+1` повтор / `≥ -1`; 1ПМ — только подходы `reps ≤ 12` и `weight > 0`; окна по 4 недели.
- Прогноз: минимум 3 точки на 3 разных неделях, ряд — 8 недель, дальше 2 лет — `far`.
- Слова «спад», минусы и красный цвет в отчёте и карточке месяца не показываются.
- Тексты без рода, склонения — `plural` из `@/lib/format`, килограммы — `formatKg`.
- Недели — понедельник в поясе пользователя, ключ `YYYY-MM-DD` (как `weekStart` в `lib/stats/series.ts`).
- e2e: даты — через `E2E_TZ`/`localAt`; итоги — недели в прошлом.

## Review Focus

1. Упражнение с весом, в одном окне сделанное только своим весом (вес 0) — нет `oneRm` в окне → сравнение по повторам или исключение, но не NaN/Infinity → тест в Task 1 (`strengthTrend` с `oneRm: null`).
2. Деление на ноль: «раньше» = 0 повторов/1ПМ, срок цели сегодня (0 недель до срока) → без Infinity → тесты в Task 1 и Task 4.
3. Цель по весу тела вниз (похудение) — темп отрицательный, но к цели → прогноз даты, а не `stalled` → тест в Task 4.
4. Неполный месяц 31-го числа против 30-дневного прошлого → «те же дни» обрезаются по длине прошлого месяца → тест в Task 3.
5. Старые снимки итогов без `strength` — страница и push не падают → тест в Task 2 (`recapPushBody` без поля).

---

### Task 1: Ядро тренда силы

**Files:**
- Create: `lib/stats/strength.ts`, `lib/stats/strength.test.ts`, `lib/stats/strength-queries.ts`

**Interfaces:**
- Produces (`lib/stats/strength.ts`, чистые):
  - `export type WeekBest = { exerciseId: string; name: string; bodyweight: boolean; week: string; oneRm: number | null; maxWeight: number; maxReps: number; sessions: number }`
  - `export type TrendItem = { exerciseId: string; name: string; bodyweight: boolean; from: number; to: number; pct: number }`
  - `export type StrengthTrend = { stronger: number; of: number; top: TrendItem[] }`
  - `export const TREND_MIN_SESSIONS = 2`
  - `export function trendWindows(week: string): { recent: string[]; before: string[] }` — `recent` = 4 понедельника, кончая `week`; `before` — 4 перед ними (по возрастанию).
  - `export function strengthTrend(rows: WeekBest[], windows: { recent: string[]; before: string[] }): StrengthTrend`
  - `export function trendHeadline(t: StrengthTrend): string`, `export function trendLine(i: TrendItem): string`
- Produces (`lib/stats/strength-queries.ts`, server-only): `export async function exerciseWeekBests(userId: string, timeZone: string, since: Date): Promise<WeekBest[]>`

- [ ] **Step 1: Падающие тесты** `strength.test.ts` (фикстура `wb(exerciseId, week, oneRm, sessions = 1, extra?)`):
  - `trendWindows("2026-10-05")` → `recent: ["2026-09-14","2026-09-21","2026-09-28","2026-10-05"]`, `before: ["2026-08-17","2026-08-24","2026-08-31","2026-09-07"]`.
  - жим: before 80 (2 сессии), recent 84 (2) → `{ stronger: 1, of: 1, top: [{ from: 80, to: 84, pct: 0.05 }] }`.
  - 1 сессия в одном окне → `of: 0`.
  - рост 0,5 % → `stronger: 0, of: 1` («держишь»); падение 10 % → `stronger: 0, of: 1`, `top: []`.
  - свой вес: `maxReps` 9 → 11, `oneRm: null` → `top[0]` `{ bodyweight: true, from: 9, to: 11 }`; 9 → 9 → не «сильнее».
  - упражнение с весом, `oneRm: null` во всём окне «раньше» → сравнение по `maxReps` (без NaN): `Number.isFinite(top[0].pct)`.
  - «раньше» `maxReps: 0` → упражнение исключается из `of`.
  - 4 «сильнее» → `top` длины 3 по убыванию `pct`, при равенстве — по имени.
  - `from`/`to` 1ПМ округлены до 0,5 (`82.3 → 82.5`).
  - `trendHeadline({stronger:4,of:6})` = «Ты стал сильнее в 4 из 6 упражнений»; `{stronger:1,of:1}` → «… в 1 из 1 упражнения»; `{stronger:0,of:5}` → «Держишь уровень в 5 упражнениях»; `{stronger:0,of:1}` → «Держишь уровень в 1 упражнении».
  - `trendLine` с весом → «Жим штанги лёжа · 1ПМ 82 → 85 кг · +4 %» (pct округлён до целого); свой вес → «Подтягивания · 9 → 11 повторов».

- [ ] **Step 2:** `npx vitest run lib/stats/strength` — FAIL (нет модуля).

- [ ] **Step 3: Реализовать** чистые функции. Значение окна: если у упражнения `bodyweight` или нет ни одного `oneRm` в обоих окнах — `max(maxReps)`, `pct = (to − from) / from`, «сильнее» при `to − from ≥ 1`, «держишь» при `≥ −1`; иначе — `max(oneRm)` по неделям окна (null пропускаются), пороги `0.01`/`-0.03`. `from ≤ 0` — исключить.

- [ ] **Step 4: `exerciseWeekBests`** — SQL по образцу `strengthRows` (`lib/stats/queries.ts:260`): группировка по `exerciseId`, неделе (`date_trunc('week', (finishedAt AT TIME ZONE 'UTC') AT TIME ZONE tz)` → `YYYY-MM-DD`); `oneRm` — `MAX(...) FILTER (WHERE weight > 0 AND reps <= 12)` (Эпли, `reps = 1` → вес), `maxWeight`, `maxReps`, `COUNT(DISTINCT w.id)`; join `Exercise` (name, isBodyweight). Все числа `::float8`/`::int`. Без лимита упражнений. (Проверяется e2e в Task 2.)

- [ ] **Step 5:** `npx vitest run lib/stats && npm run typecheck` — PASS.

- [ ] **Step 6: Commit** `feat(strength): strength trend core and weekly bests query`.

---

### Task 2: «Ты стал сильнее» в итогах недели и push

**Files:**
- Modify: `lib/recap/types.ts` (`RecapData.strength?: StrengthTrend`, `RecapInput.strengthWeeks: WeekBest[]`), `lib/recap/queries.ts` (`loadRecapInput`), `lib/recap/build.ts` (`buildRecap`, `recapHighlights`), `components/recap/recap-view.tsx`, `components/recap/recap-card.tsx`
- Create: `components/recap/strength-block.tsx`
- Test: `lib/recap/build.test.ts`, `e2e/strength-analytics.spec.ts`

**Interfaces:**
- Consumes: Task 1 — `WeekBest`, `StrengthTrend`, `strengthTrend`, `trendWindows`, `trendHeadline`, `trendLine`, `exerciseWeekBests`.

- [ ] **Step 1: Падающие тесты** в `build.test.ts` (в базовую фикстуру добавить `strengthWeeks: []`):
  - рост жима 80 → 84 по 2 сессии в окнах недели итогов → `buildRecap(...).strength` = `{ stronger: 1, of: 1, top: [...] }`.
  - `strengthWeeks: []` → `strength` отсутствует (`toBeUndefined`).
  - `recapPushBody` при `strength.stronger > 0` начинается с «Ты стал сильнее: жим штанги лёжа +5 %» и содержит «Смотри итоги недели»; при своём весе — «+2 повт.»; не больше 2 упражнений.
  - `recapPushBody` без `strength` (старый снимок) — прежний текст (существующие тесты остаются зелёными).

- [ ] **Step 2:** `npx vitest run lib/recap` — FAIL.

- [ ] **Step 3: Реализовать.** `loadRecapInput`: `exerciseWeekBests(userId, tz, <понедельник за 7 недель до week>)`, отфильтровать недели `≤ week`. `buildRecap`: `const t = strengthTrend(input.strengthWeeks, trendWindows(input.week)); if (t.of > 0) data.strength = t`. `recapPushBody`: при `data.strength?.stronger` — `Ты стал сильнее: ${до 2 top через ", "}. Смотри итоги недели` (имя упражнения со строчной буквы — как в примере спеки, `+N %` или `+N повт.`), иначе прежнее `recapHighlights(...).join(" · ")`.

- [ ] **Step 4: UI.** `StrengthBlock({ strength })` — `section aria-label="Сильнее"`, `h2` = `trendHeadline`, список `trendLine` по `top`; в `RecapView` — первым блоком после шапки, если `data.strength`. `RecapCard` — строка «Сильнее в N из M» при `strength?.stronger > 0`.

- [ ] **Step 5: e2e** `e2e/strength-analytics.spec.ts`: «recap shows «Ты стал сильнее»»: `registerUser`; через `seedRecapWeek` (или `seedWorkouts` с датами недель) — 8 недель перед прошлой… прошлая неделя: жим по 2 тренировки в каждом окне, «раньше» 60×5, «сейчас» 70×5; открыть `/recap?week=<понедельник прошлой недели>` (как в `e2e/recap.spec.ts`) → `getByRole("region", { name: "Сильнее" })` содержит «Ты стал сильнее в 1 из 1 упражнения» и «Жим штанги лёжа».

- [ ] **Step 6:** `npx vitest run && npm run typecheck && npm run build && npx playwright test strength-analytics recap --workers=8` — PASS.

- [ ] **Step 7: Commit** `feat(strength): «Ты стал сильнее» block in weekly recap and push`.

---

### Task 3: «Месяц к месяцу» в `/stats`

**Files:**
- Create: `lib/stats/month.ts`, `lib/stats/month.test.ts`, `components/stats/month-compare.tsx`
- Modify: `lib/stats/strength-queries.ts` (`getMonthCompare`), `components/stats/stats-view.tsx` (`StatsViewData.month`), `app/(app)/stats/page.tsx`, `app/(app)/coach/clients/[id]/page.tsx` (вкладка stats, ~строка 313)
- Test: `lib/stats/month.test.ts`, `e2e/strength-analytics.spec.ts`

**Interfaces:**
- Consumes: Task 1 — `strengthTrend`, `StrengthTrend`, `exerciseWeekBests`.
- Produces:
  - `export type MonthTotals = { workouts: number; hours: number; volume: number; records: number }`
  - `export function monthRanges(today: string): { cur: { from: string; to: string }; prev: { from: string; to: string }; prevFull: { from: string; to: string } }` — `cur` 1-е…сегодня; `prev` 1-е…min(день сегодня, длина прошлого месяца); `prevFull` — весь прошлый месяц.
  - `export function monthWeeks(today: string): { recent: string[]; before: string[] }` — понедельники недель, пересекающих `cur` / `prevFull`.
  - `export type MonthCompare = { title: string; caption: string; rows: { label: string; cur: string; prev: string; dir: "up" | "same" | "down" }[]; strength: StrengthTrend | null }`
  - `export function monthCompare(cur: MonthTotals, prev: MonthTotals, trend: StrengthTrend, today: string): MonthCompare`
  - `export async function getMonthCompare(userId: string, timeZone: string): Promise<MonthCompare>`

- [ ] **Step 1: Падающие тесты** `month.test.ts`:
  - `monthRanges("2026-10-12")` → `cur 2026-10-01…2026-10-12`, `prev 2026-09-01…2026-09-12`, `prevFull 2026-09-01…2026-09-30`.
  - `monthRanges("2026-03-31")` → `prev 2026-02-01…2026-02-28`.
  - `monthCompare(...)` `title` «Октябрь против сентября», `caption` «1–12 октября против 1–12 сентября»; строки «Тренировки», «Часы», «Объём», «Рекорды» с `dir`; `trend.of = 0` → `strength: null`.
  - `monthWeeks("2026-10-12")` → `recent` с `"2026-09-28"` по `"2026-10-12"`, `before` с `"2026-08-31"` по `"2026-09-28"`.

- [ ] **Step 2:** `npx vitest run lib/stats/month` — FAIL.

- [ ] **Step 3: Реализовать** `month.ts`; `getMonthCompare`: местные даты границ → один SQL агрегатов тренировок (`COUNT`, `SUM(durationSec)/3600`, `SUM(totalVolume)`) по `finishedAt` в поясе для `cur` и `prev` + число `meta.records` у `XpEvent PERSONAL_RECORD` за те же интервалы; `exerciseWeekBests(…, since = понедельник первой недели before)` → `strengthTrend(rows, monthWeeks(today))`. Объём в строке — `formatKg`/тонны как в `StatsView`; часы — с одним знаком.

- [ ] **Step 4: UI.** `MonthCompare({ data })` — `section aria-label="Месяц к месяцу"`: `title`, `caption`, строки «прошлое → текущее» со стрелкой (`up` — `text-primary`, `same`/`down` — `text-muted-foreground`), блок силы (`trendHeadline` + `trendLine`) при `strength`. В `StatsView` — первым после пустого состояния; `StatsViewData` получает `month`; обе страницы зовут `getMonthCompare` в своём `Promise.all`.

- [ ] **Step 5: e2e** в `strength-analytics.spec.ts`: «stats shows month-to-month card»: пользователь с тренировкой сегодня (`seedWorkouts(..., 1)` или `quickWorkout`) → `/stats` → `getByRole("region", { name: "Месяц к месяцу" })` видим и содержит «Тренировки».

- [ ] **Step 6:** `npx vitest run && npm run typecheck && npm run build && npx playwright test strength-analytics stats coach --workers=8` — PASS.

- [ ] **Step 7: Commit** `feat(strength): month-to-month card in stats`.

---

### Task 4: Прогноз целей

**Files:**
- Create: `lib/goals/forecast.ts`, `lib/goals/forecast.test.ts`, `lib/goals/forecast-queries.ts`
- Modify: `lib/goals/queries.ts` (`GoalView.forecast`, `toViews`, `getExerciseGoal`), `components/goals/goal-card.tsx`, `components/goals/goals-card.tsx`, `components/goals/client-goals.tsx`, `components/stats/exercise-progress-view.tsx`, `components/stats/exercise-progress-chart.tsx`
- Test: `lib/goals/forecast.test.ts`, `e2e/strength-analytics.spec.ts`

**Interfaces:**
- Consumes: Task 1 — `exerciseWeekBests`, `WeekBest`.
- Produces:
  - `export type Forecast = { kind: "onTrack" | "eta"; date: string } | { kind: "late"; date: string; need: number; pace: number } | { kind: "stalled" } | { kind: "far" }`
  - `export function forecastGoal(input: { points: { week: string; value: number }[]; current: number; target: number; deadline: string | null; today: string }): Forecast | null`
  - `export function forecastText(f: Forecast, opts: { unit: "кг" | "повт."; bodyWeight: boolean }): string`, `export function forecastShort(f: Forecast): string`
  - `export async function getGoalForecasts(client: Client, userId: string, goals: GoalRow[], tz: string): Promise<Map<string, Forecast>>`
  - `GoalView.forecast: Forecast | null`; `getExerciseGoal` → `{ metric; target; forecast: string | null }`

- [ ] **Step 1: Падающие тесты** `forecast.test.ts` (точки — понедельники с шагом 7 дней, `today` — понедельник после последней):
  - 2 точки → `null`; 3 точки на одной неделе → `null`.
  - 60, 62, 64 (кг/нед +2), current 64, target 70, без срока → `{ kind: "eta", date: <today + 21 день> }`.
  - тот же ряд, срок через 28 дней → `onTrack`; срок через 7 дней → `late` с `need: 6`, `pace: 2`.
  - срок сегодня (0 недель) → `late` с `need` конечным (`Number.isFinite`), считать недели до срока как `max(1/7, …)`.
  - 64, 64, 64 → `stalled`; 64, 62, 60 при target 70 → `stalled`.
  - вес тела 90, 89, 88, target 85 → `eta` (движение к цели вниз — не stalled).
  - темп +0,01 кг/нед, target +50 → `far`.
  - `forecastText`: `onTrack` → «Успеваешь: ≈ 14 ноября»; `eta` → «≈ 14 ноября»; `late` → «Не успеваешь к сроку: нужно +1,2 кг в неделю, сейчас +0,5»; `stalled` → «Пока без роста — прогноз появится, когда пойдёт прогресс», с `bodyWeight` → «Вес пока не движется к цели»; `far` → «Больше 2 лет при текущем темпе». Даты — «d MMMM» по-русски в формате существующих `deadlineText`. Для веса тела `need`/`pace` — по модулю, со знаком «−» при похудении.

- [ ] **Step 2:** `npx vitest run lib/goals/forecast` — FAIL.

- [ ] **Step 3: Реализовать** `forecastGoal` (МНК по индексу недели от первой точки; `slope` — единиц в неделю; направление цели `sign(target − current)`; `slope × sign ≤ 0` → `stalled`; недели до цели `(target − current) / slope`; дата > `today + 730` дней → `far`) и тексты.

- [ ] **Step 4: Подключить.** `getGoalForecasts`: силовые активные цели — `exerciseWeekBests` за 8 недель по их упражнениям (фильтр по `exerciseId`), ряд по метрике (`ONE_RM` → `oneRm`, `MAX_WEIGHT` → `maxWeight`, `MAX_REPS` → `maxReps`); вес тела — `BodyWeightEntry` за 8 недель, последняя запись недели. `toViews`: `forecast` для активных (`null` у закрытых и прочих типов). `GoalCard`: при `forecast` — строка `forecastText` вместо блока `pace === "behind"`; `GoalsCard` — `forecastShort` («≈ 14 ноября» / «не успеваешь»); `ClientGoals` — `forecastText`. `getExerciseGoal` — `forecast` текстом; в `ExerciseProgressChart` (проп `forecast?: string | null`) — строка под «Цель — X».

- [ ] **Step 5: e2e** в `strength-analytics.spec.ts`: «strength goal shows a forecast»: история жима за 3 недели с ростом (`seedWorkouts` 60/62/64 с шагом 7 дней), `createGoal({ type: "STRENGTH", exerciseName: "Жим штанги лёжа", metric: "MAX_WEIGHT", target: 70 })` → `/goals` → статья цели содержит «≈».

- [ ] **Step 6:** `npx vitest run && npm run typecheck && npm run build && npx playwright test strength-analytics goals --workers=8` — PASS.

- [ ] **Step 7: Commit** `feat(strength): goal forecast from weekly trend`.

---

### Task 5: Лендинг, документация, полный прогон

**Files:**
- Modify: `app/(marketing)/page.tsx` (строка в описании фич/инфографике про понедельничный отчёт «Ты стал сильнее»), `CLAUDE.md` (пункт про тренд силы: `exerciseWeekBests`, окна и пороги, `RecapData.strength` + push, `getMonthCompare`, `forecastGoal`)

- [ ] **Step 1:** Правки лендинга и CLAUDE.md; утверждение на лендинге — только о том, что реально работает.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное, числа — в ledger.
- [ ] **Step 3: Commit** `docs: strength analytics in CLAUDE.md and landing`. Слияние — после решения пользователя, куда.
