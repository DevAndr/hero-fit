# Назначение нескольким клиентам — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер из `/coach` назначает свой шаблон (разово или серией) сразу нескольким отмеченным клиентам.

**Architecture:** общая `assignToClient` (вынесена из `assignWorkoutAction`), новый `assignManyAction` с чистой `pickClients`; режим `many` в существующем `AssignDialog`; кнопка на `/coach`.

**Tech Stack:** Next.js 16 server actions, Prisma 7, Zod, Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-coach-assign-many-design.md`

## Global Constraints

- Только клиенты с активной связью с этим тренером; ≤ 50 за раз (`ASSIGN_MANY_MAX`).
- Поведение одиночного назначения (`assignWorkoutAction`) не меняется — его e2e (`coach-plan.spec.ts`) должны проходить.
- Тексты: «Назначить нескольким», «Клиенты», «Выбрать всех», «Назначено N клиенту/клиентам», «· M пропущен/пропущено», «Выберите клиентов», «Не больше 50 клиентов за раз», «Клиенты не найдены».
- e2e с несколькими контекстами — `--workers=8` (CLAUDE.md).

## Review Focus

- Подделанный `clientIds` с чужим клиентом — ему ничего не создаётся, уведомления нет. → unit `pickClients` (Task 1), код Task 2.
- Клиент отвязался, пока диалог открыт, — остальные назначены, тост говорит о пропуске. → unit `pickClients`/`assignManyText`.
- Пустой или огромный массив `clientIds`, не-строки. → валидация в Task 2 (ревью).
- Шаблон чужой/встроенный — отказ для всех. → код Task 2 (общая проверка, как в одиночном).
- Одиночное назначение после рефакторинга — то же поведение. → e2e `coach-plan` в Task 2.

---

### Task 1: Выбор клиентов и тексты (чистые)

**Files:** Modify `lib/coach/assign.ts`; Create `lib/coach/assign.test.ts` (если есть — дописать).

**Interfaces — Produces:** `ASSIGN_MANY_MAX = 50`; `pickClients(requested: string[], active: string[]): { ids: string[]; skipped: number }`; `assignManyText(assigned: number, skipped: number): string`.

- [ ] **Step 1: Failing tests**

```ts
expect(pickClients(["a", "b", "a", "x"], ["b", "a", "c"])).toEqual({ ids: ["a", "b"], skipped: 1 });
expect(pickClients(["x", "y", "x"], ["a"])).toEqual({ ids: [], skipped: 2 });
expect(assignManyText(1, 0)).toBe("Назначено 1 клиенту");
expect(assignManyText(2, 0)).toBe("Назначено 2 клиентам");
expect(assignManyText(5, 1)).toBe("Назначено 5 клиентам · 1 пропущен");
expect(assignManyText(3, 2)).toBe("Назначено 3 клиентам · 2 пропущено");
```

- [ ] **Step 2:** `npx vitest run lib/coach/assign.test.ts` — FAIL.
- [ ] **Step 3:** реализовать (`plural` из `lib/format.ts`).
- [ ] **Step 4:** тот же тест — PASS.
- [ ] **Step 5: Commit** `feat(coach): pick clients and copy for assigning to many`

### Task 2: Action, диалог, кнопка на /coach

**Files:** Modify `lib/coach/plan-actions.ts`, `components/coach/assign-dialog.tsx`, `app/(app)/coach/page.tsx`; Create `components/coach/assign-many.tsx`, `e2e/coach-assign-many.spec.ts`.

**Interfaces:**
- Consumes: Task 1; `requireCoach` (`lib/coach/access.ts`), `assignInputSchema`.
- Produces: `assignManyAction(clientIds: string[], input: AssignInput): Promise<{ ok: true; assigned: number; skipped: number } | { ok: false; error: string }>`; `AssignDialogState` дополняется `{ mode: "many"; date: string }`, `AssignDialog` получает необязательный `clients?: { id: string; name: string }[]`, `clientId` становится `string | null` (в режиме `many` — `null`); `AssignManyButton({ clients, templates, today })`.

`assignToClient(tx, coachId, clientId, { template, input })` — тело транзакции нынешнего `assignWorkoutAction` (создание записи/серий и `notify`); `assignWorkoutAction` после рефакторинга — та же проверка доступа и шаблона + транзакция с одним `assignToClient`.

- [ ] **Step 1: Failing e2e** (`e2e/coach-assign-many.spec.ts`; тренер + 3 клиента: `registerUser`, `enableCoach`, `coachTemplate`, `linkCoach`, `setTimeZone` — как в `coach-signals.spec.ts`)

```ts
test("assign a series to two of three clients", ...)
// /coach → «Назначить нескольким» → dialog «Назначить нескольким»; «Назначить» disabled;
// отметить checkbox клиента A и B → шаблон «Ноги — база» (pickOption) → Дата = следующий пн → «Повторять каждую неделю» → «Ср»
// → «Назначить» → тост «Назначено 2 клиентам», диалог закрыт.
// A и B: /calendar?date=<пн> → «от тренера · <ник>»; колокольчик «Новый план от тренера»; C: в календаре нет «от тренера».
// Тренер: карточка A → «План» → «Ближайшие 2 недели» содержит «Ноги — база»; карточка B — тоже.
test("«Выбрать всех» checks every client", ...)
// «Выбрать всех» → все три checkbox checked; снова → все сняты.
```

- [ ] **Step 2:** `npm run build && npx playwright test coach-assign-many --workers=8` — FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npm run build && npx playwright test coach-assign-many coach-plan coach.spec --workers=8` — PASS; `npm run typecheck && npm run lint && npm test` — чисто.
- [ ] **Step 5: Commit** `feat(coach): assign a template to several clients at once`

### Task 3: Документация и прогон

- [ ] **Step 1:** CLAUDE.md — пункт режима тренера: «назначение нескольким».
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.
- [ ] **Step 3: Commit** `docs: assigning to several clients in CLAUDE.md`
