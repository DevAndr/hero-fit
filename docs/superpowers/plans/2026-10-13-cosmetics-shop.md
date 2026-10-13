# Магазин косметики и монеты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** игровая валюта «монеты» за тренировки и активности и магазин косметики (аватар + рамка, цвет ника, тема) под флагом `shop`.

**Architecture:** баланс `User.coins` + журнал `CoinTx` с уникальным ключом события (идемпотентность); начисление — в транзакциях существующих событий через `grantCoins`; каталог — данные в коде (`lib/shop/catalog.ts`), в БД только владение `UserItem` и надетое (`User.*Code`). Показ — общие `PlayerAvatar`/`PlayerName`, флаг — по владельцу.

**Tech Stack:** Next.js 16, Prisma 7 (`@/generated/prisma/client`), PostgreSQL, Vitest, Playwright, shadcn/ui (Base UI).

**Spec:** `docs/superpowers/specs/2026-10-13-cosmetics-shop-design.md`

## Global Constraints

- Общение и тексты UI — по-русски; тексты без слов «флаг»/«админ».
- Миграции — `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<ts>_<name>/migration.sql`, затем `npx prisma migrate deploy` (не `migrate dev`: интерактивен и удалит частичные индексы).
- Ставки (точно): тренировка 10 при ≥ 3 выполненных рабочих подходах, не больше 2 за местный день; рекорд 5 за упражнение, до 3; ежедневный сундук 2 / редкий 6; босс 30; рейд 40 / MVP 60; цель 25; задание клуба 15; ачивка `round(xpReward/5)` в [3, 50]; неделя серии `min(30, 10 + 2·серия)`; уровень N — `20 + 2·N`; `RETRO_CAP = 3000`.
- Цены (обычный/редкий/эпический/легендарный): аватар 150/400/900/2000, рамка 100/300/700/1500, цвет ника 200/500/1000/1500, тема 300/600/1000/—.
- Монеты начисляются всем независимо от флага; флаг `shop` (по владельцу) прячет интерфейс и косметику.
- Цвета UI — только семантические токены (кроме данных каталога); бесконечных анимаций нет; e2e — `--workers=8`.
- Рабочая ветка `feat/cosmetics-shop` от `release/2026-11-shop`; в конце — `--no-ff` в релизную ветку.

## Review Focus

1. Тренировка, завершённая офлайн задним числом в прошлый день: лимит «2 в день» считается по её местному дню `finishedAt`, а не по сегодняшнему — тест в Task 2.
2. Повторный клик «Завершить» / повторное открытие сундука не начисляют монеты дважды и не роняют транзакцию — тест `grantCoins` на конфликт ключа в Task 1 и e2e повторного финиша в Task 2.
3. Две покупки одновременно при балансе на одну: одна успешна, вторая «Не хватает монет», баланс ≥ 0 — тест в Task 4.
4. Предмет удалён из каталога, а код надет / куплен: страницы не падают, показывается вид по умолчанию, в истории — код вместо названия — тест `visibleCosmetics`/`coinLabel` в Task 4/6.
5. Стартовый баланс при одновременных первых заходах (две вкладки): одна запись `retro` — тест в Task 3.

---

### Task 1: Модель данных, флаг и правила монет

**Files:**
- Modify: `prisma/schema.prisma` (User: `coins Int @default(0)`, `coinsSince DateTime @default(now())`, `avatarCode/frameCode/nickColorCode/themeCode String?`; модели `CoinTx`, `UserItem`; enum `CoinReason`)
- Create: `prisma/migrations/20261013120000_shop_coins/migration.sql`
- Modify: `lib/flags/registry.ts` (`shop: { description: "Магазин косметики: монеты, аватары, цвет ника, темы", expires: "2027-04-30" }`)
- Create: `lib/shop/coins.ts`, `lib/shop/coins.test.ts`, `lib/shop/coins-db.ts`

**Interfaces:**
- Produces:
  - `enum CoinReason { WORKOUT RECORD DAILY_CHEST BOSS_CHEST RAID_CHEST GOAL_CHEST CLUB_TASK_CHEST ACHIEVEMENT STREAK_WEEK LEVEL_UP RETRO PURCHASE }`
  - `CoinTx { id, userId, amount Int, reason CoinReason, key String, meta Json?, createdAt }`, `@@unique([userId, key])`, `@@index([userId, reason, createdAt])`, `@@index([userId, createdAt])`
  - `UserItem { id, userId, code, source String, acquiredAt }`, `@@unique([userId, code])`; обе связи `onDelete: Cascade`
  - `COIN_RATES` — объект констант из Global Constraints (`workout: 10`, `workoutsPerDay: 2`, `minWorkingSets: 3`, `record: 5`, `recordsPerWorkout: 3`, `dailyChest: 2`, `dailyChestRare: 6`, `bossChest: 30`, `raidChest: 40`, `raidChestMvp: 60`, `goalChest: 25`, `clubTaskChest: 15`, `retroCap: 3000`)
  - `workoutCoins(workingSets: number, paidToday: number): number`
  - `recordCoins(recordExercises: number): number`
  - `achievementCoins(xpReward: number): number`
  - `streakWeekCoins(streak: number): number`
  - `levelCoins(level: number): number`, `levelUpCoins(levelBefore: number, levelAfter: number): { level: number; amount: number }[]`
  - `type CoinGrant = { reason: CoinReason; key: string; amount: number; meta?: Prisma.InputJsonValue }`
  - `grantCoins(tx: Prisma.TransactionClient, userId: string, grants: CoinGrant[]): Promise<number>` — вставляет `CoinTx` `ON CONFLICT ("userId", key) DO NOTHING RETURNING amount`, инкрементит `User.coins` на сумму вставленных, возвращает её; суммы ≤ 0 и пустой список — без запросов.

- [ ] **Step 1: Тесты правил** — `lib/shop/coins.test.ts`:
  - `workoutCoins(3, 0) === 10`, `workoutCoins(2, 0) === 0`, `workoutCoins(5, 1) === 10`, `workoutCoins(5, 2) === 0`
  - `recordCoins(0) === 0`, `recordCoins(2) === 10`, `recordCoins(7) === 15`
  - `achievementCoins(5) === 3`, `achievementCoins(60) === 12`, `achievementCoins(1000) === 50`
  - `streakWeekCoins(1) === 12`, `streakWeekCoins(10) === 30`
  - `levelCoins(5) === 30`; `levelUpCoins(3, 5)` → `[{level:4,amount:28},{level:5,amount:30}]`; `levelUpCoins(5, 5)` → `[]`
- [ ] **Step 2:** `npx vitest run lib/shop/coins.test.ts` — FAIL (модуля нет).
- [ ] **Step 3:** реализовать `lib/shop/coins.ts`; схема и миграция (в SQL проверить: существующим `coinsSince` = время миграции — `DEFAULT CURRENT_TIMESTAMP` при `ADD COLUMN NOT NULL` так и делает); флаг в реестре; `lib/shop/coins-db.ts` (`import "server-only"`, сырой SQL через `tx.$queryRaw` с `Prisma.join` для пачки, id — `createId()` как в соседнем коде или `gen_random_uuid()::text`).
- [ ] **Step 4:** `npx prisma migrate deploy && npx prisma generate && npx vitest run lib/shop lib/flags` — PASS.
- [ ] **Step 5:** e2e-хелперы в `e2e/db.ts`: `setCoins(login, n)`, `coinTx(login): Promise<{reason,amount,key}[]>`, `userItems(login): Promise<string[]>`, `coinBalance(login)`.
- [ ] **Step 6:** `npm run typecheck && npm run lint` — чисто; коммит `feat(shop): coins ledger, rates and shop flag`.

### Task 2: Начисление за события

**Files:**
- Modify: `lib/workouts/finish.ts` (после `tx.user.update` — строка «await tx.user.update({ where: { id: userId }, data: { xp: xpAfter…»; итог — в `meta`)
- Modify: `lib/achievements/engine.ts` (`grant()` — после начисления XP)
- Modify: `lib/progress/actions.ts` (`openDailyChestAction`), `lib/boss/actions.ts`, `lib/raid/actions.ts`, `lib/goals/actions.ts` (`openGoalChestAction`), `lib/club/task-actions.ts` (`openClubTaskChestAction`)
- Create: `lib/shop/earn.ts` (server-only), `lib/shop/earn.test.ts` (чистая часть)
- Test: `e2e/shop.spec.ts` (создать: блок «монеты»)

**Interfaces:**
- Consumes: Task 1 (`grantCoins`, ставки).
- Produces:
  - `FinishMeta.coins?: { total: number; items: CoinLine[] }`, `type CoinLine = { reason: CoinReason; amount: number; label: string }` (тип — в `lib/shop/coins.ts`)
  - `workoutCoinGrants(input: { workoutId: string; day: string; workingSets: number; paidToday: number; records: { exerciseId: string; exerciseName: string }[]; streakWeek: string | null; streak: number; levelBefore: number; levelAfter: number }): CoinGrant[]` — чистая (`lib/shop/coins.ts`); ключи `workout:<id>` (meta `{ day }`), `record:<workoutId>:<exerciseId>`, `streakw:<week>`, `level:<N>`
  - `levelUpGrants(xpBefore: number, xpAfter: number): CoinGrant[]` (через `levelProgress`)
  - ответы сундуков: `{ ok: true; amount: number; coins: number }` (у ежедневного — поле `coins` в `OpenChestResult`)

- [ ] **Step 1: Тесты** `lib/shop/coins.test.ts` (дописать): `workoutCoinGrants` при `paidToday: 2` не содержит `WORKOUT`, но содержит рекорды; при `streakWeek: null` нет `STREAK_WEEK`; ключи — точно по формату выше; `levelUpGrants` при переходе 4→6 даёт `level:5` и `level:6`.
- [ ] **Step 2:** запустить — FAIL.
- [ ] **Step 3:** реализовать. В `finishWorkout`: `workingSets` — выполненные рабочие подходы (`completedAt && !isWarmup && reps > 0`); `day` — местный день `finishedAt` в `tz` (есть `localDay`/аналог в `lib/progress` — использовать существующий); `paidToday` — `count(*) FROM "CoinTx" WHERE "userId"=… AND reason='WORKOUT' AND meta->>'day' = day` (после `tx.user.update`, строка пользователя уже заблокирована); `streakWeek` — `week`, если `weekCount >= STREAK_WEEK_TARGET`; уровни — `levelProgress(user.xp).level` → `levelProgress(xpAfter).level`. Ачивочные монеты и уровни от XP ачивок начисляет `grant()`: на каждую ачивку `ACHIEVEMENT` с ключом `ach:<code>` и `achievementCoins(xpReward)`, плюс `levelUpGrants(xpДо, xpПосле)`. `FinishMeta.coins` собрать из вставленных грантов тренировки + ачивок этой тренировки (подписи — `coinLabel` из Task 4 пока не нужна: `label` здесь — «Тренировка», «Рекорд: <упражнение>», «Неделя серии», «Уровень N», «Ачивка: <название>»). Сундуки: ключи `chest:daily:<день>`, `chest:boss:<неделя>`, `chest:raid:<raidId>`, `chest:goal:<goalId>`, `chest:clubtask:<taskId>` плюс `levelUpGrants` от их XP; в той же транзакции, что XP.
- [ ] **Step 4:** `npx vitest run lib/shop` — PASS.
- [ ] **Step 5: e2e** `e2e/shop.spec.ts` (`addFlagUser("shop", login)` в `beforeEach`):
  - «workout pays 10 coins and records add 5»: `quickWorkout` с 3 подходами нового упражнения (первый результат — не рекорд) → `coinTx` содержит `WORKOUT 10`; вторая тренировка с большим весом → `RECORD 5`.
  - «third workout of the day pays nothing for the workout»: 3 тренировки → ровно две записи `WORKOUT`.
  - «offline workout of yesterday counts against yesterday»: две тренировки сегодня, затем тренировка с `finishedAt` вчера (через `withDb`-подготовку или офлайн-финиш с устройства, как в `e2e/offline.spec.ts`) → третья запись `WORKOUT` есть.
  - «repeat finish does not double coins»: повторный `finishWorkout` того же id (повтор отправки офлайн-очереди) → одна запись `workout:<id>`.
- [ ] **Step 6:** `npm run build && npx playwright test e2e/shop.spec.ts --workers=8` — PASS; затем существующие `e2e/daily-chest.spec.ts e2e/boss*.spec.ts e2e/goals.spec.ts e2e/raid*.spec.ts e2e/club-tasks.spec.ts --workers=8` — PASS; коммит `feat(shop): earn coins for workouts, chests, achievements, streak and levels`.

### Task 3: Стартовый баланс по истории

**Files:**
- Create: `lib/shop/retro.ts` (чистая), `lib/shop/retro.test.ts`, `lib/shop/retro-db.ts` (server-only)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `retroCoins(input: { workoutsPerDay: { day: string; workouts: number }[]; recordExercisesPerWorkout: number[]; achievementXp: number[]; level: number }): number` — тренировки `min(workouts, 2)·10` по дням, `recordCoins` по тренировкам, `achievementCoins` по ачивкам, `levelCoins(2…level)`, итог `min(…, RETRO_CAP)`
  - `ensureRetroCoins(userId: string): Promise<number>` — если `CoinTx` с ключом `retro` есть — вернуть 0; иначе одна транзакция: SQL по событиям **до** `User.coinsSince` (тренировки `COMPLETED` с ≥ 3 рабочими подходами по местному дню `User.timeZone`; рекорды — из `XpEvent PERSONAL_RECORD meta.records` по тренировкам; ачивки — `UserAchievement.xpReward` с `earnedAt < coinsSince`; уровень — `levelProgress` от XP на `coinsSince` = `User.xp − sum(XpEvent.amount after coinsSince)`) → `grantCoins` с `{ reason: RETRO, key: "retro", amount }` (при 0 — всё равно запись с `amount: 0`, без инкремента).

- [ ] **Step 1: Тесты** `retro.test.ts`: день с 3 тренировками даёт 20; рекорды `[5]` → 15; `achievementXp: [15, 1000]` → 3 + 50; `level: 3` → 24 + 26 = 50; огромный ввод → 3000.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. Для `amount: 0` в `grantCoins` разрешить запись нулевой суммы через отдельный параметр или прямую вставку в `ensureRetroCoins` (решение исполнителя; инкремент — только > 0).
- [ ] **Step 4:** PASS. **Step 5: e2e** (в `e2e/shop.spec.ts`): пользователь с историей, подготовленной `seedWorkouts` **до** `coinsSince` (хелпер `setCoinsSince(login, date)` в `e2e/db.ts`) → открытие `/shop` → `coinTx` содержит `RETRO` > 0, ровно одну; два параллельных `page.goto("/shop")` в двух вкладках → одна запись `retro`.
- [ ] **Step 6:** коммит `feat(shop): retro starting balance from history`.

### Task 4: Каталог, правила, покупка и надевание

**Files:**
- Create: `lib/shop/catalog.ts`, `lib/shop/catalog.test.ts`, `lib/shop/rules.ts`, `lib/shop/rules.test.ts`, `lib/shop/contrast.ts`, `lib/shop/actions.ts`, `lib/shop/access.ts`
- Create: `assets/avatars/` — 12 заглушек PNG 256×256 (силуэт на фоне цвета редкости; сгенерировать скриптом `scripts/avatar-placeholders.ts` через `next/og` `ImageResponse` или sharp, если уже в зависимостях — без новых зависимостей), `lib/shop/avatars.ts` (код → статический импорт)

**Interfaces:**
- Produces:
  - `type ItemKind = "avatar" | "frame" | "nickColor" | "theme"`, `type Rarity = "common" | "rare" | "epic" | "legendary"`, `type Acquire = "coins" | "free" | "premium" | "reward"`
  - `type ShopItem = { code: string; kind: ItemKind; name: string; rarity: Rarity; price: number; acquire: Acquire } & ({ kind: "avatar" } | { kind: "frame"; ring: string /* классы Tailwind на токенах или градиент */ } | { kind: "nickColor"; light: string; dark: string; gradient?: { light: [string, string]; dark: [string, string] } } | { kind: "theme"; light: ThemeTokens; dark: ThemeTokens })`, `type ThemeTokens = { primary: string; primaryForeground: string; ring: string; chart1: string }` (hex)
  - `SHOP_ITEMS: ShopItem[]`, `itemByCode(code: string | null | undefined): ShopItem | null`, `shopItems(kind: ItemKind): ShopItem[]` (только `coins`/`free`), `PRICES: Record<ItemKind, Partial<Record<Rarity, number>>>`
  - `contrast(fg: string, bg: string): number` (WCAG, hex), `CARD_BG = { light: string; dark: string }` — hex-эквиваленты `--card` из `app/globals.css`
  - `canBuy(item: ShopItem | null, owned: boolean, coins: number): { ok: true } | { ok: false; error: string; short?: number }` — ошибки: «Нет в продаже», «Уже куплено», «Не хватает N монет» (`short: N`)
  - `canEquip(item: ShopItem | null, kind: ItemKind, owned: boolean): boolean`
  - `requireShop(): Promise<CurrentUser>` (404 без флага), `shopAllowed(userId): Promise<boolean>`
  - `buyItemAction(code: string): Promise<{ ok: true; coins: number } | { ok: false; error: string }>`
  - `equipItemAction(kind: ItemKind, code: string | null): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Тесты** `catalog.test.ts`: коды уникальны; `price === PRICES[kind][rarity]` у `coins`, `0` у `free`; аватаров 12, `free` из них 3, у каждого есть картинка в `avatarImage`; рамок 6, цветов 8, тем 5; тексты без «флаг»/«админ»; `contrast(nick.light, CARD_BG.light) >= 4.5` и `dark` — у всех цветов ника и у каждого цвета градиента; `contrast(theme.light.primary, CARD_BG.light) >= 3`, `contrast(primaryForeground, primary) >= 4.5` в обеих темах. `rules.test.ts`: `canBuy(null, …)` → «Нет в продаже»; premium-предмет → «Нет в продаже»; купленный → «Уже куплено»; 100 монет при цене 150 → `short: 50`; `canEquip` чужого вида → false; `free` без владения → true.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. Покупка — одна транзакция: `updateMany({ where: { id, coins: { gte: price } }, data: { coins: { decrement: price } } })` (0 → «Не хватает монет»), `userItem.create` (P2002 → бросить и вернуть «Уже куплено»), `coinTx.create({ reason: PURCHASE, amount: -price, key: "buy:<code>" })`; затем `queueGoal("shop_buy")` (в `lib/analytics/goals.ts` добавить `shop_buy`, `shop_open`) и `revalidatePath("/shop")`. Надевание — `canEquip`, `user.update` поля по виду (`avatarCode`…), `revalidatePath("/", "layout")`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: e2e** (в `e2e/shop.spec.ts`): «two parallel purchases with coins for one»: `setCoins(login, 150)`, два `buyItemAction` одновременно через две вкладки (кнопки «Купить» в двух страницах) → `userItems` содержит один из двух, `coinBalance` = 0, во второй вкладке видно «Не хватает».
- [ ] **Step 6:** коммит `feat(shop): catalog, purchase and equip`.

### Task 5: Показ косметики и тема

**Files:**
- Create: `components/shop/player-avatar.tsx`, `components/shop/player-name.tsx`, `lib/shop/cosmetics.ts`, `lib/shop/cosmetics.test.ts`, `lib/shop/theme-style.ts`
- Modify: запросы ника — `lib/social/queries.ts` (`getLeague`, `getFriends`, лента через `feedPage`), `lib/social/feed.ts`, `lib/guild/queries.ts` (`getMyGuild`), `lib/club/queries.ts` (`getClubRating`), `lib/club/feed.ts`, дашборд «Друзья недавно»; компоненты — `components/social/league-table.tsx`, `activity-feed.tsx`, `friends-panel.tsx`, `components/guild/guild-members.tsx`, `components/club/club-rating.tsx`, `club-feed.tsx`, `components/app/user-menu.tsx`
- Modify: `app/(app)/layout.tsx` (тема)

**Interfaces:**
- Consumes: Task 4 (`itemByCode`, `ShopItem`), `getFlagStates`/`flagOn` (`lib/flags`).
- Produces:
  - `type Cosmetics = { avatar: string | null; frame: string | null; nickColor: string | null }`
  - `visibleCosmetics(row: { id: string; avatarCode: string | null; frameCode: string | null; nickColorCode: string | null }, shop: FlagState | null): Cosmetics` — флаг владельца выключен → все `null`; неизвестный код → `null`
  - `cosmeticsLoader(): Promise<(row) => Cosmetics>` (server-only: один `getFlagStates()` на запрос)
  - `<PlayerAvatar nickname: string; cosmetics?: Cosmetics; size?: "sm" | "md" | "lg" />`, `<PlayerName nickname: string; color?: string | null; className? />`
  - `themeStyle(item: ShopItem & { kind: "theme" }): string` — CSS `:root{--primary:…;…}.dark{…}`; layout `(app)` рендерит `<style>` при надетой теме и флаге владельца

- [ ] **Step 1: Тесты** `cosmetics.test.ts`: флаг выключен (`enabled: false`, пользователь в списке) → пусто; неизвестный код → `null`, остальные сохраняются; `themeStyle` содержит `--primary` и блок `.dark`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать; запросы добавляют `"avatarCode", "frameCode", "nickColorCode"` в те же SELECT, наружу — уже `cosmetics: Cosmetics` (коды других полей не уходят в клиент). Без аватара — кружок с первой буквой ника (как сейчас в `user-menu`). Градиент — `bg-clip-text text-transparent` с инлайн-стилем и `@supports`-запасным сплошным цветом; цвет выбирается по теме через CSS-переменные `--nick-light/--nick-dark` и класс `dark:`.
- [ ] **Step 4:** PASS; `npm run typecheck && npm run lint`.
- [ ] **Step 5: e2e**: «friend sees my avatar and nick color in league and feed» (`makeFriends`, `setCoins`, купить и надеть аватар и цвет через UI, у друга на `/leaderboard` и `/friends` — `img` с alt названия аватара и ник с атрибутом `data-nick-color=<код>`); «owner without shop flag shows no cosmetics» (снять пользователя из списка флага `resetFlag`/`setFlag` — проверить, что у друга аватара нет); «theme changes the cabinet accent» (купить тему, надеть → `getComputedStyle(document.documentElement).getPropertyValue("--primary")` равен hex темы).
- [ ] **Step 6:** коммит `feat(shop): show avatar, frame, nick color and theme`.

### Task 6: Страница магазина и строки «+N монет»

**Files:**
- Create: `app/(app)/shop/page.tsx`, `components/shop/shop-view.tsx` (вкладки, карточки), `components/shop/item-dialog.tsx`, `components/shop/coin-history.tsx`, `components/shop/earn-dialog.tsx`, `components/shop/retro-banner.tsx`, `lib/shop/queries.ts`, `lib/shop/labels.ts`, `lib/shop/labels.test.ts`
- Modify: `components/app/nav.ts` + `nav-links.tsx` (пункт «Магазин» после «Ачивок» при `useFlag("shop")`, иконка `Store`/`Coins`), `components/app/user-menu.tsx` (пункт с балансом), сводка тренировки (компонент, рисующий `FinishMeta` — строка «+N монет»), `components/progress/chest-dialog.tsx` (или общий `ChestDialog`: «+N монет»), тост ачивки (`+achievementCoins(xpReward)`), `lib/changelog/releases.ts` (новый релиз «2026-11-shop» сверху: `new: [{ text: "Магазин: монеты за тренировки и косметика — аватары, рамки, цвет ника и темы", href: "/shop", flag: "shop" }]`)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `getShopData(userId): Promise<{ coins: number; retro: number | null; owned: string[]; equipped: { avatar, frame, nickColor, theme }; history: { amount: number; reason: CoinReason; key: string; meta: unknown; createdAt: Date }[] }>` (история — 50 последних)
  - `coinLabel(tx: { reason: CoinReason; key: string; meta: unknown }): string` — «Тренировка», «Рекорд: <упражнение>» (из meta), «Сундук босса», «Ачивка: <title>», «Неделя серии», «Уровень N», «Стартовый баланс», «Покупка: <название предмета>» (неизвестный код — код)
  - `/shop?tab=avatar|frame|nickColor|theme`

- [ ] **Step 1: Тесты** `labels.test.ts`: каждая причина даёт ожидаемую подпись; `PURCHASE` с ключом `buy:unknown` → «Покупка: unknown».
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. Страница: `requireShop()`, `ensureRetroCoins`, `getShopData`, `queueGoal("shop_open")` один раз за визит не нужен — цель с клиента `reachGoal("shop_open")` при монтировании. Карточка недоступного: текст «Не хватает N». Диалог: превью на себе (`PlayerAvatar`/`PlayerName` с выбранным предметом; тема — кнопка и полоска в цветах темы), «Купить за N» → «Надеть» / «Снять»; `haptic("success")` после покупки. «Как заработать» — таблица из `COIN_RATES`. Плашка стартового баланса — при `retro > 0` и без `localStorage["hf:shop-retro-seen"]` (try/catch).
- [ ] **Step 4:** PASS. **Step 5: e2e**: «shop shows balance, earn table and history»; «summary shows +N coins after a workout» (`quickWorkout` → текст «+10 монет» в сводке); «not enough coins» (баланс 0 → у платного аватара «Не хватает 150»); «retro banner shows once» (после закрытия и перезагрузки нет); «shop is 404 without the flag».
- [ ] **Step 6:** коммит `feat(shop): shop page, coin history and coin lines`.

### Task 7: Выгрузка, удаление аккаунта, документация

**Files:**
- Modify: `lib/account/export.ts`, `lib/account/export-queries.ts`, `lib/account/export.test.ts` (раздел `shop`: `coins`, `items: { code, name, acquiredAt }[]`, `coinHistory: { amount, reason, createdAt }[]`), `EXPORT_SECTIONS`
- Modify: `e2e/account-data.spec.ts` (удаление пользователя с покупками и журналом проходит; JSON содержит `shop.coins`)
- Modify: `CLAUDE.md` (пункт «Магазин косметики» по образцу соседних: модель, ставки, ключи, флаг по владельцу, `ensureRetroCoins`, хелперы e2e), `app/(marketing)/privacy/page.tsx` — если там перечислены категории данных профиля, добавить «монеты и купленные предметы»

- [ ] **Step 1:** тест `export.test.ts` — раздел `shop` присутствует, названия предметов из каталога, неизвестный код — код. **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** `npm run build && npx playwright test e2e/account-data.spec.ts e2e/shop.spec.ts --workers=8` — PASS.
- [ ] **Step 6:** полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — зелёный (флейки перепроверить отдельно); коммит `feat(shop): export and docs`; финальное ревью ветки; `git switch release/2026-11-shop && git merge --no-ff feat/cosmetics-shop`, ветку фичи удалить.
