# Кардио и упражнения на время — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** упражнения `TIME` (подход — секунды) и `CARDIO` (время + дистанция) — полноценные подходы: XP (+1 за минуту), босс/рейд/гоблин/клуб, рекорды «Дольше/Дальше всего/Лучший темп», категория ачивок ENDURANCE; всё новое видимое — под флагом `workout_formats`.

**Architecture:** `Exercise.kind` + `WorkoutSet.durationSec/distanceM`; чистые правила `lib/workouts/kinds.ts` (`isDoneSet`, время/темп/км) и расширенные `workoutTotals`/`workoutXp`/`bestOfSets` → завершение и игровые модули считают «подход состоялся» через вид упражнения → ввод в редакторе по виду → показ, статистика, ачивки.

**Tech Stack:** Next.js 16, Prisma 7, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-cardio-timed-design.md`

## Global Constraints

- Ветка `feat/cardio-timed` от `release/2026-11-formats`; в конце — `--no-ff` в релизную.
- Подход `TIME`/`CARDIO` хранит `reps = 0`, `weight = 0`; состоялся — `durationSec > 0`. В SQL «подход состоялся»: `(s.reps > 0 OR s."durationSec" > 0)`; силовые запросы (объём, 1RM, тренд силы, вес, прогрессия, рекап силовых) остаются на `reps > 0`/`weight > 0` — кардио туда не попадает.
- XP: `+ ⌊workSec/60⌋`, потолок 600; объём и повторы — только `REPS`.
- `BEST_PACE` — меньше лучше, только дистанция ≥ 1000 м.
- Без флага: `TIME`/`CARDIO` скрыты в каталоге и выборе; категория ENDURANCE скрыта (кроме полученных); история показывает всё.
- Новое числовое поле ввода — `selectOnFocus`. Миграция: проверить SQL — частичные индексы не трогать.
- e2e — флаг на пользователя, desktop и mobile.

## Review Focus

1. **Подход кардио при завершении** (reps 0) не удаляется и попадает в итоги, XP, урон, гоблина. Тест: `finishWorkout` через e2e (Task 7) + unit `isDoneSet` (Task 1).
2. **Силовые расчёты не получают кардио** (1RM, объём, «Пора увеличить вес», «точно столько?»). Тест: unit `workoutTotals` смешанной тренировки (Task 1), `bestOfSets` кардио без силовых типов (Task 3).
3. **`BEST_PACE`**: меньше — лучше; < 1 км не ставит и не сбрасывает. Тест: `findNewRecords` (Task 3).
4. **Старый черновик** без `durationSec`/`distanceM`. Тест: схема (Task 2).
5. **Без флага**: каталог без новых видов, история не ломается. Тест: e2e (Task 7).

---

### Task 1: Правила видов, итоги, XP

**Files:** Create `lib/workouts/kinds.ts`, `lib/workouts/kinds.test.ts`; Modify `lib/workouts/schema.ts` (`workoutTotals`), `lib/progress/xp.ts`; Test `lib/workouts/schema.test.ts`, `lib/progress/xp.test.ts`.

**Interfaces — Produces:**
- `type ExerciseKindName = "REPS" | "TIME" | "CARDIO"`;
- `isDoneSet(kind: ExerciseKindName | undefined, s: { reps: number; durationSec?: number | null; completedAt: unknown }): boolean` (`undefined` = `REPS`);
- `parseClock(v: string): number`, `formatClock(sec: number): string`, `formatPace(sec: number, m: number): string | null`, `formatKm(m: number): string`;
- `workoutTotals(exercises: { kind?: ExerciseKindName; sets: { weight; reps; durationSec?; distanceM?; isWarmup?; completedAt }[] }[])` → `{ sets, reps, volume, exercises, workSec, distanceM }`;
- `workoutXp({ sets, reps, volume, workSec? })`.

- [ ] Тесты: `isDoneSet` — `REPS` reps 0 → false, 5 → true; `TIME` reps 0 durationSec 60 → true, durationSec 0 → false; не выполнен → false. `parseClock`: `"1:30"`→90, `"90"`→90, `"1:02:05"`→3725, `"0:75"`→0 (секунды ≥ 60 — мусор), `"abc"`→0, `""`→0. `formatClock`: 90→`"1:30"`, 59→`"0:59"`, 3725→`"1:02:05"`. `formatPace(1720, 5200)`→`"5:31/км"`, `(300, 900)`→`null`. `formatKm(5200)`→`"5,2 км"`, `10000`→`"10 км"`. `workoutTotals` смешанной: жим 60×10 + бег 1720 с 5200 м + планка 90 с → `{ sets: 3, reps: 10, volume: 600, exercises: 3, workSec: 1810, distanceM: 5200 }`. `workoutXp({ sets: 1, reps: 0, volume: 0, workSec: 1800 })` → 50+5+30 = 85; потолок 600.
- [ ] RED (`npx vitest run lib/workouts lib/progress/xp`) → реализация → GREEN; commit `feat(cardio): kinds, clock and pace, totals, xp per minute`.

### Task 2: Данные, сид, черновик, завершение, игровые «подход состоялся»

**Files:** Modify `prisma/schema.prisma` (+ миграция `cardio_timed`, `npx prisma generate`), `prisma/seed.ts` (10 упражнений из спеки), `lib/workouts/schema.ts` (`setDraftSchema` + `durationSec: z.number().int().min(0).max(86400).nullable().default(null).catch(null)`, `distanceM: z.number().int().min(0).max(1_000_000).nullable().default(null).catch(null)`), `lib/workouts/actions.ts` (запись), `lib/workouts/queries.ts` (`ExerciseInfo.kind`, `ActiveWorkout` sets + `durationSec`/`distanceM`, `LastPerformance` sets + `durationSec`/`distanceM`), `lib/workouts/finish.ts` (удаление пустых: невыполненные или «не состоялся» по виду; итоги/XP с `workSec`; `Workout` пишет как раньше), `lib/goblin/rules.ts` + `lib/goblin/queries.ts` (подход с повторами **или** временем), `lib/shop/retro-db.ts`, `lib/club/tasks.ts` (подходы — с кардио; объём/повторы — без), `components/training/workout-state.ts` (`SetState.duration`, `SetState.distance` — строки; `initState`/`toDraft`/`toggleComplete` перенос/`addSet` копирует).

**Interfaces — Consumes:** Task 1. **Produces:** `ExerciseInfo.kind: ExerciseKindName`; `SetState.duration: string` (`formatClock` или пусто), `SetState.distance: string` (км, «5,2»); черновик `durationSec`, `distanceM`.

- [ ] Тесты: схема — черновик без новых полей → `null`; редьюсер — `toDraft` планки `duration "1:30"` → `durationSec 90`, бега `distance "5,2"` → `distanceM 5200`; `toggleComplete` переносит время/дистанцию в следующий пустой; гоблин `goblinProgress` считает подход с `durationSec`; `rollsFor`-счёт выполненных — тоже.
- [ ] RED → схема/миграция (SQL: `CREATE TYPE "ExerciseKind"`, `ADD COLUMN`, `ALTER TYPE … ADD VALUE` ×4) → GREEN (`npm test`, `npm run typecheck`); `npm run db:seed` — новые упражнения появились; commit `feat(cardio): exercise kind, set duration and distance, done-set rule in finish and game`.

### Task 3: Рекорды

**Files:** Modify `lib/progress/records.ts` (`bestOfSets(kind, sets)`; `findNewRecords` — `BEST_PACE` меньше лучше), `lib/workouts/finish.ts` (передать вид), подписи рекордов (`grep -rn "MAX_REPS" lib components app` — все словари подписей: «Дольше всего», «Дальше всего», «Лучший темп»; значения — `formatClock`, `formatKm`, `formatPace`); Test `lib/progress/records.test.ts`.

**Interfaces — Produces:** `bestOfSets(kind: ExerciseKindName, sets: { weight; reps; durationSec?; distanceM? }[]): RecordValues`; `LOWER_IS_BETTER: ReadonlySet<RecordType>`; `formatRecord(type, value): string`.

- [ ] Тесты: `bestOfSets("TIME", [{durationSec:60},{durationSec:95}])` → `{ MAX_DURATION: 95 }` (силовых нет); `CARDIO` 5200 м/1720 с и 800 м/200 с → `MAX_DISTANCE 5200`, `MAX_DURATION 1720`, `BEST_PACE ≈ 330.77` (800 м не считается); `REPS` — как раньше; `findNewRecords({BEST_PACE: 300}, {BEST_PACE: 330})` → improved, `({BEST_PACE: 340}, {BEST_PACE: 330})` → нет.
- [ ] RED → GREEN; commit `feat(cardio): duration, distance and pace records`.

### Task 4: Ввод и каталог

**Files:** Modify `components/training/exercise-block.tsx` (по `exercise.kind`: `TIME` — поле «Время» `aria-label="Время, подход N"`; `CARDIO` — «Дистанция, км» `aria-label="Дистанция, подход N"` и «Время»; без веса, RIR, разминки, «точно столько?», подсказки прогрессии), `components/training/workout-editor.tsx` (каталог/выбор: без флага скрыть `kind !== "REPS"`), `lib/exercises/queries.ts` (+ `kind`), `components/exercises/exercise-form-dialog.tsx` + `lib/exercises/schema.ts` + `lib/exercises/actions.ts` (выбор вида при флаге; смена вида своего — только без выполненных подходов, иначе ошибка «Вид нельзя сменить: по упражнению уже есть подходы»), `app/(app)/exercises/page.tsx` (фильтр без флага), выбор упражнений шаблона и целей (цели — только `REPS`).

- [ ] Тест (`lib/exercises/schema.test.ts`): схема упражнения принимает `kind`, по умолчанию `REPS`.
- [ ] RED → реализация → GREEN; `npm run typecheck && npm run lint`; commit `feat(cardio): time and distance inputs, kind in exercise form, catalog behind flag`.

### Task 5: Ачивки ENDURANCE

**Files:** Modify `lib/achievements/definitions.ts` (5 лестниц из спеки: коды, ступени, названия, XP), `lib/achievements/engine.ts` (`cardioDistanceM`, `workSec`, `longestCardioSetM`, `longestTimeSetSec`, `hybridWorkouts`), страница/компонент ачивок (скрыть ENDURANCE без флага, кроме полученных), подпись категории «Выносливость» (`grep -rn "GOAL:" components lib` — словарь категорий); Test `lib/achievements/definitions.test.ts`.

- [ ] Тесты: `cardioDistanceM: 42_000` → `cardio_km:10`, `cardio_km:42` («Марафонская дистанция»); `longestCardioSetM: 21_100` → `cardio_set:5000/10000/21100` («Полумарафон»), без `42200`; `longestTimeSetSec: 125` → `hold:60`, `hold:120` («Стойкость: 2 мин»); `workSec: 5 * 3600` → `work_hours:1`, `work_hours:5`; `hybridWorkouts: 10` → `hybrid:1` («Гибрид»), `hybrid:10` («Гибрид ×10»); XP ступеней по спеке.
- [ ] RED → GREEN (`npm test`); commit `feat(cardio): endurance achievements`.

### Task 6: Показ, статистика, шаблоны, выгрузка

**Files:** Modify `components/workouts/workout-summary-view.tsx` (подходы по виду: «1:30»; «5,2 км · 28:40 · 5:31/км»; плитка «Кардио» с минутами и км при наличии), лента/рекап/тренер — места, где подходы печатаются как `вес × повторы` (`grep -rn "× \${" components lib`), страница упражнения (рекорды по виду; график: `TIME` — лучшее время за тренировку, `CARDIO` — дистанция), `lib/stats/queries.ts` + `app/(app)/stats/page.tsx` (блок «Кардио»: минуты и км за неделю и месяц, при флаге), `components/templates/template-editor.tsx` (у `TIME`/`CARDIO` только подходы и отдых), `lib/templates/progression.ts` + `lib/coach/progression-apply.ts` (пропуск не-`REPS`), `lib/account/export-queries.ts` + `lib/account/export.ts` + `lib/account/csv.ts` (`durationSec`, `distanceM`, `kind`; CSV `duration_sec`, `distance_m`); Test `lib/account/*.test.ts`.

- [ ] Тест: выгрузка — подход с `durationSec`/`distanceM` в JSON и CSV-колонках.
- [ ] RED → GREEN; `npm run typecheck && npm run lint`; commit `feat(cardio): display, stats, templates, export`.

### Task 7: e2e, тексты

**Files:** Create `e2e/cardio.spec.ts`; Modify `docs/features/training.md`, `docs/features/game.md` (ачивки ENDURANCE). Пункт «Что нового» — при выпуске релиза.

- [ ] Сценарии (флаг на пользователя):
  1. Пустая тренировка → «Бег» (дистанция 5,2, время 28:40) + «Планка» (1:30) → завершить → итоги: «5,2 км · 28:40 · 5:31/км», «1:30», плитка «Кардио», XP за тренировку > 50, рекорды «Дальше всего», «Дольше всего», ачивка «Пятёрка»; в БД подходы сохранились (`durationSec`).
  2. Своё упражнение вида «Кардио» → в тренировке поля дистанции и времени.
  3. Без флага: «Планки» нет в каталоге.
- [ ] `npm run build && npx playwright test e2e/cardio.spec.ts` — PASS; commit `test(cardio): e2e; docs`.

### Task 8: Финал

- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — зелёное; ревью ветки; `--no-ff` в `release/2026-11-formats`.
