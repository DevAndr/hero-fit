# Источники регистраций и UX-мелочи — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** сохранять страницу первого входа и тип источника у новых пользователей и показывать в `/admin` таблицу «Источники»; плюс три UX-мелочи и починка нестабильного e2e.

**Architecture:** чистые классификаторы `lib/analytics/source.ts`; `proxy.ts` ставит первую cookie `hf_src`; регистрация копирует её в `User.signupLanding/signupReferrer`; отчёт — SQL в `metrics-queries.ts` + чистая сборка `sourceRows` + таблица в админке.

**Tech Stack:** Next.js 16 (proxy, Server Actions), Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-signup-sources-design.md`

## Global Constraints

- Cookie `hf_src`: `httpOnly`, `sameSite: "lax"`, `secure` в production, `path: "/"`, 30 дней; значение `"<landing>.<referrer>"`; ставится только гостю, только на GET документа (нет заголовка `rsc`), только на публичной странице, только если её нет.
- Значения: landing — `home|program|tool|trainer|club|other`, referrer — `search|social|direct|site`; Telegram — `telegram` в обоих полях; `null` — до учёта.
- Адреса и Referer целиком не хранятся.
- `activeWeek2` — дни 7–13 после регистрации, только для зарегистрированных ≥ 14 дней назад; активность — `UserVisit` ∪ завершённая тренировка.
- Тексты интерфейса — по-русски; числовой формат — `ru-RU`.
- Новая связь/поле `User` — проверить «Мои данные» и удаление аккаунта (сквозное правило CLAUDE.md).
- e2e админских сценариев — serial, только desktop.

## Review Focus

1. Подделанная или устаревшая cookie `hf_src` (произвольная строка) — регистрация не падает, пишется `other/direct`. → unit `decodeSource` + проверка в Task 2.
2. Заход вошедшего пользователя после выхода (refresh-cookie есть, access нет) — proxy считает его вошедшим после ротации и cookie не ставит. → e2e в Task 1.
3. Регистрация без cookie (сразу на `/register` из закладки) — `other/direct`, не `null`. → e2e в Task 2.
4. Пустой период (нет регистраций) — таблица показывает «Нет регистраций за период», не падает. → unit `sourceRows([])` в Task 3.
5. Страница входа `/register` сама публична — cookie, поставленная на ней, даёт `other`. → unit `landingOf("/register")` в Task 1.

---

### Task 1: Классификация и cookie первого входа

**Files:**
- Create: `lib/analytics/source.ts`, `lib/analytics/source.test.ts`
- Modify: `proxy.ts`
- Test: `e2e/signup-sources.spec.ts` (новый)

**Interfaces:**
- Produces: `type Landing`, `type Referrer`, `SOURCE_COOKIE = "hf_src"`, `SOURCE_MAX_AGE = 60 * 60 * 24 * 30`, `landingOf(pathname: string): Landing`, `referrerOf(referer: string | null, ownHost: string): Referrer`, `encodeSource(s: { landing: Landing; referrer: Referrer }): string`, `decodeSource(raw: string | undefined): { landing: Landing; referrer: Referrer } | null`.

- [ ] **Step 1:** unit:
  - `landingOf`: `/` → home, `/training-programs` и `/training-programs/5x5` → program, `/tools/1rm` → tool, `/trainer/max` → trainer, `/gym/msk/iron` → club, `/register`, `/changelog` → other;
  - `referrerOf`: `null`, `"мусор"`, `https://hero.fit/x` при ownHost `hero.fit` → direct; `https://yandex.ru/search?text=…`, `https://www.google.com/`, `https://google.com.tr/`, `https://ya.ru/` → search; `https://m.vk.com/wall`, `https://t.me/x`, `https://dzen.ru/a` → social; `https://habr.com/ru/articles/1` → site;
  - `decodeSource("program.search")` → объект; `decodeSource("evil.search")`, `decodeSource("program")`, `decodeSource(undefined)` → `null`; `encodeSource` ↔ `decodeSource`.
- [ ] **Step 2:** `npx vitest run lib/analytics/source.test.ts` → FAIL.
- [ ] **Step 3:** реализация по спеке (списки доменов — дословно; сравнение хоста по суффиксу `.<домен>` или равенству; `google.*` — любой хост с меткой `google`).
- [ ] **Step 4:** `proxy.ts`: в `route()` перед `passThrough()` для публичного пути — условия из Global Constraints; cookie на объект ответа. Хост — `req.nextUrl.host`.
- [ ] **Step 5:** e2e (`e2e/signup-sources.spec.ts`):
  - гость на `/training-programs/5x5` с заголовком `Referer: https://yandex.ru/search?text=5x5` (`page.setExtraHTTPHeaders` или `goto(url, { referer })`) → cookie `hf_src = program.search`, `httpOnly`;
  - затем переход на `/` с другим Referer — cookie не изменилась;
  - вошедший (зарегистрированный хелпером) на `/` — cookie нет (очистить контекст перед проверкой);
  - вышедший пользователь с живым refresh (сценарий: зарегистрироваться, удалить только `hf_at`, открыть `/`) — cookie нет.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test`, `npm run build && npx playwright test e2e/signup-sources.spec.ts e2e/landing.spec.ts e2e/auth*.spec.ts` → PASS.
- [ ] **Step 7:** commit `feat(analytics): first-touch signup source cookie`.

### Task 2: Поля пользователя и запись при регистрации

**Files:**
- Modify: `prisma/schema.prisma` (+ миграция `signup_source`), `lib/auth/actions.ts` (`registerAction`), функция `registerFromTelegram` (найти файл), `lib/account/export.ts` (`PROFILE_FIELDS`), `app/(marketing)/privacy/page.tsx`
- Test: `e2e/signup-sources.spec.ts`, `e2e/account-data.spec.ts`, `lib/account/export.test.ts`, `e2e/db.ts` (+ `signupSourceOf(login): Promise<{ landing: string | null; referrer: string | null }>`)

**Interfaces:**
- Consumes: `SOURCE_COOKIE`, `decodeSource` (Task 1).
- Produces: `User.signupLanding String?`, `User.signupReferrer String?`.

- [ ] **Step 1:** тесты (падают):
  - e2e: гость `/training-programs/5x5` с Referer Яндекса → регистрация → `signupSourceOf` = `program/search`, cookie `hf_src` удалена;
  - e2e: гость сразу на `/register` в чистом контексте без Referer → `other/direct`;
  - e2e: cookie `hf_src = "evil.x"` (подделка) → регистрация успешна, `other/direct`;
  - unit `export.test.ts`: профиль содержит `signupLanding`, `signupReferrer`;
  - e2e `account-data.spec.ts`: выгрузка содержит оба поля.
- [ ] **Step 2:** схема + миграция (проверить SQL: частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не удаляются) → `npx prisma migrate dev`, `npx prisma generate`.
- [ ] **Step 3:** запись в `registerAction` и Telegram; удаление cookie после создания пользователя; поля в `PROFILE_FIELDS`; строка в `/privacy`.
- [ ] **Step 4:** проверки как в Task 1 + `npx playwright test e2e/account-data.spec.ts e2e/telegram*.spec.ts --workers=8` → PASS.
- [ ] **Step 5:** commit `feat(analytics): save signup source on registration`.

### Task 3: Отчёт «Источники» в админке

**Files:**
- Modify: `lib/admin/metrics.ts` (+ `sourceRows`), `lib/admin/metrics.test.ts`, `lib/admin/metrics-queries.ts` (+ `getSignupSources`), `app/(app)/admin/page.tsx`
- Create: `components/admin/signup-sources.tsx`
- Test: `e2e/admin-metrics.spec.ts`, `e2e/db.ts` (+ `setSignupSource(login, landing, referrer)`)

**Interfaces:**
- Consumes: значения полей из Task 2.
- Produces: `type SourceRow = { landing: string | null; referrer: string | null; signups: number; firstWorkout: number; activeWeek2: number | null; eligible: number }` (сырые счётчики из SQL: `firstWorkout` и `activeWeek2` — числа пользователей, `eligible` — зарегистрированных ≥ 14 дней назад); `sourceRows(rows: SourceRow[]): SourceGroup[]`, где `SourceGroup = { landing: string | null; signups: number; firstWorkoutPct: number; activeWeek2Pct: number | null; children: { referrer: string | null; signups: number; firstWorkoutPct: number; activeWeek2Pct: number | null }[] }`; `getSignupSources(tz: string, range: 30 | 90): Promise<SourceGroup[]>`.

- [ ] **Step 1:** unit `sourceRows`:
  - две пары `program/search` (10 рег., 6 трен., eligible 5, active 2) и `program/direct` (5, 1, 0, 0) → группа `program`: 15 рег., `firstWorkoutPct` 47, `activeWeek2Pct` 40 (2/5); дети отсортированы по регистрациям, у `program/direct` `activeWeek2Pct` = `null` (eligible 0);
  - `landing: null` → отдельная группа (подпись «До учёта» в компоненте);
  - `sourceRows([])` → `[]`; группы отсортированы по регистрациям убыв.
- [ ] **Step 2:** `npx vitest run lib/admin/metrics.test.ts` → FAIL → реализация → PASS.
- [ ] **Step 3:** SQL `getSignupSources`: регистрации периода (`createdAt` в поясе админа, как `signups` в `getDailySeries`), `firstWorkout` — `EXISTS` завершённой тренировки, `eligible` — `createdAt <= now − 14 дней`, `activeWeek2` — `EXISTS` дня активности (`activitySql` по `from` = день регистрации… — использовать `UserVisit.day` и местный день тренировки игрока между `signupDay + 7` и `signupDay + 13`, где `signupDay` — местный день регистрации в `User.timeZone`).
- [ ] **Step 4:** компонент по спеке (подписи — дословно; `—` при `null`; «Нет регистраций за период» при пустом), страница — после `MetricsCharts`, перед `CohortTable`.
- [ ] **Step 5:** e2e (desktop, в serial-блоке admin-metrics): регистрируем двух пользователей и `setSignupSource` → `program/search` и `tool/social`; админ открывает `/admin` → таблица «Источники регистраций за 30 дней» содержит строки «Программы» и «Калькуляторы» и вложенные «Поиск», «Соцсети».
- [ ] **Step 6:** проверки: `npm run typecheck && npm run lint && npm test`, `npm run build && npx playwright test e2e/admin-metrics.spec.ts` → PASS.
- [ ] **Step 7:** commit `feat(admin): signup sources report`.

### Task 4: UX-мелочи и нестабильный e2e

**Files:**
- Modify: `lib/format.ts` (+ `formatTonnage`), `lib/format.test.ts`, `components/dashboard/volume-chart.tsx`, `components/social/activity-feed.tsx`, `components/training/exercise-filter.tsx` и/или `exercise-picker.tsx`, `exercise-swap-dialog.tsx`, `app/(app)/exercises/page.tsx`, `e2e/whoop.spec.ts`
- Test: `lib/format.test.ts`, существующие e2e дашборда/тренировки + новые проверки

**Interfaces:**
- Produces: `formatTonnage(kg: number): string` — `< 1000` → `"850 кг"`, иначе `"15,9 т"` (1 знак, `ru-RU`, без лишнего `,0`: 15000 → `"15 т"`).

- [ ] **Step 1:** unit `formatTonnage`: 0 → «0 кг», 850 → «850 кг», 999.4 → «999 кг», 1000 → «1 т», 15900 → «15,9 т», 15000 → «15 т»; ось графика: подписи без «тыс.».
- [ ] **Step 2:** реализация; ось графика объёма — тонны без «кг» для малых значений допускаются в виде «850» (решение исполнителя, единообразно на оси); лента — `formatTonnage`.
- [ ] **Step 3:** липкие фильтры (спека, UX п.2); e2e mobile: в окне выбора упражнения после прокрутки списка поле поиска видно (`toBeInViewport`).
- [ ] **Step 4:** гидратация: воспроизвести на mobile 390px (dev-сервер, консоль: `/dashboard`, `/training`, `/exercises`, `/stats`, `/calendar`, `/achievements`, `/settings`, лендинг), устранить причину; в отчёте — где воспроизводилась и почему.
- [ ] **Step 5:** `e2e/whoop.spec.ts` «история снов при подключении» — `recoveryPct` второго сна через `expect.poll`.
- [ ] **Step 6:** проверки: `npm run typecheck && npm run lint && npm test`, `npm run build && npx playwright test e2e/dashboard.spec.ts e2e/training.spec.ts e2e/feed*.spec.ts e2e/exercises*.spec.ts` и `npx playwright test e2e/whoop.spec.ts --project=desktop --workers=1` → PASS.
- [ ] **Step 7:** commit(ы) `fix(ui): tonnage units, sticky exercise filters, hydration` и `test(whoop): poll second sleep recovery`.

### Task 5: Документация и прогон

- [ ] **Step 1:** `docs/features/platform.md` — аналитика (cookie `hf_src`, поля, отчёт «Источники»); `docs/features/training.md` — липкие фильтры, если это там описано.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` → зелёное.
- [ ] **Step 3:** commit `docs: signup sources`.
