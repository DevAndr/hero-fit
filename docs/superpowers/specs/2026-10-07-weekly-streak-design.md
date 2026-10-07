# Недельный streak «В ударе» — дизайн

Дата: 2026-10-07 · Ветка: `feat/weekly-streak` · Часть 1 из 2 (часть 2 — календарь планов, отдельная спека)

## Зачем

Сейчас streak — окна по 24 часа: пользователь, который честно тренируется по плану с днями отдыха (пн/ср/пт),
тратит заморозки или теряет серию. Новое правило поощряет регулярность, а не ежедневность: **серия — число
недель подряд, в каждой из которых ≥ 3 тренировок**. Это же правило станет основой для календаря планов (часть 2).

## Правило

- **Неделя** — понедельник 00:00 … воскресенье 24:00 в поясе пользователя (`User.timeZone`). Ключ недели —
  дата её понедельника, `"YYYY-MM-DD"`.
- **Засчитанная неделя** — ≥ 3 тренировок со статусом `COMPLETED`, по `finishedAt` в поясе пользователя
  (`STREAK_WEEK_TARGET = 3`). Серия растёт **сразу на 3-й** тренировке недели; 4-я и далее серию не меняют.
- **Пропущенные недели** — недели строго между последней засчитанной (`lastStreakWeek`) и неделей новой
  засчитанной (или текущей — для статуса). Текущая неделя пропуском не считается, пока не кончилась.
  Каждая пропущенная неделя: уже покрыта (строка `StreakCoverWeek`) → ничего; иначе списывается заморозка;
  заморозок не хватает → серия сгорела, засчитанная неделя начинает новую серию с 1.
  Проверка ленивая (при засчитывании и при расчёте статуса), без крона.
- **Тренировка задним числом** (офлайн, `finishedAt` с устройства) засчитывается в неделю своего `finishedAt`,
  но кредит выдаётся только если эта неделя позже `lastStreakWeek`. Прошлые недели не пересчитываются.

### Заморозки

- Еженедельная выдача становится **раз в 4 недели** (`FREEZE_GRANT_WEEKS = 4`, по `freezeGrantedAt`,
  проверка при завершении тренировки), пока заморозок < `MAX_FREEZES = 2`.
- Награды ачивок (`freezeReward`) копятся до `MAX_REWARD_FREEZES = 3` (было 5).
- Списание пишет строку `StreakCoverWeek(reason = FREEZE)` на каждую закрытую неделю.

### Выкуп сгоревшей серии

- Доступен, если сгоревшая серия ≥ `MIN_RESTORE_STREAK = 2` недель.
- Неделя сгорания `lostWeek` = `lastStreakWeek + (streakFreezes + 2)` недель — неделя, в начале которой стало
  ясно, что пропусков больше, чем заморозок. Выкуп возможен только в эту неделю до четверга 00:00
  (`RESTORE_WINDOW_DAYS = 3`) по поясу пользователя.
- Цена: `min(500, 50 + 50 · серия)` XP, только из прогресса текущего уровня (уровень не падает) — как сейчас.
- Выкуп пишет `StreakCoverWeek(reason = RESTORE)` на все непокрытые пропущенные недели (заморозки не тратит)
  и ставит `streakRestoredAt`. Повторно — только после новой засчитанной недели
  (`streakRestoredAt` позже недели `lastStreakWeek`).

## Данные (Prisma)

`User`:
- `currentStreak`, `longestStreak` — теперь в неделях.
- `lastStreakAt DateTime?` → удаляется; новое `lastStreakWeek String?` — последняя засчитанная неделя.
- `weekWorkouts Int @default(0)`, `weekWorkoutsKey String?` — счётчик тренировок недели `weekWorkoutsKey`
  (для шапки без лишнего SQL; если ключ ≠ текущей неделе — считается 0).
- `streakReminderFor DateTime?` → удаляется; новое `streakReminderDay String?` — локальная дата последнего
  напоминания (не чаще раза в день).
- `streakFreezes`, `freezeGrantedAt`, `streakRestoredAt` — без изменений. Значение `streakFreezes` по умолчанию остаётся 1.

Новая таблица:

```prisma
enum StreakCoverReason { FREEZE RESTORE }

model StreakCoverWeek {
  id        String            @id @default(cuid())
  userId    String
  week      String            // понедельник недели, "YYYY-MM-DD"
  reason    StreakCoverReason
  createdAt DateTime          @default(now())
  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, week])
}
```

## Модуль `lib/progress/streak.ts` (переписывается, чистые функции)

- `weekKey(date, tz): string`, `addWeeks(key, n)`, `weeksBetween(a, b): number`, `weekEnd(key, tz): Date`.
- `weeklyRuns(weeks, currentWeek)` — переезжает сюда из `lib/achievements/definitions.ts` (миграция, тесты).
- `grantFreeze(state, now)` — выдача раз в 4 недели.
- `applyWeekCredit(state, week, coveredWeeks): StreakUpdate` — `{ currentStreak, longestStreak, lastStreakWeek,
  streakFreezes, frozenWeeks: string[], extended, reset }`.
- `streakStatus(user, now, tz): StreakStatus`:
  - `none` — серии нет;
  - `done` — `{ streak }`, текущая неделя засчитана;
  - `pending` — `{ streak, count, needed, daysLeft }`, неделя идёт, пропусков нет;
  - `frozen` — `{ streak, count, needed, daysLeft, freezesNeeded }`, есть пропуски, заморозок хватает;
  - `lost` — `{ streak }`.
- `restoreOffer(user, now, tz)`, `restoreCost(streak)`.
- `shouldRemindStreak(user, now, tz)` — переезжает из `lib/notifications/reminders.ts`, см. ниже.

## Интеграция

- **Завершение** (`lib/workouts/finish.ts`, та же транзакция): SQL-подсчёт `COMPLETED` тренировок недели
  `finishedAt` → `weekWorkouts`/`weekWorkoutsKey`; выдача заморозки; если счёт достиг 3 и неделя позже
  `lastStreakWeek` — `applyWeekCredit`, строки `StreakCoverWeek(FREEZE)`. В `XpEvent.meta`: `streak`,
  `streakExtended`, `streakReset`, `usedFreezes` (как сейчас) + `weekCount`.
- **Сводка** (`/workouts/[id]`): 3-я тренировка — «🔥 Серия N недель (+1)»; 1-я/2-я — «Неделя: 2/3 — ещё 1
  тренировка до +1 к серии»; сброс — как сейчас.
- **Шапка** (`StreakBadge`): «🔥 N», подсказка по статусу: «Эта неделя 2/3, осталось 3 дня» / «Неделя засчитана».
- **Дашборд** (`StreakCard`): число недель «недель подряд», 3 точки прогресса недели и «осталось N дней»,
  рекорд, заморозки, кнопка выкупа (новый `restoreOffer`), подсветка при угрозе (`pending`/`frozen`, когда
  `needed ≥ daysLeft`).
- **Лига** (`lib/social/queries.ts`) — серия по новому `streakStatus` (0 для `none`/`lost`).
- **Лента** (`lib/social/feed.ts`, `streakMilestone`) — вехи по новым порогам в неделях.
- **`requireUser` / `CurrentUser`** (`lib/auth/dal.ts`) — новые поля вместо `lastStreakAt`.
- **Выкуп** (`lib/progress/actions.ts`) — новая логика; гонка двух нажатий — условие по старому `lastStreakWeek`
  + `streakRestoredAt`.
- **Напоминание «Не потеряй streak!»** (`processStreakReminders`): когда тренировок не хватает на оставшиеся
  дни недели (`needed ≥ daysLeft`, `daysLeft` включает сегодня), в 12:00 по местному времени и позже, не чаще
  раза в день (`streakReminderDay`). Текст: «Нужно ещё 2 тренировки до конца воскресенья». Кандидаты — один
  SQL (`notifyStreak`, `currentStreak > 0`, локальные день недели ≥ пт и час ≥ 12 через
  `now() AT TIME ZONE "timeZone"`, `streakReminderDay` ≠ локальная дата), окончательно — `shouldRemindStreak`.
- **Тексты**: «дней подряд», «окна по 24 часа» → «недель подряд», «3 тренировки в неделю»; описание механики
  streak в `CLAUDE.md`.

## Ачивки

- Лестницы `streak:N` (дни) и «Стабильность» `weeks:N` объединяются в одну: **`streakw:N`**, пороги
  2, 4, 8, 12, 26, 52, далее шаг 52; значение — `longestStreak`, цель — `currentStreak` (заморозки серию не рвут).
  Названия: 2 «В ударе», 4 «Месяц огня», 12 «Квартал без пропусков», 26 «Полгода в ударе», 52 «Год в ударе».
  XP = 15·N, `freezeReward: 1` за N ≥ 4.
- Уже полученные `streak:N` и `weeks:N` остаются у пользователей (строка хранит название и описание), новые не
  выдаются. Удаляются `WEEKS_THRESHOLDS`, `bestWeeklyRun`/`currentWeeklyRun` из `AchievementStats` и их SQL.
- «Второе дыхание» (`freeze`) — по наличию `StreakCoverWeek(reason = FREEZE)` вместо `XpEvent.meta.usedFreezes`.

## Миграция

1. Prisma-миграция схемы (новые поля и таблица, удаление `lastStreakAt`, `streakReminderFor`).
2. `prisma/migrate-weekly-streak.ts` (`npm run db:migrate-streak`, идемпотентный): для каждого пользователя —
   недели с ≥ 3 `COMPLETED` тренировками в его поясе → `currentStreak` (серия, заканчивающаяся на текущей или
   прошлой неделе, без заморозок), `longestStreak`, `lastStreakWeek`, `weekWorkouts`/`weekWorkoutsKey`;
   `streakFreezes = min(streakFreezes, 3)`. Без запуска скрипта у всех серия 0 и копится заново — безопасно.

## Сид

Демо-история под недельные серии: `demo` и `demo.masha` — по 3 тренировки в неделю за последние недели;
свежая тренировка `demo.masha` — 3-я на текущей неделе (веха серии в ленте). Повторный сид пересчитывает
поля streak из истории тем же кодом, что и скрипт миграции.

## Тесты

- Unit (`lib/progress/streak.test.ts` переписывается, `lib/notifications/reminders.test.ts`, ачивки):
  `weekKey` на стыке вс/пн в разных поясах; кредит на 3-й и не на 4-й; пропуск + заморозка; пропуск без
  заморозки → сброс; несколько пропусков; недели, покрытые выкупом; тренировка задним числом; выдача заморозки
  раз в 4 недели и лимиты; `restoreOffer` (окно до четверга, цена, повтор); `streakStatus` для всех состояний;
  `shouldRemindStreak` (сб 1/3 — да, сб 2/3 — нет, вс 2/3 — да, второй раз за день — нет); лестница `streakw`.
- e2e: три тренировки → «+1 к серии» в сводке и «1» в шапке; история с пропущенной неделей и заморозкой
  (`e2e/db.ts`) → серия жива, заморозка списана; сгоревшая серия → выкуп; существующие проверки streak в
  `dashboard`, `achievements`, `notifications`, `training` переделываются под недели.

## Вне рамок

Календарь планов и напоминание «Сегодня по плану» — часть 2. Глобальные рейтинги серий — нет.
