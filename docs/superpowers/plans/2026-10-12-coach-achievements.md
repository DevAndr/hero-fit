# Ачивки тренера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Категория ачивок `COACH` — лестницы за клиентов, комментарии, тренировки, рекорды, прогрессию и цели клиентов, титулы, блок «Награды тренера» на публичной странице.

**Architecture:** Счётчики считаются одним SQL из истории (окна `CoachLink`) и попадают в `AchievementStats.coach`; лестницы — обычные `ladders()`, выдача — существующие `evaluateAchievements`/`evaluateAchievementsNow`, плюс вызовы после действий тренера и на `/coach`.

**Tech Stack:** Next.js 16, Prisma 7 (`$queryRaw`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-coach-achievements-design.md`

## Global Constraints

- Ветка `feat/coach-achievements` (от `release/2026-10-raids`), в конце — merge `--no-ff` в релиз.
- `COACH_ACTIVE_CLIENT_WORKOUTS = 3`.
- XP тренерских ступеней — `40 + 20·i`, i — индекс порога в списке (не `n`).
- Лестницы `COACH` получают `goal: false`, если `coachMode` = false; выдача новых — только при `coachMode` = true.
- Тексты без опечаток, множественное — `plural` из `@/lib/format`.
- Чужие ачивки в транзакции `finishWorkout` клиента не считать.
- e2e с двумя пользователями — `--workers=8`; даты — через `E2E_TZ`/`localAt`.

## Review Focus

1. Клиент тренировался до связи (или после разрыва) — эти тренировки/рекорды/цели не засчитываются тренеру → тест в Task 2 (e2e: тренировки до `linkCoach since`).
2. Клиент ушёл и вернулся — два окна, события не задваиваются → покрыто SQL (окна не пересекаются); проверка в Task 2 unit-подобным e2e не нужна, но запрос группирует по `CoachLink.id` без декартова произведения — ревью SQL.
3. Тренер выключил режим — полученные ачивки на месте, новых нет, секция «Тренер» видна при наличии ачивок → тест в Task 1 (`coachMode: false` — `earnedAchievements` без `coach*`).
4. Обычный игрок без тренерской истории — лишнего SQL нет и секции «Тренер» нет → тест в Task 1 (пустые stats — ни одной `coach*` цели) и проверка в Task 2 (ранний выход).
5. Прогрессия своего шаблона клиента (`progressionSource: "own"`) тренеру не засчитывается → фильтр в SQL Task 2, ревью.

---

### Task 1: Категория, лестницы, титулы (чистая логика)

**Files:**
- Create: `prisma/migrations/<timestamp>_coach_achievements/migration.sql` (через `npx prisma migrate dev --name coach_achievements`)
- Modify: `prisma/schema.prisma` — `AchievementCategory.COACH // ачивки тренера (lib/achievements/coach-stats.ts)`; `CoachProfile.showAwards Boolean @default(true)`
- Modify: `lib/achievements/definitions.ts` — тип, пустые stats, лестницы
- Modify: `components/achievements/category.ts` — `COACH: "Тренер"`
- Modify: `lib/titles/catalog.ts` — 3 титула
- Test: `lib/achievements/definitions.test.ts`, тест каталога титулов рядом с `catalog.ts`

**Interfaces:**
- Produces:
  - `export type CoachAchievementStats = { clients: number; comments: number; workouts: number; prs: number; progressions: number; goals: number; pagePublished: boolean }`
  - `export const EMPTY_COACH_STATS: CoachAchievementStats` (нули, `pagePublished: false`)
  - `export const COACH_ACTIVE_CLIENT_WORKOUTS = 3`
  - `AchievementStats.coach: CoachAchievementStats`, `AchievementStats.coachMode: boolean` (в существующем пустом объекте stats — `EMPTY_COACH_STATS`, `false`)
  - `export const COACH_LADDERS: Record<"clients"|"comments"|"workouts"|"prs"|"progressions"|"goals", number[]>` — пороги из спеки (используется и в Task 3 для «ступени»)
  - Коды: `coachclients:N`, `coachpage:1`, `coachcomments:N`, `coachworkouts:N`, `coachprs:N`, `coachprog:N`, `coachgoals:N`

- [ ] **Step 1: Схема и миграция.** Добавить enum-значение и поле, `npx prisma migrate dev --name coach_achievements`. Проверить, что SQL миграции не удаляет частичные индексы (`CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`) — если Prisma их добавил в DROP, убрать эти строки.

- [ ] **Step 2: Падающие тесты** в `definitions.test.ts`:

```ts
const coachStats = (c: Partial<CoachAchievementStats>, coachMode = true) =>
  ({ ...EMPTY_STATS, coachMode, coach: { ...EMPTY_COACH_STATS, ...c } });

it("тренерские лестницы: пороги и XP по ступени", () => {
  const codes = earnedAchievements(coachStats({ clients: 5, workouts: 100, comments: 1, prs: 10, progressions: 5, goals: 1, pagePublished: true }));
  const coach = codes.filter((a) => a.category === "COACH");
  expect(coach.map((a) => a.code).sort()).toEqual(
    ["coachclients:1", "coachclients:3", "coachclients:5", "coachcomments:1", "coachgoals:1", "coachpage:1",
     "coachprog:5", "coachprs:10", "coachworkouts:10", "coachworkouts:50", "coachworkouts:100"].sort());
  expect(coach.find((a) => a.code === "coachworkouts:10")!.xpReward).toBe(40);
  expect(coach.find((a) => a.code === "coachworkouts:100")!.xpReward).toBe(80);
  expect(coach.find((a) => a.code === "coachclients:1")!.title).toBe("Первый ученик");
});

it("без режима тренера — ни выдачи, ни целей coach*", () => {
  const s = coachStats({ clients: 5 }, false);
  expect(earnedAchievements(s).some((a) => a.category === "COACH")).toBe(false);
  expect(nextGoals(s).some((g) => g.category === "COACH")).toBe(false);
});

it("цель — одна на семейство, у обычного игрока нет", () => {
  expect(nextGoals(coachStats({ clients: 1 })).filter((g) => g.code.startsWith("coachclients:")).map((g) => g.code)).toEqual(["coachclients:3"]);
  expect(nextGoals(EMPTY_STATS).some((g) => g.category === "COACH")).toBe(false);
});
```

(`EMPTY_STATS` — существующий пустой объект в тесте/модуле; если имя другое — использовать его.) Титулы: `titleLabel("ach:coachclients:25") === "Наставник"`, `"ach:coachworkouts:1000"` → «Кузница чемпионов», `"ach:coachprs:250"` → «Создатель рекордов».

- [ ] **Step 3: Запустить** `npx vitest run lib/achievements lib/titles` — FAIL (нет экспортов).

- [ ] **Step 4: Реализовать.** В `ladders()` блок «Тренер»: хелпер `coachLadder(key, codePrefix, value, title(n, first), description(n, first))` строит `Ladder` с `fixed: COACH_LADDERS[key]`, `goalGroup: \`coach-${key}\``, `goal: s.coachMode`, а при `!s.coachMode` — `value: 0` (так выдачи нет). `xpReward = 40 + 20 * fixed.indexOf(n)`. `coachpage:1` — `single(...)`-подобная лестница со значением `s.coachMode && s.coach.pagePublished ? 1 : 0`, `goal: false`, XP 40. Тексты — из таблицы спеки дословно. Подпись категории, титулы в `ACHIEVEMENT_TITLES`.

- [ ] **Step 5: Запустить** `npx vitest run lib/achievements lib/titles && npm run typecheck` — PASS (typecheck покажет места, где собирается `AchievementStats` — в `engine.ts` временно `coach: EMPTY_COACH_STATS, coachMode: false`; Task 2 заменит).

- [ ] **Step 6: Commit** `feat(coach-achievements): COACH category, ladders, titles`.

---

### Task 2: Счётчики из истории и выдача тренеру

**Files:**
- Create: `lib/achievements/coach-stats.ts`
- Modify: `lib/achievements/engine.ts` (`getAchievementStats`: select `isCoach`, вызов `coachStats`)
- Modify: `lib/coach/comment-actions.ts` (`saveCoachCommentAction`), `lib/coach/plan-actions.ts` (`assignWorkoutAction`, `assignManyAction`), `lib/coach/profile-actions.ts` (`publishCoachProfileAction` при `on`), `lib/coach/actions.ts` (`acceptCoachAction` — для тренера связи), `app/(app)/coach/page.tsx`
- Modify: `e2e/db.ts` — `seedWorkouts` получает необязательный `opts?: { templateId?: string }`
- Test: `e2e/coach-achievements.spec.ts`

**Interfaces:**
- Consumes: `CoachAchievementStats`, `EMPTY_COACH_STATS`, `COACH_ACTIVE_CLIENT_WORKOUTS` (Task 1); `evaluateAchievementsNow(userId)`; e2e — `enableCoach`, `linkCoach(coach, client, since?)`, `coachTemplate`, `idOf`, `achievementCodes`.
- Produces: `export async function coachStats(client: Client, coachId: string, isCoach: boolean): Promise<CoachAchievementStats>`

- [ ] **Step 1: Падающий e2e** `e2e/coach-achievements.spec.ts` (desktop):
  - «клиент с 3 тренировками в окне связи — «Первый ученик» при открытии /coach»: зарегистрировать тренера и клиента, `enableCoach`, `linkCoach(coach, client, 10 дней назад)`, `seedWorkouts(client, "Жим штанги лёжа", 3×{60,8,3}, 5)` с `templateId` шаблона тренера (`coachTemplate`); тренер открывает `/coach` → тост «Первый ученик»; `achievementCodes(coach)` содержит `coachclients:1` и не содержит `coachworkouts:10`.
  - «тренировки до связи не засчитываются»: `linkCoach(..., 2 дня назад)`, тренировки 10…8 дней назад → после `/coach` нет `coachclients:1`.
  - «комментарий — «Первый разбор»»: как в `coach-comments.spec.ts` тренер сохраняет комментарий к тренировке клиента → тост «Первый разбор», в коде `coachcomments:1`.
  - «секция «Тренер» на /achievements»: после первого сценария `/achievements` показывает заголовок «Тренер».

- [ ] **Step 2: Запустить** `npm run build && npx playwright test coach-achievements --workers=8` — FAIL.

- [ ] **Step 3: `coachStats`.** Ранний выход `EMPTY_COACH_STATS` (без SQL), если `!isCoach` и нет ни `CoachLink` (`coachId`), ни `CoachComment` (`coachId`) — один `findFirst` на каждую. Иначе один `$queryRaw` с CTE `win AS (SELECT id, "clientId", "createdAt" AS s, COALESCE("endedAt", now()) AS e FROM "CoachLink" WHERE "coachId" = $1)` и подзапросами-скалярами по таблице спеки (тренировки — `JOIN win ON w."userId" = win."clientId" AND w."finishedAt" >= s AND w."finishedAt" < e`, `status = 'COMPLETED'`; `workouts` — дополнительно `JOIN "WorkoutTemplate" t ON t.id = w."templateId" AND t."userId" = $1`; `clients` — `COUNT(*) FROM (SELECT "clientId" ... GROUP BY "clientId" HAVING COUNT(*) >= 3)`; `prs`/`progressions` — `XpEvent` по `createdAt` в окне, `progressions` — `jsonb_array_elements(meta->'progression')` с `->>'kind' = 'up'` и `meta->>'progressionSource' IS DISTINCT FROM 'own'`, `jsonb_typeof = 'array'`; `goals` — `Goal.status = 'ACHIEVED'` и `achievedAt` в окне; `pagePublished` — `EXISTS CoachProfile.publishedAt`). Все `::int`.

- [ ] **Step 4: Подключить.** `getAchievementStats` — `isCoach` в select, `coachStats(client, userId, isCoach)` в `Promise.all`, в результат `coach`, `coachMode: isCoach`. Вызовы `await evaluateAchievementsNow(user.id)` после успешного действия в `saveCoachCommentAction`, `assignWorkoutAction`, `assignManyAction`, `publishCoachProfileAction(true)`; в `acceptCoachAction` — `evaluateAchievementsNow(<id тренера>)` до `redirect`. На `app/(app)/coach/page.tsx` — `await evaluateAchievementsNow(user.id)` до чтения данных (тост берёт непросмотренные).

- [ ] **Step 5: Запустить** `npm run typecheck && npx vitest run && npm run build && npx playwright test coach-achievements coach-comments coach --workers=8` — PASS.

- [ ] **Step 6: Commit** `feat(coach-achievements): coach stats from link windows, grant on coach actions`.

---

### Task 3: «Награды тренера» на публичной странице

**Files:**
- Modify: `lib/coach/profile.ts` — `coachProfileSchema.showAwards: z.boolean()`, `publicAwards`
- Modify: `lib/coach/profile-actions.ts` (сохранение `showAwards`), редактор `/coach/page` (переключатель «Показывать награды»), `app/(marketing)/trainer/[nick]/page.tsx` (блок)
- Modify: `e2e/db.ts` — `coachProfile(..., { showAwards?: boolean })`
- Test: `lib/coach/profile.test.ts`, `e2e/coach-achievements.spec.ts`

**Interfaces:**
- Consumes: `COACH_LADDERS` (Task 1), `AchievementIcon` (`components/achievements/achievement-icon.tsx`).
- Produces: `export function publicAwards(codes: string[]): string[]` — коды для показа.

- [ ] **Step 1: Падающие unit-тесты** `publicAwards`:

```ts
expect(publicAwards(["coachclients:1", "coachclients:3", "coachpage:1", "workouts:5", "coachworkouts:1000"]))
  .toEqual(["coachworkouts:1000", "coachclients:3", "coachclients:1"]);
expect(publicAwards(Array.from({ length: 10 }, (_, i) => `coachworkouts:${[10,50,100,250,500,1000][i % 6]}`).concat(
  ["coachprs:10","coachprs:50","coachgoals:1","coachgoals:5"])).length).toBe(6);
```

Порядок: по убыванию индекса ступени в своей лестнице (`COACH_LADDERS`), при равенстве — по порядку лестниц в `COACH_LADDERS`, затем порогу; только `coach*` без `coachpage:1`; до 6, без дублей.

- [ ] **Step 2: Запустить** `npx vitest run lib/coach/profile` — FAIL.

- [ ] **Step 3: Реализовать** `publicAwards`; `showAwards` в схеме и сохранении (редактор шлёт значение, по умолчанию `true`); на странице тренера при `showAwards` — `userAchievement.findMany({ userId, category: "COACH" })` → `publicAwards` → блок «Награды тренера» (сетка значков `AchievementIcon` + название), пусто — блока нет. Переключатель — Base UI `Switch` с подписью «Показывать награды».

- [ ] **Step 4: e2e** в `coach-achievements.spec.ts`: тренер с `coachclients:1` (из Task 2 сценария) и `coachProfile(coach, { about: 50+ символов, publish: true })` → `/trainer/<ник>` показывает «Награды тренера» и «Первый ученик»; с `showAwards: false` — заголовка нет; тренер переключает «Показывать награды» в `/coach/page` (`getByRole("switch", { name: "Показывать награды" })`), сохраняет → блок пропадает.

- [ ] **Step 5: Запустить** `npx vitest run lib/coach && npm run build && npx playwright test coach-achievements coach-page --workers=8` — PASS.

- [ ] **Step 6: Commit** `feat(coach-achievements): trainer page awards block with toggle`.

---

### Task 4: Документация, сид, полный прогон, слияние

**Files:**
- Modify: `CLAUDE.md` — пункт в «Режим тренера»: категория `COACH`, `coachStats` (окна `CoachLink`, ≥ 3 тренировки = клиент), коды, XP по ступени, выдача (действия тренера, `/coach`, вход), титулы, «Награды тренера» + `showAwards`, e2e — `seedWorkouts` с `templateId`.

- [ ] **Step 1:** Обновить CLAUDE.md; `npm run db:seed` и вход `demo.coach` → проверить, что ачивки выдаются без ошибок (Маша тренировалась по его шаблону).
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное (зафиксировать числа).
- [ ] **Step 3:** Commit `docs: coach achievements in CLAUDE.md`; `git checkout release/2026-10-raids && git merge --no-ff feat/coach-achievements -m "Merge feat/coach-achievements: coach achievement ladders, titles, trainer page awards"`; `git branch -d feat/coach-achievements`.
