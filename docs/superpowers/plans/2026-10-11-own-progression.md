# Своя прогрессия в шаблоне — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вес цели в своём шаблоне растёт сам: выполнил — +шаг, три неудачи — разгрузка.

**Architecture:** `TemplateExercise.step/fails`; правило — существующее `progressTarget`; `applyOwnProgression` в `finishWorkout` рядом с тренерской; цель своего шаблона — `Target` для `plannedSets`.

**Tech Stack:** Next.js 16, Prisma 7, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-own-progression-design.md`

## Global Constraints

- Только свои шаблоны (`WorkoutTemplate.userId` = пользователь); тренерская `applyProgression` и задания тренера не меняются.
- Шаг 0,5…20 или null; шаг без веса — «Для прогрессии нужен вес».
- Пересоздание строк шаблона (`saveTemplateAction`, `updateTemplateFromWorkoutAction`) не теряет `fails`: `carryFails` — вес и шаг те же → прежний счётчик, иначе 0.
- Тексты: «Шаг, кг», «Прогрессия: +2,5 кг, когда сделаешь 4 × 8 · 60 кг», заголовок блока сводки «Прогрессия» (свой шаблон) / «План тренера» (тренерский).
- Запросы в транзакции — по очереди.
- Миграция: проверить SQL на `DROP INDEX` частичных индексов (`CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`).

## Review Focus

- «Добавить недостающие упражнения в шаблон» (`updateTemplateFromWorkoutAction`) перезаписывает вес строк из тренировки — у строки с прогрессией это откатит +шаг. → Task 2: у строк с шагом сохранять вес/шаг/`fails` шаблона.
- Тренировка по своему шаблону у клиента с активным тренером — тренерская прогрессия не срабатывает (шаблон не тренера), своя срабатывает. → код Task 2 (ревью).
- Упражнение повторяется в шаблоне дважды — одна цель на упражнение (первая строка с шагом). → `ownTargets` unit Task 1.
- Тренировка по своему шаблону, упражнение удалено из шаблона до завершения — не попытка. → код Task 2.
- Без выполненных рабочих подходов (всё пропущено) — `fails` не растёт. → правило `progressTarget` (уже покрыто), e2e не нужен.

---

### Task 1: Чистые правила

**Files:** Create `lib/templates/progression.ts`, `lib/templates/progression.test.ts`; Modify `lib/templates/schema.ts`, `lib/templates/schema.test.ts` (если нет — в `progression.test.ts`).

**Interfaces — Produces:**

```ts
export type OwnRow = { exerciseId: string; targetSets: number; targetReps: number | null; targetWeight: number | null; step: number | null; fails: number };
export function carryFails(old: { targetWeight: number | null; step: number | null; fails: number } | undefined, next: { targetWeight: number | null; step: number | null }): number;
export function ownTargets(rows: OwnRow[]): Map<string, Target>; // только строки с весом и шагом; первая на упражнение
export function progressionHint(row: { targetSets: number; targetReps: number | null; targetWeight: number | null; step: number | null }, opts?: { bodyweight?: boolean }): string | null;
// «Прогрессия: +2,5 кг, когда сделаешь 4 × 8 · 60 кг»; без повторов — «4 × 1»; своим весом — «+60 кг»; нет веса/шага — null
```

`templateExerciseSchema` + `step: z.number().min(0.5).max(20).nullable().default(null)`; `templateSchema` — `superRefine`: строка с шагом и без веса → issue «Для прогрессии нужен вес» (path `exercises.<i>.step`).

- [ ] **Step 1: Failing tests**

```ts
carryFails({ targetWeight: 60, step: 2.5, fails: 2 }, { targetWeight: 60, step: 2.5 }) === 2
carryFails({ targetWeight: 60, step: 2.5, fails: 2 }, { targetWeight: 62.5, step: 2.5 }) === 0
carryFails({ targetWeight: 60, step: 2.5, fails: 2 }, { targetWeight: 60, step: 5 }) === 0
carryFails(undefined, { targetWeight: 60, step: 2.5 }) === 0
ownTargets([row({ step: null }), row({ exerciseId: "b", targetWeight: null, step: 2.5 }), row({ exerciseId: "c" }), row({ exerciseId: "c", targetWeight: 99 })])
  → Map { "c" => { sets: 4, reps: 8, weight: 60 } }
progressionHint({ targetSets: 4, targetReps: 8, targetWeight: 60, step: 2.5 }) === "Прогрессия: +2,5 кг, когда сделаешь 4 × 8 · 60 кг"
progressionHint({ targetSets: 3, targetReps: null, targetWeight: 10, step: 1 }, { bodyweight: true }) === "Прогрессия: +1 кг, когда сделаешь 3 × 1 · +10 кг"
progressionHint({ ..., step: null }) === null
templateSchema: шаг без веса → «Для прогрессии нужен вес»; шаг 0,4 и 21 — ошибка; без шага — ok (step null)
```

- [ ] **Step 2:** `npx vitest run lib/templates` — FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** тот же — PASS.
- [ ] **Step 5: Commit** `feat(templates): own progression rules`

### Task 2: Миграция, запуск, завершение, редактор

**Files:** Modify `prisma/schema.prisma` (+ миграция `template_progression`), `lib/templates/actions.ts`, `lib/templates/queries.ts`, `components/templates/template-editor.tsx`, `lib/workouts/actions.ts`, `lib/workouts/finish.ts`, `components/workouts/workout-summary-view.tsx`, `app/(app)/training/page.tsx`; Create `lib/progress/own-progression.ts`, `e2e/own-progression.spec.ts`; `e2e/db.ts` (хелпер).

**Interfaces:**

- Consumes: Task 1; `progressTarget`, `ProgressionItem`, `plannedSets`.
- Produces:
  - `applyOwnProgression(tx, userId, workout: FinishedWorkout): Promise<ProgressionItem[]>` — шаблон тренировки свой; по строкам с весом и шагом `progressTarget({ target: { sets: targetSets, reps: targetReps, weight: targetWeight, step, fails }, template: { sets: targetSets, reps: targetReps }, done })`; обновить `targetWeight`, `fails` у этой строки (первой строки упражнения с шагом).
  - `FinishMeta.progressionSource?: "own" | "coach"` (пишется вместе с `progression`; нет поля — «coach» для старых записей). Если сработали обе (невозможно: шаблон либо свой, либо тренера) — не рассматривать.
  - `getOwnTemplateTargets(userId, templateId): Promise<Map<string, Target>>` (`lib/templates/queries.ts`) — для повтора и `/training`.

Запуск: `fromTemplate` — `targets = template.userId === userId ? ownTargets(template.exercises) : await getTemplateTargets(...)`; повтор (`repeat:`) — то же (`getOwnTemplateTargets` для своего). `/training`: `hints` без ключей из `getOwnTemplateTargets(user.id, workout.templateId)`.

Сохранение шаблона: в транзакции читать старые строки (`exerciseId, targetWeight, step, fails`), новым строкам ставить `fails: carryFails(old.get(exerciseId), e)`. `updateTemplateFromWorkoutAction`: для упражнения, у которого в старой строке был шаг, — `targetWeight`, `step`, `fails` из старой строки (поверх `templateItemsFromWorkout`). `copyTemplateAction`: копировать `step`, `fails` 0.

Редактор: поле «Шаг, кг» (`NumberCell`, decimal) в строке; под строкой `progressionHint`. Сводка: заголовок блока по `progressionSource`.

- [ ] **Step 1: Failing e2e** (`e2e/own-progression.spec.ts`)

```ts
test("a met goal raises the template weight", ...)
// registerUser; /templates/new: «Ноги», «Приседания со штангой», Подходы 2, Повторы 5, Вес 60, Шаг 2,5 → подпись «Прогрессия: +2,5 кг, когда сделаешь 2 × 5 · 60 кг» → Сохранить
// /training → шаблон «Ноги» → подходы 60×5 подставлены → подтвердить оба → Завершить
// сводка: region «Прогрессия» «Приседания со штангой: в следующий раз 62,5 кг (+2,5)»
// /training → снова «Ноги» → первый подход 62,5
test("a miss counts a fail; changing the step resets it", ...)
// шаблон хелпером ownTemplate(login, { sets: 2, reps: 5, weight: 60, step: 2.5 }); тренировка — подходы 60×3 → сводка «повторим 60 кг · неудача 1 из 3»
// templateRow(login).fails === 1; редактор → Шаг 5 → Сохранить → fails === 0; без смены шага сохранить — fails не сбрасывается (проверить до смены)
test("no «Пора увеличить вес» on an exercise with progression", ...)
// история 3 тренировок одинакового веса (как в существующем e2e подсказки) + шаблон с шагом → в редакторе тренировки из шаблона нет «Пора увеличить вес»
```

Хелперы `ownTemplate(login, row)` → id, `templateRow(login)` → `{ targetWeight, step, fails }` (`e2e/db.ts`). Как ставить подходы и завершать — существующие `helpers.ts` (`quickWorkout` смотреть для паттерна).

- [ ] **Step 2:** `npm run build && npx playwright test own-progression --workers=8` — FAIL.
- [ ] **Step 3:** схема + `npx prisma migrate dev --name template_progression --create-only` (проверить SQL) → `npx prisma migrate dev`; реализация по Interfaces.
- [ ] **Step 4:** `npm run build && npx playwright test own-progression templates coach-targets training --workers=8` — PASS; `npm run typecheck && npm run lint && npm test` — чисто.
- [ ] **Step 5: Commit** `feat: own progression in templates`

### Task 3: Документация и прогон

- [ ] **Step 1:** CLAUDE.md — рядом с «Пора увеличить вес»/шаблонами: пункт «Своя прогрессия».
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.
- [ ] **Step 3: Commit** `docs: own progression in CLAUDE.md`
