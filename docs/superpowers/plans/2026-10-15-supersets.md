# Суперсеты и круговые — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** соседние упражнения связываются в суперсет/круг (до 6); внутри круга таймер не запускается, после круга — отдых; группы живут в тренировке, черновике, шаблонах, повторе и истории; всё видимое — под флагом `workout_formats`.

**Architecture:** чистые правила `lib/workouts/supersets.ts` (нормализация, связывание, метки, «что после подхода») → поле `supersetGroup` в `WorkoutExercise`/`TemplateExercise` и `group` в черновике/шаблоне → редьюсер редактора и `onComplete` → вид (скрепка, рамка, метки) в тренировке, шаблоне, итогах.

**Tech Stack:** Next.js 16, Prisma 7, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-supersets-design.md`

## Global Constraints

- Ветка `feat/supersets` от `release/2026-11-formats`; в конце — `--no-ff` в релизную.
- `MAX_GROUP = 6`; 2 упражнения — «Суперсет», 3–6 — «Круг · N упражнения» (`plural`); метки A1, A2, B1…
- Флаг `workout_formats` (`description: "Форматы тренировки: суперсеты и круговые (дальше — кардио)"`, `expires: "2027-04-30"`). Без флага — ни кнопок, ни рамок, ни меток, отдых как сейчас; `group` при этом не теряется.
- Номера групп на сервере — всегда через `normalizeGroups` (клиенту не доверяем).
- Подходы — вес × повторы: рекорды, XP, объём, статистика не меняются.
- Миграция `supersets`: проверить SQL — частичные индексы (`CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`) не трогать.
- e2e — флаг на пользователя (`addFlagUser`), desktop и mobile.

## Review Focus

1. **Перестановка перетаскиванием** упражнения из середины группы наружу и внутрь чужой группы — группы без «дыр» и чужаков. Тест: редьюсер `reorderExercise` (Task 2).
2. **Старый черновик на устройстве** без `group` (офлайн-очередь до обновления) — читается, группы `null`. Тест: `workoutDraftSchema.parse` без `group` (Task 2).
3. **Архивное упражнение в шаблоне с группой** — старт из шаблона не оставляет группу из одного. Тест: `normalizeGroups` поверх отфильтрованного списка — покрыт Task 1; в старте вызов обязателен (Task 3, ревью).
4. **Флаг выключен** — автосохранение не стирает группы. Тест: e2e «без флага» проверяет `supersetGroup` в БД после сохранения (Task 5).
5. **Отметка подхода в A1, когда идёт отдых** после прошлого круга — отдых сбрасывается, таймер не стартует. Тест: e2e основной сценарий (Task 5).

---

### Task 1: Правила групп и флаг

**Files:** Create `lib/workouts/supersets.ts`, `lib/workouts/supersets.test.ts`; Modify `lib/flags/registry.ts`.

**Interfaces — Produces:**
- `MAX_GROUP = 6`;
- `normalizeGroups<T extends { group: number | null }>(items: T[]): T[]`;
- `canLink(items: { group: number | null }[], index: number): boolean`;
- `link<T>(items: T[], index: number): T[]`, `unlink<T>(items: T[], index: number): T[]` (тот же дженерик, что у `normalizeGroups`);
- `groupLabels(items: { group: number | null }[]): (string | null)[]`;
- `groupSize(items, index): number` (0 вне группы) — для «Суперсет» / «Круг»;
- `afterSet(items: { group: number | null; pending: number }[], index: number): { kind: "rest"; next: number | null } | { kind: "switch"; next: number }`.

- [ ] Тесты (`g = (...xs) => xs.map((group) => ({ group }))`, сравнение по `.map((x) => x.group)`):
  - `normalizeGroups(g(1, null, 1))` → `[null, null, null]`; `g(5, 5, 2, 2)` → `[1, 1, 2, 2]`; `g(1, 1, 2, 1, 1)` → `[1, 1, null, 2, 2]`; 7 × `1` → `[1,1,1,1,1,1,null]`; 8 × `1` → `[1×6, 2, 2]`; неизменённые элементы — те же объекты (`toBe`).
  - `link(g(null, null, null), 0)` → `[1, 1, null]`; `link(g(1, 1, 2, 2), 1)` → `[1, 1, 1, 1]`; `unlink(g(1, 1, 1, 1), 1)` → `[1, 1, 2, 2]`; `unlink(g(1, 1, 1), 0)` → `[null, 1, 1]`.
  - `canLink(g(null, null), 1)` → false; `canLink(g(1,1,1,1,1,1, null), 5)` → false; `canLink(g(1,1,1, 2,2,2), 2)` → true, `g(1,1,1,1, 2,2,2)` при 3 → false.
  - `groupLabels(g(1, 1, null, 2, 2, 2))` → `["A1", "A2", null, "B1", "B2", "B3"]`.
  - `afterSet` (`p = (group, pending) => ({ group, pending })`): `[p(null, 2)]`, 0 → `{ kind: "rest", next: 0 }`; `[p(null, 0), p(null, 1)]`, 0 → rest next 1; `[p(1, 2), p(1, 3)]`, 0 → `{ kind: "switch", next: 1 }`; там же, 1 → rest next 0; `[p(1, 0), p(1, 2)]`, 1 → rest next 1; `[p(1, 1), p(1, 1), p(1, 1)]`, 2 → rest next 0; `[p(1, 0), p(1, 0), p(null, 3)]`, 1 → rest next 2; `[p(1, 0), p(1, 0)]`, 1 → rest next null; `[p(1, 2), p(1, 0), p(1, 2)]`, 0 → switch next 2.
- [ ] RED (`npx vitest run lib/workouts/supersets`) → реализация → GREEN. Флаг в реестр, `npx vitest run lib/flags` — PASS.
- [ ] commit `feat(supersets): group rules, flag`.

### Task 2: Данные, черновик, редьюсер

**Files:** Modify `prisma/schema.prisma` (+ миграция `supersets`, `npx prisma generate`), `lib/workouts/schema.ts`, `lib/workouts/queries.ts` (`ActiveWorkout.exercises[].group`, `getWorkoutSummary` — `group` у упражнений), `lib/workouts/actions.ts` (запись черновика), `components/training/workout-state.ts`; Test `lib/workouts/schema.test.ts`, `components/training/workout-state.test.ts`.

**Interfaces — Consumes:** Task 1. **Produces:** `exerciseDraftSchema.group: z.number().int().min(1).nullable().default(null).catch(null)`; `ExerciseState.group: number | null`; действия `{ type: "linkNext"; key: string }`, `{ type: "unlink"; key: string }` (отсоединить следующее за `key`); `ActiveWorkout.exercises[i].group`; в сводке тренировки `exercises[i].group`.

- [ ] Тесты: схема — черновик без `group` парсится с `group: null`, `group: "x"` → `null`. Редьюсер: `linkNext` первого из трёх → группы `[1, 1, null]`; `unlink` → снова `null`; `removeExercise` второго из пары → оставшийся `null`; `reorderExercise` A2 из группы `[A1, A2, C]` в конец → `[null, null, null]`; `reorderExercise` C в середину группы `[A1, A2, A3, C]` → `C` вне группы, группа делится (`[1, null, 2, 2]` для `[A1, C, A2, A3]`); `replaceExercise` без выполненных подходов сохраняет `group`; `addExercises` с `index` внутрь группы делит её; `toDraft`/`initState` переносят `group`.
- [ ] RED → схема Prisma + миграция (SQL — только два `ADD COLUMN`), черновик, `writeDraft` пишет `supersetGroup` из `normalizeGroups(draft.exercises)`, запросы, редьюсер (после изменяющих список действий — `normalizeGroups`) → GREEN (`npm test`, `npm run typecheck`).
- [ ] commit `feat(supersets): supersetGroup in workouts and drafts, reducer`.

### Task 3: Шаблоны, старт, повтор, выгрузка

**Files:** Modify `lib/templates/schema.ts` (`group` как в черновике), `lib/templates/actions.ts` (создание/правка, копия, «Обновить шаблон»), `lib/templates/from-workout.ts`, `lib/templates/queries.ts` (`TemplateForEdit.exercises[].group`), `lib/workouts/actions.ts` (`fromTemplate`, `repeat`: перенос + `normalizeGroups` после фильтра архивных; `PlannedExercise.group`), `lib/account/export-queries.ts` (+ `supersetGroup` у упражнений тренировок и шаблонов); Test `lib/templates/*.test.ts` (рядом с `from-workout`).

**Interfaces — Consumes:** Task 1, 2. **Produces:** `templateItemsFromWorkout(exercises: { exerciseId; restSec; group: number | null; sets }[])` → элементы с `supersetGroup`; `differsFromTemplate` учитывает группы (связали в тренировке — предлагается «Обновить шаблон»).

- [ ] Тесты: `templateItemsFromWorkout` переносит `supersetGroup` нормализованным; `differsFromTemplate` — тот же состав, но группа другая → `true`; схема шаблона без `group` → `null`.
- [ ] RED → реализация → GREEN (`npm test`, `npm run typecheck`).
- [ ] commit `feat(supersets): groups in templates, start, repeat, export`.

### Task 4: Интерфейс

**Files:** Create `components/training/superset-frame.tsx` (рамка с заголовком, скрепка между блоками); Modify `components/training/workout-editor.tsx` (группировка блоков, `onComplete` через `afterSet`, свёртывание группой), `components/training/exercise-block.tsx` (метка A1 у названия), `components/templates/template-editor.tsx` (скрепки, рамка, метки, `group` в сохранении), `components/workouts/workout-summary-view.tsx` (метки и подпись в итогах/истории).

**Interfaces — Consumes:** Task 1–3.

- [ ] Всё ниже — только при `useFlag("workout_formats")`:
  - между соседними блоками: кнопка `aria-label="Связать в суперсет"` (иконка `Link2`, при `canLink`) или `aria-label="Разъединить"` (`Unlink2`) для уже связанных; в режиме перетаскивания не показывать;
  - группа — общая рамка `data-testid="superset"`, заголовок «Суперсет» (2) или «Круг · N упражнения»; метка `groupLabels` перед названием упражнения;
  - `onComplete`: `afterSet(state.exercises.map((e) => ({ group: e.group, pending: <невыполненных после отметки> })), index)`; `switch` → `rest.skip()`, `toast("Дальше: <название>")`, `scrollIntoView` блока (`behavior` — `auto` при «уменьшить движение»); `rest` → `rest.start(<restSec последнего упражнения группы или самого>, <название next>)`, `next = null` — без таймера, как сейчас;
  - свёртывание: рамка свёрнута, когда свёрнуты все её блоки.
- [ ] Без флага `onComplete` — прежний `nextLabel` (поведение не меняется).
- [ ] `npm run typecheck && npm run lint`; commit `feat(supersets): superset UI in workout, template and summary`.

### Task 5: e2e, тексты, «Что нового»

**Files:** Create `e2e/supersets.spec.ts`; Modify `e2e/db.ts` (`exerciseGroups(login): Promise<(number | null)[]>` — `supersetGroup` упражнений последней тренировки по `order`; `setExerciseGroups(login, groups: (number | null)[])` — для активной тренировки), `docs/features/training.md` (пункт «Суперсеты и круговые»). Пункт «Что нового» (текст из спеки, `flag: "workout_formats"`) пишется в запись релиза при выпуске `release/2026-11-formats` — не в этой задаче.

- [ ] Сценарии (флаг `addFlagUser("workout_formats", login)`):
  1. Тренировка с двумя упражнениями → «Связать в суперсет» → рамка «Суперсет», метки A1/A2 → отметить подход A1: таймера отдыха нет, тост «Дальше: <A2>» → отметить подход A2: таймер отдыха виден → отметить следующий подход A1 при идущем таймере: таймер скрыт → перезагрузка: рамка на месте; `exerciseGroups` → `[1, 1]`.
  2. Завершить → «Сохранить как шаблон» → начать из шаблона → рамка «Суперсет» на месте.
  3. Без флага: скрепок нет; тренировка с группой, вставленной в БД, после автосохранения (отметка подхода) — `exerciseGroups` всё ещё `[1, 1]`.
- [ ] `npm run build && npx playwright test e2e/supersets.spec.ts` — PASS (desktop и mobile); commit `test(supersets): e2e; docs`.

### Task 6: Финал

- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — зелёное; ревью ветки; `--no-ff` в `release/2026-11-formats`.
