# Клубы (цикл 2 из 2): общие задания клуба

Релиз `release/2026-11-assistant`, под тем же флагом `clubs`. Основа — цикл 1
(`docs/superpowers/specs/2026-10-12-clubs-design.md`): `Club`, `ClubMember`, рейтинг, лента событий. Согласовано
2026-10-12.

## Цель

Дать клубу общее дело: админ клуба объявляет задание («Клубом: 10 000 повторов в приседе за месяц», «Каждому:
12 тренировок за 4 недели»), прогресс считается из тренировок сам, выполнившие получают сундук, событие попадает в
ленту клуба.

## Решения

- **Типы:** тренировки (`WORKOUTS`), объём в кг (`VOLUME`), повторы в упражнении (`REPS`), часы в зале (`HOURS`).
- **Режимы:** `CLUB` — общий счётчик клуба; `EACH` — личная цель у каждого участника.
- **Создаёт и отменяет** только админ клуба; цель и срок после создания не меняются.
- **Награда** — сундук с фиксированными 75 XP (`CLUB_TASK_XP`), не в лиге и не в рейтинге клуба; не больше
  2 открытых сундуков заданий за неделю (пн…вс в поясе игрока); лестница ачивок «Командный игрок».
- **`CLUB`:** сундук — вышедшим на порог вклада: вклад ≥ 1 % цели или хотя бы одна тренировка с ненулевым вкладом.
- **Засчитываются** тренировки, завершённые в окне задания и не раньше вступления в клуб; вышедший из клуба вклад
  сохраняет.
- **Приватность** (согласие «Тренировки — нет»): в `EACH` чужой прогресс не виден — только список выполнивших; в
  `CLUB` вклад участников — только доля в процентах.
- **Подход:** вклад пишется строкой при завершении тренировки (как `RaidHit`), выполнение ловится там же.

## Данные

```prisma
enum ClubTaskType { WORKOUTS VOLUME REPS HOURS }
enum ClubTaskMode { CLUB EACH }

model ClubTask {
  id          String       @id @default(cuid())
  clubId      String
  type        ClubTaskType
  mode        ClubTaskMode
  /// только для REPS
  exerciseId  String?
  /// базовые единицы: тренировки, кг, повторы, минуты (HOURS)
  target      Int
  /// окно в UTC: полночь дня старта … конец последнего дня в поясе админа на момент создания
  startsAt    DateTime
  endsAt      DateTime
  /// участников на момент создания — для минимума цели CLUB и подписи
  membersAtStart Int
  createdById String?
  cancelledAt DateTime?
  /// только CLUB: момент выполнения (ставится один раз)
  completedAt DateTime?
  createdAt   DateTime     @default(now())

  club     Club              @relation(fields: [clubId], references: [id], onDelete: Cascade)
  exercise Exercise?         @relation(fields: [exerciseId], references: [id], onDelete: Restrict)
  createdBy User?            @relation("ClubTaskCreator", fields: [createdById], references: [id], onDelete: SetNull)
  hits     ClubTaskHit[]
  rewards  ClubTaskReward[]

  @@index([clubId, endsAt])
}

model ClubTaskHit {
  id        String   @id @default(cuid())
  taskId    String
  userId    String
  workoutId String
  amount    Int
  createdAt DateTime @default(now())

  task    ClubTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user    User     @relation("ClubTaskHit", fields: [userId], references: [id], onDelete: Cascade)
  workout Workout  @relation(fields: [workoutId], references: [id], onDelete: Cascade)

  @@unique([taskId, workoutId])
  @@index([taskId, userId])
}

model ClubTaskReward {
  id        String    @id @default(cuid())
  taskId    String
  userId    String
  openedAt  DateTime?
  createdAt DateTime  @default(now())

  task ClubTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User     @relation("ClubTaskReward", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([taskId, userId])
  @@index([userId, openedAt])
}
```

`XpReason.CLUB_TASK_REWARD` (не входит в `LEAGUE_REASONS`), `AchievementCategory.CLUB`.

## Правила (чистые, `lib/club/tasks.ts`)

- `taskSchema` (Zod): `type`, `mode`, `exerciseId` (обязателен для `REPS`, иначе пусто), `target` — целое > 0,
  `startDay` — «YYYY-MM-DD» от сегодня до +14 дней (в поясе админа), `days` — 7…31.
- `minTarget(type, mode, days, members)`: недель = `days / 7` (дробно); на неделю — `EACH`: тренировки 2, кг 5 000,
  повторы 200, часы 2; `CLUB` (на участника): тренировки 2, кг 2 000, повторы 100, часы 2; `CLUB` × `members`;
  округление вверх (часы — до целого часа, кг — до 100). В минутах для `HOURS` — × 60.
- `taskBlock({ active, target, min })` — «В клубе уже 3 активных задания» (`CLUB_TASKS_ACTIVE_MAX = 3`, активные —
  не отменённые, не выполненные `CLUB`, `endsAt` в будущем), «Минимум для такого задания: N».
- `workoutAmount(type, workout, exerciseId)` — вклад тренировки: `WORKOUTS` 1; `VOLUME` — `round(totalVolume)`;
  `REPS` — сумма повторов выполненных (`completedAt`) не разминочных подходов в упражнении; `HOURS` —
  `round(durationSec / 60)`. 0 — не пишется.
- `hitCounts({ finishedAt, joinedAt, startsAt, endsAt, now, cancelledAt })` — `finishedAt` в `[startsAt, endsAt)`,
  `finishedAt ≥ joinedAt`, не отменено, `now < endsAt + 24 ч` (`CLUB_TASK_GRACE_MS`, офлайн-финиш).
- `eligible({ amount, workouts, target })` — для `CLUB`: `amount ≥ ceil(target / 100)` или `workouts ≥ 1`.
- `taskTitle(task, exerciseName)` — «Клубом: 10 000 повторов в приседе за 30 дней» / «Каждому: 12 тренировок за
  28 дней»; `taskFeedTitle` — при скрытых весах у `VOLUME` — «задание клуба по объёму».
- `chestBlock({ openedThisWeek })` — «Откроется с понедельника» при ≥ 2 (`CLUB_TASK_CHESTS_PER_WEEK`).
- `chestExpired({ endsAt, now })` — сундук хранится 4 недели после `endsAt`.

## Завершение тренировки (`lib/club/tasks-apply.ts`)

`applyClubTasks(tx, { userId, workoutId, finishedAt, now, workout })` — в транзакции `finishWorkout` после рекордов
и рейда:

1. Членство игрока (`clubId`, `joinedAt`); нет — `undefined`.
2. Задания клуба, у которых `hitCounts` истинно (окно содержит `finishedAt`).
3. Для каждого: `amount = workoutAmount`; 0 — пропуск. `SELECT … FROM "ClubTask" WHERE id = … FOR UPDATE`;
   уже есть `ClubTaskHit` с этим `workoutId` — пропуск; вставка вклада.
4. `EACH`: личная сумма до и после; пересекла `target` — `ClubTaskReward` (upsert).
5. `CLUB` и `completedAt = null`: общая сумма ≥ `target` → условный `updateMany` по `completedAt: null`; при
   `count = 1` — вклад и число тренировок по каждому вкладчику, `eligible` → `ClubTaskReward.createMany`
   (`skipDuplicates`), уведомление `SOCIAL` получившим сундук («Клуб выполнил задание «…» — сундук ждёт», push по
   `notifyAchievements`, `url` — `/clubs/<id>?tab=tasks`), остальным текущим участникам — без push.
6. Результат — `FinishMeta.clubTasks: { taskId, title, feedTitle, amount, unit, completed, clubCompleted }[]`.

## Запросы и действия

- `getClubTasks(clubId, viewerId, member: boolean)` (`lib/club/tasks-queries.ts`): активные и стартующие
  (`endsAt > now`, не отменённые, не выполненные `CLUB`) и архив (до 10). Для `CLUB` — сумма и прогресс; участнику —
  топ-5 вкладчиков (ник и доля %), мой вклад и вышел ли я на порог; для `EACH` участнику — мой прогресс и число
  выполнивших со списком ников; не участнику — только название, срок и общий прогресс `CLUB`. Мой сундук: есть,
  открыт, можно ли открыть (`chestBlock`, `chestExpired`).
- `createClubTaskAction(clubId, input)` — админ клуба, флаг, `taskSchema`, окно из `startDay`/`days` в поясе админа,
  в транзакции под `FOR UPDATE` строки клуба — `taskBlock` (`membersAtStart` — текущее число участников);
  уведомление участникам `SOCIAL` без push «Новое задание клуба: …».
- `cancelClubTaskAction(taskId)` — админ клуба, условный `updateMany` по `cancelledAt: null`.
- `openClubTaskChestAction(taskId)` — своя награда, не открыта, `chestBlock` по открытым за неделю (пояс игрока),
  `chestExpired`; в транзакции: условный `updateMany` по `openedAt: null`, `XpEvent` `CLUB_TASK_REWARD` 75 XP,
  `User.xp`/уровень (как сундук цели); затем `evaluateAchievementsNow`.

## Интерфейс

- `/clubs/[id]/manage` — раздел «Задания»: список с «Отменить» (подтверждение) и «Новое задание» — диалог в 3 шага
  (тип → режим и упражнение для повторов (встроенные) → цель с подсказкой «Минимум: N» и старт/длительность).
- `/clubs/[id]` — вкладка «Задания» (`?tab=tasks`; первая и по умолчанию, если есть активные): карточки — название,
  «стартует …» / «осталось N дней», прогресс; `CLUB` — полоса «6 420 / 10 000», «Лучшие вкладчики», «твой вклад
  12 %»/«до сундука — 1 тренировка по заданию»; `EACH` — «7 / 12», «выполнили 8» (раскрыть ники); выполненное —
  «Выполнено» и «Открыть сундук» (`ChestDialog`) или «Откроется с понедельника»; «Архив». Не участнику — та же
  вкладка без вкладчиков, своих чисел и списков.
- Сводка тренировки — блок «Задания клуба»: «+1 к «…»», «Задание выполнено!» (`FinishMeta.clubTasks`).
- Лента клуба — события `EACH` «Выполнил(а) задание «…»» и `CLUB` «Клуб выполнил «…» — последний вклад» (из
  `meta.clubTasks`, `toClubEvents`; при скрытых весах — `feedTitle`).

## Ачивки

Лестница `clubtask:N` (1, 5, 10, 25) «Командный игрок», категория `CLUB`, счётчик — число `ClubTaskReward`
(`clubTaskRewards` в `getAchievementStats`), XP — как у лестниц гильдии. Титул `ach:clubtask:25` «Душа клуба».
Выдача: завершившему тренировку — в `finishWorkout`; остальным — при открытии сундука, входе или следующей
тренировке.

## Приватность

- `EACH`: чужой прогресс не отдаётся в браузер; виден только список выполнивших.
- `CLUB`: вклад участников — доля в процентах, без абсолютных чисел.
- Скрытые веса — `VOLUME`-события без килограммов.
- Не участнику — без вкладчиков и выполнивших.

## Тесты

- Unit `lib/club/tasks.test.ts`: `minTarget` по типам и режимам (дробные недели, округление), `taskBlock`,
  `workoutAmount` (разминка и невыполненные подходы не в счёт), `hitCounts` (окно, `joinedAt`, 24 ч, отмена),
  `eligible`, `taskTitle`/`taskFeedTitle`, `chestBlock`, `chestExpired`; `toClubEvents` с `clubTasks`.
- e2e `e2e/club-tasks.spec.ts` (`--workers=8`): создание с подсказкой минимума и отказом ниже, лимит 3; `CLUB` — двое
  вносят, второй добивает (сундуки вышедшим на порог, уведомления, событие в ленте); `EACH` — свой прогресс,
  «выполнили N», чужой прогресс не виден; третий сундук за неделю — «Откроется с понедельника»; отмена; не
  участнику — общий прогресс без вкладчиков; блок в сводке тренировки. Хелперы в `e2e/db.ts`: `createClubTask`,
  `clubTaskOf`, `clubTaskRewards`.

## Вне цикла

Свои упражнения в заданиях `REPS`, задания на группу мышц, шаблоны заданий, карточка на дашборде, задания-серии
(«каждую неделю»), денежные/внешние призы.
