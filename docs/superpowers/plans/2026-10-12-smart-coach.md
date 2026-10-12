# Умный помощник (этап 1) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Плавающий чат-помощник на сценариях с кнопками (без LLM) под флагом `smart_coach`: советы по весу, замене, боли, застою, пропуску, справка и советы по тренировкам; чек-ин самочувствия.

**Architecture:** Правила и дерево сценариев — чистые модули `lib/assistant/*`. Советы в тренировке считаются **на клиенте** из данных, которые `/training` уже грузит (прошлый раз, подсказки, задания тренера и своей прогрессии, каталог упражнений) — работают без сети; застой и пропуск — через `askAssistantAction`. Чат — компонент в `AppShell`, связь с редактором — React-контекст `AssistantWorkoutBridge`, действия идут через существующий редьюсер.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Playwright, Base UI (shadcn base-nova).

**Spec:** `docs/superpowers/specs/2026-10-12-smart-coach-design.md`

## Global Constraints

- Ветка `feat/smart-coach` от `release/2026-11-assistant`; слияние — по решению пользователя.
- Флаг `smart_coach` (`expires: "2027-02-28"`), флаг владельца данных; показ — `useFlag`, сервер проверяет сам (`isEnabled`).
- Боль **никогда** не уходит на сервер: только `localStorage` `hf:pain:<workoutId>`, не в `WorkoutState`/`toDraft`.
- Тексты: без рода, без укоров; рядом с болью нет «через силу», «терпи», «не сдавайся». Обязательная фраза при боли: «Не делай через боль. Пропусти это упражнение сегодня» и «Если боль острая или не проходит несколько дней — обратись к врачу».
- Шаг веса: 2,5 кг, до 20 кг — 1 кг (как `progressionHint`).
- Миграция не трогает частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- e2e: флаг включается списком на пользователя (`setFlag("smart_coach", { userIds: [...] })`-подобно существующему хелперу), не глобально и не через `resetFlag`.

## Review Focus

1. Упражнение без истории, своего веса и с пустыми подходами — «Вес на сегодня» и «Подставить» не падают и не пишут «0 кг» → тест в Task 1 (`weightAdvice` без истории, bodyweight).
2. «Подставить в подходы» не трогает выполненные и разминочные подходы → тест в Task 4 (редьюсер `applySets`).
3. Помощник выключен в `/settings` или флаг выключен — сервер отказывает `askAssistantAction`/`saveWellbeingAction`, а не только прячет кнопку → тест в Task 3.
4. Чек-ин на чужую или завершённую тренировку — отказ без записи → тест в Task 3.
5. Боль в `localStorage` от прошлой тренировки не протекает в новую (ключ по `workoutId`), и чистится вместе с офлайн-черновиками → Task 4 (`pruneRecords`/ключ) + e2e.

---

### Task 1: Чистые правила

**Files:**
- Create: `lib/assistant/rules.ts`, `lib/assistant/rules.test.ts`
- Modify: `lib/flags/registry.ts` (флаг `smart_coach`: «Умный помощник: чат с советами на сценариях, чек-ин самочувствия», `expires: "2027-02-28"`)

**Interfaces:**
- Consumes: `progressionHint`/`ProgressionHint` (`lib/progress/progression.ts`), `Target` (`lib/coach/targets.ts`), `MuscleGroup`.
- Produces:
  - `export type PainSpot = "shoulder" | "elbow" | "wrist" | "lowerBack" | "knee" | "neck" | "other"`; `export const PAIN_SPOTS: { spot: PainSpot; label: string }[]` (Плечо, Локоть, Запястье, Поясница, Колено, Шея, Другое); `export const PAIN_GROUPS: Record<PainSpot, MuscleGroup[]>` (значения — из спеки).
  - `export function painRelated(groups: MuscleGroup[], pain: PainSpot[]): boolean`
  - `export type Wellbeing = "GREAT" | "OK" | "TIRED"`
  - `export type WeightAdvice = { kind: "pain" } | { kind: "first"; bodyweight: boolean } | { kind: "sets"; weight: number; reps: number; sets: number; source: "coach" | "own" | "hint" | "last"; why: string; note?: string }`
  - `export function weightAdvice(input: { bodyweight: boolean; groups: MuscleGroup[]; last: { sets: { weight: number; reps: number }[] } | null; hint: ProgressionHint | null; coach: Target | null; own: Target | null; wellbeing: Wellbeing | null; pain: PainSpot[] }): WeightAdvice`
  - `export function repsOrWeight(input: { bodyweight: boolean; last: { sets: { weight: number; reps: number }[] } | null }): { text: string; why: string }`
  - `export function nextStep(weight: number): number` (1 кг до 20, иначе 2,5)
  - `export function replacementCandidates<E extends { id: string; muscleGroups: MuscleGroup[]; userId: string | null; archivedAt?: Date | string | null }>(current: { id: string; muscleGroups: MuscleGroup[] }, all: E[], ctx: { inWorkout: string[]; pain: PainSpot[]; lastDate: Record<string, string> }): E[]`
  - `export function stalledExercises(rows: { exerciseId: string; name: string; workouts6w: number; lastRecordAt: string | null }[], today: string): { exerciseId: string; name: string; weeks: number }[]`
  - `export function missedPlanAdvice(missed: { key: string; title: string; date: string; coach: boolean } | null, today: string, hasActive: boolean): { text: string; canStart: boolean } | null`

- [ ] **Step 1: Падающие тесты** `rules.test.ts`:
  - приоритет: при `coach` = `{sets: 4, reps: 8, weight: 42.5}` и `hint` → `source: "coach"`, `weight: 42.5`, `sets: 4`; без тренера, с `own` → `"own"`; без них с `hint {kind:"weight", suggested: 62.5}` → `"hint"`, `62.5`; без всего → `"last"` с максимальным весом прошлого раза и его повторами, `sets` = число подходов прошлого раза.
  - `wellbeing: "TIRED"` + `hint 60→62.5` → `weight: 60`, `source: "last"`; `TIRED` + `coach.weight 65` при прошлом 60 → `weight: 65`, `note` содержит «можно остаться на 60 кг».
  - `pain: ["knee"]` и группы `["LEGS"]` → `{ kind: "pain" }`; группы `["CHEST","TRICEPS"]` с `pain: ["shoulder"]` → pain; `["BICEPS"]` с `["knee"]` → не pain; `"other"` → никогда не pain.
  - без истории → `{ kind: "first" }`; `bodyweight` → `weight: 0` и повторы, в `why` нет «кг».
  - `nextStep(15) === 16`, `nextStep(20) === 22.5`.
  - `replacementCandidates`: та же основная группа (первая), без текущего и уже в тренировке, без архивных, без связанных с болью (любая группа), сначала с `lastDate` за 90 дней (новее — раньше), затем встроенные (`userId === null`) в исходном порядке, не больше 3.
  - `stalledExercises`: `workouts6w >= 4` и последний рекорд ≥ 28 дней назад (или нет) → в списке; сортировка по давности рекорда; не больше 3; `weeks` — целые недели.
  - `missedPlanAdvice`: `null` → `null`; вчера → текст «Сделай её сегодня — следующую можно сдвинуть»; 3+ дня назад → «Одна пропущенная не страшна — продолжай по плану»; `coach: true` → «Твой тренер увидит пропуск — сделать её можно сегодня»; `canStart = !hasActive`.
- [ ] **Step 2:** `npx vitest run lib/assistant` — FAIL (модуля нет).
- [ ] **Step 3: Реализовать** `rules.ts` и флаг в реестре.
- [ ] **Step 4:** `npx vitest run lib/assistant lib/flags && npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(assistant): advice rules and smart_coach flag`.

---

### Task 2: Справка, советы и дерево сценариев

**Files:**
- Create: `lib/assistant/content.ts`, `lib/assistant/scenarios.ts`, `lib/assistant/scenarios.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PAIN_SPOTS`), константы `STREAK_WEEK_TARGET` и др. из существующих модулей.
- Produces:
  - `export type Button = { label: string } & ({ go: NodeId } | { href: string } | { action: "apply-sets" | "replace" | "remove" | "start-plan" | "recovery"; payload?: string })`
  - `export type Reply = { text: string; why?: string; buttons: Button[] }`
  - `export type NodeId = string` (`"menu"`, `"workout-menu"`, `"help"`, `"help:<тема>"`, `"tips"`, `"tips:<тема>"`, `"rules"`, `"pain"`, `"stall"`, `"missed"`, `"recovery"`, `"exercise:<id>"`, `"exercise:<id>:weight"`, …)
  - `export const HELP_TOPICS`, `export const TIPS` — `{ id; title; text; href? }[]` (справка: серия и заморозки, опыт и уровень, босс недели, сундуки, рейды, цели, тренер, «Пора увеличить вес»; советы — 10–15 карточек из спеки)
  - `export function staticReply(id: NodeId): Reply | null` — меню, справка, советы, правила; без данных
  - `export const MENU_BUTTONS`, `WORKOUT_MENU_BUTTONS`
- [ ] **Step 1: Падающие тесты** `scenarios.test.ts`: все статичные узлы (обход от `"menu"` по `go`) существуют; у каждого не-корневого узла есть кнопка с `go: "menu"` («Назад в меню»); все `href` начинаются с `/`; в текстах `HELP_TOPICS`/`TIPS` нет `/через силу|терпи|не сдавайся/i`; текст темы серии содержит `String(STREAK_WEEK_TARGET)`; `TIPS.length` между 10 и 15; тема «боль» в советах содержит «к врачу».
- [ ] **Step 2:** `npx vitest run lib/assistant` — FAIL.
- [ ] **Step 3: Реализовать** `content.ts` (цифры — шаблонными строками из констант) и `scenarios.ts`.
- [ ] **Step 4:** `npx vitest run lib/assistant && npm run typecheck && npm run lint` — PASS.
- [ ] **Step 5: Commit** `feat(assistant): help, tips and scenario tree`.

---

### Task 3: Данные, действия, настройки, тренер

**Files:**
- Create: `prisma/migrations/<ts>_smart_coach/` (`npx prisma migrate dev --name smart_coach`), `lib/assistant/queries.ts`, `lib/assistant/actions.ts`, `lib/assistant/access.ts` (+ `access.test.ts`), `components/assistant/assistant-settings.tsx`
- Modify: `prisma/schema.prisma` (`enum Wellbeing { GREAT OK TIRED }`, `Workout.wellbeing Wellbeing?`, `User.assistantEnabled Boolean @default(true)` — с комментариями), `lib/auth/dal.ts` (`assistantEnabled` в select и `CurrentUser`), `app/(app)/settings/page.tsx` (карточка «Помощник» — только при флаге), `components/workouts/workout-feedback.tsx` (`CoachFeedbackNote` + проп `wellbeing`: «Самочувствие: отлично/нормально/устал»; показывается и без RPE), `app/(app)/coach/clients/[id]/workouts/[wid]/page.tsx` и запрос сводки (`wellbeing`), `e2e/db.ts` (`workoutWellbeing(id)`, `setAssistantEnabled(login, bool)`)

**Interfaces:**
- Consumes: Task 1 (`stalledExercises`, `missedPlanAdvice`, `Wellbeing`), `isEnabled` (`lib/flags/server.ts`), `getCalendar` (`lib/plans/queries.ts`).
- Produces:
  - `export function assistantAvailable(flagOn: boolean, enabled: boolean): boolean` (`access.ts`)
  - `export async function askAssistantAction(topic: "stall" | "missed"): Promise<{ ok: true; stall?: { exerciseId: string; name: string; weeks: number }[]; missed?: { key: string; title: string; date: string; text: string; canStart: boolean } | null } | { ok: false }>`
  - `export async function saveWellbeingAction(workoutId: string, value: Wellbeing | null): Promise<{ ok: boolean }>` — только своя `PLANNED`/`IN_PROGRESS`, `updateMany` по `{ id, userId, status in […] }`
  - `export async function setAssistantEnabledAction(on: boolean): Promise<void>`
  - `getStallRows(userId)` — SQL: по упражнению число завершённых тренировок за 42 дня и `max(PersonalRecord.achievedAt)`; `getMissedPlan(userId, tz, now)` — `getCalendar(userId, today-7, today-1, …)`, последнее со `status === "missed"`, `coach = coachId !== null`.
- [ ] **Step 1: Падающие тесты** `access.test.ts`: `assistantAvailable(true, true)` true, остальные три комбинации false. e2e RED в `e2e/smart-coach.spec.ts`: «settings toggle hides the assistant» — пользователь с флагом (список), `/settings` → `getByRole("switch", { name: "Помощник" })` выключить → на `/dashboard` нет `getByRole("button", { name: "Помощник" })` (кнопка появится в Task 4 — сейчас проверяется только свитч и `setAssistantEnabled` в БД через reload).
- [ ] **Step 2:** `npx vitest run lib/assistant` — FAIL.
- [ ] **Step 3: Миграция и схема**, `npx prisma generate`; SQL — только `CREATE TYPE` + `ADD COLUMN`.
- [ ] **Step 4: Реализовать** действия (каждое: `requireUser`, `assistantAvailable(await isEnabled("smart_coach", user.id), user.assistantEnabled)`, иначе `{ ok: false }` без записи), запросы, карточку настроек (Base UI `Switch`, подпись «Помощник», описание «Плавающая кнопка с советами»), `CoachFeedbackNote`.
- [ ] **Step 5:** `npx vitest run && npm run typecheck && npm run lint` — PASS.
- [ ] **Step 6: Commit** `feat(assistant): wellbeing, assistant toggle and server actions`.

---

### Task 4: Чат в кабинете и мост с тренировкой

**Files:**
- Create: `components/assistant/assistant.tsx` (кнопка + панель, `aria-label="Помощник"`), `components/assistant/workout-bridge.tsx` (`AssistantWorkoutBridge` контекст + `useAssistantWorkout`), `components/assistant/pain-store.ts` (+ `pain-store.test.ts`), `components/assistant/check-in.tsx`
- Modify: `components/app/app-shell.tsx` (рендер `<Assistant />` при `useFlag("smart_coach") && user.assistantEnabled`), `components/training/workout-state.ts` (+ `workout-state.test.ts`: действия `applySets { key; sets: {weight; reps}[] }` — заменяет только невыполненные рабочие подходы, недостающие добавляет, лишние невыполненные убирает; `replaceExercise { key; exercise; restSec; last }` — только если у упражнения нет выполненных подходов, иначе вставляет новое после текущего), `components/training/workout-editor.tsx` (оборачивает в `AssistantWorkoutBridge` с `workoutId`, `state`, `dispatch`, `last`, `hints`, `targets`, `own`, `exercises`, `wellbeing`), `components/training/exercise-block.tsx` (кнопка «Спросить помощника» в меню упражнения, только при доступном помощнике), `app/(app)/training/page.tsx` (сырые `targets`/`own` и `workout.wellbeing` в редактор), `lib/workouts/queries.ts` (`wellbeing` в `ActiveWorkout`), `components/training/offline-store.ts` (чистка `hf:pain:*` вместе с черновиками в `pruneRecords`), `lib/analytics/goals.ts` (`assistant_open`, `assistant_apply`), `CLAUDE.md` (пункт «Умный помощник»)
- Test: `e2e/smart-coach.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `readPain(workoutId): PainSpot[]`, `writePain(workoutId, spots)`, `PAIN_PREFIX = "hf:pain:"` (`pain-store.ts`).

- [ ] **Step 1: Падающие тесты:**
  - unit `workout-state.test.ts`: `applySets` при 1 выполненном рабочем, 1 разминочном невыполненном и 2 невыполненных рабочих, совет 3 × 8 · 62,5 → выполненный и разминка не тронуты, невыполненных рабочих стало 2 с `"62.5"`/`"8"`; `replaceExercise` без выполненных — то же место, новое упражнение, подходы из `last`; с выполненным — старое остаётся, новое сразу после.
  - unit `pain-store.test.ts`: запись/чтение по `workoutId`, чужой `workoutId` — пусто, мусор в хранилище — пусто.
  - e2e `smart-coach.spec.ts` (`registerUser`, флаг списком):
    - «no flag — no assistant»: без флага кнопки `Помощник` нет.
    - «weight for today from history»: `seedWorkouts` с жимом 3 × 8 · 60 кг RIR 2 → новая тренировка с жимом → меню упражнения «Спросить помощника» → «Какой вес взять сегодня?» → текст содержит «62,5» → «Подставить в подходы» → первое поле веса `62.5`.
    - «tired check-in is saved and seen by coach»: старт тренировки → карточка «Как ты сегодня?» → «Устал» → `workoutWellbeing` = `TIRED`; тренер (`linkCoach`) на сводке клиента видит «Самочувствие: устал» (после завершения).
    - «knee pain removes legs and stays local»: «Что-то болит» → «Колено» → текст «Не делай через боль» → «Убрать из тренировки» у приседа → упражнения нет; reload → помощник помнит колено (в меню упражнения ног — «лучше пропустить»); в черновике на сервере нет слова «knee» (`workoutDraftJson` через SQL — нет поля боли).
    - «settings toggle hides the assistant» (из Task 3) — теперь и кнопка пропадает.
    - «help works offline»: `context.setOffline(true)` → «Как это работает?» → «Серия и заморозки» → текст с «3 тренировки».
- [ ] **Step 2:** `npx vitest run components lib && npm run build && npx playwright test smart-coach --workers=8` — FAIL.
- [ ] **Step 3: Реализовать** чат (история ответов в состоянии компонента; статичные узлы — `staticReply`, узлы упражнения — Task 1 на данных моста, «Застой»/«Пропуск» — `askAssistantAction`, при ошибке сети — «Нужна сеть — попробуй, когда появится связь»), чек-ин (показывается в тренировке со `startedAt` и `wellbeing === null`, пока не отвечено/не пропущено — флаг `hf:checkin:<workoutId>` в `sessionStorage`), мост, действия, цели Метрики.
- [ ] **Step 4:** `npx vitest run && npm run typecheck && npm run lint && npm run build && npx playwright test smart-coach training offline --workers=8` — PASS.
- [ ] **Step 5: Commit** `feat(assistant): floating chat with workout bridge and check-in`; затем полный прогон `npm run test:e2e -- --workers=8`.

**Решение (против спеки):** порядок замены — «недавние за 90 дней» по дате прошлого раза (`last[exerciseId].date`, уже есть на странице), а не по частоте: без отдельного запроса и работает офлайн.
