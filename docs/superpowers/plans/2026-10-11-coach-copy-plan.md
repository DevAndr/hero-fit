# Копирование плана клиента — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер копирует будущие назначения и задания одного клиента другим своим клиентам.

**Architecture:** чистая `copyPlan` решает, что создать; запрос источника + `copyPlanAction` в одной транзакции; диалог во вкладке «План» с общим `ClientPicker`.

**Tech Stack:** Next.js 16 server actions, Prisma 7, Zod, Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-coach-copy-plan-design.md`

## Global Constraints

- Только назначения этого тренера (`coachId`) и задания по шаблонам скопированных назначений; получатели — активные клиенты тренера без источника, ≤ 50 (`ASSIGN_MANY_MAX`, `pickClients`).
- Добавление, не замена: у получателя ничего не удаляется; задания по тем же шаблон + упражнение — upsert целиком, `fails` = 0, `unloadedAt` = null.
- Без «С весами» вес и шаг пустые; задание, ставшее пустым (`isEmptyTarget`), не копируется.
- «Сегодня» — по поясу источника; даты копируются как есть.
- Запросы в транзакции — по очереди; `timeout: 30_000`.
- Тексты: «Скопировать план», «Будет скопировано: …», «С весами», «Скопировать», «перезапишется N задание/задания/заданий», «План скопирован N клиенту/клиентам», «· M пропущен/пропущено», «Нечего копировать», «Клиенты не найдены», уведомление «Новый план от тренера».
- e2e с несколькими контекстами — `--workers=8`.

## Review Focus

- Источник не активный клиент (отвязан, чужой) — 404, ничего не создаётся. → `requireClientOf` в коде Task 2 (ревью).
- В `clientIds` есть сам источник или чужой клиент — пропускается и считается в `skipped`. → код Task 2.
- Серия без вхождений после сдвига начала (`endDate` раньше первого подходящего дня недели) — не копируется. → unit Task 1.
- Назначение с удалённым шаблоном (`templateId = null`) — не копируется. → unit Task 1.
- Задание по упражнению, которого уже нет в шаблоне, — не копируется. → unit Task 1.

---

### Task 1: Что копировать (чистые)

**Files:** Create `lib/coach/plan-copy.ts`, `lib/coach/plan-copy.test.ts`.

**Interfaces — Produces:**

```ts
export type CopySeries = { templateId: string | null; title: string; weekday: number; time: string; durationMin: number; startDate: string; endDate: string | null };
export type CopyEntry = { templateId: string | null; title: string; date: string; time: string; durationMin: number; cancelled: boolean };
export type CopyTarget = { templateId: string; exerciseId: string; sets: number | null; reps: number | null; weight: number | null; step: number | null };
export type CopySource = { series: CopySeries[]; entries: CopyEntry[]; targets: CopyTarget[]; templateExercises: Record<string, string[]> };
export type CopyResult = { series: (CopySeries & { templateId: string })[]; entries: (CopyEntry & { templateId: string })[]; targets: CopyTarget[] };
export function copyPlan(source: CopySource, today: string, opts: { withWeights: boolean }): CopyResult;
export function copySummary(r: CopyResult): string | null; // «2 серии, 1 разовая тренировка, 5 заданий»
export const targetKey: (t: { templateId: string; exerciseId: string }) => string; // `${templateId}:${exerciseId}`
export function overwriteCount(targets: CopyTarget[], recipientKeys: string[]): number;
export function copyPlanText(copied: number, skipped: number): string; // «План скопирован 2 клиентам · 1 пропущен»
```

`entries` в источнике — только разовые (`seriesId = null`, это делает запрос); `copyPlan` сама отбрасывает отменённые, прошедшие и без шаблона. Серия: `startDate → max(startDate, today)`; не копируется при `templateId = null`, `endDate < today` или когда первое вхождение (`addDays(start, (weekday − weekdayOf(start) + 7) % 7)`) позже `endDate`. Задания — только шаблонов из скопированных серий/записей и упражнений из `templateExercises[templateId]`; без `withWeights` — `weight = step = null`, пустые (`isEmptyTarget`) — прочь.

- [ ] **Step 1: Failing tests** (`today = "2026-10-14"`, ср)

```ts
// серии
copyPlan(src({ series: [s({ startDate: "2026-10-01", endDate: null })] }), today, w).series[0].startDate === "2026-10-14";
copyPlan(src({ series: [s({ startDate: "2026-10-20" })] }), today, w).series[0].startDate === "2026-10-20";
copyPlan(src({ series: [s({ endDate: "2026-10-13" })] }), today, w).series.length === 0;            // закончилась
copyPlan(src({ series: [s({ weekday: 0, endDate: "2026-10-18" })] }), today, w).series.length === 0; // пн 19-го > вс 18-го
copyPlan(src({ series: [s({ templateId: null })] }), today, w).series.length === 0;
// разовые: 13-е, 14-е, 15-е отменённая, без шаблона → только 14-е
// задания: шаблон без назначений → прочь; упражнения нет в templateExercises → прочь;
// { sets: 4, reps: 8, weight: 60, step: 2.5 } без весов → { sets: 4, reps: 8, weight: null, step: null };
// { weight: 60 } без весов → прочь; с весами — как есть
copySummary → "2 серии, 1 разовая тренировка, 5 заданий"; "1 серия"; пустое → null
overwriteCount([t1, t2], [targetKey(t1), "x:y"]) === 1
copyPlanText(1, 0) === "План скопирован 1 клиенту"; copyPlanText(3, 2) === "План скопирован 3 клиентам · 2 пропущено"
```

- [ ] **Step 2:** `npx vitest run lib/coach/plan-copy.test.ts` — FAIL (module not found).
- [ ] **Step 3:** реализовать (`plural` — `lib/format.ts`, `addDays`/`weekdayOf` — `lib/plans/expand.ts`, `isEmptyTarget` — `lib/coach/targets.ts`).
- [ ] **Step 4:** тот же тест — PASS.
- [ ] **Step 5: Commit** `feat(coach): what to copy from a client's plan`

### Task 2: Запрос, action, диалог

**Files:** Create `lib/coach/plan-copy-queries.ts`, `components/coach/client-picker.tsx`, `components/coach/copy-plan-dialog.tsx`, `e2e/coach-copy-plan.spec.ts`; Modify `lib/coach/plan-actions.ts`, `components/coach/assign-dialog.tsx`, `components/coach/client-plan.tsx`, `app/(app)/coach/clients/[id]/page.tsx`, `e2e/db.ts`.

**Interfaces:**

- Consumes: Task 1; `requireClientOf`, `pickClients`, `clientIdsSchema` (plan-actions), `clientPickLabels` (`lib/coach/assign.ts`), `notify`, `queueGoal`.
- Produces:
  - `getPlanCopySource(coachId: string, clientId: string): Promise<CopySource>` — серии и разовые (`seriesId: null`) тренера у клиента, задания клиента по шаблонам тренера, `templateExercises` этих шаблонов.
  - `getCopyRecipients(coachId: string, sourceId: string, tz: string): Promise<{ id: string; name: string; keys: string[] }[]>` — активные клиенты без источника (подписи — `clientPickLabels`, `tz` — пояс тренера), `keys` — их задания по шаблонам тренера (`targetKey`).
  - `copyPlanAction(sourceId: string, clientIds: string[], opts: { withWeights: boolean }): Promise<{ ok: true; copied: number; skipped: number } | { ok: false; error: string }>`.
  - `ClientPicker({ clients: { id: string; name: string; hint?: string }[], picked, onChange })` — `hint` — вторая строка мелким текстом.
  - `CopyPlanButton({ sourceId, summary, recipients: { id: string; name: string; overwrite: number }[] })`.

Action: `requireClientOf(sourceId)` → `clientIdsSchema` → `today = dayKey(now, пояс источника)` → `copyPlan`; пусто → «Нечего копировать»; `pickClients(ids, активные без источника)`; пусто → «Клиенты не найдены»; транзакция: на клиента `planSeries.createMany`/`planEntry.createMany` (`userId`, `coachId`), upsert заданий (`update: { sets, reps, weight, step, fails: 0, unloadedAt: null }`), `notify` («Новый план от тренера», body — `copySummary`, url `/calendar?date=<самая ранняя дата>`, push); `queueGoal("coach_copy_plan")`; revalidate карточек и `/coach`. Страница «План» считает `summary` и `overwrite` по варианту **с весами** и показывает кнопку при `summary && recipients.length`.

- [ ] **Step 1: Failing e2e** (`e2e/coach-copy-plan.spec.ts`; тренер + Маша + Боря: `registerUser`, `enableCoach`, `setTimeZone`, `coachTemplate`, `linkCoach`, `coachAssignOnce` на будущую дату, `coachTarget`, `coachTargetRow` — расширить полями `sets, reps, step`)

```ts
test("copy a plan without weights", ...)
// Маша: разовая «Ноги — база» на localDate(3), задание «Приседания со штангой» 4×8·60 шаг 2,5;
// Боря: задания «Жим ногами» 3×12 и «Приседания со штангой» 5×5
// карточка Маши → «План» → «Скопировать план» → dialog «Скопировать план»:
//   «Будет скопировано: 1 разовая тренировка, 1 задание», у Бори «перезапишется 1 задание»; «Скопировать» disabled
// отметить Борю → «Скопировать» → тост «План скопирован 1 клиенту»
// Боря: /calendar?date=localDate(3) — «от тренера · <ник>»; уведомление «Новый план от тренера»;
// coachTargetRow(Боря, «Приседания…») → { sets: 4, reps: 8, weight: null, step: null }; «Жим ногами» у Бори — 3×12
test("copy with weights keeps weight and step", ...)
// то же с «С весами» → { weight: 60, step: 2.5, fails: 0 }
```

- [ ] **Step 2:** `npm run build && npx playwright test coach-copy-plan --workers=8` — FAIL.
- [ ] **Step 3:** вынести `ClientPicker` (assign-dialog использует новый), реализовать запросы, action, диалог, кнопку во вкладке.
- [ ] **Step 4:** `npm run build && npx playwright test coach-copy-plan coach-assign-many coach-plan coach-targets --workers=8` — PASS; `npm run typecheck && npm run lint && npm test` — чисто.
- [ ] **Step 5: Commit** `feat(coach): copy a client's plan to other clients`

### Task 3: Документация и прогон

- [ ] **Step 1:** CLAUDE.md — пункт режима тренера: «Копирование плана».
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.
- [ ] **Step 3: Commit** `docs: copying a client's plan in CLAUDE.md`
