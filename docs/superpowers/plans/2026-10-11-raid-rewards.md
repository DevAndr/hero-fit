# Рейды: ачивки, титулы, лента, итоги, лендинг — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Победы в рейдах дают ачивки и титулы, видны в ленте и итогах недели; гильдии и рейды — на лендинге, вступление в гильдию — из Telegram.

**Architecture:** Всё — расширения существующих механизмов по образцу личного босса: лестницы ачивок в `definitions.ts` со счётчиками в `getAchievementStats`, титулы `ach:` в каталоге, поле `raidDefeated` в `toFeedEntry` из `XpEvent.meta.raid`, необязательный блок `raid` в `RecapData`, раздел лендинга, `startTarget` для `guild_`.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Playwright, Motion (лендинг).

**Spec:** `docs/superpowers/specs/2026-10-11-raid-rewards-design.md`

## Global Constraints

- Категория `AchievementCategory.GUILD`; лестницы `raid:N` (1, 5, 10, 25; «Рейдер» / «Рейдер ×N»; `30 + 5·N` XP) и `raidmvp:N` (1, 5, 10; «MVP рейда» / «MVP рейда ×N»; `40 + 5·N` XP).
- Победа для ачивки — есть `RaidReward` игрока; MVP — `RaidWeek.mvpUserId` = игрок.
- Титулы: `ach:raid:25` — «Гроза рейдов», `ach:raidmvp:10` — «Сердце гильдии».
- Чужие ачивки в транзакции победы не считаются.
- Строка ленты: «Гильдия «<название>» повергла: <Древний …>»; гильдия или рейд удалены — строки нет.
- `RecapData.version` не меняется; блок `raid` необязательный.
- Утверждения на лендинге — только существующие механики; анимации — с «уменьшить движение», числа — в `sr-only`.
- `startTarget("guild_<код>")` → `/guild/join/<КОД>` (верхний регистр через `normalizeFriendCode`).

## Review Focus

- Игрок вышел из гильдии, а его старая победная тренировка в ленте друзей → строка с названием гильдии на момент показа; гильдия удалена → строки нет, лента не падает.
- Игрок бил в двух гильдиях за неделю (перешёл) → в итогах рейд с бóльшим его уроном.
- Неделя итогов без рейда (нет ударов) → блока нет, старые снимки `WeeklyRecap` без поля читаются.
- `start_param` вида `guild_` с мусором/пустым кодом → дашборд, а не 404-цикл.
- Ачивка «Рейдер» второму бившему появляется и без открытия сундука — при ежедневном входе.

---

### Task 1: Ачивки и титулы за рейды

**Files:**
- Modify: `prisma/schema.prisma` (`AchievementCategory.GUILD // победы в рейдах гильдии`), миграция `npx prisma migrate dev --name raid_achievements` + `npx prisma generate`
- Modify: `lib/achievements/definitions.ts` (`AchievementStats.raidWins`, `raidMvps`, нули в пустой статистике, две лестницы после «Босс недели»)
- Modify: `lib/achievements/engine.ts` (`getAchievementStats`: `raidReward.count({ where: { userId } })`, `raidWeek.count({ where: { mvpUserId: userId } })`)
- Modify: `lib/titles/catalog.ts` (`ACHIEVEMENT_TITLES` + 2 строки)
- Modify: места, где перечисляются категории для UI (найти `"BOSS"` в `components/achievements/*`/`lib/achievements/*` — подпись категории «Гильдия»)
- Test: `lib/achievements/definitions.test.ts`, `lib/titles/catalog.test.ts`

**Interfaces:**
- Produces: `AchievementStats.raidWins: number`, `AchievementStats.raidMvps: number`; коды `raid:N`, `raidmvp:N`; титулы `ach:raid:25`, `ach:raidmvp:10`.

- [ ] **Step 1: Failing tests** — в `definitions.test.ts` блок `describe("raids")`:
  - `codesOf("raid", { raidWins: 5 })` → `["raid:1", "raid:5"]`; `codesOf("raid", { raidWins: 0 })` → `[]`;
  - `earnedAchievements({ ...empty, raidWins: 1 }).find((a) => a.code === "raid:1")` → `{ category: "GUILD", title: "Рейдер", xpReward: 35 }`; `raid:5` → title «Рейдер ×5»;
  - `nextGoals({ ...empty, raidWins: 5 })` содержит цель `raid:10`;
  - `codesOf("raidmvp", { raidMvps: 1 })` → `["raidmvp:1"]`, title «MVP рейда», `xpReward: 45`.
  
  В `catalog.test.ts`: `titleLabel("ach:raid:25") === "Гроза рейдов"`, `titleLabel("ach:raidmvp:10") === "Сердце гильдии"`; `availableTitles({ achievementCodes: ["raid:25"], bossWins: {} })` содержит `ach:raid:25`.
- [ ] **Step 2: Run** `npx vitest run lib/achievements lib/titles` — Expected: FAIL.
- [ ] **Step 3: Implement** (схема, лестницы через тот же `def(n, {...})`, что у `boss:N`, описания: `raid` — «Победить рейд-босса с гильдией» / «Победить N рейд-боссов с гильдией» (`plural`), `raidmvp` — «Нанести больше всех урона в победном рейде» / «Стать MVP N победных рейдов»).
- [ ] **Step 4: Run** `npx vitest run lib/achievements lib/titles && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Extend e2e** `e2e/raids.spec.ts`, сценарий «victory…»: после победы у B (добил) в `/achievements` есть «Рейдер»; у A после открытия сундука — «Рейдер» и «MVP рейда» (проверка через хелпер `achievementCodes(login)` в `e2e/db.ts`, если его нет — добавить: коды `UserAchievement` пользователя).
- [ ] **Step 6: Run** `npm run build && npx playwright test e2e/raids.spec.ts e2e/achievements*.spec.ts --workers=8` — Expected: PASS.
- [ ] **Step 7: Commit** `feat(raid): achievements and titles`

---

### Task 2: Победа рейда в ленте

**Files:**
- Modify: `lib/social/feed.ts` (`FeedRow.meta.raid?: { raidId: string; code: string; defeated: boolean }`, `FeedRow.raidGuild: string | null`, `FeedEntry.raidDefeated: { boss: string; guild: string } | null`)
- Modify: `lib/social/queries.ts` (`feedPage` SQL: колонка `"raidGuild"` — `(SELECT g.name FROM "RaidWeek" r JOIN "Guild" g ON g.id = r."guildId" WHERE r.id = x.meta->'raid'->>'raidId')`)
- Modify: `components/social/activity-feed.tsx` (строка с иконкой `Shield`, `text-destructive`)
- Test: `lib/social/feed.test.ts`

**Interfaces:**
- Consumes: `raidBossName` (`lib/raid/rules.ts`).
- Produces: `FeedEntry.raidDefeated`.

- [ ] **Step 1: Failing tests** в `feed.test.ts`: строка с `meta.raid = { raidId: "r", code: "golem", defeated: true }`, `raidGuild: "Молоты"` → `raidDefeated` `{ boss: "Древний Железный Голем", guild: "Молоты" }`; `defeated: false` → `null`; `raidGuild: null` → `null`; без `meta.raid` → `null`.
- [ ] **Step 2: Run** `npx vitest run lib/social` — FAIL.
- [ ] **Step 3: Implement** `toFeedEntry` + SQL + строка в карточке: «Гильдия «{guild}» повергла: {boss}».
- [ ] **Step 4: Run** `npx vitest run lib/social && npm run typecheck` — PASS.
- [ ] **Step 5: Extend e2e** «victory…»: на `/guild` у A регион «Лента гильдии» содержит «повергла: Древний».
- [ ] **Step 6: Run** `npm run build && npx playwright test e2e/raids.spec.ts e2e/friends*.spec.ts e2e/guilds.spec.ts --workers=8` — PASS.
- [ ] **Step 7: Commit** `feat(raid): raid victory in the feed`

---

### Task 3: Рейд в итогах недели

**Files:**
- Modify: `lib/recap/types.ts` (`RecapRaid`, `RecapData.raid?`, `RecapInput.raid?: RecapRaid | null`)
- Modify: `lib/recap/build.ts` (`raid: input.raid ?? undefined`)
- Modify: `lib/recap/queries.ts` (`loadRecapInput` → `weekRaid(userId, start, end)`)
- Modify: `components/recap/recap-view.tsx` (блок `Raid`)
- Modify: `e2e/db.ts` (`seedRaidHits(login: string, week: string, hp: number, defeated: boolean)` — рейд гильдии игрока на неделю `week` через `createRaid`-логику + `RaidHit` на каждую завершённую тренировку игрока этой недели с уроном 100 за выполненный рабочий подход)
- Test: `lib/recap/build.test.ts`, `e2e/raids.spec.ts`

**Interfaces:**
- Produces: `type RecapRaid = { name: string; code: string; defeated: boolean; damage: number; hp: number; mine: number; place: number; members: number; mvp: boolean }`;
  `weekRaid(userId: string, start: Date, end: Date): Promise<RecapRaid | null>` — рейды с `startsAt ∈ [start, end)`, где у игрока есть `RaidHit`; при нескольких — с наибольшим `mine`; `place` — 1 + число бивших с бóльшим суммарным уроном; `members` — число бивших; `mvp` — `mvpUserId === userId`.

- [ ] **Step 1: Failing test** в `build.test.ts`: вход с `raid: { name: "Древний Железный Голем", code: "golem", defeated: true, damage: 4000, hp: 3600, mine: 1200, place: 2, members: 3, mvp: false }` → `buildRecap(...).raid` равен ему; вход без `raid` → поля `raid` нет (`"raid" in data === false`).
- [ ] **Step 2: Run** `npx vitest run lib/recap` — FAIL.
- [ ] **Step 3: Implement** типы, `buildRecap`, `weekRaid` (один SQL: суммы по игрокам в рейдах окна, где есть мои удары), блок `Raid` в `recap-view.tsx`: заголовок «Рейд гильдии» (регион `aria-label="Рейд гильдии"`), `BossSprite raid`, имя, «Повержен» / «Устоял», «{damage} / {hp}», «мой вклад {mine} · {place}-е место из {members}», 👑 с sr-only «MVP» при `mvp`.
- [ ] **Step 4: Run** `npx vitest run lib/recap && npm run typecheck` — PASS.
- [ ] **Step 5: e2e** «recap shows the guild raid»: A в гильдии (через `twoInGuild`), `week = mondayWeeksAgo(2)`, `seedRecapWeek(a.login, week, [<одна тренировка как в recap.spec: press({ day: 1 })>])`, `seedRaidHits(a.login, week, 300, true)` → `/recap?week=<week>` (как открывает `recap.spec.ts`) — регион «Рейд гильдии» содержит «Повержен» и «мой вклад».
- [ ] **Step 6: Run** `npm run build && npx playwright test e2e/raids.spec.ts e2e/recap.spec.ts --workers=8` — PASS.
- [ ] **Step 7: Commit** `feat(raid): guild raid in the weekly recap`

---

### Task 4: Telegram-ссылка в гильдию

**Files:**
- Modify: `lib/telegram/init-data.ts` (`startTarget`), `lib/telegram/links.ts` (`telegramGuildJoinUrl`)
- Modify: `components/guild/guild-members.tsx` (`GuildInvite` — проп `telegramUrl: string | null`), `app/(app)/guild/page.tsx` (передать `telegramGuildJoinUrl(guild.code, env.TELEGRAM_BOT_USERNAME)` — как берёт бота страница тренера)
- Test: `lib/telegram/init-data.test.ts`, `e2e/telegram-app.spec.ts`

**Interfaces:**
- Produces: `telegramGuildJoinUrl(code: string, botUsername: string | undefined): string | null` → `https://t.me/<бот>?startapp=guild_<код>`.

- [ ] **Step 1: Failing tests**: `startTarget("guild_abcdefgh") === "/guild/join/ABCDEFGH"`; `startTarget("guild_") === "/dashboard"`; `startTarget("join_ABCDEFGH")` по-прежнему `/coach/join/ABCDEFGH`; `telegramGuildJoinUrl("ABCDEFGH", "bot") === "https://t.me/bot?startapp=guild_ABCDEFGH"`, без бота — `null` (тест в `lib/telegram/links.test.ts`, создать при отсутствии).
- [ ] **Step 2: Run** `npx vitest run lib/telegram` — FAIL.
- [ ] **Step 3: Implement**; в `GuildInvite` — второе поле «Ссылка для Telegram» (`textbox` с этим именем) и «Копировать», только при `telegramUrl`.
- [ ] **Step 4: Run** `npx vitest run lib/telegram && npm run typecheck` — PASS.
- [ ] **Step 5: e2e** в `telegram-app.spec.ts` по образцу «coach invite via start_param»: гильдия создана другим игроком (`player` + `createGuild` из `e2e/guild-helpers.ts`, код — `guildOf`), `registerViaTelegram(page, newTelegramId(), "Маша", \`guild_${code}\`)` → заголовок «Вступить в гильдию «…»?». На `/guild` главы — поле «Ссылка для Telegram» со значением `https://t.me/hero_fit_e2e_bot?startapp=guild_<код>`.
- [ ] **Step 6: Run** `npm run build && npx playwright test e2e/telegram-app.spec.ts e2e/guilds.spec.ts --workers=8` — PASS.
- [ ] **Step 7: Commit** `feat(guild): telegram invite link`

---

### Task 5: Лендинг «Гильдии и рейды»

**Files:**
- Create: `components/marketing/raid-infographics.tsx`
- Modify: `app/(marketing)/page.tsx` (раздел `#guilds` после `#bestiary`, `FREE_PLAN` строка, 2 вопроса FAQ — тексты из спеки), `components/marketing/site-header.tsx`, `site-footer.tsx` (пункт «Гильдии» → `/#guilds`)
- Test: `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `Reveal`, `CountUp`, `useSeen`, `MotionProvider` (`components/marketing/motion.tsx`), `BossSprite` (`raid`).

- [ ] **Step 1: Failing e2e** «guilds block: header link, raid infographic, CTA»: `/` → навигация «Разделы сайта» содержит ссылку «Гильдии» с `href="/#guilds"`; регион с заголовком «Гильдии и рейды» виден, содержит «до 10» и «MVP»; кнопка «Собрать гильдию» ведёт на `/register`; в FAQ есть вопрос «Что такое гильдия и рейд?».
- [ ] **Step 2: Run** `npm run build && npx playwright test e2e/landing.spec.ts --project=desktop` — FAIL.
- [ ] **Step 3: Implement** раздел (по образцу блока `#coaches`: eyebrow, заголовок `font-display`, 3 тезиса, инфографика справа) и `RaidInfographic` (рейд-босс со спрайтом и аурой, полоса HP, 4 участника — вымышленные ники, полоски вклада, 👑 у первого; `aria-hidden`, текстовое описание в `sr-only`).
- [ ] **Step 4: Run** `npm run build && npx playwright test e2e/landing.spec.ts e2e/animations.spec.ts` — PASS.
- [ ] **Step 5: Commit** `feat(landing): guilds and raids section`

---

### Task 6: Документация и полная проверка

- [ ] **Step 1:** CLAUDE.md — в абзац «Рейд-босс гильдии» добавить: ачивки `raid:N`/`raidmvp:N` (категория `GUILD`, выдача бившим — в `openRaidChestAction`/вход/тренировка), титулы, `FeedEntry.raidDefeated`, `RecapData.raid` (`weekRaid`), `guild_` в `startTarget`, `telegramGuildJoinUrl`, раздел лендинга `#guilds`; e2e-хелперы `seedRaidHits`/`achievementCodes`.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное.
- [ ] **Step 3: Commit** `docs: raid rewards in CLAUDE.md`
