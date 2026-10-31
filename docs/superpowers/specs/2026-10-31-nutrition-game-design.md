# Питание, подпроект 4: игровой слой

Дата: 2026-10-31. Флаг: `nutrition`. Ветка: `feat/nutrition-game` от `release/2028-02-nutrition`.

Решения пользователя: награды — ачивки (XP только за них, ежедневного XP нет); зачётный день — записи в 2+ разных
приёмах и сумма ≥ 800 ккал.

## Правила (`lib/nutrition/streak.ts`, чистые)

- `DIARY_DAY_MIN_MEALS = 2`, `DIARY_DAY_MIN_KCAL = 800`; зачётные дни — из SQL (`GROUP BY date HAVING count(DISTINCT meal) >= 2
  AND sum(kcal) >= 800`, окно 400 дней), вход функций — `{ date: string; kcal: number }[]`.
- `diaryStreak(days, today)` → `{ current, longest }`: подряд идущие местные даты; текущая жива, если последний зачётный
  день — сегодня или вчера (незачтённое «сегодня» серию не рвёт).
- `normDays(days, normKcal)` — зачётные дни с `0,9·норма ≤ ккал ≤ 1,1·норма`; норма — текущая (истории нормы нет); без
  нормы — 0.

## Ачивки

Категория `NUTRITION` (enum, миграция). В `AchievementStats` — `nutrition: { enabled; longestDiaryStreak; normDays }`
(`EMPTY` — `enabled: false`, нули). Без флага значения лестниц — 0 и `goal: false` (как `coachMode`); `hiddenGoalCategories`
прячет `NUTRITION` без флага.

| Код | Название | Описание | Порог | XP |
|---|---|---|---|---|
| `diary:3` | Записал — значит, съел | 3 дня подряд с дневником питания | longest ≥ 3 | 15 |
| `diary:7` | Неделя на учёте | 7 дней подряд с дневником питания | ≥ 7 | 30 |
| `diary:30` | Месяц без пропусков | 30 дней подряд с дневником питания | ≥ 30 | 75 |
| `normdays:7` | В цель | 7 дней в норме калорий (±10 %) | ≥ 7 | 20 |
| `normdays:30` | Снайпер калорий | 30 дней в норме калорий (±10 %) | ≥ 30 | 50 |

Пересчёт — `evaluateAchievementsNow(userId)` после `addFoodEntryAction`, `updateFoodEntryAction`,
`repeatYesterdayMealAction`, `copyFoodEntryToTodayAction`, `restoreFoodEntryAction`, `saveNutritionProfileAction`.

## Интерфейс

- Запрос `getDiaryStreak(userId, tz, now)` (`lib/nutrition/streak-queries.ts`) → `{ current, longest }`.
- Карточка `NutritionTodayCard` (дашборд, секция «Сегодня», только при флаге, `region` «Питание сегодня»): мини-кольцо
  (`CalorieRing` с `size="sm"`) или без нормы — «Съедено N ккал»; строка «Серия дневника: N дн.» при `current > 0`;
  ссылка «Открыть дневник» (`/nutrition`). Нет записей за 7 дней — «Записывайте еду — посчитаем калории и серию» и ссылка.
- `/nutrition`: в «Итоге дня» — та же строка серии при `current > 0`.

## Тесты

- Unit: `diaryStreak` (пусто, сегодня пусто — серия со вчера, разрыв, longest, смена месяца), `normDays` (90/110 %, без
  нормы), лестницы ачивок (`earnedAchievements` с `nutrition` и без флага — ничего).
- e2e: 6 зачётных дней из БД + сегодня через интерфейс 2 приёма → ачивки `diary:3` и `diary:7` выданы, строка серии
  «7 дн.»; карточка на дашборде с флагом (кольцо, серия, ссылка), без флага — нет.

## Документация

Раздел в `docs/features/nutrition.md`, строка про категорию в `docs/features/game.md`.
