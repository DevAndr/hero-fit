# Итоги недели — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Понедельничные итоги прошлой недели: снимок `WeeklyRecap`, push «Итоги недели», страница `/recap/[week]`, архив, карточка на дашборде.

**Architecture:** Чистая `buildRecap` превращает собранные SQL-данные недели в `RecapData` (JSON-снимок). Снимок создаёт тик уведомлений (пн ≥ 09:00 местного) или страница/дашборд на лету; push отправляет только тик по `pushedAt`. UI читает только снимок.

**Tech Stack:** Next.js 16 (App Router, Server Components), Prisma 7 + PostgreSQL, Tailwind + shadcn/ui (base-nova), recharts, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-weekly-recap-design.md`

## Global Constraints

- Неделя — пн 00:00 … вс 24:00 в `User.timeZone` (`safeTimeZone` из `lib/daily-login.ts`), ключ — дата понедельника `"YYYY-MM-DD"` (`weekKey`, `addWeeks`, `localMidnight` из `lib/progress/weekly-streak.ts`).
- `RECAP_HOUR = 9` — тик создаёт итоги и шлёт push не раньше понедельника 09:00 местного; на лету — с понедельника 00:00.
- На лету итоги создаются только для недель не старше 8 недель назад (`RECAP_LAZY_WEEKS = 8`).
- Не больше 50 пользователей на создание за тик (`RECAP_BATCH = 50`).
- Лига — XP `WORKOUT_COMPLETED` + `PERSONAL_RECORD`; процентиль — `percentile()` из `lib/social/league.ts` (`null` при < 10 атлетов).
- Лучший подход — `epley1RM` из `lib/progress/records.ts`; разминка (`isWarmup`) и невыполненные (`completedAt IS NULL`) подходы не считаются.
- Ачивки недели — `UserAchievement.earnedAt` в пределах недели, без кодов `login:*`.
- Тексты: заголовок push «Итоги недели 📊», «новый старт» — «Новая неделя — новый старт 💪», переключатель — «Итоги недели — в понедельник утром».
- Все SQL в тике используют переданный `now` (тестовые часы), не `now()` Postgres.
- Цвета — только семантические токены; ссылка-кнопка — `<Link className={buttonVariants()}>`; графики — `components/ui/chart.tsx` со скрытой таблицей в `div.sr-only`.
- Unit-тесты — для чистых функций; слой queries/actions проверяется e2e (как в календаре).

## Review Focus

1. Пользователь в поясе с большим смещением (например, `Pacific/Kiritimati`, UTC+14, или `America/Los_Angeles`): «прошлая неделя» и понедельник 09:00 считаются в его поясе, а не в UTC. Тест — Task 2 (`shouldPushRecap`, `recapWeekFor`).
2. Тренировка в воскресенье 23:30 местного времени попадает в итоги этой недели, а не следующей. Тест — Task 4 (e2e: тренировка в вс 23:30 по поясу пользователя видна в итогах).
3. Два тика одновременно (воркер + cron): один снимок и один push. Тест — Task 5 (два параллельных вызова тика → одно уведомление).
4. Подход 0 кг у весового упражнения (пустой) не становится «лучшим подходом» с e1RM 0. Тест — Task 1 (`bestSet` пропускает подходы с весом 0 у не-bodyweight).
5. Некорректный параметр `/recap/abc` или `/recap/2026-10-07` (не понедельник) → 404, а не ошибка сервера. Тест — Task 4 (e2e).

---

## Файлы

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/<ts>_weekly_recap/` | `WeeklyRecap`, `User.notifyRecap`, `User.recapNudgeWeek`, `NotificationType.RECAP` |
| `lib/recap/types.ts` | `RecapData`, `RecapInput` и константы |
| `lib/recap/build.ts` (+ `.test.ts`) | `buildRecap`, `recapHighlights`, `recapPushBody` — чистые |
| `lib/recap/schedule.ts` (+ `.test.ts`) | `recapWeekFor`, `shouldPushRecap`, `isRecapWeek` — чистые, время/пояса |
| `lib/recap/queries.ts` | `loadRecapInput`, `getOrCreateRecap`, `getRecap`, `listRecaps`, `markRecapSeen` |
| `lib/recap/tick.ts` | `processWeeklyRecaps(now)` — создание, push, «новый старт» |
| `lib/notifications/service.ts`, `push.ts`, `actions.ts`, `queries.ts`, `components/notifications/*` | подключение тика, тип `RECAP`, переключатель |
| `app/(app)/recap/page.tsx`, `app/(app)/recap/[week]/page.tsx` | архив и страница итогов |
| `components/recap/*` | блоки страницы и карточка дашборда |
| `app/(app)/dashboard/page.tsx`, `app/(app)/stats/page.tsx` | карточка и ссылка «Итоги недель» |
| `e2e/recap.spec.ts`, `e2e/db.ts` | e2e и подготовка недели в БД |
| `CLAUDE.md` | раздел про итоги недели |

---

### Task 1: Схема, типы и `buildRecap`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_weekly_recap/migration.sql` (через `npx prisma migrate dev --name weekly_recap`)
- Create: `lib/recap/types.ts`, `lib/recap/build.ts`
- Test: `lib/recap/build.test.ts`

**Interfaces:**
- Produces (`lib/recap/types.ts`):

```ts
export const RECAP_VERSION = 1;
export const RECAP_HOUR = 9;
export const RECAP_LAZY_WEEKS = 8;
export const RECAP_BATCH = 50;

export type RecapLeagueRow = { nickname: string; xp: number; place: number; me: boolean };
export type RecapData = {
  version: 1;
  week: string; // понедельник
  league?: { place: number; of: number; xp: number; rows: RecapLeagueRow[] } | { percentile: number; xp: number };
  totals: { workouts: number; minutes: number; volume: number; sets: number;
            prev: { workouts: number; minutes: number; volume: number; sets: number } | null };
  bestSet?: { exerciseId: string; exerciseName: string; weight: number; reps: number; e1rm: number | null; isRecord: boolean };
  streak?: { weekCount: number; target: number; credited: boolean; streak: number; frozen: boolean };
  records?: { prs: { exerciseId: string; exerciseName: string; type: "ONE_RM" | "MAX_WEIGHT" | "MAX_REPS"; value: number }[];
              achievements: { code: string; title: string }[]; level: { from: number; to: number } | null };
  muscles?: { groups: { group: MuscleGroup; sets: number }[]; forgotten: MuscleGroup | null };
  plan?: { done: number; planned: number };
};

/** Всё, что buildRecap нужно о неделе; собирает loadRecapInput (Task 3). */
export type RecapInput = {
  week: string;
  workouts: { minutes: number; volume: number; sets: number; finishedAt: Date }[];
  prevWorkouts: { minutes: number; volume: number; sets: number }[];
  sets: { exerciseId: string; exerciseName: string; isBodyweight: boolean; weight: number; reps: number }[]; // выполненные рабочие
  league: { members: { id: string; nickname: string; xp: number }[]; meId: string } | null; // null — нет друзей
  percentile: { value: number | null; xp: number };
  finishMetas: FinishMeta[]; // meta WORKOUT_COMPLETED недели по возрастанию времени
  coveredByFreeze: boolean; // StreakCoverWeek(FREEZE) за эту неделю
  currentStreak: number;
  achievements: { code: string; title: string }[]; // уже без login:*
  muscleSets: { group: MuscleGroup; week: string; sets: number }[]; // эта неделя и 5 предыдущих
  plan: { done: number; planned: number } | null; // null — планов не было
};
```

`MuscleGroup` — из `@/generated/prisma/client`, `FinishMeta` — из `lib/workouts/finish.ts`.

- Produces (`lib/recap/build.ts`): `buildRecap(input: RecapInput): RecapData | null` — `null`, если в неделе нет тренировок.

- [ ] **Step 1: Схема и миграция**

В `schema.prisma` — модель `WeeklyRecap` ровно как в спецификации (раздел «Данные»), связь `User.weeklyRecaps WeeklyRecap[]`, поля `User.notifyRecap Boolean @default(true)` (рядом с `notifyPlan`), `User.recapNudgeWeek String?`, значение `RECAP` в `enum NotificationType`.
Run: `npx prisma migrate dev --name weekly_recap`
Expected: миграция создана и применена, `generated/prisma` перегенерирован.

- [ ] **Step 2: Тесты `buildRecap` (падают)**

В `lib/recap/build.test.ts`, фабрика `input(overrides)` с одной тренировкой по умолчанию:
- `returns null without workouts` → `buildRecap(input({ workouts: [] })) === null`.
- `totals with previous week` → 3 тренировки (60/45/50 мин, объём 5000/4000/3000, подходы 20/15/18) и 2 прошлые → `totals = { workouts: 3, minutes: 155, volume: 12000, sets: 53, prev: { workouts: 2, … } }`.
- `prev is null for empty previous week` → `prevWorkouts: []` → `totals.prev === null`.
- `bestSet by Epley` → подходы Жим 100×5 (e1RM 116.7) и Присед 110×1 (113.3) → `bestSet.exerciseName === "Жим"`, `weight 100`, `reps 5`, `e1rm ≈ 116.67`.
- `bestSet tie → heavier` → `90×10` и `100×6` (оба e1RM = 120) → выбран `100×6`.
- `bestSet skips zero weight on weighted exercise` → единственный подход 0×10 у `isBodyweight: false` → `bestSet` отсутствует.
- `bodyweight bestSet only without weighted sets` → подтягивания (bodyweight) 0×12 и 0×15 → `bestSet = { weight: 0, reps: 15, e1rm: null }`; при наличии весового подхода выбран весовой.
- `bestSet.isRecord` → в `finishMetas[0].records` есть `{ exerciseId: жим, type: "MAX_WEIGHT", value: 100 }` → `isRecord === true`; (правило: есть PR этого упражнения типа `ONE_RM` с value ≈ e1RM ±0.01 или `MAX_WEIGHT` с value = weight).
- `league with friends` → members me 300 XP, A 500, B 100 → `league = { place: 2, of: 3, xp: 300, rows: [A(1), me(2), B(3)] }`; при 10 участниках rows = топ-3 + я и соседи по месту без повторов, по возрастанию места.
- `league percentile without friends` → `league: null, percentile: { value: 80, xp: 120 }` → `{ percentile: 80, xp: 120 }`; при `value: null` поля `league` нет.
- `streak` → последняя meta `weekCount: 3`, `currentStreak: 5` → `{ weekCount: 3, target: 3, credited: true, streak: 5, frozen: false }`; `weekCount: 2` → `credited: false`.
- `records` → PR из всех meta недели, ачивки из input, `level = { from: levelBefore первой, to: levelAfter последней }`, `null` если не вырос; при пустых PR, ачивках и без роста уровня поля `records` нет.
- `muscles forgotten` → ноги: 0 на этой и прошлой неделе, 6 подходов 3 недели назад; спина 0/0, 2 подхода 4 недели назад → `forgotten === "LEGS"` (больше прошлых подходов); группа, у которой подходы есть на прошлой неделе, не забыта.
- `plan` → `{ done: 3, planned: 4 }` переносится; `null` → поля нет.

Run: `npx vitest run lib/recap/build.test.ts`
Expected: FAIL — модуль `./build` не найден.

- [ ] **Step 3: Реализовать `lib/recap/types.ts` и `buildRecap` в `lib/recap/build.ts`**

Поле опускается (`undefined`), когда блоку нечего показать. `muscles.groups` — только группы с `sets > 0` этой недели, по убыванию. Соседи в лиге: места `me.place - 1 … me.place + 1`.

- [ ] **Step 4: Тесты проходят**

Run: `npx vitest run lib/recap/build.test.ts` → PASS; `npm run typecheck` → без ошибок.

- [ ] **Step 5: Commit**

```bash
git add prisma lib/recap
git commit -m "feat(recap): WeeklyRecap model and buildRecap"
```

---

### Task 2: Расписание и текст push (чистые)

**Files:**
- Create: `lib/recap/schedule.ts`, `lib/recap/schedule.test.ts`
- Modify: `lib/recap/build.ts`, `lib/recap/build.test.ts`

**Interfaces:**
- Consumes: `RecapData`, `RECAP_HOUR`, `RECAP_LAZY_WEEKS` (Task 1).
- Produces:
  - `recapWeekFor(now: Date, tz: string): string` — понедельник прошлой недели в поясе.
  - `isMondayAfter(now: Date, tz: string, hour: number): boolean` — местный понедельник и `localHour ≥ hour`.
  - `shouldPushRecap(recap: { week: string; pushedAt: Date | null; seenAt: Date | null }, now: Date, tz: string): boolean`.
  - `isRecapWeek(week: string, now: Date, tz: string): "ok" | "invalid" | "not-ended" | "too-old"` — формат `YYYY-MM-DD`, понедельник, неделя закончилась, не старше `RECAP_LAZY_WEEKS` (для `too-old` страница показывает только существующий снимок).
  - `recapHighlights(data: RecapData): string[]` — 2–3 факта по приоритету спецификации.
  - `recapPushBody(data: RecapData): string` — `recapHighlights(data).join(" · ")`.

- [ ] **Step 1: Тесты (падают)**

`schedule.test.ts`:
- `recapWeekFor` → `2026-10-12T07:00Z` в `Europe/Moscow` (пн 10:00) → `"2026-10-05"`; `2026-10-11T22:30Z` в `Europe/Moscow` (пн 01:30) → `"2026-10-05"`; тот же момент в `UTC` (вс 22:30) → `"2026-09-28"`; `Pacific/Kiritimati` и `America/Los_Angeles` — по одному кейсу на границе.
- `isMondayAfter` → пн 08:59 местного → `false`, пн 09:00 → `true`, вт 10:00 → `false`.
- `shouldPushRecap` → неделя = `recapWeekFor(now)`, пн 09:30, `pushedAt/seenAt null` → `true`; `seenAt` задан → `false`; `pushedAt` задан → `false`; вторник → `false`; неделя не прошлая (старый снимок) → `false`.
- `isRecapWeek` → `"abc"` и `"2026-10-07"` (среда) → `"invalid"`; текущая неделя → `"not-ended"`; 9 недель назад → `"too-old"`; прошлая → `"ok"`.

`build.test.ts`, describe `recapPushBody`:
- место 2 из 3, объём +18% (12000 против ~10170), лучший подход Жим лёжа 100×5 → `"2-е место в лиге · объём +18% · лучший подход: Жим лёжа 100×5"`.
- без лиги и с падением объёма, рост тренировок 2→3 → `"тренировок +1 · лучший подход: …"`; без роста — `"… · неделя засчитана 🔥"` если `streak.credited`.
- всегда ≤ 3 фактов и ≥ 1 (запасной факт — `"3 тренировки за неделю"`).
- `bodyweight` лучший подход → `"лучший подход: Подтягивания ×15"`.

Run: `npx vitest run lib/recap` → FAIL.

- [ ] **Step 2: Реализовать**

Приоритет `recapHighlights`: место в лиге (только вариант с друзьями, `of ≥ 2`) → рост объёма в % (если `prev` есть и рост > 0, округление до целого) иначе рост числа тренировок (`тренировок +N`) → лучший подход → `неделя засчитана 🔥` → запасной `N тренировки за неделю` (склонение — `plural(n, "тренировка", "тренировки", "тренировок")` из `lib/format.ts`). Порядковое «2-е» — `${place}-е`.

- [ ] **Step 3: PASS**

Run: `npx vitest run lib/recap` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/recap
git commit -m "feat(recap): schedule rules and push copy"
```

---

### Task 3: Сбор данных и снимки (`lib/recap/queries.ts`)

**Files:**
- Create: `lib/recap/queries.ts`

**Interfaces:**
- Consumes: `buildRecap`, `RecapInput`, `RecapData` (Task 1), `isRecapWeek` (Task 2), `getCalendar` (`lib/plans/queries.ts`), `percentile`/`MIN_PERCENTILE_POPULATION` (`lib/social/league.ts`).
- Produces:
  - `loadRecapInput(userId: string, week: string, tz: string): Promise<RecapInput>`
  - `getOrCreateRecap(userId: string, week: string, tz: string, now?: Date): Promise<WeeklyRecapRow | null>` — существующий снимок; иначе, если `isRecapWeek(...) === "ok"` и `buildRecap` ≠ `null`, — `INSERT … ON CONFLICT ("userId", week) DO NOTHING`, затем чтение.
  - `createRecap(userId: string, week: string, tz: string): Promise<boolean>` — то же без проверки окна (для тика); `true`, если строка создана.
  - `getRecap(userId: string, week: string): Promise<WeeklyRecapRow | null>`
  - `listRecaps(userId: string, page: number): Promise<{ items: WeeklyRecapRow[]; hasMore: boolean }>` — 20 на страницу, новые сверху.
  - `adjacentRecaps(userId: string, week: string): Promise<{ prev: string | null; next: string | null }>`
  - `markRecapSeen(userId: string, week: string): Promise<void>` — `updateMany` где `seenAt: null`.
  - `type WeeklyRecapRow = { id: string; week: string; data: RecapData; createdAt: Date; pushedAt: Date | null; seenAt: Date | null }`.

- [ ] **Step 1: Реализовать `loadRecapInput`**

Границы недели: `start = localMidnight(week, tz)`, `end = localMidnight(addDays(week, 7), tz)` (`addDays` из `lib/plans/expand.ts`). Сравнение с колонками — как в `lib/social/queries.ts` (колонки без пояса: `("col" AT TIME ZONE 'UTC')` против `timestamptz`, либо Prisma-фильтры `gte/lt` по `Date`). Запросы (параллельно `Promise.all`):
- тренировки недели и прошлой (`status = COMPLETED`, по `finishedAt`): `durationSec/60`, `totalVolume`, `totalSets`;
- выполненные рабочие подходы недели с упражнением (`isWarmup = false`, `completedAt IS NOT NULL`);
- лига: друзья (`Friendship ACCEPTED`) + я, XP `LEAGUE_REASONS` за неделю по `XpEvent.createdAt`; нет друзей → `league: null`;
- процентиль за эту неделю: тот же SQL, что `getPercentile`, но с границами недели, активные — тренировавшиеся за 28 дней до `end`; вынести общий SQL-фрагмент из `lib/social/queries.ts` в экспортируемую функцию с параметрами `start/end`, `getPercentile`/`getLeague` перевести на неё (поведение не меняется);
- `XpEvent.meta` событий `WORKOUT_COMPLETED` недели по `createdAt`;
- `StreakCoverWeek` (`week`, `reason = FREEZE`), `User.currentStreak`;
- `UserAchievement` с `earnedAt` в неделе, `code NOT LIKE 'login:%'`;
- подходы по основной группе (`e."muscleGroups"[1]`) за 6 недель до `end`, сгруппированные по ключу недели в поясе пользователя (`to_char(date_trunc('week', "completedAt" AT TIME ZONE 'UTC' AT TIME ZONE tz), 'YYYY-MM-DD')`);
- план: `getCalendar(userId, week, addDays(week, 6), tz, end)` → `planned = occurrences.length`, `done = status === "done"`; нет вхождений → `null`.

- [ ] **Step 2: Остальные функции** по сигнатурам выше; `data` при чтении приводится к `RecapData` (`as unknown as RecapData`).

- [ ] **Step 3: Проверка**

Run: `npm run typecheck && npm run lint && npm test` → без ошибок, существующие тесты лиги/процентиля зелёные. (Поведение `loadRecapInput` проверяется e2e в Task 4.)

- [ ] **Step 4: Commit**

```bash
git add lib/recap/queries.ts lib/social/queries.ts
git commit -m "feat(recap): load week data and recap snapshots"
```

---

### Task 4: Страница итогов и архив

**Files:**
- Create: `app/(app)/recap/[week]/page.tsx`, `app/(app)/recap/page.tsx`
- Create: `components/recap/recap-hero.tsx`, `recap-totals.tsx`, `recap-best-set.tsx`, `recap-league.tsx`, `recap-streak.tsx`, `recap-records.tsx`, `recap-muscles.tsx` (client, recharts), `recap-plan.tsx`, `recap-view.tsx` (компоновка), `lib/recap/view.ts` (+ `.test.ts`) — подписи
- Modify: `e2e/db.ts`
- Test: `e2e/recap.spec.ts`

**Interfaces:**
- Consumes: `getOrCreateRecap`, `getRecap`, `listRecaps`, `adjacentRecaps`, `markRecapSeen` (Task 3), `isRecapWeek`, `recapHighlights` (Task 2).
- Produces:
  - `lib/recap/view.ts`: `weekRangeLabel(week: string): string` (`"6–12 октября"`, `"29 сентября – 5 октября"`), `delta(cur: number, prev: number): { pct: number; sign: "up" | "down" | "same" }`.
  - `components/recap/recap-view.tsx`: `RecapView({ data }: { data: RecapData })`.
  - `e2e/db.ts`: `seedRecapWeek(login: string, opts: { weekStart: string; tz: string; workouts: { day: number; time: string; exercise: string; weight: number; reps: number; sets: number; xp: number }[] }): Promise<void>` — тренировки в местное время пользователя (`day` 0 = пн), подходы, `XpEvent WORKOUT_COMPLETED` с `meta` (`weekCount`, `records: []`, `achievements: []`, `levelBefore/levelAfter`), и `User.timeZone = tz`.

- [ ] **Step 1: Тесты `view.ts` (падают)** — `weekRangeLabel("2026-10-05") === "5–11 октября"`, `weekRangeLabel("2026-09-28") === "28 сентября – 4 октября"`; `delta(12, 10) = { pct: 20, sign: "up" }`, `delta(5, 10) → down 50`, `delta(3, 3) → same 0`.
Run: `npx vitest run lib/recap/view.test.ts` → FAIL; реализовать; → PASS.

- [ ] **Step 2: e2e (падают)** — `e2e/recap.spec.ts`, неделя — понедельник две недели назад от реального времени (вычислить в тесте), пояс `Europe/Moscow`:
  - `recap page shows totals, best set and league`: `registerUser`, `makeFriends` с другом, `seedRecapWeek` мне (Жим лёжа 100×5 ×3, 80 XP) и другу (больше XP) → `/recap/<week>` → видны «Итоги недели», `weekRangeLabel`, «Жим лёжа», «100 кг × 5», «2-е место»; в БД `WeeklyRecap.seenAt` не `null`.
  - `sunday 23:30 local counts for that week`: тренировка `day: 6, time: "23:30"` → в итогах `1` тренировка.
  - `invalid week → 404`: `/recap/abc` и `/recap/<среда>` → текст 404-страницы.
  - `archive lists recaps`: после открытия итогов `/recap` содержит ссылку на неделю, клик ведёт на страницу.
Run: `npm run build && npx playwright test recap` → FAIL.

- [ ] **Step 3: Страница `/recap/[week]`**

Server Component: `requireUser()`, пояс — `safeTimeZone(user.timeZone)`. `isRecapWeek`: `"invalid"` → `notFound()`; `"not-ended"` → `redirect("/recap")`; `"ok"` → `getOrCreateRecap`; `"too-old"` → `getRecap`. Нет снимка → `notFound()`. Затем `markRecapSeen`. Порядок блоков и тексты — спецификация, раздел «UI». Шапка: стрелки по `adjacentRecaps` (`aria-label` «Предыдущая неделя»/«Следующая неделя»), ссылка «Все итоги».

- [ ] **Step 4: Архив `/recap`** — `listRecaps(user.id, page)` (`?page=`, по умолчанию 1), строка: `weekRangeLabel`, тренировки, место в лиге (если есть), `delta` объёма; ссылка «Ещё» при `hasMore`. Пустой архив — «Итоги появятся в понедельник после первой недели тренировок».

- [ ] **Step 5: PASS** — `npm run build && npx playwright test recap` → PASS (desktop + mobile); `npm run typecheck && npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/recap components/recap lib/recap e2e
git commit -m "feat(recap): recap page and archive"
```

---

### Task 5: Тик, push, настройка, колокольчик

**Files:**
- Create: `lib/recap/tick.ts`
- Modify: `lib/notifications/service.ts` (`runNotificationTick`), `lib/notifications/push.ts` (тег `RECAP: "hero-fit-recap"`), `components/notifications/notification-bell.tsx` (`RECAP: { icon: BarChart3, color: "text-primary" }`), `components/notifications/notification-settings.tsx`, `lib/notifications/actions.ts`, `lib/notifications/queries.ts` (`notifyRecap`)
- Test: `e2e/recap.spec.ts`

**Interfaces:**
- Consumes: `createRecap`, `getRecap` (Task 3), `recapWeekFor`, `isMondayAfter`, `shouldPushRecap`, `recapPushBody` (Task 2), `notify`, `processDuePushes` (`lib/notifications/service.ts`).
- Produces: `processWeeklyRecaps(now: Date): Promise<number>` — число созданных уведомлений; `runNotificationTick` возвращает `{ reminders, pushes }`, где `reminders` включает итоги.

- [ ] **Step 1: e2e (падают)** — неделя `W` = понедельник прошлой реальной недели; тестовые часы `now` = последний уже наступивший понедельник 09:30 `Europe/Moscow`, `W` = неделя перед ним (хелпер `lastMondayAt(hour, minute, tz)` в спеке). `runTick` — как в `e2e/notifications.spec.ts` (вынести в `e2e/helpers.ts` как `runTick(request, now?)` и переиспользовать в обоих файлах).
  - `monday tick creates recap and one notification`: `seedRecapWeek` за `W` → `runTick(now)` → в колокольчике «Итоги недели» с текстом «лучший подход: Жим лёжа 100×5»; второй `runTick(now)` и два параллельных `Promise.all([runTick, runTick])` → ровно одно уведомление `RECAP` в БД.
  - `before 09:00 no push; seen recap → no push`: `runTick(пн 08:30)` → уведомлений нет; открыть `/recap/W` → `runTick(пн 09:30)` → уведомлений нет.
  - `fresh start nudge once`: тренировки только за `W − 1` → `runTick(now)` → одно уведомление «Новая неделя — новый старт 💪»; `runTick(now + 7 дней)` → новых нет.
  - `notifyRecap off`: выключить переключатель «Итоги недели — в понедельник утром» в `/settings` (роль `switch`) → `runTick(now)` → снимок есть, уведомления нет.
  - `push reaches push service`: по образцу `e2e/notifications.spec.ts` со `startPushService` → payload с заголовком «Итоги недели 📊».
Run: `npx playwright test recap -g "tick|nudge|notifyRecap|push"` → FAIL.

- [ ] **Step 2: `processWeeklyRecaps(now)` в `lib/recap/tick.ts`**

1. Кандидаты на создание (SQL, всё от `${now}::timestamptz`): `extract(isodow FROM now AT TIME ZONE "timeZone") = 1 AND extract(hour …) >= RECAP_HOUR`, есть `Workout COMPLETED` с `finishedAt` в прошлой неделе пользователя, нет `WeeklyRecap` с `week = прошлая неделя`; `LIMIT RECAP_BATCH`. Ключ прошлой недели в SQL: `to_char(date_trunc('week', now AT TIME ZONE "timeZone") - interval '7 days', 'YYYY-MM-DD')`. Для каждого — `createRecap` в `try/catch` (`console.error`, продолжить). Пользователи с вторника и позже не выбираются — снимок за пропущенный понедельник создастся на лету.
2. Push: снимки с `week = recapWeekFor(now, tz)`, `pushedAt IS NULL AND seenAt IS NULL`, `notifyRecap`, только у пользователей, для которых `isMondayAfter(now, tz, RECAP_HOUR)` (грубый отбор SQL + точный `shouldPushRecap`). Транзакция: `updateMany({ where: { id, pushedAt: null }, data: { pushedAt: now } })`, при `count === 1` — `notify(tx, userId, { type: RECAP, title: "Итоги недели 📊", body: recapPushBody(data), url: "/recap/" + week }, { push: true })`.
3. «Новый старт»: понедельник ≥ 09:00, `notifyRecap`, нет тренировок в прошлой неделе, есть в позапрошлой, `recapNudgeWeek IS DISTINCT FROM прошлая неделя` → условный `updateMany` по старому `recapNudgeWeek` и `notify` (`RECAP`, «Новая неделя — новый старт 💪», тело «Начни неделю с тренировки — до streak осталось 3», url `/training`).
4. Если что-то отправлено — `processDuePushes()` (как в `processStreakReminders`).

Подключить в `runNotificationTick`: `reminders = streak + plan + recaps`.

- [ ] **Step 3: Настройка и колокольчик** — `notifyRecap` в zod-схеме `actions.ts`, в select `queries.ts`, в списке переключателей `notification-settings.tsx`: `{ key: "notifyRecap", label: "Итоги недели — в понедельник утром", description: "Место в лиге, прирост и лучший подход за прошлую неделю" }`; маппинги `RECAP` в `push.ts` и `notification-bell.tsx`. TypeScript подскажет все `Record<NotificationType, …>`, которые нужно дополнить.

- [ ] **Step 4: PASS** — `npm run build && npx playwright test recap notifications` → PASS; `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/recap/tick.ts lib/notifications components/notifications e2e
git commit -m "feat(recap): monday push, fresh-start nudge and setting"
```

---

### Task 6: Карточка на дашборде и ссылка из статистики

**Files:**
- Create: `components/recap/recap-card.tsx`
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/stats/page.tsx`
- Test: `e2e/recap.spec.ts`

**Interfaces:**
- Consumes: `getOrCreateRecap` (Task 3), `recapWeekFor`, `recapHighlights` (Task 2), `weekRangeLabel` (Task 4).
- Produces: `RecapCard({ recap }: { recap: WeeklyRecapRow })`.

- [ ] **Step 1: e2e (падает)** — `dashboard card → recap`: `seedRecapWeek` за прошлую реальную неделю → `/dashboard` → карточка «Итоги недели» с меткой «новое» и `recapHighlights[0]` → «Смотреть итоги» → страница итогов → назад на дашборд → метки «новое» нет. `stats links to recaps`: `/stats` → ссылка «Итоги недель» → `/recap`.
Run: `npx playwright test recap -g "dashboard|stats"` → FAIL.

- [ ] **Step 2: Реализовать** — дашборд: `getOrCreateRecap(user.id, recapWeekFor(now, tz), tz)` в общем `Promise.all` страницы; карточка ниже кнопки «Начать тренировку», рядом с «Сегодня по плану». Непросмотренная (`seenAt === null`) — рамка `border-primary` и бейдж «новое»; просмотренная — компактная (одна строка highlights). Кнопка — `<Link className={buttonVariants()} href={"/recap/" + week}>Смотреть итоги</Link>`. На `/stats` — ссылка «Итоги недель» → `/recap`.

- [ ] **Step 3: PASS** — `npm run build && npx playwright test recap dashboard` → PASS.

- [ ] **Step 4: Commit**

```bash
git add components/recap app/(app)/dashboard app/(app)/stats e2e
git commit -m "feat(recap): dashboard card and stats link"
```

---

### Task 7: Документация и полный прогон

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md** — пункт в «Разработка» в стиле соседних: «Итоги недели (`/recap`, `lib/recap/*`, `components/recap/*`): снимок `WeeklyRecap` (JSON `RecapData`, `version`), создаёт тик в пн ≥ 09:00 местного (`processWeeklyRecaps`) или страница/дашборд на лету (`getOrCreateRecap`, с пн 00:00, не старше 8 недель); push только из тика по `pushedAt`, не после просмотра (`seenAt`); пустая неделя после активной — один «новый старт» (`recapNudgeWeek`); блоки — чистая `buildRecap`, текст push — `recapPushBody`; переключатель `notifyRecap`; в e2e неделю готовит `seedRecapWeek`, понедельник — `?now=`».
- [ ] **Step 2: Полный прогон** — `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` → всё зелёное (известный нестабильный `drag a plan… (mouse and keyboard)` — перезапустить один раз, отметить в отчёте).
- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: weekly recap"
```
