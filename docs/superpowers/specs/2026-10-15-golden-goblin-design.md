# Золотой гоблин

Релиз `release/2026-11-ux` (0.8.0), пятая фича, под фича-флагом `golden_goblin`. Идея — заметка «11. Случайные редкие
боссы»: «Посреди тренировки иногда появляется Золотой гоблин: 3 подхода за 10 минут — и он твой. Не успел — ушёл.
Пойманных собирают в бестиарий редких».

## Цель

Непредсказуемая награда прямо в зале: тренировку хочется не пропустить — вдруг сегодня выпадет. Посреди тренировки
изредка выскакивает Золотой гоблин; 3 рабочих подхода за 10 минут — пойман, золотой сундук в итогах. Не успел —
ушёл. Босс недели не меняется.

Вне рамок: гоблин без сети (запрос не уйдёт — не появится), уведомления, гоблин на дашборде, в ленте и в лиге,
другие редкие боссы (раздел «Редкие» бестиария готов к ним, но сейчас там только гоблин).

## Решения

### Данные

Миграция `golden_goblin`:

```prisma
model GoblinEncounter {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// одна встреча на тренировку; отменили тренировку (удаление) — встреча удаляется
  workoutId      String    @unique
  workout        Workout   @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  spawnedAt      DateTime
  caughtAt       DateTime?
  rewardOpenedAt DateTime?
  @@index([userId, spawnedAt])
}
```

`User.goblinEncounters`, `Workout.goblin GoblinEncounter?`. `XpReason.GOBLIN_REWARD`, `CoinReason.GOBLIN_CHEST`.
Флаг — `golden_goblin` в `lib/flags/registry.ts` (`description: "Золотой гоблин: редкая встреча посреди тренировки"`,
`expires: "2027-04-30"`).

### Правила — чистые функции `lib/goblin/rules.ts`

Константы: `GOBLIN_SET_CHANCE = 0.01`, `GOBLIN_COOLDOWN_DAYS = 14`, `GOBLIN_WINDOW_MS = 10 * 60_000`,
`GOBLIN_SETS = 3`, `GOBLIN_REWARD_XP = 150`; `COIN_RATES.goblinChest = 40` (`lib/shop/coins.ts`).

- `shouldSpawn({ now, lastSpawnedAt, hasEncounter, completedWorkingSets, random }): boolean` — `false`, если у
  тренировки уже есть встреча, или выполнено меньше 2 рабочих подходов, или с `lastSpawnedAt` прошло меньше 14 дней;
  иначе `random < 0.01`.
- `goblinProgress(spawnedAt, sets: { completedAt: string | Date | null; isWarmup: boolean }[], now): { done: number;
  caught: boolean; escaped: boolean; leftMs: number }` — `done` — рабочие подходы с `completedAt` в
  `[spawnedAt, spawnedAt + 10 мин]` (не больше 3); `caught = done ≥ 3`; `escaped = !caught && now > spawnedAt + 10 мин`;
  `leftMs ≥ 0`. Одна функция для редактора и сервера.

### Появление — `rollGoblinAction(workoutId)` (`lib/goblin/actions.ts`)

Редактор вызывает после отметки рабочего подхода (не разминки, не снятия отметки), если флаг включён у
пользователя (`useFlag`) и у тренировки ещё нет гоблина. Сервер: `requireUser`, `isEnabled("golden_goblin")`,
тренировка своя и `IN_PROGRESS`, число выполненных рабочих подходов — из сохранённого черновика (вызов идёт после
автосохранения; если черновик ещё не дошёл — считаем по тому, что есть), последняя встреча пользователя,
`shouldSpawn` с `Math.random()`. Выпало — `create` (`spawnedAt = now`; уникальность `workoutId` — защита от двойного
вызова, ошибка уникальности = «уже есть»). Ответ: `{ spawnedAt: string } | null`.

### Поимка — `finishWorkout`

`finishWorkoutAction` передаёт `finishWorkout(..., { goblin: isEnabled(...) })`. В транзакции, если флаг включён и у
тренировки есть встреча: `goblinProgress` по подходам тренировки на момент `now`; `caught` → `caughtAt = now`
условным `updateMany` по `caughtAt = null`. `FinishMeta.goblin?: { id: string; caught: boolean; reward: number }`.
Без флага встреча остаётся как есть (не поймана).

### Сундук

`openGoblinChestAction(id)` — по образцу `openBossChestAction`: своя встреча, пойман, `rewardOpenedAt` условным
`updateMany`; XP `GOBLIN_REWARD_XP` (`XpReason.GOBLIN_REWARD`, `meta: { id }`), уровень, монеты
(`grantChestCoins`, ключ `chest:goblin:<id>`), `evaluateAchievements`. Диалог — общий `ChestDialog`.

### Ачивки

Лестница `goblin:N` для `N ∈ {1, 5, 10}`, категория `BOSS`: N = 1 — «Охотник за золотом» / «Поймать Золотого
гоблина», иначе «Охотник за золотом ×N» / «Поймать N золотых гоблинов»; `xpReward: 25 + n * 5`. Значение —
`goblinCatches` (встречи с `caughtAt`) рядом с `bossWins`. Ачивки видны всем (без флага их не получить — как у
клубов).

### Интерфейс (только при флаге)

- **Редактор** — `ActiveWorkout.goblin: { spawnedAt: string } | null` (загрузка с тренировкой), состояние
  обновляется ответом `rollGoblinAction`. Липкая плашка `GoblinBanner` под шапкой страницы (над упражнениями):
  картинка, «Золотой гоблин! 3 подхода за 10 минут», таймер `9:41` (раз в секунду), «Подходы: 1/3». Пойман —
  «Пойман! Сундук ждёт в итогах тренировки». Ушёл — «Гоблин ушёл…» с кнопкой «Закрыть» (скрыть до перезагрузки).
  Появление — короткая анимация (без неё при «уменьшить движение»), вибрация `haptic("success")`.
- **Итоги тренировки** — `GoblinSummary` после блока босса: пойман — «🪙 Золотой гоблин пойман!» и кнопка сундука
  (открыт — «Сундук открыт · +150 XP»); не пойман — «Золотой гоблин ушёл».
- **Бестиарий** — раздел «Редкие» под боссами: карточка «Золотой гоблин» — встречен N, пойман M, первая поимка;
  не встречен — «???».
- **Картинка** — `assets/icons/game/bosses/gold_goblin.png` (742×890, прозрачный фон, без баннера с именем — имя
  выводится текстом).

### Сквозное

- Удаление аккаунта — `Cascade` от `User`; выгрузка «Мои данные» — `goblins` (`spawnedAt`, `caughtAt`) в JSON.
- «Что нового» 0.8.0 — пункт с `flag: "golden_goblin"`.
- e2e — флаг списком на пользователя (`addFlagUser`), только desktop.

## Тестирование

Unit (`lib/goblin/rules.test.ts`): `shouldSpawn` — встреча уже есть, 1 подход, пауза 13 и 14 дней, порог 0.009/0.01;
`goblinProgress` — 3 подхода в окне → пойман, подход после 10 минут и разминка не считаются, `escaped` после окна,
`leftMs`. Ачивки `goblin:1/5`.

e2e (`e2e/goblin.spec.ts`; встреча вставляется в БД хелпером для идущей тренировки — случайность не участвует):
- плашка с таймером → 3 подхода → «Пойман!» → завершить → итоги «пойман» → сундук → XP +150, ачивка «Охотник за
  золотом», в бестиарии «пойман: 1»;
- встреча 11 минут назад → «Гоблин ушёл», итоги «ушёл», сундука нет;
- без флага — плашки нет, итоги без гоблина;
- `rollGoblinAction` без флага и для чужой тренировки — `null`.
