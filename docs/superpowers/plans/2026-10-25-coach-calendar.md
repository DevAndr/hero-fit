# Календарь тренера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/coach/calendar`: назначения тренера всем активным клиентам по дням недели/месяца со статусами, фильтр по группе, клик — в план клиента.

**Architecture:** Чистые функции вида — `lib/coach/calendar.ts`; данные — `getCoachCalendar` (`lib/coach/calendar-queries.ts`) поверх общей с вкладкой «План» `coachOccurrences` (выделяется из `getClientPlan`); страница `app/(app)/coach/calendar/page.tsx` и компонент `components/coach/coach-calendar.tsx`.

**Tech Stack:** Next.js 16 (App Router, Server Components), Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-coach-calendar-design.md`

## Global Constraints

- Без фича-флага; доступ — `requireCoach()` (не тренеру 404).
- Только назначения этого тренера и отменённые клиентом по ним (`coachOccurrences`), только активные клиенты (`CoachLink.endedAt = null`). Новых таблиц и данных нет.
- Статусы вида: `done` («выполнено»), `skipped` («пропущено»), `missed` («не выполнено»), `upcoming`. Соответствие `PlanStatus` (`lib/plans/match.ts`): `done` → `done`, `missed` → `missed`, `today`/`planned` → `upcoming`; отменённые — `skipped`.
- Дата и время — клиента; при другом поясе — пометка «по его времени» с `title` = пояс клиента.
- Месяц — до 3 строк в ячейке и «ещё N». Параллельно — не более 8 клиентов (`CALENDAR_CONCURRENCY = 8`).
- Тексты: «Календарь», «Неделя», «Месяц», «Сегодня», «Все», «N тренировок у M клиентов» (`plural`), «выполнено X из Y прошедших», «Пока нет клиентов», «На эти дни ничего не назначено».

## Review Focus

- Клиент в поясе, где «сегодня» уже другое число, чем у тренера: его сегодняшнее невыполненное — `upcoming`, а не `missed` (статус берётся из `getCalendar` клиента с его поясом). Тест — Task 2 (e2e: клиент в другом поясе, назначение на его сегодня).
- `?group=` чужой группы или мусор — показываются все клиенты, без ошибки. Тест — Task 3 (e2e).
- `?date=2026-13-45` / пусто — сегодня. Тест — Task 3 (e2e).
- Разовое назначение тренера, перенесённое клиентом на другой день, стоит в новом дне (как в плане клиента). Покрыто тем, что данные — из `getCalendar`; отдельного теста нет — ревьюеру проверить, что `coachOccurrences` не теряет перенос.
- Вкладка «План» клиента после выделения `coachOccurrences` ведёт себя как раньше. Тест — Task 2 (существующие `e2e/coach-plan.spec.ts`, `e2e/coach-copy-plan.spec.ts`).

---

### Task 1: Чистые функции вида

**Files:**
- Create: `lib/coach/calendar.ts`, `lib/coach/calendar.test.ts`

**Interfaces:**
- Produces:
  - `type CoachCalendarStatus = "done" | "skipped" | "missed" | "upcoming"`.
  - `type CoachCalendarItem = { key: string; clientId: string; clientName: string; clientTz: string; date: string; time: string; title: string; status: CoachCalendarStatus }`.
  - `statusOf(status: PlanStatus | "skipped"): CoachCalendarStatus`.
  - `groupByDay(items: CoachCalendarItem[]): Map<string, CoachCalendarItem[]>` — по дате, внутри по `time`, затем `clientName.localeCompare(.., "ru")`.
  - `dayPreview<T>(items: T[], limit = 3): { shown: T[]; more: number }`.
  - `calendarSummary(items): { workouts: number; clients: number; done: number; past: number }` — `past` — не `upcoming`, `done` — из них `done`.
  - `CALENDAR_CONCURRENCY = 8`.

- [ ] **Step 1: Тесты** — `statusOf`: `done`→`done`, `missed`→`missed`, `today`→`upcoming`, `planned`→`upcoming`, `skipped`→`skipped`. `groupByDay`: два дня, в одном — «Яна 18:00», «Аня 18:00», «Боря 09:00» → порядок Боря, Аня, Яна. `dayPreview([1,2,3,4,5])` → `{ shown: [1,2,3], more: 2 }`, `dayPreview([1])` → `{ shown: [1], more: 0 }`. `calendarSummary` на 2 клиентах (done, skipped, missed, upcoming, upcoming) → `{ workouts: 5, clients: 2, done: 1, past: 3 }`.
- [ ] **Step 2:** `npx vitest run lib/coach/calendar.test.ts` — FAIL (нет модуля).
- [ ] **Step 3:** Реализация.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(coach): calendar view rules`.

### Task 2: Данные — `coachOccurrences` и `getCoachCalendar`

**Files:**
- Modify: `lib/coach/plan-queries.ts` (выделить `coachOccurrences`, `getClientPlan` — через неё)
- Create: `lib/coach/calendar-queries.ts`
- Modify: `e2e/db.ts` (+ `coachGroup(coachLogin, name, clientLogins): Promise<string>` — id группы; `completeAssignment(clientLogin, key, finishedAt: Date)` — завершённая тренировка с `planKey = key`, по образцу `seedXpWorkout`; `cancelAssignment(key)` — `PlanEntry.cancelled = true` для `e:<id>`)
- Create: `e2e/coach-calendar.spec.ts` (только desktop для логики; данные — через `e2e/db.ts`)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `coachOccurrences(coachId: string, clientId: string, from: string, to: string, tz: string, now: Date): Promise<CoachPlanItem[]>`.
  - `getCoachCalendar(coachId: string, from: string, to: string, opts: { groupId: string | null; now: Date }): Promise<{ clients: number; items: CoachCalendarItem[] }>` — `clients` — активных клиентов (с учётом группы) для пустого состояния. Отбор клиентов с назначениями: `PlanSeries` с `coachId` и `startDate <= to` (и `endDate` null или `>= from` — свериться с полями модели) или `PlanEntry` с `coachId`/`series.coachId` и `date` в диапазоне. Параллельность — пачками по `CALENDAR_CONCURRENCY`.
  - Группа: `groupId` проверяется как группа этого тренера; чужая/нет — без фильтра (`groupId` → `null`).

- [ ] **Step 1: e2e (RED) — через страницу из Task 3 нельзя; проверка данных — в Task 3. Здесь — регрессия:** `npx playwright test e2e/coach-plan.spec.ts e2e/coach-copy-plan.spec.ts --project=desktop --workers=8` зелёные до рефакторинга (база).
- [ ] **Step 2:** Выделить `coachOccurrences`, `getClientPlan` = `coachOccurrences(coachId, clientId, today-28, today+13, tz, now)` + разбиение на `upcoming`/`past` как раньше.
- [ ] **Step 3:** Те же e2e — PASS; `npm run typecheck`.
- [ ] **Step 4:** `getCoachCalendar` + хелперы `e2e/db.ts`.
- [ ] **Step 5:** Commit `refactor(coach): coachOccurrences shared by plan tab and calendar` и `feat(coach): coach calendar query`.

### Task 3: Страница, компонент, навигация

**Files:**
- Create: `app/(app)/coach/calendar/page.tsx`, `components/coach/coach-calendar.tsx`
- Modify: `components/app/nav.ts` (`COACH_CALENDAR_NAV_ITEM = { href: "/coach/calendar", label: "Календарь", icon: CalendarRange, mobile: false }`), `components/app/nav-links.tsx` (тренеру — после «Клиентов»), `components/app/user-menu.tsx` (тренеру — пункт «Календарь клиентов» на телефоне, `lg:hidden`), `app/(app)/coach/page.tsx` (ссылка «Календарь» в шапке страницы)
- Modify: `e2e/coach-calendar.spec.ts`

**Interfaces:**
- Consumes: Task 1, Task 2; `viewRange`, `mondayOf`/`addDays` из `lib/plans/view.ts`/`lib/plans/expand.ts`; `planDateSchema` (`lib/plans/schema.ts`); `clientDisplayName`.
- Страница: `requireCoach()`; `view`, `date` (неверная → сегодня тренера), `group`; `getCoachCalendar`; группы тренера для чипов; заголовок диапазона («27 окт — 2 нояб» / «Ноябрь 2026»). Компонент — серверный, раскрытие «ещё N» — нативный `<details>` (без JS).
- Разметка для тестов: день — `role="region"` с `aria-label` = дата «понедельник, 27 октября»; строка — ссылка с текстом «19:00 Маша · Ноги — база» и статусом текстом («выполнено», «пропущено», «не выполнено»).

- [ ] **Step 1: e2e (RED):**
  - «two clients appear on their days with name and time» — тренер, Маша и Боря (`linkCoach`), `coachAssignOnce` на `localDate(1)` 19:00 и `localDate(2)` 08:30; `/coach/calendar?date=<localDate(1)>` (неделя, где оба дня — если перескок недели, взять даты внутри одной недели через `mondayOf`) → в регионе дня — ссылка «19:00 Маша · …», в другом — «08:30 Боря · …».
  - «statuses: done, skipped, missed» — три назначения Маше в прошлые дни этой/прошлой недели (`completeAssignment`, `cancelAssignment`, без отметки) → «выполнено», «пропущено», «не выполнено»; сводка «выполнено 1 из 3 прошедших».
  - «group filter keeps one client; foreign group shows all» — `coachGroup(coach, "Утро", [masha])`, чип «Утро» → только Маша; `?group=<id группы другого тренера>` → оба.
  - «row opens the client's plan» → URL `/coach/clients/<id>?tab=plan`.
  - «month: 4 on one day — 3 rows and «ещё 1»».
  - «other coach's client and a former client are not shown» (`endCoachLinks` у второго тренера/разрыв).
  - «client in another timezone: today's assignment is upcoming, marked «по его времени»» — клиент с поясом `Etc/GMT-12`/`+12` относительно `E2E_TZ` (`setTimeZone`), назначение на его сегодня.
  - «bad date falls back to today»; «not a coach — 404»; «coach nav has «Календарь»».
- [ ] **Step 2:** `npm run build && npx playwright test e2e/coach-calendar.spec.ts --project=desktop` — FAIL.
- [ ] **Step 3:** Реализация.
- [ ] **Step 4:** PASS; плюс `--project=mobile` для «coach nav» (пункт в меню профиля) и отсутствия горизонтальной прокрутки на 360 px (`scrollWidth <= 360`).
- [ ] **Step 5:** Commit `feat(coach): coach calendar page`.

### Task 4: Документация и прогон

**Files:**
- Modify: `docs/features/coach.md` (раздел «Календарь тренера»)

- [ ] **Step 1:** Документация.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное.
- [ ] **Step 3:** Commit `docs(coach): coach calendar`; влить `feat/coach-calendar` в `release/2027-08-trainers` с `--no-ff`, удалить ветку.
