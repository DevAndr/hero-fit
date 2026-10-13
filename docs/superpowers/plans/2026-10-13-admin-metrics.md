# Метрики в админке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/admin` «Метрики»: плитки (юзеры, новые, DAU/WAU/MAU, тренировки, часы), графики по дням за 30/90 дней, недельные когорты удержания, срез использования фич; журнал заходов `UserVisit`.

**Architecture:** Живой SQL при открытии страницы (`$queryRaw` с границами в поясе админа), чистые преобразования в `lib/admin/metrics.ts`, SQL в `lib/admin/metrics-queries.ts`, серверная страница за `requireAdmin` + компоненты в `components/admin/`. Журнал пишется в существующей транзакции `recordDailyVisit`.

**Tech Stack:** Next.js 16 (App Router, Server Components), Prisma 7 + PostgreSQL, recharts через `components/ui/chart.tsx`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-admin-metrics-design.md`

## Global Constraints

- Пояс — `User.timeZone` админа; сутки и недели (с понедельника) — в нём. SQL-шаблон перевода: `("col" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}` (как `lib/stats/queries.ts`).
- Активный за период = есть `UserVisit` с `day` в периоде ИЛИ `Workout.status = 'COMPLETED'` с `finishedAt` в периоде.
- Страница — `requireAdmin()` из `lib/auth/admin.ts` (не админу 404).
- Период графиков — `?range=30|90`, иное → 30.
- Цвета — только семантические токены (`--chart-*`, `--series-1..3`, `primary`); у каждого графика скрытая таблица в `div.sr-only`; одна метрика — одна ось.
- Ссылка-кнопка — `<Link className={buttonVariants()}>`.
- Все тексты UI по-русски.
- e2e админа: `makeAdmin(login)` переименовывает в `E2E_ADMIN` (`e2e/db.ts`), сценарий — только desktop (как `e2e/clubs-moderation.spec.ts`).

## Review Focus

- Пустая база / нет регистраций в периоде — плитки «0», дельта «—», графики с нулями, без падений → `deltaPercent` и `fillDays` (Task 1).
- Текущая неделя когорты частично прошла — её ячейка считается (не `null`), а недели после текущей — `null` → `cohortGrid` (Task 1).
- Пользователь и заходил, и тренировался в один день — в «активных» считается один раз → SQL `UNION` (не `UNION ALL`) + `count(distinct)` в Task 3, проверяется ревью (e2e на общей базе нестабилен).
- Повторный заход в тот же день не плодит строки журнала и не падает на конфликте ключа → `skipDuplicates` (Task 2), e2e Task 2.
- `?range=abc` / `?range=7` → 30 дней, не 500 → `parseRange` (Task 1).

---

### Task 1: Чистые функции метрик

**Files:**
- Create: `lib/admin/metrics.ts`
- Test: `lib/admin/metrics.test.ts`

**Interfaces:**
- Produces:
  - `type DayPoint = { day: string; value: number }` (`day` — `YYYY-MM-DD`)
  - `parseRange(raw: string | string[] | undefined): 30 | 90`
  - `deltaPercent(now: number, prev: number): number | null` — `prev = 0` → `null`, иначе `Math.round((now - prev) / prev * 100)`
  - `fillDays(rows: DayPoint[], from: string, to: string): DayPoint[]` — все дни от `from` до `to` включительно, пропуски → 0, порядок по возрастанию
  - `type CohortRow = { week: string; size: number; cells: (number | null)[] }` — `cells[i]` — % (0…100, целое) активных в неделю i после регистрации, `null` — неделя ещё не наступила
  - `cohortGrid(cohorts: { week: string; size: number }[], active: { week: string; offset: number; users: number }[], currentWeek: string, weeks?: number /* =7: offsets 0..6 */): CohortRow[]` — порядок строк: новые недели сверху; ячейка `offset` у когорты `week` — `null`, если `addDays(week, 7*offset) > currentWeek`; `size = 0` → `0` вместо деления (не `null`, если неделя наступила)
  - `addDays(day: string, n: number): string`

- [ ] **Step 1: Тесты**

```ts
import { describe, expect, it } from "vitest";
import { addDays, cohortGrid, deltaPercent, fillDays, parseRange } from "./metrics";

describe("deltaPercent", () => {
  it("рост и падение", () => { expect(deltaPercent(12, 10)).toBe(20); expect(deltaPercent(5, 10)).toBe(-50); });
  it("prev = 0 → null", () => { expect(deltaPercent(3, 0)).toBeNull(); expect(deltaPercent(0, 0)).toBeNull(); });
});

describe("parseRange", () => {
  it("30 и 90", () => { expect(parseRange("90")).toBe(90); expect(parseRange("30")).toBe(30); });
  it("иное → 30", () => { for (const r of [undefined, "7", "abc", ["90", "30"]]) expect(parseRange(r)).toBe(30); });
});

describe("fillDays", () => {
  it("заполняет пропуски нулями, включая границы", () => {
    expect(fillDays([{ day: "2026-10-02", value: 4 }], "2026-10-01", "2026-10-03")).toEqual([
      { day: "2026-10-01", value: 0 }, { day: "2026-10-02", value: 4 }, { day: "2026-10-03", value: 0 },
    ]);
  });
  it("через границу месяца", () => { expect(fillDays([], "2026-09-30", "2026-10-01").map((p) => p.day)).toEqual(["2026-09-30", "2026-10-01"]); });
});

describe("addDays", () => { it("через месяц", () => expect(addDays("2026-10-30", 3)).toBe("2026-11-02")); });

describe("cohortGrid", () => {
  const current = "2026-10-12";
  it("будущие недели — null, текущая — считается", () => {
    const [row] = cohortGrid([{ week: "2026-10-05", size: 4 }], [{ week: "2026-10-05", offset: 0, users: 4 }, { week: "2026-10-05", offset: 1, users: 1 }], current);
    expect(row.cells).toEqual([100, 25, null, null, null, null, null]);
  });
  it("пустая когорта — нули на прошедших неделях", () => {
    const [row] = cohortGrid([{ week: "2026-10-12", size: 0 }], [], current);
    expect(row.cells).toEqual([0, null, null, null, null, null, null]);
  });
  it("новые недели сверху", () => {
    expect(cohortGrid([{ week: "2026-09-28", size: 1 }, { week: "2026-10-05", size: 1 }], [], current).map((r) => r.week)).toEqual(["2026-10-05", "2026-09-28"]);
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/admin/metrics.test.ts` → FAIL (модуля нет).
- [ ] **Step 3:** Реализовать по Interfaces. Даты — арифметика в UTC (`new Date(day + "T00:00:00Z")`), без пояса процесса.
- [ ] **Step 4:** `npx vitest run lib/admin/metrics.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(admin): pure metrics helpers`.

---

### Task 2: Журнал заходов `UserVisit`

**Files:**
- Modify: `prisma/schema.prisma` (модель `UserVisit` из спеки + `visits UserVisit[]` в `User`)
- Create: миграция `npx prisma migrate dev --name user_visit` (проверить, что сгенерированный SQL не удаляет частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` — если удаляет, вычеркнуть эти строки из миграции)
- Modify: `lib/achievements/daily-visit.ts` — в транзакции при `count === 1`: `await tx.userVisit.createMany({ data: [{ userId: user.id, day: new Date(\`${today}T00:00:00Z\`) }], skipDuplicates: true })` до `evaluateAchievements`
- Modify: `e2e/db.ts` — `visitDays(login: string): Promise<string[]>` (дни `YYYY-MM-DD` по возрастанию)
- Modify: `e2e/account-data.spec.ts` — в существующем сценарии удаления: до удаления `expect(await visitDays(login)).not.toHaveLength(0)`; после — проверить отсутствие строк по сохранённому `userId` (SQL в хелпере `visitCountById(id)` или по id из `idOf`, если он есть в `e2e/db.ts`)
- Modify: `app/(marketing)/privacy/page.tsx` — пункт в списке собираемых данных: «Дни, в которые вы открывали личный кабинет, — для статистики сервиса.»

- [ ] **Step 1:** e2e-проверка в `account-data.spec.ts` (журнал есть до удаления, нет после) + сценарий в новом `e2e/admin-metrics.spec.ts`: `test("заход пишет один день в журнал", …)` — регистрация, `/dashboard`, повторный `page.reload()`, `expect(await visitDays(login)).toHaveLength(1)`.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/admin-metrics.spec.ts --project=desktop` → FAIL (`visitDays` / таблицы нет).
- [ ] **Step 3:** Схема, миграция, запись в `recordDailyVisit`, хелперы, строка в `/privacy`.
- [ ] **Step 4:** `npm run typecheck && npm test`, затем `npm run build && npx playwright test e2e/admin-metrics.spec.ts e2e/account-data.spec.ts --workers=8` → PASS.
- [ ] **Step 5:** Commit `feat(admin): user visit log`.

---

### Task 3: SQL метрик

**Files:**
- Create: `lib/admin/metrics-queries.ts` (`import "server-only"`)

**Interfaces:**
- Consumes: Task 1 (`DayPoint`, `fillDays`, `cohortGrid`, `addDays`, `CohortRow`), `dayKey` из `lib/daily-login.ts`.
- Produces:
  - `type Overview = { users: number; newToday: number; new7: number; new7Prev: number; new30: number; new30Prev: number; dau: number; wau: number; wauPrev: number; mau: number; mauPrev: number; workouts: number; workouts7: number; workouts7Prev: number; workouts30: number; workouts30Prev: number; hours30: number; hours30Prev: number; avgMinutes30: number | null }`
  - `getOverview(tz: string): Promise<Overview>` — периоды «7 дн» = сегодня и 6 предыдущих местных дней; «пред.» — 7 дней перед ними; аналогично 30. `hours*` — сумма `durationSec` / 3600, одна десятая. `avgMinutes30` — `null` без тренировок.
  - `type DailySeries = { signups: DayPoint[]; visited: DayPoint[]; trained: DayPoint[]; workouts: DayPoint[] }`
  - `getDailySeries(tz: string, range: 30 | 90): Promise<DailySeries>` — все ряды через `fillDays`.
  - `getCohorts(tz: string): Promise<CohortRow[]>` — 8 недель регистрации, включая текущую; недели — `date_trunc('week', local)`; активность — `UNION` дней из `UserVisit.day` и местных дней `finishedAt` завершённых тренировок, `offset = (неделя активности − неделя регистрации) / 7`, 0…6.
  - `type FeatureUsage = { coaches: number; coachesWithClients: number; activeClients: number; telegramNotify: number; telegramMiniApp: number; push: number; guilds: number; guildMembers: number; clubs: number; clubMembers: number; activeGoals: number; buyers: number; coins: number; onboarded: number; users: number }`
  - `getFeatureUsage(): Promise<FeatureUsage>` — один SQL со скалярными подзапросами; `clubs` — `status = 'APPROVED'`, `clubMembers` — участники одобренных; `activeClients` — `CoachLink.endedAt IS NULL`; `push` — `count(distinct userId)` в `PushSubscription`; `buyers` — `count(distinct userId)` в `UserItem`; `activeGoals` — `count(distinct userId)` с `Goal.status = 'ACTIVE'`.

Активные (DAU/WAU/MAU и ряд «активные») — одна CTE `activity(userId, day)` = `SELECT "userId", day FROM "UserVisit" UNION SELECT "userId", (local finishedAt)::date FROM "Workout" WHERE status='COMPLETED'`; `count(distinct "userId")` по диапазону дней. Ряд `visited` — только `UserVisit`, `trained` — только тренировки (оба `count(distinct userId)` по дню).

- [ ] **Step 1:** Реализовать функции. `bigint` из `count` → `Number(...)`.
- [ ] **Step 2:** `npm run typecheck` → чисто. Проверка поведения — e2e Task 5 (SQL в unit не гоняется, как в остальном `lib/stats`).
- [ ] **Step 3:** Commit `feat(admin): metrics queries`.

---

### Task 4: Страница и компоненты

**Files:**
- Create: `app/(app)/admin/page.tsx` — `metadata.title = "Метрики"`; `const me = await requireAdmin()`; `range = parseRange((await searchParams).range)`; `Promise.all` четырёх запросов с `me.timeZone`; `PageHeader title="Метрики"` + разделы.
- Create: `components/admin/metric-tiles.tsx` — `MetricTiles({ overview }: { overview: Overview })`: секция `aria-label="Сводка"`, плитки (подписи — «Пользователей», «Новые», «Активные», «Тренировок», «Часов в зале», «Средняя тренировка»); у сравнимых — подпись `deltaPercent` вида «+20 % к прошлым 7 дн» / «—»; рост — `text-primary`, падение — `text-muted-foreground` (без красного).
- Create: `components/admin/metrics-charts.tsx` (`"use client"`) — `MetricsCharts({ series, range }: { series: DailySeries; range: 30 | 90 })`: три карточки — «Регистрации», «Активные» (линии «Заходили» и «Тренировались», `--series-1`/`--series-2`), «Тренировки»; переключатель 30 / 90 дней — ссылки `?range=30|90` (`aria-current` на активной); у каждого графика `div.sr-only` с таблицей.
- Create: `components/admin/cohort-table.tsx` — `CohortTable({ rows }: { rows: CohortRow[] })`: `<table>` с `caption` «Удержание по неделям регистрации», колонки «Неделя», «Новых», «0»…«6»; ячейка — `N %` на фоне `color-mix(in oklch, var(--primary) <N>%, transparent)`; при N ≥ 50 текст `text-primary-foreground`; `null` — пусто. Подпись под таблицей: «Активный — заходил в кабинет или завершил тренировку в эту неделю».
- Create: `components/admin/feature-usage.tsx` — `FeatureUsage({ usage }: { usage: FeatureUsage })`: секция `aria-label="Фичи"`, строки «Тренеры: N, с клиентами M», «Клиентов у тренеров», «Telegram: уведомления N, Mini App M», «Push», «Гильдии: N, игроков M», «Клубы: N, участников M», «Активные цели», «Магазин: купили N, монет на балансах M», «Прошли экскурсию: N из M».
- Modify: `components/app/user-menu.tsx` — пункт «Метрики» (`BarChart3` из lucide) → `/admin`, первым в админском блоке.

- [ ] **Step 1:** Реализовать страницу и компоненты; сверить `components/dashboard/volume-chart.tsx` как образец `ChartContainer`.
- [ ] **Step 2:** `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 3:** Ручная проверка: `npm run dev`, вход админом (`ADMIN_LOGINS` в `.env` локально), `/admin`, `/admin?range=90`, `/admin?range=abc` — без ошибок, светлая и тёмная тема.
- [ ] **Step 4:** Commit `feat(admin): metrics page`.

---

### Task 5: e2e и документация

**Files:**
- Modify: `e2e/admin-metrics.spec.ts` (`test.skip(({}, info) => info.project.name !== "desktop")` для сценариев с `makeAdmin`, `mode: "serial"`)
- Modify: `CLAUDE.md` — абзац в «Разработка»: страница `/admin` (метрики, `requireAdmin`), `UserVisit` (пишется в `recordDailyVisit`, каскад), определение «активного», пояс админа, файлы `lib/admin/metrics.ts`/`metrics-queries.ts`, хелпер `visitDays`.

- [ ] **Step 1:** Сценарии:
  - `"не админу — 404"`: обычный пользователь, `page.goto("/admin")` → ответ 404.
  - `"админ видит метрики"`: `makeAdmin`, вход как `E2E_ADMIN`; видны `region "Сводка"`, заголовки «Регистрации», «Активные», «Тренировки», `table` с caption «Удержание по неделям регистрации», `region "Фичи"`; клик «90 дней» → URL `?range=90`.
  - Дубли «заходил + тренировался» в e2e не проверяются: общая база e2e меняется параллельными спеками, точное DAU нестабильно. Это пункт ревью SQL (`UNION` + `count(distinct)`).
- [ ] **Step 2:** `npm run build && npx playwright test e2e/admin-metrics.spec.ts --workers=8` → PASS (desktop + mobile, админские — skip на mobile).
- [ ] **Step 3:** Полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` → зелёный.
- [ ] **Step 4:** Commit `test(admin): metrics e2e; docs`.
- [ ] **Step 5:** Влить в релизную ветку: `git checkout release/2026-11-versioning && git merge --no-ff feat/admin-metrics -m "Merge feat/admin-metrics: admin metrics page" && git branch -d feat/admin-metrics`.
