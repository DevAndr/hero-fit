# Итоги недели для тренера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** раз в неделю тренер получает снимок «как прошла неделя у клиентов» — страница с историей, анонс на `/coach`, push в понедельник.

**Architecture:** по образцу `lib/recap` (итоги недели пользователя): чистые функции сборки → запросы и снимок в БД (`CoachWeeklyRecap` + строки `CoachRecapClient`) → тик в `runNotificationTick` → страницы `/coach/recap*`. Сигналы считаются на лету `clientSignals` (как список `/coach`).

**Tech Stack:** Next.js 16 (server components, server actions), Prisma 7, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-coach-weekly-recap-design.md`

## Global Constraints

- Только русский в интерфейсе; тексты — как в спеке.
- Без фича-флага.
- Неделя — ключ понедельника в поясе тренера (`recapWeekFor`); данные клиента — за те же даты в поясе клиента (`localMidnight`).
- Тик — понедельник ≥ `RECAP_HOUR` (9) местного времени тренера, бюджет 2000 мс на тик.
- Миграция: только новые таблицы и поле `User.notifyCoachRecap`; в SQL не должно быть `DROP INDEX` для `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- Новая связь с `User` → удаление аккаунта и «Мои данные» (`lib/account/*`, `e2e/account-data.spec.ts`).
- e2e с двумя контекстами — `--workers=8`; даты — только через `E2E_TZ`/`localAt`/`mondayWeeksAgo`; тестовые понедельники — недели в прошлом (фоновый воркер тикает по реальному времени).
- Ссылка-кнопка — `<Link className={buttonVariants()}>`; цвета — семантические токены.

## Rulings (уточнения спеки, внести в спеку в Task 1)

1. `/coach/recap` — список недель (как `/recap`), неделя — `/coach/recap/<понедельник>`; уведомление и анонс ведут на неделю. Вместо `/coach/recap/all`.
2. Создание со страницы — неделя закончилась и не старше `RECAP_LAZY_WEEKS` (8), как `getOrCreateRecap` (иначе e2e пришлось бы гонять в реальном времени); сигналы и «без ответа» — на момент создания снимка. Push — только тик и только за прошлую неделю.
3. Сигналы — на лету `clientSignals(getSignalInput(...))`, без пересчёта таблицы `CoachSignal`.
4. Клиенты снимка — активные связи (`endedAt = null`) с `createdAt` < конца недели (в поясе тренера); «новый» — связь создана внутри недели.

## Review Focus

1. Клиент в другом поясе, чем тренер (тренер UTC+3, клиент UTC−5): тренировка в воскресенье 23:00 клиента попадает в неделю, план считается по датам клиента.
2. Тренер с клиентами, подключёнными только на этой неделе (после недели снимка): снимок не создаётся, тик не перебирает его бесконечно с ошибкой.
3. Гонка тик ↔ страница и два параллельных тика: один снимок, одно уведомление.
4. Клиент удалил аккаунт / связь разорвана после снимка: страница не падает, строки нет, общие цифры прежние.
5. Тренер выключил режим тренера (`isCoach = false`): страницы 404, тик его не трогает.

---

### Task 1: Модель, миграция и чистая сборка

**Files:**
- Modify: `prisma/schema.prisma` (модели из спеки, обратные связи у `User`: `coachRecaps CoachWeeklyRecap[]`, `coachRecapRows CoachRecapClient[]`; поле `notifyCoachRecap Boolean @default(true)`)
- Create: migration `coach_weekly_recap` (`npx prisma migrate dev --name coach_weekly_recap --create-only`, проверить SQL, затем `npx prisma migrate dev`)
- Create: `lib/coach/recap.ts`, `lib/coach/recap.test.ts`
- Modify: `docs/superpowers/specs/2026-10-16-coach-weekly-recap-design.md` (Rulings 1–4)

**Interfaces — Produces (`lib/coach/recap.ts`, без `server-only`):**
```ts
export const COACH_RECAP_VERSION = 1;
export type RecapProgression = { exercise: string; kind: "up" | "deload"; from: number; to: number; bodyweight: boolean };
export type CoachRecapRow = {
  version: 1;
  isNew: boolean;
  plan: { done: number; total: number } | null;
  workouts: number;
  prevWorkouts: number;
  records: { count: number; names: string[] };          // names — до 3, уникальные, в порядке появления
  progression: { items: RecapProgression[]; more: number; ups: number }; // items — до 3; ups — все повышения
  program: { week: number; weeks: number; nextDeload: boolean; ending: boolean } | null;
  signals: SignalKind[];
  unanswered: number;
};
export type CoachRecapTotals = {
  version: 1;
  clients: number; trained: number;
  plan: { done: number; total: number } | null;
  prevPlanPct: number | null;
  workouts: number; records: number; ups: number; attention: number; unanswered: number;
};
export type ClientRecapInput = {
  isNew: boolean;
  plan: { done: number; total: number } | null;
  workouts: number; prevWorkouts: number;
  metas: Pick<FinishMeta, "records" | "progression" | "progressionSource">[];
  program: { startDate: string; weeks: number; deloadEvery: number | null } | null;
  sunday: string;                 // воскресенье недели снимка, "YYYY-MM-DD"
  signals: SignalKind[];
  unanswered: number;
};
export function buildClientRow(input: ClientRecapInput): CoachRecapRow;
export function buildTotals(rows: CoachRecapRow[], prev: CoachRecapTotals | null): CoachRecapTotals;
export const planPct: (plan: { done: number; total: number }) => number; // Math.round(done / total * 100)
export function sortRecapRows<T extends { name: string; row: CoachRecapRow }>(rows: T[]): T[];
export function recapPushBody(t: CoachRecapTotals): string;
export function isCoachRecapRow(v: unknown): v is CoachRecapRow;      // version === 1
export function isCoachRecapTotals(v: unknown): v is CoachRecapTotals;
```
Правила `program`: `week = programWeekIndex(startDate, sunday)`; `nextDeload = week + 1 <= weeks && isDeloadWeek(week + 1, deloadEvery)`; `ending = week >= weeks - 1`. Прогрессия — из метаданных без `progressionSource === "own"`, `kind` `up`/`deload` (`same` — нет); `ups` — полное число `up` до обрезки; `ups` в итогах — сумма `progression.ups`.
Порядок: сигналов больше → выше; затем `workouts === 0`; затем `records.count + progression.ups > 0`; затем по `name` (`localeCompare(…, "ru")`).
Тексты push:
- `trained === 0` → `Неделя клиентов: никто не тренировался — загляните, кому написать`
- иначе `Неделя клиентов: ${trained} из ${clients} тренировались` + (`plan` ? `, план ${planPct}%` : ``) + хвост: `attention > 0` → `. ${attention} ${plural(attention, "требует", "требуют", "требуют")} внимания`; иначе `records > 0` → `. ${records} ${plural(records, "рекорд", "рекорда", "рекордов")}`; иначе без хвоста.

- [ ] **Step 1: Тесты `lib/coach/recap.test.ts`** (имена и ключевые утверждения):
  - `buildClientRow: план и тренировки` — `plan` переносится, `null` остаётся `null`; `workouts`/`prevWorkouts`.
  - `рекорды: число по всем, до 3 уникальных названий` — 5 рекордов по 4 упражнениям → `{ count: 5, names: [первые 3 уникальных] }`.
  - `прогрессия: own и same не считаются, до 3 + more, ups — полное число` — 4 `up` + 1 `deload` + `same` + own-мета → `items.length 3`, `more 2`, `ups 4`.
  - `программа: неделя на воскресенье, следующая — разгрузка, заканчивается` — старт `2026-10-05`, 8 недель, разгрузка каждая 4-я, `sunday 2026-10-25` → `{ week: 3, weeks: 8, nextDeload: true, ending: false }`; `sunday 2026-11-22` → `ending: true`.
  - `buildTotals: суммы, trained, attention, prevPlanPct` — две строки (одна с сигналом, у другой 0 тренировок) + prev с планом 3/4 → `prevPlanPct 75`; без prev → `null`; ни у кого нет плана → `plan null`.
  - `sortRecapRows` — с 2 сигналами выше с 1; без тренировок выше рекордсмена; остальные по имени.
  - `recapPushBody` — три варианта: `"Неделя клиентов: 12 из 15 тренировались, план 85%. 2 требуют внимания"`, `"Неделя клиентов: 3 из 4 тренировались. 9 рекордов"`, `"Неделя клиентов: никто не тренировался — загляните, кому написать"`.
  - `isCoachRecapRow` — `false` на `{ version: 2 }` и `null`.
- [ ] **Step 2:** `npx vitest run lib/coach/recap.test.ts` → FAIL (модуля нет).
- [ ] **Step 3:** схема + миграция (проверить SQL на частичные индексы), `npx prisma generate`; реализовать `lib/coach/recap.ts`.
- [ ] **Step 4:** `npx vitest run lib/coach/recap.test.ts` → PASS; `npm run typecheck` → чисто.
- [ ] **Step 5:** обновить спеку (Rulings), коммит `feat(coach): weekly recap — model and pure builder`.

### Task 2: Запросы, снимок и тик

**Files:**
- Create: `lib/coach/recap-queries.ts`, `lib/coach/recap-tick.ts`
- Modify: `lib/notifications/service.ts` (шаг после `processCoachSignals`, в `try/catch` с `console.error("[coach-recap] …")`, `pushes += await processDuePushes()` при отправке)

**Interfaces — Consumes:** Task 1; `getCalendar` (`lib/plans/queries.ts`), `getSignalInput` + `clientSignals`, `isFinishMeta` (`lib/recap/meta.ts`), `recapWeekFor`/`isRecapWeek`/`shouldPushRecap` (`lib/recap/schedule.ts`), `RECAP_HOUR`/`RECAP_LAZY_WEEKS`, `localMidnight`/`addWeeks` (`lib/progress/weekly-streak.ts`), `clientDisplayName`, `notify`.

**Produces:**
```ts
// recap-queries.ts ("server-only")
export type CoachRecapView = { id: string; week: string; totals: CoachRecapTotals; seenAt: Date | null; rows: { clientId: string; name: string; row: CoachRecapRow }[] };
export async function createCoachRecap(coachId: string, week: string, coachTz: string, now?: Date): Promise<boolean>;
export async function getCoachRecap(coachId: string, week: string): Promise<CoachRecapView | null>; // rows уже отсортированы sortRecapRows
export async function getOrCreateCoachRecap(coachId: string, week: string, coachTz: string, now?: Date): Promise<CoachRecapView | null>;
export async function listCoachRecaps(coachId: string, page: number): Promise<{ items: { week: string; totals: CoachRecapTotals }[]; hasMore: boolean }>; // по 20
export async function adjacentCoachRecaps(coachId: string, week: string): Promise<{ prev: string | null; next: string | null }>;
export async function markCoachRecapSeen(coachId: string, week: string): Promise<boolean>; // true — отмечено впервые
export async function unseenCoachRecap(coachId: string, coachTz: string, now?: Date): Promise<{ week: string; totals: CoachRecapTotals } | null>; // прошлая неделя, seenAt null
// recap-tick.ts
export async function processCoachRecaps(now?: Date): Promise<number>; // число уведомлений
```
`createCoachRecap`: клиенты — `coachLink` `{ coachId, endedAt: null, createdAt: { lt: localMidnight(addWeeks(week, 1), coachTz) } }`; нет — `false`. Для каждого (`Promise.all`) — `loadClientRecapInput`: границы недели в поясе клиента; тренировки и прошлой недели — `COMPLETED` по `finishedAt`; метаданные — `xpEvent WORKOUT_COMPLETED` по id тренировок, `isFinishMeta`; план — `getCalendar(clientId, week, addDays(week, 6), tz, now)` → вхождения с `coachId === coachId`; программа — `programAssignment` пары с `startDate <= sunday`, `programEndDay >= sunday`, (`endedAt` null или ≥ конца недели), последняя по `createdAt`; сигналы — `clientSignals(await getSignalInput(coachId, clientId, tz, link.createdAt, now), now, tz).map(s => s.kind)`; без ответа — тренировки недели без `coachComment { coachId, workoutId }`. Прошлые итоги — снимок `addWeeks(week, -1)`. Запись — `db.$transaction`: `coachWeeklyRecap.create` + `coachRecapClient.createMany`; P2002 → `false`.
Тик: SQL по образцу `mondayUsers` из `lib/recap/tick.ts` — `isCoach`, понедельник ≥ 9 местного, есть активная связь с `createdAt` < начала текущей местной недели, нет снимка за `last_week`; `orderBy createdAt desc`, бюджет 2000 мс, ошибки одного тренера — `console.error`, не роняют тик. Push — снимки `last_week` с `pushedAt` и `seenAt` null у тренеров с `notifyCoachRecap`, `shouldPushRecap`; транзакция: условный `updateMany` по `pushedAt: null, seenAt: null` → `notify(tx, coachId, { type: COACH, title: "Итоги недели клиентов 📋", body: recapPushBody(totals), url: \`/coach/recap/${week}\` }, { push: true })`.

- [ ] **Step 1:** реализовать оба файла и подключить шаг в `runNotificationTick`. Проверка поведения — e2e Task 5 (данные БД; unit-моков БД в проекте для таких запросов нет).
- [ ] **Step 2:** `npm run typecheck && npm run lint` → чисто; `npm test` → все проходят.
- [ ] **Step 3:** коммит `feat(coach): weekly recap — snapshot queries and monday tick`.

### Task 3: Страницы, анонс, настройка

**Files:**
- Create: `app/(app)/coach/recap/page.tsx` (список, пусто — «Итоги появятся в понедельник после первой недели с клиентами.»), `app/(app)/coach/recap/[week]/page.tsx`
- Create: `components/coach/recap/coach-recap-view.tsx` (плитки + карточки), `components/coach/recap/recap-announce.tsx` (анонс на `/coach`), `components/coach/recap/recap-goal.tsx` (`"use client"`, `useEffect(() => reachGoal("coach_recap_open"), [])`)
- Modify: `app/(app)/coach/page.tsx` (анонс над списком, если `unseenCoachRecap`; кнопка «Итоги недели» в `actions` рядом с «Программы», иконка `BarChart3`), `lib/analytics/goals.ts` (`coach_recap_open`), `components/notifications/notification-settings.tsx` + `lib/notifications/actions.ts` + `lib/notifications/queries.ts` (`notifyCoachRecap`; переключатель «Итоги недели клиентов — в понедельник утром», описание «Сводка по всем клиентам за прошлую неделю», показывается только при `isCoach` — передать проп из `app/(app)/settings/page.tsx`)

**Interfaces — Consumes:** Task 2. Доступ — `requireCoach()` (`lib/coach/access.ts`).

Страница недели — по образцу `app/(app)/recap/[week]/page.tsx`: пояс тренера; `isRecapWeek`: `invalid` → `notFound()`, `not-ended` → `redirect("/coach/recap")`, `ok` → `getOrCreateCoachRecap`, иначе `getCoachRecap`; нет → `notFound()`. `markCoachRecapSeen` → `true` — отрисовать `<RecapGoal />`. Заголовок «Неделя клиентов», описание `weekRangeLabel(week)`, стрелки `aria-label` «Предыдущая неделя»/«Следующая неделя», ссылка «Все итоги».
Вид: `section aria-label="Итоги недели клиентов"`; плитки с `data-testid` `coach-recap-trained` («X из Y»), `coach-recap-plan` («85%», подпись ± из `prevPlanPct`), `coach-recap-workouts`, `coach-recap-records`, `coach-recap-ups`, `coach-recap-attention`, `coach-recap-unanswered`. Карточка — `li aria-label={name}`: ссылка-имя → `/coach/clients/<id>`, «новый», `SignalBadge` на каждый сигнал (ссылка → `?tab=overview`), строка `План 3/4 · 4 тренировки (+1) · Нед. 5/8` (`plural`), «следующая — разгрузка»/«заканчивается», «🏆 Рекорды: a, b, c» (+ «и ещё N»), прогрессия «↑ Жим +5 кг» / «↓ Тяга — разгрузка» (+ «ещё N»; своим весом — «доп. кг»), «💬 N без ответа» → `?tab=workouts`. Сетка плиток `grid-cols-2 sm:grid-cols-4`.
Анонс — `section aria-label="Итоги недели готовы"`: «Тренировались X из Y · план N%» + кнопка-ссылка «Смотреть» на неделю.

- [ ] **Step 1:** реализовать страницы и компоненты, настройку и цель.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 3:** коммит `feat(coach): weekly recap — pages, announce and setting`.

### Task 4: Разрыв связи, «Мои данные», 152-ФЗ

**Files:**
- Modify: `lib/coach/actions.ts` (`dropAssignments`: `tx.coachRecapClient.deleteMany({ where: { clientId, recap: { coachId } } })`)
- Modify: `lib/account/export-queries.ts`, `lib/account/export.ts` (+ тест `lib/account/export.test.ts`, если он перечисляет разделы): `coachRecapsAboutMe: { week, coach: nickname | null, data }[]`, `coachRecaps: { week, totals, clients: { client: nickname | null, data }[] }[]`
- Modify: `app/(marketing)/privacy/page.tsx` — фраза из спеки в разделе про тренера
- Modify: `e2e/account-data.spec.ts` — снимок в БД (хелпер `seedCoachRecap(coachLogin, clientLogin, week)` в `e2e/db.ts`: одна строка `CoachWeeklyRecap` с минимальными `data` + `CoachRecapClient`), экспорт тренера содержит `coachRecaps[0].clients[0].client` = ник клиента, экспорт клиента — `coachRecapsAboutMe[0].coach`; после удаления аккаунта клиента — `CoachRecapClient` клиента 0, снимок тренера остался.

- [ ] **Step 1:** дописать e2e в `account-data.spec.ts` и тест экспорта (если есть перечень разделов) → запустить: `npx playwright test e2e/account-data.spec.ts --project=desktop` → FAIL (нет разделов).
- [ ] **Step 2:** реализовать.
- [ ] **Step 3:** `npm run build && npx playwright test e2e/account-data.spec.ts --workers=8` → PASS; `npm test` → PASS.
- [ ] **Step 4:** коммит `feat(coach): weekly recap — unlink cleanup, data export, privacy`.

### Task 5: e2e сводки, документация, лендинг

**Files:**
- Create: `e2e/coach-recap.spec.ts`
- Modify: `e2e/db.ts` (хелперы: `coachRecapNotifications(login)`, `coachRecapRows(coachLogin)`; связь задним числом — `linkCoach(…, since)` уже есть; комментарий тренера в прошлом — `coachCommentOn(coachLogin, workoutId)` если нужен)
- Modify: `docs/features/coach.md` (абзац «Итоги недели»), `docs/features/platform.md` (уведомления, если там перечень), `app/(marketing)/page.tsx` (`COACH_FEATURES`: карточка «Итоги недели» — «Каждый понедельник — сводка по всем клиентам: кто тренировался, рекорды, кому нужно внимание»; визуал — простой список или без инфографики, по образцу соседних), `components/marketing/faq.tsx` (ответ про тренера), `e2e/landing.spec.ts` (число карточек)

Тесты (тестовые понедельники — свои недели в прошлом, `mondayWeeksAgo`, `localAt`; связи — `linkCoach(…, since)` раньше недели; тренировки — `seedRecapWeek` клиентам):
1. `monday tick creates a coach recap and one notification; the page shows totals, order and links` — тренер + клиенты A (2 тренировки, рекорд) и B (0 тренировок): `runTick` в пн 08:30 → нет уведомления; 09:30 ×2 + 2 параллельно → одно уведомление `/coach/recap/<неделя>`; страница: `coach-recap-trained` = «1 из 2», B выше A (без тренировок), ссылка-имя ведёт в карточку; анонс на `/coach` исчезает после просмотра.
2. `the page creates the recap before the tick; the tick after viewing sends no push`.
3. `unlinking removes the client from old recaps; totals stay` — разрыв связи клиентом в `/settings` → строки нет, `coach-recap-trained` прежний.
4. `setting off — recap without a notification`.
5. `mobile: no horizontal scroll` (проект mobile, `scrollWidth - clientWidth === 0`).
6. Review Focus 2: тренер, у которого единственный клиент подключён после недели — тик снимка не создаёт и не падает (`/coach/recap` пуст).

- [ ] **Step 1:** написать e2e; `npm run build && npx playwright test e2e/coach-recap.spec.ts --workers=8` → PASS (тесты пишутся на готовую реализацию Task 2–3; для каждого — убедиться, что он падает, если временно убрать проверяемое поведение — хотя бы для 1 и 3).
- [ ] **Step 2:** документация, лендинг, FAQ, `e2e/landing.spec.ts`; `npx playwright test e2e/landing.spec.ts --workers=8` → PASS.
- [ ] **Step 3:** полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` → всё зелёное.
- [ ] **Step 4:** коммит `feat(coach): weekly recap — e2e, docs, landing`.
