# Бестиарий и титулы Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бестиарий боссов (вкладка `/achievements?tab=bestiary`) и титулы рядом с ником, открываемые победами над боссами и вершинами ачивок.

**Architecture:** Доступность титулов вычисляется чистыми функциями (`lib/titles/catalog.ts`) из `UserAchievement` и побед `BossWeek`; хранится только выбор `User.titleCode`. Бестиарий — чистая `bestiary()` поверх одного запроса. Показ титула — поле `title` у людей в запросах лиги, ленты и друзей.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, PostgreSQL, Vitest, Playwright, shadcn/Base UI, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-08-boss-titles-design.md`

## Global Constraints

- Боссов 4 (`BOSSES` в `lib/boss/bosses.ts`), список не меняется.
- Звёзды за 1 / 3 / 10 побед (`BOSS_STAR_WINS = [1, 3, 10]`).
- Коды титулов: `boss:<bossCode>:<1|2|3>`, `legend`, `ach:<код ачивки>`.
- Тексты титулов — ровно из таблиц спека, без рода.
- Цвета — только семантические токены; титул: `text-xs text-muted-foreground truncate`.
- Ссылка-кнопка — `<Link className={buttonVariants()}>`.
- Таблица ачивок в БД — `UserAchievement` (`code`, `userId`).
- Каждая задача заканчивается зелёными `npm run typecheck`, `npm run lint`, `npm test`.

## Review Focus

1. Пользователь ни разу не бился с боссом (нет строк `BossWeek`) — бестиарий из 4 «???» без падения, у каждого «На арене сейчас»/«Придёт через N недель».
2. `winsBefore` в `finishWorkout` не должен включать текущую победу — первая победа обязана показать «Гроза …» (e2e в Task 5).
3. В БД лежит неизвестный `titleCode` — нигде ничего не показывается и страницы не падают (unit `titleLabel` в Task 1; запросы маппят через `titleLabel`).
4. Своя карточка в ленте («Вы») и своя строка в лиге тоже показывают титул (e2e в Task 4).
5. Длинный титул на телефоне не раздвигает строку лиги/ленты (`truncate` + `min-w-0`; проверка — mobile-проект e2e Task 4).

---

### Task 1: Каталог титулов

**Files:**
- Create: `lib/titles/catalog.ts`, `lib/titles/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Title = { code: string; label: string; source: "boss" | "achievement" }`
  - `BOSS_STAR_WINS: readonly [1, 3, 10]`
  - `bossStars(wins: number): 0 | 1 | 2 | 3`
  - `type BossWins = Partial<Record<BossCode, number>>`
  - `availableTitles(input: { achievementCodes: Iterable<string>; bossWins: BossWins }): Title[]`
  - `titleLabel(code: string | null | undefined): string | null`
  - `titleForAchievement(achievementCode: string): Title | null`
  - `titlesUnlockedByWin(winsBefore: BossWins, code: BossCode): Title[]`
  - `bossTitles(code: BossCode): (Title & { wins: number })[]` — `wins` = порог звезды

- [ ] **Step 1: Failing tests** (`lib/titles/catalog.test.ts`):

```ts
expect([0, 1, 2, 3, 9, 10, 25].map(bossStars)).toEqual([0, 1, 1, 2, 2, 3, 3]);
expect(availableTitles({ achievementCodes: [], bossWins: {} })).toEqual([]);
expect(availableTitles({ achievementCodes: [], bossWins: { golem: 3 } }).map((t) => t.label)).toEqual(["Гроза Голема", "Кошмар Голема"]);
// legend — только при ≥1 победе у всех 4
expect(labels({ golem: 1, troll: 1, dragon: 1 })).not.toContain("Легенда бестиария");
expect(labels({ golem: 1, troll: 1, dragon: 1, knight: 1 })).toContain("Легенда бестиария");
// порядок: боссы по BOSSES, legend, затем ачивки по таблице
expect(availableTitles({ achievementCodes: ["login:100", "streakw:12"], bossWins: { troll: 10, golem: 1 } }).map((t) => t.code))
  .toEqual(["boss:golem:1", "boss:troll:1", "boss:troll:2", "boss:troll:3", "ach:streakw:12", "ach:login:100"]);
expect(availableTitles({ achievementCodes: ["streakw:8"], bossWins: {} })).toEqual([]);
expect(titleForAchievement(`allgroups:${MUSCLE_GROUPS.length}`)?.label).toBe("Без слабых мест");
expect(titleForAchievement("workouts:95")).toBeNull();
expect(titleLabel("boss:dragon:3")).toBe("Драконья чешуя");
expect(titleLabel("legend")).toBe("Легенда бестиария");
expect(titleLabel("boss:hydra:1")).toBeNull();
expect(titleLabel(null)).toBeNull();
expect(titlesUnlockedByWin({}, "golem").map((t) => t.code)).toEqual(["boss:golem:1"]);
expect(titlesUnlockedByWin({ golem: 2 }, "golem").map((t) => t.code)).toEqual(["boss:golem:2"]);
expect(titlesUnlockedByWin({ golem: 9 }, "golem").map((t) => t.code)).toEqual(["boss:golem:3"]);
expect(titlesUnlockedByWin({ golem: 1 }, "golem")).toEqual([]);
expect(titlesUnlockedByWin({ golem: 3 }, "golem")).toEqual([]);
expect(titlesUnlockedByWin({ golem: 4, troll: 1, dragon: 2 }, "knight").map((t) => t.code)).toEqual(["boss:knight:1", "legend"]);
expect(bossTitles("knight").map((t) => [t.label, t.wins])).toEqual([["Гроза Рыцаря", 1], ["Кошмар Рыцаря", 3], ["Тень среди теней", 10]]);
```

- [ ] **Step 2:** `npx vitest run lib/titles` → FAIL (module not found).
- [ ] **Step 3:** Реализовать `lib/titles/catalog.ts` — тексты из таблиц спека; ачивки — массив `[achievementCode, label]` в порядке таблицы спека (`allgroups:${MUSCLE_GROUPS.length}` из `lib/muscle-groups.ts`).
- [ ] **Step 4:** `npx vitest run lib/titles` → PASS.
- [ ] **Step 5:** Commit `feat(titles): title catalog`.

### Task 2: Бестиарий

**Files:**
- Create: `lib/boss/bestiary.ts`, `lib/boss/bestiary.test.ts`, `components/boss/bestiary.tsx`, `e2e/titles.spec.ts`
- Modify: `lib/boss/queries.ts` (+`getBestiary`), `app/(app)/achievements/page.tsx` (вкладки), `components/boss/boss-card.tsx` (ссылка)

**Interfaces:**
- Consumes: `bossStars`, `bossTitles`, `BOSS_STAR_WINS` (Task 1); `bossForWeek`, `BOSSES` ; `damageByWeek` (внутренняя в `queries.ts`).
- Produces:
  - `type BestiaryRow = { week: string; code: string; defeatedAt: Date | null; damage: number }`
  - `type BestiaryEntry = { code: BossCode; name: string; wins: number; stars: 0|1|2|3; firstWin: string | null; bestDamage: number; weeksUntil: number }`
  - `bestiary(rows: BestiaryRow[], currentWeek: string): BestiaryEntry[]` — в порядке `BOSSES`
  - `getBestiary(userId: string, tz: string, now?: Date): Promise<BestiaryEntry[]>`

- [ ] **Step 1: Failing unit** (`lib/boss/bestiary.test.ts`), неделя `cur` — понедельник, где `bossForWeek(cur) === "golem"` (найти перебором в тесте):

```ts
const empty = bestiary([], cur);
expect(empty.map((e) => e.code)).toEqual(["golem", "troll", "dragon", "knight"]);
expect(empty.every((e) => e.wins === 0 && e.stars === 0 && e.firstWin === null && e.bestDamage === 0)).toBe(true);
expect(empty.map((e) => e.weeksUntil)).toEqual([0, 1, 2, 3]);
const rows = [
  { week: w1, code: "golem", defeatedAt: new Date("2026-09-01T10:00:00Z"), damage: 2100 },
  { week: w2, code: "golem", defeatedAt: new Date("2026-08-01T10:00:00Z"), damage: 1800 },
  { week: w3, code: "troll", defeatedAt: null, damage: 900 },
];
const [golem, troll] = bestiary(rows, cur);
expect(golem).toMatchObject({ wins: 2, stars: 1, firstWin: "2026-08-01T10:00:00.000Z", bestDamage: 2100 });
expect(troll).toMatchObject({ wins: 0, stars: 0, bestDamage: 900 });
```

- [ ] **Step 2:** `npx vitest run lib/boss/bestiary` → FAIL.
- [ ] **Step 3:** Реализовать `bestiary` (`weeksUntil` — минимальное `k ∈ 0..3`, при котором `bossForWeek(addWeeks(currentWeek, k)) === code`) и `getBestiary`: все `BossWeek` пользователя + `damageByWeek(db, userId, tz, minWeek, currentWeek)` → строки → `bestiary(rows, weekKey(now, tz))`.
- [ ] **Step 4:** `npx vitest run lib/boss` → PASS.
- [ ] **Step 5: Failing e2e** (`e2e/titles.spec.ts`, тест `bestiary: one golem win`): новый пользователь, в БД `BossWeek` golem `defeatedAt = now()` за 2 недели назад (`mondayWeeksAgo(2)`); `/achievements?tab=bestiary` → `getByTestId("bestiary-golem")` содержит «Побед: 1», звёзды `getByLabel("1 звезда из 3")`, титул «Гроза Голема»; `bestiary-troll` содержит «???»; ровно один из четырёх содержит «На арене сейчас». Вкладка «Ачивки» по умолчанию (без `?tab`) — видна «Ближайшие цели».
- [ ] **Step 6:** `npm run build && npx playwright test titles` → FAIL.
- [ ] **Step 7:** UI: вкладки на `/achievements` — две ссылки (`Link`, `aria-current="page"` у активной), `searchParams.tab === "bestiary"`; `components/boss/bestiary.tsx` по спеку (затемнённый спрайт `brightness-0 opacity-40`, «???», «На арене сейчас» / «Придёт через N недель» с `plural`, «Первая победа: <дата ru-RU>», «Лучший урон за неделю: N» при `bestDamage > 0`, три титула босса с порогом «N побед», полученные — `font-medium`, остальные `text-muted-foreground`); над сеткой — «Легенда бестиария» получена или «звёзды у N из 4 боссов». В `BossCard` — ссылка «Бестиарий» на `/achievements?tab=bestiary`.
- [ ] **Step 8:** `npx playwright test titles boss` → PASS.
- [ ] **Step 9:** Commit `feat(boss): bestiary tab`.

### Task 3: Выбор титула

**Files:**
- Modify: `prisma/schema.prisma` (`User.titleCode String?`), миграция `npx prisma migrate dev --name user_title`
- Create: `lib/titles/queries.ts`, `lib/titles/actions.ts`, `components/social/title-select.tsx`
- Modify: `app/(app)/settings/page.tsx`, `e2e/titles.spec.ts`

**Interfaces:**
- Consumes: `availableTitles`, `titleLabel` (Task 1).
- Produces:
  - `getAvailableTitles(userId: string): Promise<Title[]>` (server-only; `UserAchievement.code` + `bossWeek.groupBy({ by: ["bossCode"], where: { defeatedAt: { not: null } } })`)
  - `setTitleAction(code: string | null): Promise<{ ok: true } | { ok: false; error: string }>` — ошибка «Титул ещё не открыт»
  - `TitleSelect({ titles: Title[]; current: string | null; nickname: string | null })`

- [ ] **Step 1: Failing e2e** (`title: pick in settings`): пользователь с победой над големом (как в Task 2) и `UserAchievement` `streakw:12`; `/settings` → блок `#title`, в списке ровно «Без титула», «Гроза Голема», «Железная воля» (нет «Кошмар Голема»); выбрать «Гроза Голема» → после перезагрузки выбран он, превью «<ник> · Гроза Голема»; `SELECT "titleCode"` = `boss:golem:1`; выбрать «Без титула» → `NULL`. Второй тест: без побед и ачивок — текст «Титулы открываются за победы над боссами и вершины ачивок» и ссылка на бестиарий.
- [ ] **Step 2:** `npm run build && npx playwright test titles` → FAIL.
- [ ] **Step 3:** Схема + миграция; `getAvailableTitles`; `setTitleAction` (`requireUser`, проверка `availableTitles`, `revalidatePath("/", "layout")`); `TitleSelect` — Select из `components/ui/select`, сохранение сразу при выборе с тостом «Титул сохранён»; в `settings/page.tsx` — под `NicknameForm`.
- [ ] **Step 4:** `npx playwright test titles` → PASS; `npm test`, typecheck, lint зелёные.
- [ ] **Step 5:** Commit `feat(titles): pick a title in settings`.

### Task 4: Титул в лиге, ленте и у друзей

**Files:**
- Modify: `lib/social/league.ts` (`LeagueMember.title: string | null`), `lib/social/queries.ts` (лига: `u."titleCode"`; друзья/заявки: `titleCode` в select; приглашение), `lib/social/feed.ts` (`FeedRow.titleCode`, `FeedEntry.title`), запрос ленты, `components/social/league-table.tsx`, `components/social/activity-feed.tsx`, `components/social/friends-panel.tsx` (`Person.title`), `app/(app)/friends/page.tsx` (если пробрасывает людей), unit-фикстуры `league.test.ts`/`feed.test.ts`/`build.test.ts` (добавить поле)
- Modify: `e2e/titles.spec.ts`

**Interfaces:**
- Consumes: `titleLabel` (Task 1); колонка `titleCode` (Task 3).
- Produces: `title: string | null` у `LeagueMember`, `FeedEntry`, `Person` (`friends-panel`), результата приглашения.

- [ ] **Step 1: Failing unit** в `lib/social/feed.test.ts`: `toFeedEntry` с `titleCode: "boss:golem:1"` → `title: "Гроза Голема"`; с `"nope"` → `null`.
- [ ] **Step 2:** `npx vitest run lib/social` → FAIL; реализовать маппинг в `toFeedEntry`; PASS.
- [ ] **Step 3: Failing e2e** (`friend sees my title`): A и B — друзья (`makeFriends`), у A `titleCode = 'boss:golem:1'` и победа golem в БД, у A завершённая тренировка (`seedWorkouts`). Под B: `/leaderboard` → строка A содержит `getByTestId("member-title")` с «Гроза Голема»; `/friends` → карточка ленты A содержит «Гроза Голема»; список друзей содержит «Гроза Голема». Под A: своя строка лиги и своя карточка «Вы» тоже с титулом.
- [ ] **Step 4:** `npm run build && npx playwright test titles` → FAIL.
- [ ] **Step 5:** Выборки + отрисовка: лига — строкой под ником (`data-testid="member-title"`), лента — после ника « · титул» (в `compact` не показывать), друзья/заявки/баннер — под ником; везде `text-xs text-muted-foreground truncate` в контейнере `min-w-0`.
- [ ] **Step 6:** `npx playwright test titles boss social friends leaderboard` → PASS (desktop + mobile); `npm test`, typecheck, lint.
- [ ] **Step 7:** Commit `feat(titles): show titles in league, feed and friends`.

### Task 5: Уведомление об открытии, сид, документация

**Files:**
- Modify: `lib/workouts/finish.ts` (`FinishMeta.boss.titles?: string[]`), `components/boss/boss-damage.tsx`, `components/achievements/achievement-toaster.tsx`, `prisma/seed.ts`, `CLAUDE.md`, `e2e/titles.spec.ts`

**Interfaces:**
- Consumes: `titlesUnlockedByWin`, `titleForAchievement` (Task 1).

- [ ] **Step 1: Failing e2e** (`first boss win unlocks a title`): сценарий победы как в `e2e/boss.spec.ts` «defeating the boss» (HP босса выставить в БД, завершить тренировку); в сводке `getByTestId("boss-title-unlocked")` содержит «Открыт титул «Гроза <босс>»» и ссылку «Выбрать» на `/settings#title`. Повторное открытие `/workouts/<id>` — строка на месте. Отдельно: победа, когда побед над этим боссом в БД уже 1, — строки нет.
- [ ] **Step 2:** `npm run build && npx playwright test titles` → FAIL.
- [ ] **Step 3:** В `finishWorkout` при `defeated`: `winsBefore` — `tx.bossWeek.groupBy` побед **без** текущей `bossWeek.id` (`id: { not: bossWeek.id }`); `boss.titles = titlesUnlockedByWin(winsBefore, code).map((t) => t.label)` (поле только если не пусто). `BossDamage` — строка и ссылка. Тост ачивки: если `titleForAchievement(a.code)` — к описанию добавить ` · + титул «…»`.
- [ ] **Step 4:** Сид: demo.masha — `titleCode = \`boss:${код её BossWeek}:1\``. CLAUDE.md — абзац «Бестиарий и титулы» (модули, коды, вычисляемость, где показывается).
- [ ] **Step 5:** `npx playwright test titles boss` → PASS; `npm run db:seed` проходит; полный `npm test`, typecheck, lint, `npm run test:e2e`.
- [ ] **Step 6:** Commit `feat(titles): announce unlocked titles; seed and docs`.
