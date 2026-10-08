# Босс недели — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У каждого пользователя свой босс недели; рабочие подходы наносят урон, победа даёт сундук с XP, ачивку и запись в ленте.

**Architecture:** Хранится только `BossWeek` (HP фиксируется при создании); урон всегда считается из подходов и `XpEvent.meta.records`. Чистая логика — `lib/boss/*.ts` с юнит-тестами; запросы — `lib/boss/queries.ts`; победа ставится в транзакции `finishWorkout`; UI — `components/boss/*`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + PostgreSQL, Vitest, Playwright, Tailwind/shadcn (Base UI), Web Animations API.

**Spec:** `docs/superpowers/specs/2026-10-08-weekly-boss-design.md`

## Global Constraints

- Неделя — пн 00:00 … вс 24:00 в `User.timeZone`, ключ — `weekKey(date, tz)` из `lib/progress/weekly-streak.ts`.
- Урон подхода: рабочий выполненный (`isWarmup = false`, `completedAt` не null) — 100; RIR 0 или 1 — +50; крит — +100 за каждое различное `exerciseId` в `meta.records` события `WORKOUT_COMPLETED`; разминка — 0.
- Учитываются только тренировки `status = 'COMPLETED'`, неделя тренировки — по её `finishedAt`.
- HP: `max(1500, roundTo100(avgDamage4 × 1.1))`, среднее — по последним 4 неделям до недели босса, в которых урон > 0.
- Награда: `rewardXp = hp / 20`, `XpReason.BOSS_REWARD` (в лигу не входит).
- Ачивки: категория `BOSS`, лестница `boss:N` — 1, 5, 10, 25, 50.
- Рабочие имена: Железный Голем (`golem`), Ледяной Тролль (`troll`), Огненный Дракон (`dragon`), Теневой Рыцарь (`knight`); спрайты — `assets/icons/game/boss_<code>.png`, пока их нет — заглушка.
- Цвета — только семантические токены (`app/globals.css`); анимации конечные, «уменьшить движение» — сразу итог.
- Тексты — без рода там, где субъект — пользователь («⚔ Босс повержен: Железный Голем», не «победил/победила»).

## Review Focus

1. Тренировка, завершённая в вс 23:50 по местному времени, бьёт босса этой недели, а не следующей (граница — `User.timeZone`, а не UTC сервера) — тест в Task 2 (`weekDamage` по границам пояса).
2. Двойное нажатие «Открыть сундук босса» / две вкладки — XP начисляется один раз — e2e в Task 4.
3. Снятие отметки с подхода в редакторе возвращает HP; разминочный подход урона не наносит — e2e в Task 5.
4. Тренировка прошлой недели (в т. ч. отправленная из офлайна задним числом — `finishWorkout` берёт неделю по своему `now`) не трогает босса текущей недели — e2e в Task 4 («last week's workout does not hit this week's boss»).
5. Повторное завершение / перезагрузка сводки не создаёт второй победы и второго уведомления — e2e в Task 4 (после победы перезагрузить сводку: одно уведомление «⚔ Босс повержен», одна строка `BossWeek` с `defeatedAt`).

---

### Task 1: Схема, список боссов и чистые расчёты

**Files:**
- Modify: `prisma/schema.prisma` (модель `BossWeek`, связь в `User`, `XpReason.BOSS_REWARD`, `AchievementCategory.BOSS`, `NotificationType.BOSS`)
- Create: `prisma/migrations/<ts>_weekly_boss/` (через `npx prisma migrate dev --name weekly_boss`, затем `npx prisma generate`)
- Create: `lib/boss/bosses.ts`, `lib/boss/damage.ts`
- Test: `lib/boss/damage.test.ts`, `lib/boss/bosses.test.ts`
- Modify: `components/achievements/category.ts` (подпись `BOSS: "Боссы"`)

**Interfaces:**
- Produces:
  - `type BossCode = "golem" | "troll" | "dragon" | "knight"`; `BOSSES: { code: BossCode; name: string }[]`; `bossForWeek(week: string): BossCode` (по `weeksSinceEpoch(week) % BOSSES.length`, эпоха — понедельник `2024-01-01`); `bossName(code: string): string` (неизвестный код → «Босс»).
  - `SET_DAMAGE = 100`, `FAILURE_BONUS = 50`, `CRIT_DAMAGE = 100`, `MIN_HP = 1500`.
  - `setDamage(rir: number | null): number`.
  - `workoutDamage(sets: { rir: number | null }[], critExercises: number): { damage: number; crits: number }`.
  - `bossHp(pastWeeklyDamage: number[]): number` — на вход урон последних недель (любой длины, берутся первые 4 ненулевых).
  - `rewardXp(hp: number): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// damage.test.ts
expect(setDamage(null)).toBe(100); expect(setDamage(2)).toBe(100);
expect(setDamage(1)).toBe(150); expect(setDamage(0)).toBe(150);
expect(workoutDamage([{ rir: null }, { rir: 0 }, { rir: 3 }], 2)).toEqual({ damage: 550, crits: 2 });
expect(bossHp([])).toBe(1500);
expect(bossHp([1000, 0, 1200])).toBe(1500);          // 1100 × 1,1 = 1210 < минимума
expect(bossHp([2000, 0, 2400, 1600, 2000, 9000])).toBe(2200); // первые 4 ненулевых: 2000 × 1,1
expect(bossHp([2050])).toBe(2300);                   // 2255 → до сотни
expect(rewardXp(1500)).toBe(75); expect(rewardXp(2300)).toBe(115);
// bosses.test.ts
expect(bossForWeek("2024-01-01")).toBe("golem");
expect(bossForWeek("2024-01-08")).toBe("troll");
expect(bossForWeek("2024-01-29")).toBe("golem");     // по кругу из 4
expect(bossName("dragon")).toBe("Огненный Дракон"); expect(bossName("x")).toBe("Босс");
```

- [ ] **Step 2: Run** `npx vitest run lib/boss` — Expected: FAIL (модулей нет)
- [ ] **Step 3: Schema** — `BossWeek` ровно как в спеке (раздел «Данные»), `User.bossWeeks BossWeek[]`; три значения enum. Migrate + generate.
- [ ] **Step 4: Implement** `lib/boss/bosses.ts`, `lib/boss/damage.ts` (округление до сотни — `Math.round(x / 100) * 100`).
- [ ] **Step 5: Run** `npx vitest run lib/boss && npm run typecheck` — Expected: PASS
- [ ] **Step 6: Commit** `feat(boss): schema, boss roster and damage/HP math`

---

### Task 2: Запросы босса

**Files:**
- Create: `lib/boss/queries.ts` (server-only)
- Test: проверяется через страницы в Task 4 (запросы без UI не тестируются отдельно — как остальные `queries.ts` проекта)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `weekDamage(client, userId, week: string, tz: string, excludeWorkoutId?: string): Promise<{ damage: number; crits: number }>` — один SQL: подходы завершённых тренировок с `finishedAt` в границах недели (`[понедельник 00:00, +7 дней)` в `tz`, как `weekBounds` в `lib/social/queries.ts`) + число различных `exerciseId` из `meta->'records'` их событий `WORKOUT_COMPLETED`.
  - `getOrCreateBossWeek(client, userId, week, tz): Promise<BossWeek>` — `upsert` по `(userId, week)`; при создании HP = `bossHp(урон 8 предыдущих недель, от ближней к дальней)`, `bossCode = bossForWeek(week)`.
  - `type BossView = { week: string; code: string; name: string; hp: number; damage: number; crits: number; defeatedAt: string | null; rewardXp: number; rewardOpened: boolean; endsAt: string }`.
  - `getBossView(userId: string, tz: string, now = new Date(), excludeWorkoutId?: string): Promise<BossView>` — текущая неделя.
  - `bossWins(client, userId): Promise<number>` — число `BossWeek` с `defeatedAt`.

- [ ] **Step 1:** Implement по интерфейсу; `client` — `Prisma.TransactionClient | typeof db`.
- [ ] **Step 2: Run** `npm run typecheck` — Expected: PASS
- [ ] **Step 3: Commit** `feat(boss): boss week queries`

---

### Task 3: Урон и победа при завершении тренировки, ачивки

**Files:**
- Modify: `lib/workouts/finish.ts` (`FinishMeta.boss`, расчёт до `evaluateAchievements`)
- Modify: `lib/achievements/definitions.ts` (`AchievementStats.bossWins`, лестница `boss:N`), `lib/achievements/engine.ts` (`getAchievementStats` берёт `bossWins`), `lib/achievements/icons.ts` (`boss` → `default`)
- Modify: `lib/notifications/*` — уведомление `BOSS` через существующий `notify()` (push по `notifyAchievements`)
- Test: `lib/achievements/definitions.test.ts` (лестница), `e2e/boss.spec.ts`

**Interfaces:**
- Consumes: Task 1, 2.
- Produces: `FinishMeta.boss?: { code: string; damage: number; crits: number; hpBefore: number; hpAfter: number; hp: number; defeated: boolean }` (`hpBefore`/`hpAfter` — оставшееся HP до/после этой тренировки, не меньше 0; `defeated` — победа случилась этой тренировкой).

- [ ] **Step 1: Failing unit test** — `earnedAchievements({ ...base, bossWins: 5 })` содержит коды `boss:1`, `boss:5`, не содержит `boss:10`; `nextGoals` при `bossWins: 0` содержит цель `boss:1` с `target 1`.
- [ ] **Step 2: Run** `npx vitest run lib/achievements` — Expected: FAIL
- [ ] **Step 3:** Лестница: `fixed: [1, 5, 10, 25, 50]`, категория `BOSS`, `title` — `n === 1 ? "Победитель босса" : \`Охотник на боссов ×${n}\``, `description` — «Победить босса недели» / «Победить ${n} боссов недели», `xpReward: 30 + n * 5`.
- [ ] **Step 4:** В `finishWorkout` после записи рекордов и до `evaluateAchievements`: неделя = `weekKey(now, tz)`; `getOrCreateBossWeek`; `before = weekDamage(..., excludeWorkoutId = workoutId)`; урон этой тренировки = `workoutDamage(рабочие выполненные подходы, distinct exerciseId в records)`; если `before + this ≥ hp` — условный `updateMany({ where: { id, defeatedAt: null }, data: { defeatedAt: now } })`, `defeated = count === 1`, при победе — `notify(BOSS, "⚔ Босс повержен: <имя>", "Сундук ждёт на дашборде · +<rewardXp> XP", url "/dashboard")`. Записать `meta.boss`.
- [ ] **Step 5: Run** `npx vitest run lib/achievements && npm run typecheck` — Expected: PASS
- [ ] **Step 6: Commit** `feat(boss): damage and victory on workout finish, boss hunter achievements`

---

### Task 4: Сундук босса и карточка на дашборде

**Files:**
- Create: `lib/boss/actions.ts` (`"use server"`), `components/boss/boss-sprite.tsx`, `components/boss/boss-card.tsx`
- Modify: `components/progress/daily-chest.tsx` — вынести диалог открытия в `components/progress/chest-dialog.tsx` (`ChestDialog`), `DailyChest` им пользуется
- Modify: `app/(app)/dashboard/page.tsx` (карточка после строки «Уровень / Серия / Ачивка»)
- Test: `e2e/boss.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`getBossView`, `BossView`), Task 1 (`rewardXp`).
- Produces:
  - `openBossChestAction(week: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }>` — условный `updateMany` по `{ userId, week, defeatedAt: { not: null }, rewardOpenedAt: null }`, затем `XpEvent BOSS_REWARD` (`meta: { week, code }`), `xp`/`level`, `evaluateAchievements`, `revalidatePath("/", "layout")`.
  - `ChestDialog({ open, onOpenChange, title, description, onOpen: () => Promise<{ ok: true; amount: number; rare?: boolean } | { ok: false; error: string }> })`.
  - `BossSprite({ code, defeated, size, className })` — статический импорт PNG по коду, заглушка (`Skull` из lucide в круге `bg-muted`) для отсутствующих.
  - `BossCard({ boss }: { boss: BossView })` — `data-testid="boss-card"`, полоса `role="progressbar"` `aria-valuenow={hp - damage}` `aria-valuemax={hp}`, текст `${left} / ${hp} HP`, «осталось ~N подходов» (`ceil(left / 100)`), «до конца недели N дн.»; победа — «Повержен!» и кнопка «Открыть сундук босса» (пока `!rewardOpened`).

- [ ] **Step 1: Failing e2e** (`e2e/boss.spec.ts`):
  - «boss card shows HP and remaining sets»: новый пользователь → `boss-card` содержит `1500 / 1500 HP` и `осталось ~15 подходов`.
  - «defeating the boss: finish → victory, chest pays once»: SQL-тренировка этой недели на 14 рабочих подходов (`seedWorkouts` с `daysAgo = 0` в пределах недели; если сегодня понедельник утром — тест берёт `finishedAt = now - 1 min`), затем `quickWorkout` с 1 подходом → сводка показывает «Босс повержен»; дашборд: «Повержен!», клик «Открыть сундук босса» → `+75 XP`, в БД одно событие `BOSS_REWARD`; повторный вызов (второй клик/вкладка) — `toHaveCount(0)` кнопки и одно событие.
  - Review Focus 1, «week bounds follow the user's time zone»: `UPDATE "User" SET "timeZone" = 'Asia/Vladivostok'`, SQL-тренировка с `finishedAt` = понедельник 00:10 по Владивостоку этой недели (в UTC это ещё воскресенье) → `boss-card` показывает урон этих подходов; вторая с `finishedAt` = воскресенье 23:50 по Владивостоку прошлой недели — не учитывается.
  - Review Focus 4, «last week's workout does not hit this week's boss»: SQL-тренировка с `finishedAt` 8 дней назад → `1500 / 1500 HP`.
  - Review Focus 5: после победы перезагрузить сводку — в `/notifications`-ленте (колокольчик) одно «⚔ Босс повержен», в БД одна строка `BossWeek` с `defeatedAt`.
- [ ] **Step 2: Run** `npm run build && npx playwright test boss` — Expected: FAIL
- [ ] **Step 3:** Implement по интерфейсам; страница дашборда получает `getBossView(user.id, userTz)`.
- [ ] **Step 4: Run** `npm run build && npx playwright test boss daily-chest dashboard` — Expected: PASS
- [ ] **Step 5: Commit** `feat(boss): dashboard boss card and boss chest`

---

### Task 5: Полоса босса в редакторе и блок в сводке

**Files:**
- Create: `components/boss/boss-bar.tsx`, `components/boss/boss-damage.tsx`
- Modify: `app/(app)/training/page.tsx` (`getBossView(user.id, tz, now, workout.id)` → проп `boss`), `components/training/workout-editor.tsx` (проп `boss?: BossView`, полоса под заголовком; урон текущих подходов из состояния редьюсера), `app/(app)/workouts/[id]/page.tsx` (блок из `meta.boss`)
- Test: `e2e/boss.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`setDamage`), Task 2 (`BossView`), Task 3 (`FinishMeta.boss`).
- Produces: `BossBar({ boss, sets }: { boss: BossView; sets: { done: boolean; warmup: boolean; rir: number | null }[] })` — `data-testid="boss-bar"`, текст `${left} / ${hp} HP` в `aria-live="polite"`, при росте урона — тряска спрайта и всплывающая `−N` (`aria-hidden`); `left ≤ 0` — «Босс на последнем издыхании — заверши тренировку, чтобы добить». `BossDamage({ boss }: { boss: NonNullable<FinishMeta["boss"]> })` — «Урон боссу: −1100 (2 крита)», полоса от `hpBefore` к `hpAfter`, при `defeated` — салют `LottiePlayer name="celebration"` и кнопка сундука.

- [ ] **Step 1: Failing e2e** «set confirm hits the boss, unconfirm heals it, warmup does nothing»: тренировка с одним упражнением → `boss-bar` `1500 / 1500 HP`; отметить подход → `1400 / 1500 HP`; выбрать RIR 0 под подходом → `1350`; снять отметку → `1500`; разминочный подход (кнопка разминки из `plate-tools`) выполнен → `1500`.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3:** Implement.
- [ ] **Step 4: Run** `npm run build && npx playwright test boss training animations` — Expected: PASS
- [ ] **Step 5: Commit** `feat(boss): boss bar in the workout editor and damage block in the summary`

---

### Task 6: Лента, лига, итоги недели; документация

**Files:**
- Modify: `lib/social/feed.ts` (`FeedEntry.bossDefeated: string | null` — имя босса из `meta.boss` при `defeated`), `components/social/activity-feed.tsx` (строка «⚔ Босс повержен: …»)
- Modify: `lib/social/queries.ts` (`getLeague`: поле `bossDefeated` — `EXISTS BossWeek` с `week = weekKey(now, timeZone)` смотрящего и `defeatedAt` не null, только для `offset = 0`), `components/social/league-table.tsx` (⚔ с `title`/`sr-only` «Босс недели повержен»)
- Modify: `lib/recap/types.ts` (`RecapData.boss?: { code: string; hp: number; damage: number; defeatedAt: string | null }`, `RecapInput.boss`), `lib/recap/build.ts`, `lib/recap/queries.ts` (`loadRecapInput` читает `BossWeek` недели + `weekDamage`), `components/recap/recap-view.tsx`
- Modify: `prisma/seed.ts` (у `demo.masha` свежая тренировка побеждает босса — `BossWeek` с `defeatedAt`, `meta.boss.defeated`), `CLAUDE.md`
- Test: `lib/social/feed.test.ts`, `lib/recap/build.test.ts`, `e2e/boss.spec.ts`

- [ ] **Step 1: Failing unit tests** — `toFeedEntry` с `meta.boss = { defeated: true, code: "golem", … }` → `bossDefeated: "Железный Голем"`; без `defeated` → `null`. `buildRecap` с `boss` во входе → блок `boss` с теми же полями; без босса (нет строки) — блока нет.
- [ ] **Step 2: Run** `npx vitest run lib/social lib/recap` — Expected: FAIL
- [ ] **Step 3:** Implement; текст итогов: победа — «Повержен: <имя> · <день недели>», нет — «<имя> ушёл: <урон> из <hp>».
- [ ] **Step 4: Failing e2e** «friend sees the boss victory in the feed and league»: `makeFriends`, друг побеждает (SQL как в Task 4 + `quickWorkout`), у смотрящего в `/friends` — «⚔ Босс повержен: …», в `/leaderboard` у друга ⚔. «Recap shows the boss block»: `seedRecapWeek` прошлой недели + `BossWeek` той недели → `/recap` содержит «ушёл: … из 1500».
- [ ] **Step 5: Run** `npm run build && npx playwright test boss friends leaderboard recap` — Expected: PASS
- [ ] **Step 6:** CLAUDE.md — абзац «Босс недели» (модули, формулы, хранение, где показывается, e2e); `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — всё зелёное.
- [ ] **Step 7: Commit** `feat(boss): feed, league and weekly recap; docs`
