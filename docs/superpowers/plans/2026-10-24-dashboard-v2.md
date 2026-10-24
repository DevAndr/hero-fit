# Дашборд v2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** под флагом `dashboard_v2` — новый `/dashboard`: ярус «Сегодня» с полосой недели и чипами, ярус «Прогресс» из шести виджетов, затем «Игра» и «Сообщество».

**Architecture:** `page.tsx` при флаге рендерит `DashboardV2` (серверный компонент) с данными из нового `lib/dashboard/v2-queries.ts` + существующих запросов; чистая логика — `lib/dashboard/v2.ts`; виджеты — `components/dashboard-v2/*`. Без флага — нынешняя страница, новые запросы не выполняются.

**Tech Stack:** Next.js 16 (RSC), Prisma 7 `$queryRaw`, recharts (через `components/ui/chart`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-dashboard-v2-design.md`

## Global Constraints

- Ветка `feat/dashboard-v2` от `release/2027-03-next`; по готовности — `--no-ff` в релизную, ветку удалить.
- Флаг `dashboard_v2`, `expires: "2027-06-30"`, описание «Дашборд v2: полоса недели и инфографика прогресса».
- Стиль — ровные карточки `rounded-xl border bg-card p-4`, только семантические токены; кольцо — `--series-1…5` + `--muted-foreground` («прочие»).
- У каждого графика — скрытая таблица `sr-only`; новых бесконечных анимаций нет.
- Неделя — пн…вс в `User.timeZone` (`dayKey`, `weekStart` из `lib/dates`), как у серии (`STREAK_WEEK_TARGET`).
- Изменения «Недели в цифрах» не красные: рост — `text-primary`, снижение — `text-muted-foreground`, всегда со стрелкой/знаком.
- Старая страница и её e2e не меняются. Пункт «Что нового» — с `flag: "dashboard_v2"` (при релизе).

## Review Focus

1. Новый пользователь без тренировок: все виджеты — заглушки, нигде «NaN», «Infinity %», пустых графиков без подписи — e2e в Task 5.
2. Тренировка в 23:30 местного воскресенья попадает в воскресную плитку этой недели, а не в понедельник следующей — unit в Task 1.
3. `strength_analytics` выключен (по умолчанию в тестовой базе): виджета «Тренд силы» нет, «Свежие рекорды» шире — e2e в Task 5.
4. Активная (незавершённая) тренировка не закрашивает плитку дня, герой говорит «Продолжить» — unit (`weekStrip` получает только завершённые) + e2e в Task 5.
5. Телефон 390 px: чипы переносятся, горизонтальной прокрутки страницы нет — e2e (mobile) в Task 5: `scrollWidth <= innerWidth`.

---

### Task 1: Флаг и чистая логика

**Files:**
- Modify: `lib/flags/registry.ts`
- Create: `lib/dashboard/v2.ts`, `lib/dashboard/v2.test.ts`

**Interfaces:**
- Produces:
  - `type StripDay = { day: string; weekday: number /* 0 = пн … 6 = вс */; done: boolean; today: boolean; planned: boolean; past: boolean }`
  - `weekStrip(input: { today: string; workoutDays: string[]; plannedDays: string[] }): StripDay[]` — 7 дней недели `today` с понедельника
  - `type WeekTotals = { volume: number; seconds: number; sets: number; records: number }`
  - `type Delta = { pct: number | null; dir: "up" | "down" | "same" }`
  - `weekCompare(cur: WeekTotals, prev: WeekTotals | null): { cur: WeekTotals; volume: Delta | null; seconds: Delta | null; sets: Delta | null }` — `prev === null` или поле prev = 0 → `null` у этого поля; |pct| < 1 → `"same"`
  - `type Slice = { key: MuscleGroup | "other"; sets: number; pct: number }`
  - `balanceSlices(rows: { group: MuscleGroup; sets: number }[], top = 5): Slice[]` — по убыванию, нулевые отброшены, сверх top — `"other"` последним, `pct` округлены и в сумме 100
  - `weekHeadline(weekWorkouts: number, streak: number): string` — «Ещё 1 тренировка — и неделя засчитана в серию» / «Ещё 2 тренировки — …» / «Неделя засчитана — серия 4 недели» (`plural`)

- [ ] **Step 1: тесты** (`v2.test.ts`)

```ts
it("неделя с понедельника; сегодня в среду", () => {
  const s = weekStrip({ today: "2026-10-22", workoutDays: ["2026-10-20", "2026-10-22"], plannedDays: ["2026-10-24"] });
  expect(s.map((d) => d.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  expect(s[1]).toMatchObject({ done: true, past: true });
  expect(s[3]).toMatchObject({ done: true, today: true, past: false });
  expect(s[5]).toMatchObject({ planned: true, past: false, done: false });
});
it("сегодня — воскресенье: неделя та же, что у понедельника", () => {
  expect(weekStrip({ today: "2026-10-25", workoutDays: ["2026-10-25"], plannedDays: [] })[6]).toMatchObject({ done: true, today: true });
});
it("дни вне недели игнорируются", () => {
  expect(weekStrip({ today: "2026-10-22", workoutDays: ["2026-10-18", "2026-10-26"], plannedDays: [] }).some((d) => d.done)).toBe(false);
});
it("weekCompare: рост, падение, без прошлой", () => {
  const c = weekCompare({ volume: 6800, seconds: 9600, sets: 42, records: 2 }, { volume: 6000, seconds: 9600, sets: 50, records: 0 });
  expect(c.volume).toEqual({ pct: 13, dir: "up" });
  expect(c.seconds).toEqual({ pct: 0, dir: "same" });
  expect(c.sets).toEqual({ pct: -16, dir: "down" });
  expect(weekCompare({ volume: 1, seconds: 1, sets: 1, records: 0 }, null).volume).toBeNull();
  expect(weekCompare({ volume: 1, seconds: 1, sets: 1, records: 0 }, { volume: 0, seconds: 0, sets: 0, records: 0 }).volume).toBeNull();
});
it("balanceSlices: топ-5 и «прочие», доли в сумме 100", () => {
  const rows = (["CHEST", "LEGS", "BACK", "SHOULDERS", "BICEPS", "TRICEPS", "ABS"] as const).map((group, i) => ({ group, sets: 10 - i }));
  const s = balanceSlices(rows);
  expect(s.map((x) => x.key)).toEqual(["CHEST", "LEGS", "BACK", "SHOULDERS", "BICEPS", "other"]);
  expect(s.reduce((a, x) => a + x.pct, 0)).toBe(100);
  expect(balanceSlices([{ group: "CHEST", sets: 0 }])).toEqual([]);
});
it("weekHeadline", () => {
  expect(weekHeadline(2, 4)).toBe("Ещё 1 тренировка — и неделя засчитана в серию");
  expect(weekHeadline(0, 0)).toBe("Ещё 3 тренировки — и неделя засчитана в серию");
  expect(weekHeadline(3, 4)).toBe("Неделя засчитана — серия 4 недели");
});
```

- [ ] **Step 2:** `npx vitest run lib/dashboard/v2.test.ts` — FAIL (нет модуля).
- [ ] **Step 3:** реализовать `v2.ts` (без server-only; `addDays`, `weekStart` из `@/lib/dates`, `plural` из `@/lib/format`, `STREAK_WEEK_TARGET`); доли — метод наибольшего остатка, чтобы сумма была ровно 100. Флаг — в реестр.
- [ ] **Step 4:** тесты PASS, `npm run typecheck`.
- [ ] **Step 5:** commit `feat(dashboard): dashboard_v2 flag and week strip, week compare, balance slices`.

### Task 2: Запросы v2

**Files:**
- Create: `lib/dashboard/v2-queries.ts`

**Interfaces:**
- Consumes: Task 1 (`weekStrip`, `weekCompare`, `balanceSlices`, типы).
- Produces:
  - `getWeekTotals(userId: string, tz: string, now?: Date): Promise<{ cur: WeekTotals; prev: WeekTotals | null }>` — окна `[понедельник 00:00 местн., now)` и то же минус 7 суток; объём — сумма `weight × reps` рабочих выполненных подходов (как `totalVolume`), время — `durationSec`, подходы — рабочие выполненные, рекорды — `PersonalRecord.achievedAt` в окне; `prev = null`, если у пользователя нет завершённых тренировок до начала текущей недели
  - `getWorkoutDays(userId: string, tz: string, monday: string, sunday: string): Promise<string[]>` — местные дни `finishedAt` завершённых тренировок
  - `type RecentRecord = { exerciseId: string; name: string; type: RecordType; value: number; prev: number | null; achievedAt: Date }`
  - `getRecentRecords(userId: string, limit = 3): Promise<RecentRecord[]>` — за 30 дней, `LAG(value) OVER (PARTITION BY "exerciseId", type ORDER BY "achievedAt")`
  - `getDashboardV2(user: { id: string; timeZone: string }): Promise<DashboardV2Data>`, где `DashboardV2Data = { strip: StripDay[]; week: ReturnType<typeof weekCompare>; records: RecentRecord[]; trends: Trends; balance: Slice[]; strength: StrengthTrend | null }` — все запросы в одном `Promise.all`; план недели — `getCalendar(id, monday, sunday, tz).occurrences.map((o) => o.date)`; `strength` — `isEnabled("strength_analytics")` → `getMonthCompare(...).strength`, иначе `null`; баланс — `balanceSlices(getMuscleBalance(...).groups)`.

- [ ] **Step 1:** реализовать (локальный день — тот же приём `AT TIME ZONE`, что в `lib/stats/queries.ts`; `utcFloor`-запас в сутки и отсечение по местному дню).
- [ ] **Step 2:** `npm run typecheck && npm run lint` — PASS. Поведение запросов проверяет e2e Task 5.
- [ ] **Step 3:** commit `feat(dashboard): v2 queries — week totals, workout days, recent records`.

### Task 3: Карта мышц только с восстановлением

**Files:**
- Modify: `components/progress/body-map.tsx`

**Interfaces:**
- Produces: проп `views?: ("recovery" | "balance")[]` (по умолчанию оба); при одном виде — без переключателя вкладок, `balance` можно не передавать (`balance?: MuscleBalanceData`).

- [ ] **Step 1:** реализовать; старые вызовы не меняются.
- [ ] **Step 2:** `npm run typecheck`; существующие e2e карты мышц (`npx playwright test body-map recovery --project=desktop`, имена спек — по `grep -l "Карта мышц" e2e`) — PASS после `npm run build`.
- [ ] **Step 3:** commit `feat(progress): body map with a single view`.

### Task 4: Виджеты и страница

**Files:**
- Create: `components/dashboard-v2/dashboard-v2.tsx` (сервер, раскладка ярусов), `week-hero.tsx` (приветствие + полоса + чипы + восстановление серии + «Последняя тренировка»), `week-numbers.tsx`, `strength-card.tsx`, `recent-records.tsx`, `balance-donut.tsx` (клиент, recharts `PieChart` через `ChartContainer`)
- Modify: `app/(app)/dashboard/page.tsx` (ветка по флагу), `docs/features/game.md` (раздел дашборда — абзац про v2 под флагом; если раздела нет — в `docs/features/training.md` рядом со статистикой)

**Interfaces:**
- Consumes: `DashboardV2Data` (Task 2), `BodyMap views` (Task 3), `weekHeadline` (Task 1); существующие `WeeklyTrendChart({ weeks })`, `ActivityHeatmap({ columns })`, `BossCard`, `GoalCard`, `GoalsCard`, `GuildCard`, `ClubCard`, `FeedCard`, `TodayPlan`, `MyCoachCard`, `RecapCard`, `WhoopRecoveryCard`, `RestoreStreakButton`, `XpBar` не нужен (чип).
- Подписи (точные): ярусы «Прогресс», «Игра», «Сообщество»; полоса — `role="list"` `aria-label="Неделя"`, плитка — `role="listitem"` `aria-label` вида «Пятница, 24 октября: тренировка» / «…: по плану» / «…: отдых» / «…: впереди»; регионы виджетов (`section aria-label`): «Неделя в цифрах», «Тренд силы», «Свежие рекорды», «Тренд объёма», «Баланс нагрузки», «Тепловая карта», «Карта мышц». Заглушки: рекорды — «Рекорды появятся после тренировок», баланс — «Баланс появится после тренировок», неделя без прошлой — числа без процентов.

- [ ] **Step 1:** `page.tsx`: после `requireUser()` — `if (await isEnabled("dashboard_v2", user.id)) return <DashboardV2 … />` до старых запросов; общие данные (getDashboard, план, тренер, итоги, восстановление, босс, гильдия, цели, клуб, лента) — вынести в общий хелпер внутри файла или передать как есть, без дублирования запросов.
- [ ] **Step 2:** компоненты по спеке (сетка ярусов из спеки: `lg:grid-cols-4` для ряда 1 с `col-span-2`; «Тренд силы» — только при `strength && strength.of > 0`, иначе рекорды `col-span-2`).
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test` — PASS.
- [ ] **Step 4:** commit `feat(dashboard): v2 layout — today, progress, game, community`.

### Task 5: e2e и проверка глазами

**Files:**
- Create: `e2e/dashboard-v2.spec.ts`

**Interfaces:**
- Consumes: `addFlagUser`, `registerUser`, `seedWorkouts(login, exercise, workouts, daysAgo, { finishedAt })`, `localAt`, `E2E_TZ`.

- [ ] **Step 1: сценарии** (desktop и mobile; флаг — `addFlagUser("dashboard_v2", login)` после `registerUser`, затем `goto("/dashboard")`):
  - `"new user: every widget shows its empty state"` — регионы «Неделя в цифрах», «Свежие рекорды», «Баланс нагрузки», «Тепловая карта» видны; текст страницы не содержит `NaN`, `Infinity`; «Рекорды появятся после тренировок»; подпись героя «Ещё 3 тренировки — и неделя засчитана в серию».
  - `"this week's workouts fill the strip and the numbers"` — две тренировки этой недели (`finishedAt` — `localAt` понедельника 10:00 и сегодня 10:00; если сегодня понедельник — вчера и сегодня, и ожидание — по `weekStrip`) жим 60×10×3 → плитки с «: тренировка» = 2, подпись «Ещё 1 тренировка…», «Неделя в цифрах» содержит «3,6 т» или «3 600 кг» (как `formatTonnage(3600)`), «Свежие рекорды» — строка «Жим штанги лёжа».
  - `"strength widget is hidden without strength_analytics"` — региона «Тренд силы» нет.
  - `"an active workout keeps the day open"` — начать пустую тренировку, отметить подход, вернуться на `/dashboard` → кнопка «Продолжить тренировку», сегодняшняя плитка без «: тренировка».
  - `"no horizontal scroll on a phone"` (только mobile) — `document.documentElement.scrollWidth <= window.innerWidth`.
  - `"without the flag the old dashboard stays"` — плитка «Тренировок всего» на месте, региона «Неделя в цифрах» нет.
- [ ] **Step 2:** `npm run build && npx playwright test dashboard-v2 dashboard --workers=6` — PASS (старые спеки дашборда тоже зелёные).
- [ ] **Step 3:** скриншоты demo-учётки с флагом (desktop 1440 и Pixel 7, тёмная и светлая тема) — посмотреть глазами: подписи не налезают, кольцо и тепловая карта читаются; палитра кольца — `node <dataviz>/scripts/validate_palette.js` уже пройдена для `--series-1…5`, повторно — только если цвета менялись.
- [ ] **Step 4:** замер: время ответа `/dashboard` на demo без флага и с флагом (5 запросов, медиана) — записать в описание ветки/итог.
- [ ] **Step 5:** commit `test(e2e): dashboard v2`.

### Task 6: Финал

- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — зелёное.
- [ ] Merge `--no-ff` в `release/2027-03-next`, ветку удалить (после решения пользователя).
