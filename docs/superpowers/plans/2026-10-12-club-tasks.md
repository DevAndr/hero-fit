# Задания клуба (клубы, цикл 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ клуба создаёт задания (тренировки / объём / повторы / часы, режимы «всем клубом» и «каждому»), вклад пишется при завершении тренировки, выполнившие получают сундук 75 XP, события — в ленту клуба, ачивки «Командный игрок».

**Architecture:** Чистые правила — `lib/club/tasks.ts`; запись вклада и выполнение — `applyClubTasks` в транзакции `finishWorkout` (как `applyRaidHit`); чтение — `lib/club/tasks-queries.ts`; действия — `lib/club/task-actions.ts`; UI — вкладка «Задания» на `/clubs/[id]` и раздел в `/clubs/[id]/manage`.

**Tech Stack:** Next.js 16, Prisma 7 + PostgreSQL, Zod, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-club-tasks-design.md` (основа — `docs/superpowers/specs/2026-10-12-clubs-design.md`)

## Global Constraints

- Ветка `feat/club-tasks` от `release/2026-11-assistant`; готово — `--no-ff` в релизную, ветка удаляется. e2e только локально (`npm run test:e2e -- --workers=8`), на CI не гонять.
- Флаг `clubs` (страницы — `requireClubs`, действия — `clubsAllowed`).
- `CLUB_TASK_XP = 75`, `CLUB_TASKS_ACTIVE_MAX = 3`, `CLUB_TASK_CHESTS_PER_WEEK = 2`, `CLUB_TASK_GRACE_MS = 24 ч`, хранение сундука — 4 недели после `endsAt`, срок 7…31 день, старт — сегодня…+14 дней.
- Минимум цели на неделю срока: `EACH` — тренировки 2, кг 5 000, повторы 200, часы 2; `CLUB` (× участников на момент создания) — тренировки 2, кг 2 000, повторы 100, часы 2. Недели — `days / 7` дробно, округление вверх (часы — до целого часа, кг — до 100). `HOURS` хранится в минутах.
- Порог сундука `CLUB`: вклад ≥ `ceil(target / 100)` или ≥ 1 тренировка с ненулевым вкладом.
- `XpReason.CLUB_TASK_REWARD` — не в `LEAGUE_REASONS`; `AchievementCategory.CLUB`; лестница `clubtask:N` (1, 5, 10, 25) «Командный игрок», XP `30 + n * 5`; титул `ach:clubtask:25` «Душа клуба».
- Приватность: в `EACH` чужой прогресс в браузер не уходит; в `CLUB` вклад других — только доля %; не участнику — без вкладчиков и выполнивших; `hideWeights` — `VOLUME` в ленте как «задание клуба по объёму».
- Тексты: «В клубе уже 3 активных задания», «Минимум для такого задания: N», «Откроется с понедельника», «Новое задание клуба: …», «Клуб выполнил задание «…» — сундук ждёт».

## Review Focus

- Две тренировки одновременно добивают `CLUB`-задание — одна отметка выполнения, сундуки и уведомления один раз (`FOR UPDATE` строки задания + условный `updateMany` по `completedAt`). Тест — Task 2 (e2e: второй финиш после выполнения не создаёт сундуков и уведомлений повторно).
- Тренировка, завершённая офлайн до конца окна и отправленная через час после него, засчитывается; через 25 ч — нет; тренировка до вступления — нет. Тест — Task 1 (`hitCounts`).
- Задание «Повторы» с разминочными или неотмеченными подходами — они не засчитываются. Тест — Task 1 (`workoutAmount`).
- Админ отменил задание, пока у участника открыт экран — сундук за уже выполненное открывается, новый вклад не пишется. Тест — Task 4 (e2e отмена).
- Участник с «Скрыть веса» выполнил задание по объёму — в ленте без килограммов. Тест — Task 3 (`toClubEvents`).

---

### Task 1: Модель и чистые правила

**Files:**
- Modify: `prisma/schema.prisma` — enum `ClubTaskType`, `ClubTaskMode`, модели `ClubTask`, `ClubTaskHit`, `ClubTaskReward` дословно из спеки; `XpReason.CLUB_TASK_REWARD`; `AchievementCategory.CLUB`; обратные связи: `Club.tasks`, `Exercise.clubTasks`, `Workout.clubTaskHits`, `User` — `clubTasksCreated @relation("ClubTaskCreator")`, `clubTaskHits @relation("ClubTaskHit")`, `clubTaskRewards @relation("ClubTaskReward")`
- Create: миграция `npx prisma migrate dev --name club_tasks` (проверить, что в SQL нет `DROP INDEX` частичных индексов)
- Create: `lib/club/tasks.ts`, `lib/club/tasks.test.ts`

**Interfaces:**
- Produces (`lib/club/tasks.ts`):
  - константы из Global Constraints
  - `taskSchema` (Zod: `type`, `mode`, `exerciseId?: string`, `target: int > 0`, `startDay: "YYYY-MM-DD"`, `days: int 7..31`); отдельная проверка `startDayAllowed(startDay, today): boolean` (0…14 дней)
  - `minTarget(type: ClubTaskType, mode: ClubTaskMode, days: number, members: number): number`
  - `taskBlock({ active, target, min }: { active: number; target: number; min: number }): string | null`
  - `type WorkoutForTask = { totalVolume: number; durationSec: number; exercises: { exerciseId: string; sets: { reps: number | null; isWarmup: boolean; completedAt: Date | null }[] }[] }`
  - `workoutAmount(type, workout: WorkoutForTask, exerciseId: string | null): number`
  - `hitCounts(a: { finishedAt: Date; joinedAt: Date; startsAt: Date; endsAt: Date; now: Date; cancelledAt: Date | null }): boolean`
  - `eligible(a: { amount: number; workouts: number; target: number }): boolean`
  - `taskTitle(t: { type; mode; target; days: number }, exerciseName: string | null): string`, `taskFeedTitle(...)` (у `VOLUME` — «задание клуба по объёму»), `unitText(type, n): string` («12 тренировок», «10 000 кг», «200 повторов», «5 ч»)
  - `chestBlock({ openedThisWeek }: { openedThisWeek: number }): string | null`, `chestExpired({ endsAt, now }): boolean`
  - `taskWindow(startDay: string, days: number, timeZone: string): { startsAt: Date; endsAt: Date }`

- [ ] **Step 1: Тесты `lib/club/tasks.test.ts`**

```ts
expect(minTarget("WORKOUTS", "EACH", 28, 1)).toBe(8);
expect(minTarget("WORKOUTS", "CLUB", 14, 50)).toBe(200);
expect(minTarget("VOLUME", "EACH", 10, 1)).toBe(7200); // 5000 × 10/7 = 7142,9 → до 100 вверх
expect(minTarget("HOURS", "EACH", 7, 1)).toBe(120); // минуты
expect(minTarget("HOURS", "EACH", 10, 1)).toBe(180); // 2 × 10/7 = 2,86 ч → 3 ч
expect(minTarget("REPS", "CLUB", 7, 3)).toBe(300);
expect(taskBlock({ active: 3, target: 999, min: 1 })).toBe("В клубе уже 3 активных задания");
expect(taskBlock({ active: 0, target: 7, min: 8 })).toBe("Минимум для такого задания: 8");
expect(taskBlock({ active: 2, target: 8, min: 8 })).toBeNull();
expect(taskSchema.safeParse({ ...ok, days: 6 }).success).toBe(false);
expect(taskSchema.safeParse({ ...ok, type: "REPS", exerciseId: undefined }).success).toBe(false);
expect(startDayAllowed("2026-10-27", "2026-10-12")).toBe(false); // +15
// вклад: разминка и неотмеченные не в счёт
const w = { totalVolume: 1234.6, durationSec: 3599, exercises: [{ exerciseId: "sq", sets: [
  { reps: 10, isWarmup: true, completedAt: d }, { reps: 8, isWarmup: false, completedAt: d }, { reps: 8, isWarmup: false, completedAt: null } ] }] };
expect(workoutAmount("REPS", w, "sq")).toBe(8);
expect(workoutAmount("REPS", w, "bench")).toBe(0);
expect(workoutAmount("VOLUME", w, null)).toBe(1235);
expect(workoutAmount("HOURS", w, null)).toBe(60);
expect(workoutAmount("WORKOUTS", w, null)).toBe(1);
// окно, вступление, 24 ч, отмена
const win = { startsAt: at("2026-10-01T00:00Z"), endsAt: at("2026-10-08T00:00Z"), joinedAt: at("2026-09-01T00:00Z"), cancelledAt: null };
expect(hitCounts({ ...win, finishedAt: at("2026-10-07T23:00Z"), now: at("2026-10-08T01:00Z") })).toBe(true);
expect(hitCounts({ ...win, finishedAt: at("2026-10-07T23:00Z"), now: at("2026-10-09T01:00Z") })).toBe(false);
expect(hitCounts({ ...win, finishedAt: at("2026-10-08T00:00Z"), now: at("2026-10-08T00:30Z") })).toBe(false);
expect(hitCounts({ ...win, joinedAt: at("2026-10-05T00:00Z"), finishedAt: at("2026-10-04T10:00Z"), now: at("2026-10-04T10:00Z") })).toBe(false);
expect(hitCounts({ ...win, cancelledAt: at("2026-10-03T00:00Z"), finishedAt: at("2026-10-04T10:00Z"), now: at("2026-10-04T10:00Z") })).toBe(false);
expect(eligible({ amount: 100, workouts: 0, target: 10000 })).toBe(true);
expect(eligible({ amount: 99, workouts: 0, target: 10000 })).toBe(false);
expect(eligible({ amount: 5, workouts: 1, target: 10000 })).toBe(true);
expect(taskTitle({ type: "REPS", mode: "CLUB", target: 10000, days: 30 }, "Приседания со штангой")).toBe("Клубом: 10 000 повторов в «Приседания со штангой» за 30 дней");
expect(taskTitle({ type: "WORKOUTS", mode: "EACH", target: 12, days: 28 }, null)).toBe("Каждому: 12 тренировок за 28 дней");
expect(taskFeedTitle({ type: "VOLUME", mode: "EACH", target: 20000, days: 28 }, null, true)).toBe("задание клуба по объёму");
expect(chestBlock({ openedThisWeek: 2 })).toBe("Откроется с понедельника");
expect(chestExpired({ endsAt: at("2026-10-01T00:00Z"), now: at("2026-10-29T00:00:01Z") })).toBe(true);
expect(taskWindow("2026-10-12", 7, "Europe/Moscow")).toEqual({ startsAt: at("2026-10-11T21:00Z"), endsAt: at("2026-10-18T21:00Z") });
```

- [ ] **Step 2: `npx vitest run lib/club/tasks` — FAIL (нет модуля)**
- [ ] **Step 3: Схема, миграция, `lib/club/tasks.ts`.** `taskWindow` — полночь `startDay` в поясе и через `days` суток (через `Intl`/существующие хелперы поясов, как `deadlineEnd` в `lib/goals/rules.ts`). Числа в названиях — `toLocaleString("ru-RU")`, склонения — существующий `plural`.
- [ ] **Step 4: `npx vitest run lib/club && npm run typecheck` — PASS**
- [ ] **Step 5: Commit** `feat(club-tasks): schema and pure rules`

### Task 2: Вклад при завершении тренировки и блок в сводке

**Files:**
- Create: `lib/club/tasks-apply.ts`, `components/club/club-tasks-summary.tsx`
- Modify: `lib/workouts/finish.ts` (вызов после `applyRaidHit`, поле `FinishMeta.clubTasks`), `components/workouts/workout-summary-view.tsx` (блок после `RaidDamage`)
- Test: `e2e/club-tasks.spec.ts`, `e2e/db.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `type FinishClubTask = { taskId: string; title: string; feedTitle: string; amount: number; amountText: string; completed: boolean; clubCompleted: boolean; mode: ClubTaskMode }`; `FinishMeta.clubTasks?: FinishClubTask[]`
  - `applyClubTasks(tx, a: { userId: string; workoutId: string; finishedAt: Date; now: Date; workout: WorkoutForTask }): Promise<FinishClubTask[] | undefined>`
  - e2e-хелперы: `createClubTask(clubId: string, o: { type; mode; target; exerciseName?: string; startsAt?: Date; endsAt?: Date }): Promise<string>`, `clubTaskOf(id): Promise<{ completedAt: Date | null; cancelledAt: Date | null; hits: number }>`, `clubTaskRewards(id): Promise<string[] /* логины */>`

- [ ] **Step 1: e2e** (`--workers=8`, клуб и участники — `createClub`/`joinClub`/`setNickname` из цикла 1, флаг — `addFlagUser`):
  - `EACH` `WORKOUTS` цель 1 (хелпер минует минимум): `quickWorkout` → в сводке «Задания клуба» и «Задание выполнено!», `clubTaskRewards` = [я].
  - `CLUB` `REPS` «Приседания со штангой» цель 30: игрок A — `quickWorkout` 2 × 10 (разминки нет) → в сводке «+20», не выполнено; игрок B (вступил до) — 1 × 10 → «Задание выполнено!» у B; `clubTaskOf.completedAt` есть; `clubTaskRewards` = [A, B]; у A — уведомление «Клуб выполнил задание «…» — сундук ждёт»; игрок C с вкладом 0 сундука не получает. Затем A делает ещё тренировку — сундуков и уведомлений не прибавилось, вклад записан.
  - Тренировка игрока, вступившего после неё (`joinClub` с `joinedAt` в будущем относительно финиша — сид через `seedXpWorkout` не годится, использовать `quickWorkout` до `joinClub`) — вклада нет.
- [ ] **Step 2: `npm run build && npx playwright test e2e/club-tasks.spec.ts --workers=8` — FAIL**
- [ ] **Step 3: Реализовать `applyClubTasks`** по шагам спеки (раздел «Завершение тренировки»): задания клуба с `startsAt ≤ finishedAt < endsAt`, не отменённые; `hitCounts`; `FOR UPDATE` строки задания; существующий хит по `(taskId, workoutId)` — пропуск; `EACH` — reward при пересечении цели; `CLUB` — условный `updateMany`, `eligible` по сгруппированным суммам и числу хитов, `createMany({ skipDuplicates: true })`, уведомления (получившим — push по `notifyAchievements`, остальным участникам — без push). Название — `taskTitle` (упражнение — `exercise.name`). В `finishWorkout` — `workout` для `WorkoutForTask` собрать из уже загруженных `exercises`/`sets` и итогов (`totals.volume`, `durationSec`).
- [ ] **Step 4: прогон — PASS**
- [ ] **Step 5: Commit** `feat(club-tasks): contributions on workout finish and summary block`

### Task 3: Лента и ачивки

**Files:**
- Modify: `lib/club/feed.ts` (+ `ClubEvent.tasks: string[]`, `ClubEvent.clubTasks: string[]`), `lib/club/feed.test.ts`, `components/club/club-feed.tsx` (иконки `ListChecks`/`Users`), `lib/social/feed.ts` (`FeedRow["meta"].clubTasks?: FinishClubTask[]`), `lib/achievements/definitions.ts` (лестница + `clubTaskRewards` в статистике), `lib/achievements/engine.ts` (счётчик `count(ClubTaskReward)`), `lib/titles/catalog.ts` (`["clubtask:25", "Душа клуба"]`), `lib/achievements/icons.ts` (ключ значка — существующий групповой, например как у `raid`)
- Test: `lib/club/feed.test.ts`, `lib/achievements/definitions.test.ts`

**Interfaces:**
- Produces: `ClubEvent.tasks` — выполненные `EACH` («Выполнил(а) задание «…»» — в UI), `ClubEvent.clubTasks` — добитые `CLUB`; статистика `clubTaskRewards: number`.

- [ ] **Step 1: Тесты**

```ts
// feed: EACH выполнено — в tasks; CLUB добито — в clubTasks; VOLUME при hideWeights у чужого — feedTitle; невыполненные — нет
const meta = { clubTasks: [
  { taskId: "1", title: "Каждому: 20 000 кг за 28 дней", feedTitle: "задание клуба по объёму", amount: 5000, amountText: "5 000 кг", completed: true, clubCompleted: false, mode: "EACH" },
  { taskId: "2", title: "Клубом: 100 тренировок за 14 дней", feedTitle: "Клубом: 100 тренировок за 14 дней", amount: 1, amountText: "1 тренировка", completed: true, clubCompleted: true, mode: "CLUB" },
  { taskId: "3", title: "Клубом: 50 ч за 30 дней", feedTitle: "Клубом: 50 ч за 30 дней", amount: 60, amountText: "1 ч", completed: false, clubCompleted: false, mode: "CLUB" } ] };
const e = toClubEvents(row({ hideWeights: true, meta }), "v")!;
expect(e.tasks).toEqual(["задание клуба по объёму"]);
expect(e.clubTasks).toEqual(["Клубом: 100 тренировок за 14 дней"]);
expect(toClubEvents(row({ meta: { clubTasks: [meta.clubTasks[2]] } }), "v")).toBeNull();
// ачивки: лестница clubtask по числу наград
expect(codes(achievementsFor({ ...emptyStats, clubTaskRewards: 5 }))).toEqual(expect.arrayContaining(["clubtask:1", "clubtask:5"]));
expect(codes(achievementsFor({ ...emptyStats, clubTaskRewards: 5 }))).not.toContain("clubtask:10");
```

(`achievementsFor`/`emptyStats`/`codes` — существующие помощники `definitions.test.ts`; если называются иначе — использовать их.)
- [ ] **Step 2: `npx vitest run lib/club lib/achievements` — FAIL**
- [ ] **Step 3: Реализовать**; `finishWorkout` уже вызывает `evaluateAchievements` после `applyClubTasks` — счётчик видит новую награду.
- [ ] **Step 4: `npx vitest run lib/club lib/achievements lib/titles && npm run typecheck` — PASS**
- [ ] **Step 5: Commit** `feat(club-tasks): feed events and achievements`

### Task 4: Запросы, действия, интерфейс

**Files:**
- Create: `lib/club/tasks-queries.ts`, `lib/club/task-actions.ts`, `components/club/club-tasks.tsx` (карточки, вкладчики, «выполнили N», архив, сундук через `ChestDialog`), `components/club/manage-tasks.tsx` (список с «Отменить» и диалог «Новое задание» в 3 шага с «Минимум: N»)
- Modify: `app/(app)/clubs/[id]/page.tsx` (вкладка «Задания», `?tab=tasks`, первая и по умолчанию при активных; не участнику — тоже), `app/(app)/clubs/[id]/manage/page.tsx` (раздел «Задания»)
- Test: `e2e/club-tasks.spec.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 (`createClubTask`, `clubTaskOf`, `clubTaskRewards`).
- Produces:
  - `getClubTasks(clubId: string, viewerId: string, member: boolean, timeZone: string): Promise<{ active: ClubTaskView[]; archive: ClubTaskView[] }>`; `ClubTaskView = { id; title; mode; type; startsAt: string; endsAt: string; started: boolean; progress: { done: number; target: number } | null /* CLUB — всем, EACH — только моё */; top: { nickname: string; share: number }[] /* CLUB, участнику */; mine: { amount: number; share: number; eligible: boolean } | null; completedCount: number | null; completedNames: string[] | null /* EACH, участнику */; completed: boolean; chest: { state: "open" | "opened" | "wait" | "expired" } | null }`
  - `getManageTasks(clubId, adminId): Promise<ClubTaskView[]>` и `minTargetFor(clubId, type, mode, days)` для подсказки (через server action `taskMinimumAction`)
  - `createClubTaskAction(clubId: string, input: unknown): Promise<Result>`, `cancelClubTaskAction(taskId: string): Promise<Result>`, `openClubTaskChestAction(taskId: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }>`, `taskMinimumAction(clubId, type, mode, days): Promise<number>`, `clubExercisesAction(query: string)` (встроенные упражнения для шага 2)

- [ ] **Step 1: e2e**
  - Админ: «Новое задание» → «Тренировки» → «Каждому» → длительность 7, цель 1 → подсказка «Минимум: 2», «Создать» — «Минимум для такого задания: 2»; цель 2 → создано, у участника уведомление «Новое задание клуба: Каждому: 2 тренировки за 7 дней».
  - Ещё два задания → четвёртое — «В клубе уже 3 активных задания».
  - Участник: вкладка «Задания» по умолчанию; `EACH` — «0 / 2»; после двух `quickWorkout` — «Выполнено», «Открыть сундук» → диалог с «+75 XP».
  - `CLUB` (через `createClubTask`) с вкладом двух игроков: участник видит «Лучшие вкладчики» с процентами и «твой вклад N %», нет абсолютных чисел других (`getByText(/кг|тренировк/)` внутри списка вкладчиков — 0).
  - `EACH`: второй участник не видит прогресс первого — только «выполнили 1» и ник по кнопке.
  - Лимит сундуков: две открытые за неделю награды (`clubTaskRewards` + SQL `openedAt`) → третья — «Откроется с понедельника».
  - Отмена: «Отменить» → подтверждение → задание в «Архиве» с «Отменено»; уже полученный сундук открывается; новая тренировка вклад не пишет (`clubTaskOf.hits` не растёт).
  - Не участник: вкладка «Задания» — название и общий прогресс `CLUB`, без «Лучшие вкладчики» и «выполнили».
- [ ] **Step 2: `npm run build && npx playwright test e2e/club-tasks.spec.ts --workers=8` — FAIL**
- [ ] **Step 3: Реализовать** по спеке (разделы «Запросы и действия», «Интерфейс»): создание — транзакция под `FOR UPDATE` строки клуба, окно — `taskWindow` в поясе админа, `membersAtStart` — текущее число участников; сундук — как `openGoalChestAction` (условный `updateMany` по `openedAt: null`, `XpEvent`, `xp`/уровень, `evaluateAchievements`), недельный счётчик — открытые за неделю (пн 00:00 в поясе игрока, `weekBounds`/`weekKey`); без `revalidatePath` в действии сундука — компонент обновляет страницу при закрытии диалога (как `GoalChestButton`).
- [ ] **Step 4: прогон — PASS**
- [ ] **Step 5: Commit** `feat(club-tasks): tasks tab, management and chest`

### Task 5: Документация и полный прогон

**Files:**
- Modify: `CLAUDE.md` (дополнить пункт «Клубы залов»: цикл 2 — модели, правила, `applyClubTasks`, приватность, ачивки, e2e-хелперы), `lib/changelog/releases.ts` (в пункт о клубах — «…и общие задания клуба с сундуками», `flag: "clubs"`)

- [ ] **Step 1: Документация**
- [ ] **Step 2: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное, числа — в итог**
- [ ] **Step 3: Commit** `docs: club tasks notes and changelog`; финальное ревью ветки; `git checkout release/2026-11-assistant && git merge --no-ff feat/club-tasks && git branch -d feat/club-tasks`
