# Прогрессия в заданиях тренера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** у задания тренера появляется шаг прогрессии: успешная тренировка поднимает вес на шаг, неудача повторяет, третья неудача подряд — разгрузка −10 % и уведомление тренеру; клиент видит итог в сводке.

**Architecture:** два поля в `CoachTarget` (`step`, `fails`); чистое правило `progressTarget` и тексты `progressionLine` в `lib/coach/progression.ts`; применение — в транзакции `finishWorkout` (`applyProgression` в `lib/coach/progression-apply.ts`), итог — в `FinishMeta.progression`; UI — блок в `WorkoutSummaryView` и поле «Шаг, кг» в диалоге заданий.

**Tech Stack:** Next.js 16, Prisma 7 + PostgreSQL, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-coach-progression-design.md`

## Global Constraints

- Прогрессия только при заполненных `weight` и `step`; шаг 0,5…20 кг.
- Успех: не меньше `N = target.sets ?? template.sets` выполненных рабочих подходов с весом ≥ `target.weight` и повторами ≥ `R = target.reps ?? template.reps` (нет нигде — любые > 0).
- Разгрузка на 3-й неудаче подряд: `floor(weight × 0.9 / 2.5) × 2.5`, не меньше 0; `fails = 0`. Вес — округление до 0,01.
- Пустой список выполненных рабочих подходов — не попытка (ничего не меняется).
- Только шаблон активного тренера и только упражнения, которые сейчас в шаблоне.
- Тексты: «в следующий раз 62,5 кг (+2,5)», «повторим 100 кг · неудача 2 из 3», «разгрузка — 52,5 кг (−10 %)», своим весом — «+12,5 кг»; заголовок блока «План тренера»; «Для прогрессии нужен вес»; «прогрессия: +2,5 кг за успешную тренировку · неудач подряд: 1»; «прогрессия у N»; уведомление «Разгрузка: <клиент>» / «<упражнение>: 52,5 кг после 3 неудач». Тексты без рода.
- Миграция только добавляет колонки; частичные индексы не трогать.

## Review Focus

1. Повтор тренировки (`repeat:`) по шаблону тренера с весом ниже задания → неудача (сравнение с заданием) — так по спеке; проверить, что не падает и не двигает вес вверх (Task 2 — unit «подход легче задания не засчитывается»).
2. Тренер меняет вес, пока клиент тренируется → финиш сравнивает с новым весом из БД (задание читается в транзакции финиша) — по построению.
3. Клиент без сети завершил две тренировки подряд и они ушли разом → каждая применяется по очереди к текущему заданию (последовательные транзакции) — по построению.
4. Разгрузка с отягощением своего веса 2,5 → 0, затем успех → 0 + шаг (Task 1 — unit).
5. Связь разорвана до синхронизации офлайн-финиша → задания уже удалены, прогрессии нет, финиш не падает (Task 2 — `applyProgression` без активной связи возвращает `[]`).

---

### Task 1: Правило и тексты

**Files:** Create `lib/coach/progression.ts`; Test `lib/coach/progression.test.ts`; Modify `lib/coach/targets.ts` (`targetSchema` + `step`)

**Interfaces — Produces:**
- `DELOAD_AFTER = 3`, `DELOAD_FACTOR = 0.9`, `DELOAD_ROUND = 2.5`
- `progressTarget(input: ProgressInput): ProgressResult | null` — типы как в спеке
- `type ProgressionItem = { exercise: string; kind: "up" | "same" | "deload"; from: number; to: number; fails: number; bodyweight: boolean }`
- `progressionLine(item: ProgressionItem): string` — «<exercise>: …» по Global Constraints (`same` — «неудача <fails> из 3»; `up` — «(+<to − from>)»)
- `targetSchema` получает `step: z.number().min(0.5).max(20).nullable()`; `Target` — `step: number | null` (обновить существующие вызовы/тесты)

- [ ] **Step 1: failing tests** — по разделу «Тесты / Unit» спеки; конкретные значения: `{weight:60,step:2.5,sets:3,reps:5,fails:1}` + 3×(60×5) → `{weight:62.5,fails:0,kind:"up",from:60,to:62.5}`; 4×(60×5) → up; 2×(60×5)+1×(55×5) → same, fails 2; 3×(60×4) → same; fails 2 + неудача → deload 60→52.5, 62.5→55, 2.5→0; `done: []` → null; `step: null` → null; `weight: null` → null; `reps: null`, template `reps: 8` → нужно 8; оба null → любые > 0; `{weight:0,step:2.5}` успех → 2.5; `progressionLine` — три вида и `bodyweight: true` («+62,5 кг»); `targetSchema` — `step: 0.4` и `20.5` отклоняются.
- [ ] **Step 2:** `npx vitest run lib/coach/progression.test.ts lib/coach/targets.test.ts` — FAIL
- [ ] **Step 3:** implement
- [ ] **Step 4:** тот же запуск — PASS; `npx tsc --noEmit` чисто
- [ ] **Step 5:** commit `feat(coach): progression rule and summary lines`

### Task 2: Модель и применение при завершении

**Files:** Modify `prisma/schema.prisma` (`CoachTarget.step`, `fails`) + миграция `coach_target_progression`; Create `lib/coach/progression-apply.ts` (server-only); Modify `lib/workouts/finish.ts` (`FinishMeta.progression?: ProgressionItem[]`, вызов после чистки подходов, до `meta`); Modify `lib/coach/target-queries.ts` (выбирать `step`, `fails`, где нужно); Modify `e2e/db.ts` (`coachTarget` принимает `step`, `fails`; `coachTargetRow(clientLogin, exerciseName)` → `{ weight, fails }`); Test `e2e/coach-targets.spec.ts`

**Interfaces:**
- Consumes: `progressTarget`, `ProgressionItem` (Task 1)
- Produces: `applyProgression(tx: Prisma.TransactionClient, userId: string, workout: { id: string; templateId: string | null; exercises: { exerciseId: string; exercise: { name: string; isBodyweight: boolean }; sets: { weight: number; reps: number; isWarmup: boolean }[] }[] }): Promise<{ items: ProgressionItem[]; deloads: ProgressionItem[]; coachId: string | null }>`

- [ ] **Step 1: failing e2e** (сценарии 1–2 спеки): «progression: success raises the weight for the next start» — `coachTarget(client, tpl, SQUAT, { sets: 3, reps: 5, weight: 60, step: 2.5 })`, запуск из «От тренера», 3 подхода 60×5 «выполнен», «Завершить» → в сводке «Приседания со штангой: в следующий раз 62,5 кг (+2,5)»; `coachTargetRow` → `{ weight: 62.5, fails: 0 }`; «failure keeps the weight» — 2 подхода из 3 (третий удалить) → «повторим 60 кг · неудача 1 из 3».
- [ ] **Step 2:** `npx playwright test coach-targets -g progression --project=desktop` — FAIL
- [ ] **Step 3:** schema + migration (проверить SQL); `applyProgression`: активная связь и шаблон тренера (как `getTemplateTargets`), задания с `weight` и `step` по упражнениям шаблона, подходы упражнения объединяются, `isWarmup = false`; `coachTarget.update` по результату. Подходы в `finishWorkout` читать уже после `deleteMany` невыполненных (перечитать `workoutSet` или отфильтровать по `completedAt` и `reps > 0` из уже загруженных). Блок «План тренера» в сводке — Task 3; для зелёного Step 4 этой задачи добавить его уже здесь минимально (заголовок + строки `progressionLine`).
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build && npx playwright test coach-targets coach-plan training` — PASS
- [ ] **Step 5:** commit `feat(coach): progression applied when the client finishes a coach template`

### Task 3: Разгрузка — уведомление тренеру; сводка у тренера

**Files:** Modify `lib/coach/progression-apply.ts` или `lib/workouts/finish.ts` (уведомление `notify(tx, coachId, …)` на каждую разгрузку; тип `COACH`, url `/coach/clients/<userId>/workouts/<workoutId>`, push); Modify `components/workouts/workout-summary-view.tsx` (блок «План тренера» — после «Новые рекорды», `aria-label="План тренера"`, значки `ArrowUp`/`RotateCcw`/`ArrowDown` из lucide, токены цвета `primary`/`muted-foreground`/`streak`); Test `e2e/coach-targets.spec.ts`

- [ ] **Step 1: failing e2e:** «third failure deloads and notifies the coach» — `coachTarget(…, { sets: 3, reps: 5, weight: 60, step: 2.5, fails: 2 })`, клиент 2 подхода → «разгрузка — 52,5 кг (−10 %)»; тренер: колокольчик — «Разгрузка:» и «Приседания со штангой: 52,5 кг после 3 неудач»; тренер открывает тренировку клиента — регион «План тренера» с той же строкой.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** implement
- [ ] **Step 4:** `npm run build && npx playwright test coach-targets coach-comments` — PASS
- [ ] **Step 5:** commit `feat(coach): deload notifies the coach; coach sees the plan block`

### Task 4: Диалог тренера — шаг и неудачи

**Files:** Modify `components/coach/client-targets.tsx` (поле «Шаг, кг», строка прогрессии, «· прогрессия у N»); `lib/coach/target-queries.ts` (`target` с `step`, `fails`); `lib/coach/target-actions.ts` (шаг без веса — «Для прогрессии нужен вес»; изменились `weight`/`step` — `fails: 0`); Test `e2e/coach-targets.spec.ts`

- [ ] **Step 1: failing e2e:** «coach sets a step in the dialog; step without weight is refused; changing weight resets fails» — в диалоге «Шаг, кг: Приседания со штангой» `2,5` при пустом весе → тост «Для прогрессии нужен вес»; вес `60` → «Сохранить» → список «прогрессия у 1»; `coachTarget(…, { weight: 60, step: 2.5, fails: 2 })` у другого клиента → в диалоге «неудач подряд: 2» → вес `65` → «Сохранить» → `coachTargetRow` → `{ weight: 65, fails: 0 }`.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** implement (сравнение со старой строкой в транзакции action)
- [ ] **Step 4:** `npm run build && npx playwright test coach-targets` — PASS
- [ ] **Step 5:** commit `feat(coach): progression step in the targets dialog`

### Task 5: Сид, документация, полный прогон

**Files:** `prisma/seed.ts` (присед Маши: `step: 2.5, fails: 1`); `CLAUDE.md` (по разделу «Документация» спеки)

- [ ] **Step 1:** `npm run db:seed` дважды без ошибок
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --workers=4` — зелёное
- [ ] **Step 3:** commit `chore(coach): demo progression in seed, docs`
