# Программы тренера на несколько недель — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер создаёт программу (неделя-шаблон + правило веса и разгрузок) и назначает её клиенту; вес недели подставляется при запуске тренировки.

**Architecture:** библиотека `CoachProgram` и снимок `ProgramAssignment` + `ProgramBase`; в календарь — обычные `PlanSeries` с `programAssignmentId`. Вес недели считает чистая `programWeek` в `lib/coach/program.ts`; наложение — внутри `getTemplateTargets`, единой точки запуска. Всё под флагом `coach_programs`.

**Tech Stack:** Next.js 16 (server actions), Prisma 7, Zod, Vitest, Playwright, shadcn/Base UI.

**Spec:** `docs/superpowers/specs/2026-10-16-coach-mesocycles-design.md`

## Global Constraints

- Флаг `coach_programs` (реестр `lib/flags/registry.ts`, `expires: "2027-04-30"`); без флага — ни страниц, ни кнопок, ни наложения, ни уведомления «заканчивается».
- Диапазоны: недели 2…16; шаг PERCENT 0,5…10, KG 0,5…20; `deloadEvery` 3…8 или null; `deloadPct` 5…30 (по умолчанию 10); дни 1…7 без повторов; название 1…60; база 0…1000.
- Округление веса: до 2,5 кг, база < 20 кг — до 0,5 кг; обычная неделя не ниже базы.
- Проверочный пример: база 100, +2,5 %, разгрузка каждая 4-я −10 % → 100; 102,5; 105; 95 (−1 подход); 107,5; 110; 112,5.
- Неделя — пн…вс; `weekdayOf` из `lib/dates.ts` (0 = пн). Даты — ключи `YYYY-MM-DD` в поясе клиента (`dayKey`).
- Тексты: «Неделя 3/8», «Разгрузка · неделя 4/8», «Новая программа от тренера: <название>, 8 недель с 20 окт.», «Программа <клиента> заканчивается через неделю», «Изменения — для новых назначений».
- Новая связь с `User` → удаление аккаунта и «Мои данные» (`lib/account/*`, `e2e/account-data.spec.ts`). Новые числовые поля — с `selectOnFocus`.
- Миграция: проверить SQL — не трогать `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- e2e с глобальным флагом — `mode: "serial"`, только desktop, `--workers=8`.

## Review Focus

- Клиент запускает тренировку программы из «От тренера» (не из календаря) в воскресенье вечером в своём поясе — неделя считается по дню клиента, а не сервера (UTC). → тест в Task 1 (`programWeekIndex` с поясом) и Task 4.
- Шаблон программы изменили: добавили упражнение без базы — вес по обычным правилам, без ошибки; убрали — база не читается. → тест в Task 4.
- Назначение со стартом на текущей неделе в четверг — серии начинаются с сегодня/будущих дней, не задним числом. → тест в Task 3.
- Флаг выключили посреди программы — запуск даёт вес задания, сводка без «Программа: неделя». → e2e в Task 6.
- Двойной клик «Назначить» / две вкладки — у клиента не две активные программы. → Task 3 (блокировка строки клиента `FOR UPDATE` в транзакции, как в `createGoalAction`).

---

### Task 1: Флаг, модель и правило

**Files:**
- Modify: `lib/flags/registry.ts`, `prisma/schema.prisma`
- Create: миграция `prisma/migrations/<ts>_coach_programs/`, `lib/coach/program.ts`, `lib/coach/program.test.ts`

**Interfaces — Produces:**
```ts
export type ProgramRule = { weeks: number; stepKind: "PERCENT" | "KG"; stepValue: number; deloadEvery: number | null; deloadPct: number };
export function programWeekIndex(startDate: string, day: string): number | null; // null до старта
export function isDeloadWeek(week: number, deloadEvery: number | null): boolean;
export function programWeek(rule: ProgramRule, base: { weight: number; fromWeek: number }, week: number): { weight: number; setsDelta: 0 | -1; deload: boolean };
export function programPreview(rule: ProgramRule, base: { weight: number; fromWeek: number }): { week: number; weight: number; deload: boolean }[];
export function programLabel(week: number, weeks: number, deload: boolean): string;
export function programEndDay(startDate: string, weeks: number): string; // последний день (вс)
export const programSchema: z.ZodType<...>; // name, weeks, stepKind, stepValue, deloadEvery, deloadPct, days[{weekday, templateId, time, durationMin}]
export const assignProgramSchema: z.ZodType<...>; // programId, startDate (понедельник), bases[{templateId, exerciseId, weight}]
```

- [ ] **Step 1: Флаг** `coach_programs: { description: "Программы тренера на несколько недель: вес по неделям и разгрузки", expires: "2027-04-30" }`; тест реестра (`lib/flags/*.test.ts`) зелёный.
- [ ] **Step 2: Модель** — enum `ProgramStep`, `CoachProgram`, `CoachProgramDay`, `ProgramAssignment`, `ProgramBase` ровно как в спеке; `PlanSeries.programAssignmentId String?` (onDelete SetNull, индекс); обратные связи у `User` (`coachPrograms`, `programAssignmentsAsClient`, `programAssignmentsAsCoach`) и `WorkoutTemplate` (`programDays`). `npx prisma migrate dev --name coach_programs --create-only`, проверить SQL (нет DROP частичных индексов), применить, `npx prisma generate`.
- [ ] **Step 3: Падающие тесты** `lib/coach/program.test.ts`:
  - `programWeekIndex("2026-10-19", "2026-10-18")` → null; `"2026-10-19"` → 1; `"2026-10-25"` → 1; `"2026-10-26"` → 2.
  - проверочный пример: `programPreview({weeks:7, stepKind:"PERCENT", stepValue:2.5, deloadEvery:4, deloadPct:10}, {weight:100, fromWeek:1}).map(w => w.weight)` → `[100, 102.5, 105, 95, 107.5, 110, 112.5]`; `programWeek(...,4).setsDelta` → -1.
  - KG: база 60, шаг 2,5, без разгрузки, неделя 3 → 65.
  - гантели: база 12, +5 %, неделя 2 → 12,5 (округление 0,5); база 10, +2,5 %, неделя 2 → 10 (не ниже базы).
  - база 0 → вес 0, на разгрузке `setsDelta` -1.
  - `fromWeek: 3`, база 95, +2,5 %, разгрузка каждая 4-я: неделя 3 → 95, неделя 4 → разгрузка 85,5→85, неделя 5 → 97,5.
  - `programLabel(4, 8, true)` → «Разгрузка · неделя 4/8»; `programLabel(3, 8, false)` → «Неделя 3/8».
  - схемы: недели 1 и 17 — ошибка; повтор дня — ошибка; `startDate` не понедельник — ошибка.
- [ ] **Step 4:** `npx vitest run lib/coach/program.test.ts` — FAIL (модуля нет).
- [ ] **Step 5: Реализация** `lib/coach/program.ts`. k = число обычных недель в `[fromWeek, week)`; обычная: PERCENT `base·(1+p/100)^k`, KG `base + k·step`; разгрузка — вес прошлой обычной недели (k − 1; при k = 0 — база) × (1 − deloadPct/100), без «не ниже базы»; округление `Math.round(w / q) * q`, q = 2.5 или 0.5 (база < 20); обычная — `max(base, …)`.
- [ ] **Step 6:** тесты PASS, `npm run typecheck`.
- [ ] **Step 7: Commit** `feat(coach-programs): flag, models and week rule`.

### Task 2: Библиотека программ

**Files:**
- Create: `lib/coach/program-actions.ts` (`saveProgramAction(id: string | null, input): Promise<Result>`, `deleteProgramAction(id)`), `lib/coach/program-queries.ts` (`getCoachPrograms(coachId)`, `getProgram(coachId, id)`), `app/(app)/coach/programs/page.tsx`, `components/coach/program-editor.tsx`, `components/coach/program-preview.tsx`
- Modify: `app/(app)/coach/page.tsx` (ссылка «Программы» при флаге)

**Interfaces:** Consumes `programSchema`, `programPreview` (Task 1). Produces `getCoachPrograms(coachId): Promise<{ id; name; weeks; rule: ProgramRule; days: { weekday; templateId; templateName; time; durationMin }[] }[]>`.

- [ ] **Step 1:** действия — `requireCoach` + `isEnabled("coach_programs", coach.id)` (иначе «Недоступно»); шаблоны дней — только свои (`userId = coach.id`), иначе «Шаблон не найден»; сохранение — замена дней целиком в транзакции; до 30 программ у тренера («Не больше 30 программ»).
- [ ] **Step 2:** страница `/coach/programs` (без флага — `notFound()`): список, «Новая программа», редактор в диалоге (поля Task 1, числовые — `selectOnFocus`), предпросмотр «неделя → вес» на базе 100 (`programPreview`), подпись «Изменения — для новых назначений», удаление с подтверждением.
- [ ] **Step 3:** `npm run typecheck && npm run lint`; ручная проверка — в Task 6 e2e.
- [ ] **Step 4: Commit** `feat(coach-programs): program library page`.

### Task 3: Назначение, досрочное завершение, разрыв связи

**Files:**
- Create: `lib/coach/program-assign.ts` (server-only: `assignProgram(tx, coachId, clientId, program, input, todayKey)`, `endAssignment(tx, assignmentId, todayKey, { writeTargets: boolean })`), `components/coach/assign-program-dialog.tsx`
- Modify: `lib/coach/program-actions.ts` (+`assignProgramAction(clientId, input)`, `endProgramAction(clientId)`, `getProgramBasesAction(clientId, programId)` — предзаполнение), `lib/coach/actions.ts` (`dropAssignments`: закрыть активное назначение пары, `endedAt = now`, без записи весов), `app/(app)/coach/clients/[id]/page.tsx` (кнопка «Назначить программу» во вкладке «План» при флаге)
- Test: `lib/coach/program.test.ts` (+чистые `seriesStarts`, `lastLoadedWeight`)

**Interfaces — Produces (в `lib/coach/program.ts`):**
```ts
export function seriesStarts(startDate: string, weekdays: number[], today: string): { weekday: number; startDate: string }[]; // первый такой день ≥ max(startDate, today)
export function lastLoadedWeight(rule: ProgramRule, base: { weight: number; fromWeek: number }, lastWeek: number): number; // вес последней обычной недели ≤ lastWeek
```

- [ ] **Step 1: Падающие тесты:** `seriesStarts("2026-10-12", [0, 2, 4], "2026-10-15")` (чт) → пн 2026-10-19, ср 2026-10-21, пт 2026-10-16; `lastLoadedWeight(пример, {100,1}, 4)` → 105; `lastLoadedWeight(…, 2)` → 102,5.
- [ ] **Step 2:** FAIL → реализация → PASS.
- [ ] **Step 3: `assignProgramAction`:** `requireClientOf`, флаг, `assignProgramSchema`, программа своя; транзакция: `SELECT id FROM "User" WHERE id = clientId FOR UPDATE`; активное назначение клиента → `endAssignment(…, { writeTargets: true })`; создать `ProgramAssignment` (снимок) + `ProgramBase` (`fromWeek` 1); серии по `seriesStarts` c `coachId`, `programAssignmentId`, `endDate = programEndDay`; уведомление клиенту (push) с текстом из Global Constraints, url `/calendar?date=<первая дата>`. Цель `coach_program_assign`.
- [ ] **Step 4: `endAssignment`:** `endedAt = now`; серии назначения: `endDate = addDays(today, -1)`, у серий, ещё не начавшихся, — удалить; при `writeTargets` — по базам с весом > 0 upsert `CoachTarget` (`clientId`, шаблон, упражнение) с `weight = lastLoadedWeight(rule, base, текущая неделя − 1 или последняя)`, `fails = 0`.
- [ ] **Step 5: Предзаполнение баз:** по шаблонам дней программы — упражнения `kind = REPS`; вес: `CoachTarget.weight` → последний рабочий вес клиента (`getLastPerformance`, макс. по подходам) → `targetWeight` шаблона → 0.
- [ ] **Step 6: Диалог** (2 шага, понедельник старта — ближайший, можно текущий; таблица баз с `selectOnFocus` и весом финальной недели через `programPreview`; при активной — «Текущая программа «…» завершится»). «Завершить досрочно» → `endProgramAction`.
- [ ] **Step 7:** `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 8: Commit** `feat(coach-programs): assign to a client, end early, unlink`.

### Task 4: Вес недели при запуске, сводка, метки клиента

**Files:**
- Create: `lib/coach/program-queries.ts` (+`getActiveAssignment(clientId, today)`), чистая `applyProgramToTargets` в `lib/coach/program.ts`
- Modify: `lib/coach/target-queries.ts` (`getTemplateTargets(clientId, templateId, day?: string)` → `Promise<Map<string, Target & { program?: string }>>`), `lib/workouts/actions.ts` (передать дату: `plan:` — дата вхождения, иначе `dayKey(now, tz)`), `app/(app)/training/page.tsx`, `lib/coach/targets.ts` (`formatTarget` — хвост «(неделя 3/8)» из `program`), `lib/coach/progression-apply.ts` (пропуск шаблонов активной программы; `FinishMeta.progression` + `program?: string`), сводка (`progressionLine` / блок «План тренера» — «Программа: неделя 3/8»), календарь и «План на сегодня» (метка из `programAssignmentId` серии)

**Interfaces — Produces:**
```ts
export function applyProgramToTargets(
  targets: Map<string, Target>, templateSets: Map<string, number>, // exerciseId → targetSets шаблона
  bases: { exerciseId: string; weight: number; fromWeek: number }[], rule: ProgramRule, week: number,
): Map<string, Target & { program: string }>;
```

- [ ] **Step 1: Падающие тесты** `applyProgramToTargets`: задание `{sets:4, reps:8, weight:60}` + база 100 неделя 3 → `{sets:4, reps:8, weight:105, program:"Неделя 3/8"}`; неделя 4 разгрузка → `sets:3, weight:95`; без задания — подходы из шаблона (3 → 2 на разгрузке), `reps: null`; упражнение без базы — не трогается; база 0 → `weight: null` (вес по истории), подходы −1 на разгрузке.
- [ ] **Step 2:** FAIL → реализация → PASS.
- [ ] **Step 3: Наложение в `getTemplateTargets`:** флаг клиента; активное назначение (`endedAt = null`, неделя 1…weeks по `day`); шаблон — в сериях назначения; базы с `templateId`. Неделя > weeks и `endedAt = null` → ленивое окончание: условный `updateMany({ where: { id, endedAt: null } })` + запись весов в задания (`endAssignment` логика без трогания серий), один раз.
- [ ] **Step 4: Пропуск автопрогрессии** в `applyProgression` для шаблонов активной программы; тест-регрессия `e2e/coach-targets.spec.ts` остаётся зелёным.
- [ ] **Step 5: Метки клиента:** календарь (`event-card`, `week-grid` aria) и «План на сегодня» — «Неделя 3/8» / «Разгрузка» рядом с «от тренера · <ник>», только при флаге.
- [ ] **Step 6: Review Focus:** тест — пояс клиента: `programWeekIndex("2026-10-19", dayKey(new Date("2026-10-25T22:30:00Z"), "Europe/Moscow"))` → 2 (по Москве уже пн 26 окт.), а с `"UTC"` → 1.
- [ ] **Step 7:** `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 8: Commit** `feat(coach-programs): week weight on start, labels, no auto-progression inside`.

### Task 5: Ход программы у тренера, «Изменить базу», напоминание

**Files:**
- Create: `components/coach/program-progress.tsx`, `lib/coach/program-tick.ts` (`processProgramReminders(now)`)
- Modify: `app/(app)/coach/clients/[id]/page.tsx` (блок «Программа» во вкладке «План»), `lib/coach/program-actions.ts` (+`updateBasesAction(clientId, bases[])` — `fromWeek` = текущая неделя), `lib/coach/clients.ts` + `components/coach/client-list.tsx` (метка «Нед. 3/8»), `lib/notifications/service.ts` (вызов `processProgramReminders` в `runNotificationTick`)

- [ ] **Step 1:** блок «Программа»: «Неделя 3 из 8», следующая разгрузка, таблица «упражнение → вес этой недели → финальной» (`programWeek`/`programPreview`), «Изменить базу» (диалог, `selectOnFocus`), «Завершить досрочно».
- [ ] **Step 2: Падающий тест** чистой `shouldRemindProgramEnd(endDay, today, remindedAt)` (в `program.ts`): за 7 дней до `endDay` и позже → true, если не напоминали; раньше или уже напомнили → false.
- [ ] **Step 3:** FAIL → реализация → PASS; `processProgramReminders`: активные назначения при флаге тренера, условный `updateMany` по `remindedAt = null`, уведомление тренеру (без push), бюджет как у `processCoachSignals`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(coach-programs): progress block, change base, end reminder`.

### Task 6: «Мои данные», документация, e2e

**Files:**
- Modify: `lib/account/export.ts`, `lib/account/export-queries.ts`, `lib/account/export.test.ts` (разделы `programs`, `coachPrograms` — по белому списку, без id), `app/(marketing)/privacy/page.tsx` (если меняется смысл раздела про тренера), `docs/features/coach.md`, `e2e/db.ts` (`shiftProgramStart(login, weeks)`)
- Create: `e2e/coach-programs.spec.ts`

- [ ] **Step 1: Падающий тест выгрузки:** `programs: [{ name, startDate, weeks, rule, bases: [{ template, exercise, weight }], ended }]`, `coachPrograms: [{ name, weeks, rule, days: [{ weekday, template, time }] }]`; id нет в тексте. FAIL → реализация → PASS.
- [ ] **Step 2: e2e** (`mode: "serial"`, desktop, глобальный флаг вкл/выкл в `beforeAll/afterAll`): тренер создаёт программу (шаблон «Жим», пн/ср/пт, 8 недель, +2,5 %, разгрузка каждая 4-я) и видит предпросмотр; назначает клиенту с базой 100 → у клиента в календаре «Неделя 1/8», запуск — 100 кг и пометка «(неделя 1/8)»; `shiftProgramStart(клиент, 3)` → запуск — 95 кг и подходов на 1 меньше; тренер «Завершить досрочно» → задание тренера 105 кг; флаг выкл → запуск по заданию, меток нет. Удаление аккаунта клиента с программой — в `account-data.spec.ts`.
- [ ] **Step 3:** `docs/features/coach.md` — абзац «Программы на несколько недель» (модель, правило, наложение, флаг, e2e).
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test e2e/coach-programs.spec.ts e2e/coach-plan.spec.ts e2e/coach-targets.spec.ts e2e/coach-signals.spec.ts e2e/account-data.spec.ts --workers=8` — всё зелёное.
- [ ] **Step 5: Commit** `test(coach-programs): export, e2e; docs`.
