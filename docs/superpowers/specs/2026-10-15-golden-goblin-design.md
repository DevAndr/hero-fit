# Золотой гоблин

Релиз `release/2026-11-ux` (0.8.0), пятая фича, под фича-флагом `golden_goblin`.

## Цель

Редкая случайная встреча, ради которой хочется прийти на тренировку в ближайшие два дня: после тренировки иногда
выскакивает Золотой гоблин; поймал (набил урон) за 48 часов — золотой сундук с XP и монетами, не успел — сбежал.
Азарт за счёт непредсказуемости, без нового сложного интерфейса. Босс недели остаётся как есть: подходы бьют обоих.

Вне рамок: напоминание «убежит через 12 ч», титулы, гоблин в ленте друзей и в лиге, общий гоблин на всех.

## Решения

### Данные

Миграция `golden_goblin`:

```prisma
model GoblinEncounter {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// тренировка, после которой появился (её урон гоблина не бьёт)
  spawnWorkoutId  String
  spawnedAt       DateTime
  /// spawnedAt + 48 ч — после этого не пойманный гоблин сбежал
  expiresAt       DateTime
  hp              Int
  damage          Int       @default(0)
  caughtAt        DateTime?
  rewardOpenedAt  DateTime?
  @@index([userId, spawnedAt])
}
```

У `User` — `goblinEncounters GoblinEncounter[]`. Статус вычисляется, не хранится: `caughtAt` — пойман; иначе
`expiresAt > now` — активен; иначе — сбежал.

Флаг — `golden_goblin` в `lib/flags/registry.ts` (`description: "Золотой гоблин: редкая встреча после тренировки"`,
`expires: "2027-04-30"`).

### Правила — чистые функции `lib/goblin/rules.ts`

- `GOBLIN_CHANCE = 0.12`, `GOBLIN_COOLDOWN_DAYS = 14`, `GOBLIN_WINDOW_MS = 48 * 3_600_000`, `GOBLIN_MIN_HP = 1000`.
- `shouldSpawn({ now, lastSpawnedAt, blocking, random }): boolean` — `false`, если `blocking` (есть активный
  гоблин или пойманный с неоткрытым сундуком), или с `lastSpawnedAt` прошло меньше 14 дней; иначе `random < 0.12`.
- `goblinHp(avgWorkoutDamage: number): number` — `max(1000, round(avg / 100) * 100)`; `avg` — средний урон
  тренировки с уроном за 4 прошлые недели (как у босса — `damageByWeek`: сумма урона / число тренировок); нет
  истории — 1000.
- `goblinRewardXp(hp) = round(hp / 10)`; монеты — `COIN_RATES.goblinChest = 40` (`CoinReason.GOBLIN_CHEST`,
  ключ `chest:goblin:<id>`, через `grantChestCoins` — магазин выключен → монеты не начисляются, как у сундука босса).
- `goblinStatus(e, now): "active" | "caught" | "escaped"`.

### Завершение тренировки (`finishWorkout`, та же транзакция, после блока босса)

Только если флаг включён: `finishWorkoutAction` вызывает `isEnabled("golden_goblin", userId)` до транзакции и
передаёт `finishWorkout(..., { goblin: boolean })` (по умолчанию `false` — офлайн-синхронизация и прочие вызовы идут тем же
action):

1. **Урон.** Активная встреча пользователя, у которой `spawnWorkoutId ≠ эта тренировка`, `caughtAt = null` и
   `spawnedAt < finishedAt ≤ expiresAt` (время — `finishedAt` тренировки: офлайн-тренировка в окне засчитывается)
   → `damage += hit.damage` (тот же `workoutDamage`, что у босса). Если `damage ≥ hp` — `caughtAt = now` условным
   `updateMany` по `caughtAt = null` (повтор и параллельная тренировка не поймают дважды). Поймал → уведомление
   `GOBLIN` «🪙 Золотой гоблин пойман!», тело «Сундук ждёт в сводке тренировки · +N XP», ссылка на сводку.
2. **Появление** (только если на шаге 1 эта тренировка не била гоблина): `shouldSpawn` с `Math.random()` →
   создать встречу (`spawnedAt = finishedAt`, `hp = goblinHp(...)`) и уведомление `GOBLIN`
   «🪙 Золотой гоблин! Поймай за 48 ч», тело «Набей N урона следующей тренировкой», ссылка `/dashboard`.
   Push — по `notifyAchievements`, как у босса.

`FinishMeta.goblin?: { id; event: "spawned" | "hit" | "caught"; hp; damageBefore; damageAfter; expiresAt; reward }`
— в сводку. `NotificationType` + `GOBLIN`.

### Сундук

`openGoblinChestAction(id)` (`lib/goblin/actions.ts`) — по образцу `openBossChestAction`: своя встреча, пойман,
`rewardOpenedAt` условным `updateMany`; XP `goblinRewardXp(hp)` (`XpReason.GOBLIN_REWARD`, `meta: { id }`), уровень,
монеты, `evaluateAchievements`. Диалог — общий `ChestDialog`.

### Ачивки

Лестница `goblin:N` для `N ∈ {1, 5, 10}`, категория `BOSS`: «Охотник за золотом» / «Охотник за золотом ×N»,
«Поймать Золотого гоблина» / «Поймать N золотых гоблинов», `xpReward: 25 + n * 5`. Значение — `goblinCatches`
(число встреч с `caughtAt`), поле в состоянии ачивок рядом с `bossWins`. Ачивки видны всем: без флага до них просто
не дойти (как ачивки клубов).

### Интерфейс (только при флаге)

- **Карточка босса на дашборде** (`BossCard`) — строка гоблина внутри карточки, не новый блок: картинка,
  «Золотой гоблин · 600 / 1500 HP · убежит через 31 ч»; пойман с неоткрытым сундуком — «Пойман! Открыть сундук»
  (ссылка на сводку тренировки поимки). Сбежал — строки нет.
- **Редактор тренировки** — под `BossBar` полоса гоблина (`GoblinBar`): HP с учётом урона текущих подходов (клиент
  считает той же `setDamage`), «убежит через …». Только для активного гоблина и тренировки, которая его бьёт.
- **Сводка тренировки** — блок `GoblinSummary` после босса: «🪙 Появился Золотой гоблин! Поймай за 48 ч»;
  «Урон по гоблину: −N HP»; «Пойман!» + кнопка сундука.
- **Бестиарий** — карточка «Золотой гоблин» в конце: поймано, сбежало, первая поимка; не встречен — «???».
- **Картинка** — `assets/icons/game/bosses/gold_goblin.png` (742×890, прозрачный фон, без баннера с именем — в отличие
  от спрайтов боссов ~700×500 с баннером, поэтому имя «Золотой гоблин» выводится текстом рядом).

### Сквозное

- Удаление аккаунта — `onDelete: Cascade`; выгрузка «Мои данные» — массив `goblins` (`spawnedAt`, `hp`, `damage`,
  `caughtAt`) в JSON.
- «Что нового» 0.8.0 — пункт с `flag: "golden_goblin"`.
- e2e с флагом — списком на пользователя (`addFlagUser`), не глобально.

## Тестирование

Unit (`lib/goblin/rules.test.ts`): `shouldSpawn` (блокировка, пауза 13/14 дней, порог шанса 0.11/0.12),
`goblinHp` (минимум, округление), `goblinRewardXp`, `goblinStatus` (граница `expiresAt`); ачивки `goblin:1/5`.

e2e (`e2e/goblin.spec.ts`, desktop, флаг на пользователя; гоблин вставляется в БД хелпером — случайность в e2e
не участвует):
- активный гоблин (HP 300) → строка на дашборде и полоса в редакторе → тренировка с 3 подходами → сводка «Пойман!» →
  сундук → XP выросли на `hp / 10`; ачивка «Охотник за золотом»;
- истёкший гоблин → на дашборде строки нет, в бестиарии «сбежало: 1», тренировка его не бьёт;
- без флага — нет ни строки, ни полосы, тренировка гоблина не бьёт.
