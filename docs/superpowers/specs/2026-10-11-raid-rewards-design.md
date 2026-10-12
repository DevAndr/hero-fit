# Рейды: ачивки, титулы, лента, итоги недели, лендинг (рейды, цикл 3 из 3)

Релиз `release/2026-10-raids`. Цикл 1 — гильдии (`2026-10-11-guilds-design.md`), цикл 2 — рейд-босс
(`2026-10-11-raid-boss-design.md`). Этот цикл показывает рейды везде, где уже видны личные боссы, и рассказывает о них
на лендинге.

## Цель

Победа в рейде заметна и после сундука: ачивки и титулы за неё, строка в ленте, блок в итогах недели. Новые игроки
узнают о гильдиях с лендинга и могут вступить из Telegram.

## Решения

### Ачивки и титулы

- Новая категория `AchievementCategory.GUILD` (миграция `raid_achievements`).
- Лестница `raid:N`, N = 1, 5, 10, 25: «Рейдер» (1) / «Рейдер ×N»; описание «Победить рейд-босса с гильдией» /
  «Победить N рейд-боссов с гильдией»; `xpReward = 30 + 5·N`. Значение — число `RaidReward` игрока (победы, где он
  бил до победы и был в гильдии; те же, что дают сундук).
- Лестница `raidmvp:N`, N = 1, 5, 10: «MVP рейда» / «MVP рейда ×N»; «Нанести больше всех урона в победном рейде»;
  `xpReward = 40 + 5·N`. Значение — число `RaidWeek` с `mvpUserId` = игрок.
- Значок обеих — `default` (`achievementIconKey` без изменений).
- Титулы (`ACHIEVEMENT_TITLES`): `ach:raid:25` — «Гроза рейдов», `ach:raidmvp:10` — «Сердце гильдии».
- Выдача: тому, кто добил, — в `finishWorkout` (как сейчас, `evaluateAchievements` после `applyRaidHit`); остальным
  бившим — в `openRaidChestAction` (уже зовёт `evaluateAchievements`), при ежедневном входе и на следующей тренировке.
  В транзакции победы чужие ачивки не считаются.
- `getAchievementStats` получает `raidWins` и `raidMvps` (два `count`).

### Лента

- `FeedEntry.raidDefeated: { boss: string; guild: string } | null` — тренировка нанесла победный удар
  (`XpEvent.meta.raid.defeated`). `boss` — `raidBossName(meta.raid.code)`, `guild` — название гильдии рейда на момент
  показа (по `meta.raid.raidId` → `RaidWeek.guild`); рейд или гильдия удалены — `null`.
- Строка в карточке ленты (друзья и гильдия): «⚔ Гильдия «…» повергла: Древний …».
- `hideWeights` не влияет (в строке нет весов).

### Итоги недели

- `RecapData.raid?: { name: string; code: string; defeated: boolean; damage: number; hp: number; mine: number;
  place: number; members: number; mvp: boolean }`, `version` не меняется (поле необязательное).
- Рейд недели итогов — тот, в который игрок бил тренировками, завершёнными в неделе итогов (в поясе игрока; окно
  рейда — в поясе главы и может не совпадать с неделей игрока); ударов не было — блока нет. Если рейдов несколько
  (переход между гильдиями) — с наибольшим моим уроном.
- `place` — место игрока по урону среди всех бивших этот рейд (1 — больше всех), `members` — число бивших.
- Блок «Рейд гильдии» в `/recap`: босс со спрайтом (`BossSprite raid`), «Повержен» / «Устоял», урон гильдии / HP, «мой
  вклад N · M-е место из K», 👑 при `mvp`.

### Лендинг

- Раздел «Гильдии и рейды» (`#guilds`) после бестиария: заголовок, 3 тезиса (до 10 человек; общий босс недели — бьёт
  каждая тренировка; сундук всем, кто бил, MVP — больше), инфографика `components/marketing/raid-infographics.tsx`
  (полоса HP рейд-босса, 4 участника с полосками вклада и 👑; `Reveal`/`CountUp`, `aria-hidden`, точные числа в
  `sr-only`), кнопка «Собрать гильдию» → `/register`.
- Пункт «Гильдии» в шапке и подвале (`#guilds`), строка «Гильдии до 10 человек и рейд-босс недели» в `FREE_PLAN`,
  2 вопроса в FAQ: «Что такое гильдия и рейд?», «Что если я не тренировался на неделе рейда?» (ответ: урон наносят
  те, кто тренируется; сундук — только бившим).

### Telegram

- `startTarget("guild_<код>")` → `/guild/join/<КОД>` (код в верхний регистр, как у `join_`).
- `telegramGuildJoinUrl(code)` (`lib/telegram/links.ts`) — `t.me/<бот>?startapp=guild_<код>`, `null` без бота.
- В блоке «Пригласить» на `/guild` — второе поле «Ссылка для Telegram» с «Копировать», если ссылка есть.

## Модули

- `prisma/schema.prisma` — `AchievementCategory.GUILD`.
- `lib/achievements/definitions.ts` — `AchievementStats.raidWins`, `raidMvps`, две лестницы; `engine.ts` — счётчики.
- `lib/titles/catalog.ts` — два титула.
- `lib/social/feed.ts` (`toFeedEntry`, тип `meta.raid`), `lib/social/queries.ts` (название гильдии рейда),
  `components/social/activity-feed.tsx` (строка).
- `lib/recap/types.ts`, `build.ts` (вход `raid`), `queries.ts` (выборка), `components/recap/*` (блок).
- `app/(marketing)/page.tsx`, `components/marketing/raid-infographics.tsx`, шапка/подвал marketing.
- `lib/telegram/init-data.ts` (`startTarget`), `lib/telegram/links.ts`, `components/guild/guild-members.tsx`
  (`GuildInvite`).

## Тесты

- Unit: лестницы `raid`/`raidmvp` (`definitions.test.ts`: 0 → цель «0 / 1», 5 побед → `raid:1`, `raid:5`, цель 10),
  титулы `ach:raid:25`/`ach:raidmvp:10` (`catalog.test.ts`), `toFeedEntry` с `raidDefeated` и без,
  `buildRecap` с блоком рейда и без, `startTarget("guild_abcdefgh")` → `/guild/join/ABCDEFGH`.
- e2e:
  - `raids.spec.ts` (сценарий победы): у добившего B — ачивка «Рейдер», у A после открытия сундука — «Рейдер» и
    «MVP рейда»; в ленте гильдии у A строка «повергла: Древний».
  - `recap.spec.ts`: рейд прошлой недели с ударами игрока (SQL) → в `/recap` блок «Рейд гильдии» с «мой вклад».
  - `landing.spec.ts` (или существующий спек лендинга): раздел «Гильдии и рейды» и пункт меню.
  - `telegram-mini-app.spec.ts`: `start_param=guild_<код>` → экран «Вступить в гильдию «…»?».

## Вне цикла

Долги ревью рейда (см. память `guild-raids-idea`), свои спрайты рейд-боссов, рейд в редакторе тренировки, поиск
гильдий, чат.
