# Замена упражнения в тренировке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** пункт «Заменить» в меню упражнения тренировки — похожие упражнения (до 3) или любое из каталога, замена только на эту тренировку, с «Вернуть».

**Architecture:** всё на клиенте, сервер не меняется. Подбор — существующая `replacementCandidates`; замена — существующее действие редьюсера `replaceExercise` (+ ключ нового упражнения) и новое `undoReplace`; новый диалог `ExerciseSwapDialog`, открываемый из `ExerciseBlock`.

**Tech Stack:** Next.js 16, React, shadcn/ui (Base UI), sonner, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-exercise-swap-design.md`

## Global Constraints

- Ветка фичи `feat/exercise-swap` от `release/2026-12-next`; по готовности — `git merge --no-ff` в релизную, ветка удаляется.
- Без фича-флага; замена только на эту тренировку — шаблон, программа, задания тренера, своя прогрессия не меняются; сервер и схема БД не меняются.
- Кандидатов максимум 3; та же основная группа (`muscleGroups[0]`) и тот же `kind`.
- Тексты (точно): пункт меню «Заменить»; заголовок диалога «Заменить: <название>»; подзаголовок «Тренажёр занят? Похожие упражнения»; подсказка при начатых подходах «Сделанные подходы останутся, новое упражнение встанет следом»; кнопка «Другое упражнение…»; пусто — «Похожих упражнений нет» и «Пропустить сегодня»; без истории — «ещё не делали»; тост «Заменено: <новое>» с действием «Вернуть».
- Цвета — только семантические токены; бесконечных анимаций нет; новых числовых полей нет.
- Пользователю и в отчётах — по-русски.

## Review Focus

1. Замена в суперсете и «Вернуть» после неё — группа A1/A2 не должна рассыпаться (`regroup`) — тест в Task 1.
2. «Вернуть», когда пользователь уже удалил новое упражнение или изменил порядок — ничего не ломается, работает по ключам — тест в Task 1.
3. Офлайн: замена и «Вернуть» без сети — состояние уходит в localStorage как любое действие, после синхронизации сервер получает заменённое — проверяется e2e Task 3 (`context.setOffline(true)`).
4. Упражнение со своим весом / на время — текст прошлого раза без «0 кг», для времени — `timedSetText` — тест в Task 2.
5. Повторная замена того же места (A→B→C) и «Вернуть» последней — возвращает B — тест в Task 1.

---

### Task 1: Редьюсер — ключ замены и `undoReplace`

**Files:**
- Modify: `components/training/workout-state.ts` (действия ~строки 89–122, `key` — строка 29, `case "replaceExercise"` ~308, `GROUPING` ~186)
- Test: `components/training/workout-state.test.ts`

**Interfaces:**
- Produces:
  - `export const exerciseKey: () => string` — тот же генератор, что внутренний `key()` (экспортировать его под этим именем, внутренние вызовы оставить).
  - Действие `{ type: "replaceExercise"; key: string; exercise: ExerciseInfo; restSec: number; last: LastPerformance; newKey?: string }` — при `newKey` новое упражнение получает этот ключ.
  - Действие `{ type: "undoReplace"; newKey: string; original: ExerciseState }` — убирает `newKey`; если `original.key` в состоянии нет — вставляет `original` на позицию убранного; нет `newKey` — состояние без изменений (та же ссылка). Добавить в `GROUPING`.

- [ ] **Step 1: Тесты** в `describe("replaceExercise")` (рядом с существующим тестом ~строка 242):
  - `"replaceExercise uses newKey for the fresh exercise"` — `newKey: "n1"` → `swapped.exercises[0].key === "n1"`.
  - `"undoReplace restores the original in place"` — замена без подходов, затем `undoReplace { newKey: "n1", original }` → `exercises.map(e => e.exercise.id)` равно `["squat", "bench"]`, `exercises[0]` — тот же объект `original` (`toBe`).
  - `"undoReplace after a started exercise removes only the fresh one"` — выполнен подход → замена → undo → ids `["squat", "bench"]`, выполненный подход на месте.
  - `"undoReplace keeps the superset group"` — 3 упражнения, `linkNext` 0 и 1, замена второго, undo → `group` у первых двух одинаковый и не null.
  - `"undoReplace is a no-op when the fresh exercise is gone"` — после `removeExercise` нового → `reducer(s, undo)` `toBe(s)`.
  - `"undoReplace when the original was removed meanwhile inserts it at the fresh position"` — начатое (исходное осталось) → замена → `removeExercise` исходного → undo → исходное на позиции нового, нового нет.
  - `"chained replace A→B→C and undo returns B"` — A заменено на B (`newKey: "b"`), B на C (`newKey: "c"`), `undoReplace { newKey: "c", original: <B state> }` → на месте B.

- [ ] **Step 2:** `npx vitest run components/training/workout-state.test.ts` — новые тесты падают (нет `newKey`/`undoReplace`).
- [ ] **Step 3:** реализовать по Interfaces.
- [ ] **Step 4:** тот же запуск — PASS; `npm run typecheck` — чисто.
- [ ] **Step 5:** commit `feat(training): replaceExercise newKey and undoReplace`.

### Task 2: Текст прошлого раза и начальная группа фильтра

**Files:**
- Modify: `lib/assistant/rules.ts` (`lastTop`/`lastText` ~строки 59–68)
- Modify: `components/training/exercise-filter.tsx:22` (`useExerciseFilter`)
- Test: `lib/assistant/rules.test.ts`

**Interfaces:**
- Produces:
  - `export function lastResultText(ex: { isBodyweight: boolean; kind?: ExerciseKindName }, last: LastPerformance[string] | undefined): string` — без истории/без подходов — `"ещё не делали"`; REPS — существующий `lastText(lastTop(last), bodyweight)` («в прошлый раз 3 × 10 · 60 кг», без «0 кг»); TIME/CARDIO — `"в прошлый раз " + timedSetText(kind, last.sets[0])` (`lib/workouts/kinds.ts`).
  - `useExerciseFilter(exercises: ExerciseItem[], initialGroup: MuscleGroup | null = null)` — начальное значение `group`; `reset()` по-прежнему сбрасывает в `null`.

- [ ] **Step 1: Тесты** `describe("lastResultText")`: нет истории → `"ещё не делали"`; 3 подхода 60×10 → `"в прошлый раз 3 × 10 · 60 кг"`; своим весом 0×12 ×3 → `"в прошлый раз 3 × 12"`; TIME с `durationSec: 60` → `"в прошлый раз "` + `timedSetText("TIME", { durationSec: 60 })`.
- [ ] **Step 2:** `npx vitest run lib/assistant/rules.test.ts` — FAIL (нет экспорта).
- [ ] **Step 3:** реализовать оба пункта.
- [ ] **Step 4:** тесты PASS, `npm run typecheck` чисто.
- [ ] **Step 5:** commit `feat(training): last result text and initial filter group`.

### Task 3: Диалог замены, пункт меню, e2e и документация

**Files:**
- Create: `components/training/exercise-swap-dialog.tsx`
- Modify: `components/training/exercise-block.tsx` (меню ~строки 200–231, пропсы ~92–128)
- Modify: `components/training/workout-editor.tsx` (рендер `ExerciseBlock` ~строка 419)
- Create: `e2e/exercise-swap.spec.ts`
- Modify: `docs/features/training.md` — абзац «Замена упражнения»

**Interfaces:**
- Consumes: `exerciseKey`, действия `replaceExercise` (с `newKey`) и `undoReplace` (Task 1); `lastResultText`, `useExerciseFilter(…, initialGroup)` (Task 2); `replacementCandidates` (`lib/assistant/rules.ts:149`), `readPain` (`components/assistant/pain-store.ts`), `ExerciseFilterControls`.
- Produces:
  - `ExerciseSwapDialog({ open, onOpenChange, item, exercises, last, inWorkout, pain, today, onReplace, onSkip }: { open: boolean; onOpenChange: (o: boolean) => void; item: ExerciseState; exercises: ExerciseItem[]; last: LastPerformance; inWorkout: string[]; pain: PainSpot[]; today: string; onReplace: (target: ExerciseItem) => void; onSkip: () => void })`.
  - Новый необязательный проп `ExerciseBlock`: `swap?: { exercises: ExerciseItem[]; last: LastPerformance; inWorkout: string[]; pain: PainSpot[]; today: string }` — без него пункт «Заменить» не показывается.

Поведение (точные тексты — Global Constraints):
- Кандидаты: `replacementCandidates(item.exercise, exercises, { inWorkout, pain, lastDate, today })`, `lastDate` — из `last` как в `components/assistant/assistant.tsx:429`. Кнопка кандидата — название + `lastResultText`.
- «Другое упражнение…» переключает диалог на список каталога (поиск + `ExerciseFilterControls`, `initialGroup = item.exercise.muscleGroups[0]`), без уже стоящих в тренировке; тап по упражнению — сразу замена.
- Замена в `ExerciseBlock`: `const newKey = exerciseKey()`; `dispatch({ type: "replaceExercise", key: item.key, exercise, restSec: target.defaultRestSec, last, newKey })`; `toast("Заменено: " + name, { action: { label: "Вернуть", onClick: () => dispatch({ type: "undoReplace", newKey, original: item }) } })`; диалог закрыть; фокус — на `section[data-exercise-key=newKey]` заголовок (после рендера).
- «Пропустить сегодня» — `dispatch({ type: "skipPending", key: item.key })`.
- `workout-editor.tsx`: `pain` — `readPain(workout.id)` в момент открытия (не в рендере сервера), `today` — локальная дата `YYYY-MM-DD`, `inWorkout` — id упражнений состояния.

- [ ] **Step 1: e2e** `e2e/exercise-swap.spec.ts` (desktop + mobile). Пользователь — `registerUser`; история — `seedWorkouts(login, "Выпады с гантелями", [{ weight: 20, reps: 10, sets: 3 }], 10)`. Сценарии:
  - `"swap before any set: in place, weight from last time"` — `quickWorkout`-подобный старт пустой тренировки с «Приседания со штангой» и «Жим штанги лёжа»; меню «Действия с упражнением» → «Заменить»; диалог «Заменить: Приседания со штангой» содержит «Тренажёр занят? Похожие упражнения»; первая кнопка — «Выпады с гантелями» с текстом «в прошлый раз 3 × 10 · 20 кг»; кандидатов ≤ 3, нет «Бег»; клик → регион «Выпады с гантелями» на месте первого, `Вес, подход 1` = `20`; региона «Приседания со штангой» нет.
  - `"undo restores the original"` — после замены в тосте «Вернуть» → снова регион «Приседания со штангой», «Выпады…» нет.
  - `"after a completed set the original stays and the new one goes next"` — отметить подход 1 приседа, заменить → видна подсказка про сделанные подходы; порядок регионов: присед, выпады, жим.
  - `"another exercise: filter preset to the main group and can be cleared"` — «Другое упражнение…» → видно «Жим ногами», не видно «Жим штанги лёжа»; снять фильтр группы → «Жим штанги лёжа» не показан (уже в тренировке), видно «Сведение рук в кроссовере»; выбрать «Жим ногами» → регион «Жим ногами».
  - `"own progression is untouched by a swap"` — `ownTemplate(login, "Ноги", "Приседания со штангой", { sets: 3, reps: 10, weight: 100, step: 2.5, fails: 1 })`; старт по шаблону, замена на «Выпады с гантелями», выполнить подходы, завершить; `templateRow(id, "Приседания со штангой")` → `{ targetWeight: 100, step: 2.5, fails: 1 }`.
  - `"swap works offline and syncs"` — `context.setOffline(true)`, замена, `setOffline(false)`, дождаться «Сохранено»; перезагрузка — регион «Выпады с гантелями».
- [ ] **Step 2:** `npm run build && npx playwright test e2e/exercise-swap.spec.ts` — FAIL (нет пункта «Заменить»).
- [ ] **Step 3:** реализовать диалог, проп `swap` и пункт меню, прокинуть из редактора.
- [ ] **Step 4:** `npm run build && npx playwright test e2e/exercise-swap.spec.ts e2e/training.spec.ts e2e/training-dnd.spec.ts --workers=8` — PASS; `npm run typecheck && npm run lint && npm test` — чисто.
- [ ] **Step 5:** абзац в `docs/features/training.md`: пункт «Заменить», `ExerciseSwapDialog`, подбор `replacementCandidates`, только на эту тренировку, «Вернуть» — `undoReplace`, прогрессия не страдает.
- [ ] **Step 6:** commit `feat(training): swap an exercise for a similar one when the machine is busy`; `git switch release/2026-12-next && git merge --no-ff feat/exercise-swap && git branch -d feat/exercise-swap`.

Пункт «Что нового» — при сборке релиза (запись `RELEASES` создаётся вместе с версией).
