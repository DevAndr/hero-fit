# Сигналы риска клиентов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер видит у клиентов сигналы «Пропуски плана», «Застой на весе», «Спад активности», «Неактивен» в списке и карточке и получает уведомление, когда сигнал появляется.

**Architecture:** правила — чистые функции `lib/coach/signals.ts`; входные данные на клиента собирает `getSignalInputs` (`lib/coach/signals-queries.ts`); список и карточка считают сигналы на лету, таблица `CoachSignal` нужна только тику (`processCoachSignals` в `runNotificationTick`), чтобы уведомлять один раз на появление.

**Tech Stack:** Next.js 16, Prisma 7 (миграция SQL с частичным индексом), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-coach-signals-design.md`

## Global Constraints

- Пояс правил — клиента (`safeTimeZone(User.timeZone)`); время проверки — тренера: ≥ 10:00 местного, раз в день (`User.coachSignalsDay`, `YYYY-MM-DD`).
- Назначения — только этого тренера; окно назначений — 28 дней (как `PAST_DAYS` в `getClientPlan`), тренировок — 42 дня.
- Пороги: 2 пропуска подряд; `fails ≥ 2`; разгрузка ≤ 14 дней; связь ≥ 42 дней, среднее ≥ 2, последние 14 дней ≤ среднего / 2; неактивность 7 дней.
- `INACTIVE` гасит `ACTIVITY_DROP`; сегодняшнее назначение — не пропуск.
- Тексты без рода. Метки: «Пропуски плана», «Застой на весе», «Спад активности», «Неактивен».
- Уведомление: `notify(…, { type: COACH, title: signalsNotice(...), url: "/coach/clients/<id>" }, { push: true })`, одно на клиента за проверку, только по новым сигналам.
- Частичный уникальный индекс `CoachSignal_open` — в SQL миграции; при `migrate dev` не удалять.
- Цвета — семантические токены (`destructive`, `streak`/`xp` и т. п. как в `client-list.tsx`).

## Review Focus

- Клиент, привязанный сегодня, без тренировок и назначений — никаких сигналов, кроме `INACTIVE` через 7 дней от `linkedAt`. → unit в Task 1.
- Назначение на сегодня с прошедшим временем не считается пропуском (в т. ч. в 23:59 пояса клиента, когда у тренера уже завтра). → unit в Task 1.
- Тренер в другом поясе, чем клиент: проверка по поясу тренера, правила по поясу клиента. → unit в Task 1 (пояс параметром), e2e Task 3 использует тестовые часы.
- Разрыв связи и повторная связь с тем же тренером — старые открытые сигналы не мешают и не дублируют уведомление навсегда. → Task 2 (`dropAssignments` закрывает), unit `signalsDiff`.
- Ошибка на одном тренере (битые данные) не роняет тик остальных. → Task 3, код `try/catch` на тренера (проверка ревью).

---

### Task 1: Правила сигналов (чистые функции)

**Files:**
- Create: `lib/coach/signals.ts`, `lib/coach/signals.test.ts`
- Modify: `lib/coach/clients.ts` (`ClientRow.signals`, новая `sortClients`, `clientFlags` удаляется — `inactive` теперь сигнал), `lib/coach/clients.test.ts` (если есть тесты `sortClients`/`clientFlags` — переписать под новую сортировку)

**Interfaces:**
- Produces:
  - `type SignalKind = "MISSED_PLAN" | "STALLED" | "ACTIVITY_DROP" | "INACTIVE"` (строки совпадают с enum Prisma из Task 2).
  - `type SignalInput = { linkedAt: Date; lastWorkoutAt: Date | null; workoutsAt: Date[]; plan: { date: string; status: "done" | "missed" | "skipped" | "today" | "planned" }[]; targets: { fails: number; unloadedAt: Date | null; updatedAt: Date }[] }`
  - `type Signal = { kind: SignalKind; since: Date }`
  - `clientSignals(input: SignalInput, now: Date, tz: string): Signal[]` — порядок: `MISSED_PLAN`, `INACTIVE`, `STALLED`, `ACTIVITY_DROP`.
  - `signalsDiff(open: SignalKind[], current: SignalKind[]): { open: SignalKind[]; resolve: SignalKind[] }`
  - `SIGNAL_LABELS: Record<SignalKind, string>`, `signalTone(kind): "alert" | "warn"` (`MISSED_PLAN`, `INACTIVE` — alert).
  - `signalText(signal: Signal, tz: string): string` — пояснение для карточки, например «Две последние назначенные тренировки не выполнены (с 3 октября)», «Нет тренировок с 1 октября», «Задание не выполняется 2 раза подряд или была разгрузка», «За 2 недели вдвое меньше тренировок, чем обычно».
  - `signalsNotice(name: string, kinds: SignalKind[]): string` — «Маша: пропущены 2 тренировки подряд · спад активности»; фразы: `MISSED_PLAN` → «пропущены 2 тренировки подряд», `INACTIVE` → «7 дней без тренировок», `STALLED` → «застой на весе», `ACTIVITY_DROP` → «спад активности».
  - `ClientRow` (в `clients.ts`): поле `signals: SignalKind[]` вместо вычисления `inactive`; `sortClients(rows)` — сначала `signals.length > 0` (больше — выше; при равенстве — `lastWorkoutAt` раньше выше, `null` — выше всех), затем остальные — `lastWorkoutAt` позже выше.

Правила (`since`):
- `MISSED_PLAN`: из `plan` с `date < today` (сегодня — `dayKey(now, tz)`), по убыванию даты; две последние обе `missed`/`skipped` → `since` = начало дня более ранней из двух (полночь в `tz`).
- `INACTIVE`: `now − (lastWorkoutAt ?? linkedAt) ≥ 7 дней` → `since = lastWorkoutAt ?? linkedAt`.
- `STALLED`: есть target с `fails ≥ 2` (since — `updatedAt`) или `unloadedAt ≥ now − 14 дней` (since — `unloadedAt`); берётся самый ранний.
- `ACTIVITY_DROP` (если нет `INACTIVE`): `now − linkedAt ≥ 42 дня`; `base = count(workoutsAt в (now−42д, now−14д]) / 2`; `base ≥ 2` и `count(workoutsAt в (now−14д, now]) ≤ base / 2` → `since = now − 14 дней`.

- [ ] **Step 1: Write the failing tests** (`lib/coach/signals.test.ts`; `now = new Date("2026-10-11T09:00:00Z")`, `tz = "Europe/Moscow"`, хелпер `input(patch)` с `linkedAt` 100 дней назад, `lastWorkoutAt` вчера, пустыми списками)

```ts
// MISSED_PLAN
expect(kinds({ plan: [p("2026-10-08", "missed"), p("2026-10-10", "skipped")] })).toContain("MISSED_PLAN");
expect(kinds({ plan: [p("2026-10-08", "missed"), p("2026-10-10", "done")] })).not.toContain("MISSED_PLAN");
expect(kinds({ plan: [p("2026-10-10", "missed")] })).not.toContain("MISSED_PLAN");
expect(kinds({ plan: [p("2026-10-08", "missed"), p("2026-10-11", "today")] })).not.toContain("MISSED_PLAN");
expect(sig({ plan: [p("2026-10-06", "missed"), p("2026-10-08", "missed")] }, "MISSED_PLAN").since).toEqual(new Date("2026-10-05T21:00:00Z"));
// INACTIVE
expect(kinds({ lastWorkoutAt: daysAgo(7) })).toContain("INACTIVE");
expect(kinds({ lastWorkoutAt: daysAgo(6) })).not.toContain("INACTIVE");
expect(kinds({ lastWorkoutAt: null, linkedAt: daysAgo(1) })).toEqual([]);
// STALLED
expect(kinds({ targets: [t({ fails: 2 })] })).toContain("STALLED");
expect(kinds({ targets: [t({ fails: 1 })] })).not.toContain("STALLED");
expect(kinds({ targets: [t({ unloadedAt: daysAgo(14) })] })).toContain("STALLED");
expect(kinds({ targets: [t({ unloadedAt: daysAgo(15) })] })).not.toContain("STALLED");
// ACTIVITY_DROP: база — 4 тренировки за дни 15…42 (среднее 2), последние 14 дней — 1
expect(kinds({ workoutsAt: [...at(20, 25, 30, 35), ...at(3)] })).toContain("ACTIVITY_DROP");
expect(kinds({ workoutsAt: [...at(20, 25, 30), ...at(3)] })).not.toContain("ACTIVITY_DROP"); // среднее 1,5
expect(kinds({ workoutsAt: [...at(20, 25, 30, 35), ...at(3, 5)] })).not.toContain("ACTIVITY_DROP"); // 2 > 1
expect(kinds({ linkedAt: daysAgo(41), workoutsAt: [...at(20, 25, 30, 35), ...at(3)] })).not.toContain("ACTIVITY_DROP");
expect(kinds({ lastWorkoutAt: daysAgo(10), workoutsAt: at(20, 25, 30, 35, 10) })).toEqual(["INACTIVE"]); // неактивность гасит спад
// signalsDiff
expect(signalsDiff(["STALLED", "INACTIVE"], ["INACTIVE", "MISSED_PLAN"])).toEqual({ open: ["MISSED_PLAN"], resolve: ["STALLED"] });
// signalsNotice
expect(signalsNotice("Маша", ["MISSED_PLAN", "ACTIVITY_DROP"])).toBe("Маша: пропущены 2 тренировки подряд · спад активности");
// sortClients — в clients.test.ts: [без сигналов свежий, 1 сигнал давний, 2 сигнала, 1 сигнал без тренировок] →
// [2 сигнала, 1 сигнал без тренировок, 1 сигнал давний, без сигналов]
```

- [ ] **Step 2: Run** `npx vitest run lib/coach/signals.test.ts lib/coach/clients.test.ts` — FAIL (модуля нет / старая сортировка).

- [ ] **Step 3: Implement** `signals.ts` и правки `clients.ts`. Чтобы typecheck прошёл до Task 2: `getCoachClients` временно отдаёт `signals: []`, `client-list.tsx` вместо `clientFlags(r, now).inactive` читает `r.signals.includes("INACTIVE")`.

- [ ] **Step 4: Run** те же тесты — PASS; `npm run typecheck` — чисто.

- [ ] **Step 5: Commit** `feat(coach): client risk signal rules`

### Task 2: Схема, данные и показ в кабинете тренера

**Files:**
- Modify: `prisma/schema.prisma` (enum `CoachSignalKind` с 4 значениями; модель `CoachSignal`; `User.coachSignalsDay String?`; `CoachTarget.unloadedAt DateTime?`; обратные связи у `User`)
- Create: `prisma/migrations/20261011120000_coach_signals/migration.sql` (сгенерировать `npx prisma migrate dev --create-only --name coach_signals`, затем дописать `CREATE UNIQUE INDEX "CoachSignal_open" ON "CoachSignal" ("coachId", "clientId", kind) WHERE "resolvedAt" IS NULL;` и переименовать папку под дату)
- Modify: `lib/coach/progression-apply.ts` (в `tx.coachTarget.update` при `result.kind === "deload"` — `unloadedAt: new Date()`)
- Modify: `lib/coach/actions.ts` (`dropAssignments`: `tx.coachSignal.updateMany({ where: { coachId, clientId, resolvedAt: null }, data: { resolvedAt: new Date() } })`)
- Create: `lib/coach/signals-queries.ts`
- Modify: `lib/coach/queries.ts` (`getCoachClients` → `signals` из `clientSignals`), `components/coach/client-list.tsx` (метки сигналов), `app/(app)/coach/clients/[id]/page.tsx` (блок «Требует внимания» в `Overview`)
- Modify: `e2e/db.ts` (хелперы), Create: `e2e/coach-signals.spec.ts`

**Interfaces:**
- Consumes: Task 1 целиком.
- Produces:
  - `getSignalInput(coachId: string, clientId: string, tz: string, linkedAt: Date, now: Date): Promise<SignalInput>` и `getSignalInputs(coachId: string, now: Date): Promise<Map<string, { input: SignalInput; tz: string; name: string }>>` (все активные клиенты; `plan` — `[...past, ...upcoming]` из `getClientPlan`, статусы как есть; `workoutsAt` — `finishedAt` завершённых за 42 дня; `targets` — `CoachTarget` клиента по шаблонам тренера).
  - e2e: `coachTargetSet(clientLogin, exerciseName, patch: { fails?: number; unloadedAt?: Date })`, `coachNotifications(coachLogin): Promise<{ title: string; url: string }[]>` (тип `COACH`, по `createdAt`).

UI:
- `client-list.tsx`: на каждый сигнал — метка `SIGNAL_LABELS[kind]`; tone `alert` — как нынешняя «7+ дней без тренировок» (`bg-destructive/10 text-destructive`, `CircleAlert`), `warn` — `bg-streak/10 text-streak`, иконка `TriangleAlert`. «Пора увеличить вес» — как сейчас. `ul` — прежний `aria-label="Клиенты"`; у метки `data-testid="client-signal"`.
- `Overview`: если сигналы есть — `<section aria-label="Требует внимания">` с заголовком «Требует внимания», по строке на сигнал: метка, `signalText`, ссылка «Открыть» → `MISSED_PLAN` `?tab=plan`, `STALLED` `?tab=plan#targets` (у раздела заданий в `client-targets.tsx` — `id="targets"`, если его нет), остальные `?tab=workouts`.

- [ ] **Step 1: Write the failing e2e** (`e2e/coach-signals.spec.ts`; тренер и клиент — как в `coach-plan.spec.ts`: `registerUser` ×2, `enableCoach`, `linkCoach`, `coachTemplate`)

```ts
test("missed plan: label in the list and the attention block in the card", ...)
// coachAssignOnce на localAt(-3 дня) и localAt(-1 день) (даты — через E2E_TZ/localAt из e2e/tz.ts), без тренировок
// тренер: /coach → у строки клиента метка «Пропуски плана»; карточка → region «Требует внимания» содержит
// «Пропуски плана» и ссылку на ?tab=plan.
test("stalled target shows «Застой на весе»", ...)
// coachTarget(... { weight: 60, step: 2.5 }) + coachTargetSet(... { fails: 2 }) → метка «Застой на весе».
test("a fresh client has no signals", ...)
// только связь → в /coach нет [data-testid=client-signal].
```

- [ ] **Step 2: Run** `npm run build && npx playwright test coach-signals` — FAIL.

- [ ] **Step 3: Implement** схему и миграцию (`npm run db:migrate` на dev-базе; e2e-база мигрирует сама), `unloadedAt`, `dropAssignments`, запросы, UI.

- [ ] **Step 4: Run** `npm run build && npx playwright test coach-signals coach coach-plan coach-targets` — PASS; `npm test`, `npm run typecheck`, `npm run lint` — чисто.

- [ ] **Step 5: Commit** `feat(coach): signals in the client list and card; CoachSignal, unloadedAt`

### Task 3: Ежедневная проверка и уведомление тренеру

**Files:**
- Create: `lib/coach/signals-tick.ts`
- Modify: `lib/notifications/service.ts` (`runNotificationTick`: `reminders += await processCoachSignals(now)` в своём `try/catch` с `console.error("[coach-signals] …")`)
- Test: `e2e/coach-signals.spec.ts`

**Interfaces:**
- Consumes: `clientSignals`, `signalsDiff`, `signalsNotice` (Task 1), `getSignalInputs` (Task 2), `notify` (`lib/notifications/service.ts`), `dayKey`/`safeTimeZone`.
- Produces: `processCoachSignals(now?: Date): Promise<number>` — число отправленных уведомлений.

Алгоритм: тренеры с `isCoach = true`, есть `CoachLink` с `endedAt = null`, `coachSignalsDay` ≠ `dayKey(now, tzТренера)` и местный час ≥ 10 (отбор — в JS по списку тренеров с активными связями; их мало). Для тренера: `getSignalInputs` → для клиента `current = clientSignals(...)`, `open` — `CoachSignal` пары с `resolvedAt = null`; в транзакции: создать новые (`since`, `notifiedAt = now`), закрыть пропавшие, при новых — `notify` тренеру. Затем `coachSignalsDay = сегодня` тренера. Гонку двух тиков гасит условный `updateMany` по `coachSignalsDay` в начале обработки тренера (взял день — обрабатываю, `count = 0` — пропускаю), уникальный индекс — от дублей сигналов (`P2002` — пропустить клиента).

- [ ] **Step 1: Write the failing e2e**

```ts
test("daily check notifies the coach once per new signal and resolves it after a workout", ...)
// пропуски как в Task 2; tomorrow = localAt(+1 день, 12:00); runTick(request, tomorrow) → coachNotifications(coach)
// содержит ровно одно с title /: пропущены 2 тренировки подряд$/ и url /coach/clients/<id>;
// повторный runTick(request, tomorrow) → всё ещё одно.
// Клиент завершает тренировку из следующего назначения (coachAssignOnce на сегодня → запуск из плана как в
// coach-plan.spec.ts → finish); runTick(request, localAt(+2 дня, 12:00)) → в БД у сигнала MISSED_PLAN resolvedAt не null
// (хелпер coachSignals(coachLogin) в e2e/db.ts: kind, resolvedAt).
```

Фоновый воркер e2e тикает по реальному времени и может создать сигнал раньше `runTick` — тест считает уведомления после тиков, а не «до/после», поэтому от этого не зависит.

- [ ] **Step 2: Run** `npm run build && npx playwright test coach-signals -g "daily check"` — FAIL.

- [ ] **Step 3: Implement** `signals-tick.ts`, вызов в тике.

- [ ] **Step 4: Run** `npm run build && npx playwright test coach-signals notifications recap` — PASS; `npm test` — PASS.

- [ ] **Step 5: Commit** `feat(coach): daily signal check notifies the coach`

### Task 4: Документация и полный прогон

**Files:**
- Modify: `CLAUDE.md` (пункт «Режим тренера»: сигналы — правила `lib/coach/signals.ts`, запросы, `CoachSignal` и частичный индекс `CoachSignal_open`, `coachSignalsDay`, `unloadedAt`, проверка в тике ≥ 10:00 пояса тренера, метки и блок «Требует внимания»; e2e-хелперы)

- [ ] **Step 1:** обновить `CLAUDE.md`.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — зелёное (флейки под нагрузкой — `--last-failed`, указать в отчёте).
- [ ] **Step 3: Commit** `docs: coach risk signals in CLAUDE.md`
