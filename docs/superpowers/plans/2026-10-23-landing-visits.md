# Счётчик заходов на лендинг — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** админка показывает новых посетителей лендинга и переходы по меткам с конверсией в регистрацию.

**Architecture:** `proxy.ts` там же, где ставит `hf_src`/`hf_utm`, фоном (`event.waitUntil`) прибавляет счётчик в
агрегатных таблицах за час UTC. Запросы админки суммируют их по дню в поясе админа и сливают с таблицами
источников чистой функцией.

**Tech Stack:** Next.js 16 (`proxy.ts`), Prisma 7 + `$queryRaw`/`$executeRaw`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-landing-visits-design.md`

## Global Constraints

- Ветка `feat/landing-visits` от `release/2027-02-e2e`; по готовности — `--no-ff` в релизную, ветку удалить.
- Только агрегаты: без IP, UA, идентификаторов пользователя; `lib/account/*` и `/privacy` не трогаем.
- Боты: пустой UA или `/bot|crawl|spider|slurp|curl|wget|python|httpclient|headless|lighthouse|preview|monitor/i`.
- Лимит меток: 200 разных пар `source × campaign` за сутки UTC; сверх — `source = "(прочие)"`, `campaign = ""`.
- Без кампании хранится `campaign = ""`, наружу — `null` («без кампании» в таблице, как сейчас).
- Ошибка записи не роняет страницу и не задерживает ответ.
- Новая миграция: проверить SQL — частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не должны удаляться.

## Review Focus

1. Playwright по умолчанию шлёт UA `HeadlessChrome` — он бот по правилу; e2e счётчиков задаёт обычный UA Chrome (`test.use({ userAgent })`), иначе тесты ничего не увидят. Тест на бота — отдельно с `Googlebot`.
2. Пара с посетителями без регистраций должна появиться в таблице (регистрации 0, конверсия 0 %), а группа «До учёта» (`null`) — с посетителями «—» — тест в Task 3.
3. Залогиненный пользователь и фоновый prefetch не прибавляют счётчики (те же условия, что у cookie) — e2e в Task 5.
4. Падение БД при записи: промис ловит ошибку (`console.error`), страница 200 — unit в Task 2 с моком `db`, который бросает.
5. Конверсия > 100 % (регистрации от посетителей до периода) показывается как есть, без обрезки — тест в Task 3.

---

### Task 1: Схема и миграция

**Files:**
- Modify: `prisma/schema.prisma` (после `UserVisitHour`)
- Create: `prisma/migrations/<timestamp>_landing_visits/migration.sql` (генерирует Prisma)

**Interfaces:**
- Produces: модели `LandingVisit { hour, landing, referrer, count }`, `LandingUtmVisit { hour, source, campaign, count }` — ровно как в спеке (`@@id` по всем полям, кроме `count`; `hour` — `@db.Timestamptz(3)`).

- [ ] **Step 1:** добавить модели из спеки с комментариями `///`.
- [ ] **Step 2:** `npx prisma migrate dev --name landing_visits` — в SQL только `CREATE TABLE` двух таблиц и PK; строк `DROP INDEX` нет (иначе удалить их из файла и применить заново).
- [ ] **Step 3:** `npm run typecheck` — PASS.
- [ ] **Step 4:** commit `feat(admin): landing visit tables`.

### Task 2: Запись счётчиков

**Files:**
- Create: `lib/analytics/bots.ts`, `lib/analytics/bots.test.ts`
- Create: `lib/analytics/visits.ts`, `lib/analytics/visits.test.ts`
- Modify: `proxy.ts` (`proxy(req, event)`, `tagSource`)

**Interfaces:**
- Consumes: модели Task 1; `Landing`, `Referrer`, `Utm` из `lib/analytics/source.ts`.
- Produces:
  - `isBot(ua: string | null): boolean` (без server-only — импортирует proxy)
  - `hourFloor(d: Date): Date` — начало часа UTC, в `visits.ts`
  - `recordFirstVisit(landing: Landing, referrer: Referrer, now?: Date): Promise<void>`
  - `recordUtmVisit(utm: Utm, now?: Date): Promise<void>`
  - константа `UTM_PAIRS_PER_DAY = 200`, `UTM_OTHER = "(прочие)"`

- [ ] **Step 1: тесты `isBot`**

```ts
it.each(["", null, "Googlebot/2.1", "YandexBot/3.0", "curl/8.4", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120", "TelegramBot (like TwitterBot)"])("бот: %s", (ua) => expect(isBot(ua)).toBe(true));
it("обычный Chrome — не бот", () => expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe(false));
```

- [ ] **Step 2:** `npx vitest run lib/analytics/bots.test.ts` — FAIL (нет модуля).
- [ ] **Step 3:** реализовать `isBot`.
- [ ] **Step 4:** тесты `visits.ts` с `vi.mock("@/lib/db")`:
  - `hourFloor(new Date("2026-10-23T14:37:12Z"))` → `2026-10-23T14:00:00.000Z`;
  - `recordFirstVisit("home", "search")` вызывает `db.$executeRaw` один раз;
  - если `$executeRaw` бросает — промис резолвится, `console.error` вызван.
- [ ] **Step 5:** FAIL → реализовать `visits.ts` (`import "server-only"`):
  - первый заход — `INSERT INTO "LandingVisit" (hour, landing, referrer, count) VALUES (…, 1) ON CONFLICT (hour, landing, referrer) DO UPDATE SET count = "LandingVisit".count + 1`;
  - метка — один `INSERT … SELECT` с подменой пары:

```sql
INSERT INTO "LandingUtmVisit" (hour, source, campaign, count)
SELECT ${hour}, CASE WHEN keep THEN ${source} ELSE ${UTM_OTHER} END, CASE WHEN keep THEN ${campaign} ELSE '' END, 1
FROM (SELECT EXISTS (SELECT 1 FROM "LandingUtmVisit" WHERE hour >= ${dayStart} AND hour < ${dayStart} + interval '1 day' AND source = ${source} AND campaign = ${campaign})
          OR (SELECT COUNT(DISTINCT (source, campaign)) FROM "LandingUtmVisit" WHERE hour >= ${dayStart} AND hour < ${dayStart} + interval '1 day') < ${UTM_PAIRS_PER_DAY} AS keep) k
ON CONFLICT (hour, source, campaign) DO UPDATE SET count = "LandingUtmVisit".count + 1
```

  `campaign` — `utm.campaign ?? ""`; обе функции — `try/catch` с `console.error("landing visit", e)`.
- [ ] **Step 6:** unit PASS.
- [ ] **Step 7:** `proxy.ts`: сигнатура `proxy(req: NextRequest, event: NextFetchEvent)`; в `tagSource` после проверки «гость/GET/не фон» — `const counted = !isBot(req.headers.get("user-agent"))`; при установке `hf_src` — `if (counted) event.waitUntil(recordFirstVisit(landing, referrer))` (referrer вычислить один раз в переменную); при метке — `event.waitUntil(recordUtmVisit(utm))`. Это покрывает и редирект ссылок-приглашений (тот же `tagSource`).
- [ ] **Step 8:** `npm run typecheck && npm run lint` — PASS.
- [ ] **Step 9:** commit `feat(analytics): count first visits and utm clicks in proxy`.

### Task 3: Слияние с таблицами источников (чистая логика)

**Files:**
- Modify: `lib/admin/metrics.ts`, `lib/admin/metrics.test.ts`

**Interfaces:**
- Produces:
  - `type VisitRow = { group: string | null; child: string | null; visits: number }`
  - `SourceStats` получает `visitors: number | null; conversionPct: number | null`
  - `sourceRows(rows: SourceRow[], visits?: VisitRow[]): SourceGroup[]` — расширение существующей функции (без visits — `visitors: null` везде, старые тесты не меняются, кроме ожидаемых полей)

- [ ] **Step 1: тесты**
  - пара с регистрациями и посетителями: `signups 3, visitors 12` → `conversionPct 25`; итог группы суммирует детей;
  - визиты `{group: "tool", child: "search", visits: 5}` без регистраций → группа `tool` с `signups 0, visitors 5, conversionPct 0`, ребёнок такой же;
  - группа `null` без визитов → `visitors null, conversionPct null`;
  - `signups 6, visitors 4` → `conversionPct 150`;
  - сортировка: по `signups` убыв., при равенстве — по `visitors` убыв. (`null` как 0).
- [ ] **Step 2:** FAIL → реализовать: в `stats` — `visitors` = сумма визитов строк (нет ни одной — `null`), `conversionPct = visitors ? pct(signups, visitors) : null`; строки визитов без пары в `rows` добавляются как `SourceRow` с нулями.
- [ ] **Step 3:** `npx vitest run lib/admin` — PASS.
- [ ] **Step 4:** commit `feat(admin): visitors and conversion in source rows`.

### Task 4: Запросы и UI админки

**Files:**
- Modify: `lib/admin/metrics-queries.ts` (`getDailySeries`, `getSignupSources`, `getSignupCampaigns`, новая `getVisitsSince`)
- Modify: `components/admin/metrics-charts.tsx`, `components/admin/signup-sources.tsx`, `app/(app)/admin/page.tsx`
- Modify: `docs/features/platform.md` (аналитика и метрики админки — абзац про счётчик)

**Interfaces:**
- Consumes: `sourceRows(rows, visits)`, `VisitRow` (Task 3); таблицы Task 1.
- Produces: `DailySeries.visitors: DayPoint[]`; `getVisitsSince(): Promise<string | null>` — `min(hour)` из `LandingVisit` днём `YYYY-MM-DD` в поясе админа (аргумент `tz`).

- [ ] **Step 1:** `getDailySeries` — ещё ветка `UNION ALL SELECT 'visitors', to_char(${localDay(Prisma.sql\`hour\`, tz)}, 'YYYY-MM-DD'), SUM(count)::int FROM "LandingVisit" WHERE hour >= ${utcFloor(from)} AND <localDay> >= ${from}::date GROUP BY 2`; `pick("visitors")`.
- [ ] **Step 2:** визиты за тот же период для таблиц: `landing AS group, referrer AS child, SUM(count)` из `LandingVisit`; для меток — `source, NULLIF(campaign, '')` из `LandingUtmVisit`; передать в `sourceRows`.
- [ ] **Step 3:** UI: `BarCard title="Новые посетители" label="Посетителей" points={series.visitors}` ; порядок сетки: ActiveCard (`lg:col-span-2`), «Новые посетители», «Регистрации», «Тренировки» (обёрнута в `lg:col-span-2`), HourlyCard. В `SourceTable` — колонки «Посетители» (для меток — заголовок «Переходы» через проп `visitorsLabel`) и «Конверсия» (`${n} %`, `null` → «—») после «Регистраций». Под таблицами — `Посетители считаются с ${formatted}` при `visitsSince` позже начала периода (проп `visitsSince: string | null` и `range`); `null` — «Посетителей пока нет».
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` — PASS.
- [ ] **Step 5:** commit `feat(admin): landing visitors chart and conversion columns`.

### Task 5: e2e

**Files:**
- Create: `e2e/landing-visits.spec.ts`
- Modify: `e2e/db.ts` (`landingUtmVisits(source: string): Promise<number>`, `landingVisits(landing: string, referrer: string): Promise<number>` — `SUM(count)` за всё время, через `withDb`)

**Interfaces:**
- Consumes: `makeAdmin`, `registerUser`, `withDb`.

- [ ] **Step 1: сценарии** (desktop, `test.use({ userAgent: CHROME_UA })` с обычным UA Chrome; источник `e2e_${randomUUID().slice(0, 8)}`):
  - `"utm click counts on every visit"`: `goto("/?utm_source=<src>&utm_campaign=c1")` дважды → `landingUtmVisits(src)` поллингом (`expect.poll`) = 2;
  - `"first visit counts once"`: до — `before = landingVisits("tool", "social")`; `goto("/tools/1rm", { referer: "https://vk.com/" })`, затем `goto("/")` → поллинг `>= before + 1`, и через 1 с значение не выросло ещё на 1 от второго захода (проверить, что `hf_src` уже стоит, и `landingVisits` не ≥ before + 2 — другие воркеры этот источник не используют: `tool.social` только здесь);
  - `"bots are not counted"`: новый контекст с UA `Googlebot/2.1`, `goto("/?utm_source=<src2>")` → через 1 с `landingUtmVisits(src2) === 0`, cookie `hf_utm` при этом есть;
  - `"logged-in user and prefetch are not counted"`: `registerUser`, `goto("/?utm_source=<src3>")`; `request.get("/?utm_source=<src3>", { headers: { "next-url": "/register", "sec-fetch-dest": "empty" } })` → 0;
  - `"admin sees clicks and conversion"`: заход гостем с `<src4>` → `registerUser` в том же контексте → `makeAdmin` второму пользователю, `/admin` → в «Рекламных метках» строка `<src4>` с «Переходы» 1 и «Конверсия» 100 %.
- [ ] **Step 2:** `npm run build && npx playwright test landing-visits signup-sources admin-metrics --project=desktop` — PASS.
- [ ] **Step 3:** commit `test(e2e): landing visit counters`.

### Task 6: Финал ветки

- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное (падения — разобрать, не перезапускать вслепую).
- [ ] `git switch release/2027-02-e2e && git merge --no-ff feat/landing-visits && git branch -d feat/landing-visits`.
