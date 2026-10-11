# Группы клиентов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер раскладывает клиентов по группам-меткам, фильтрует по ним `/coach` и отмечает группу одним нажатием в «Назначить нескольким» и «Скопировать план».

**Architecture:** две таблицы (`CoachGroup`, `CoachGroupMember`); чистые правила в `lib/coach/groups.ts`; actions через `requireCoach`; фильтр — `?group=`; кнопки групп — проп `groups` у общего `ClientPicker`.

**Tech Stack:** Next.js 16 server actions, Prisma 7, Zod, Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-coach-groups-design.md`

## Global Constraints

- Клиент — в любом числе групп; группы клиенту не видны.
- Название 1…40 символов после trim, уникально у тренера по `nameKey` (без учёта регистра, пробелы схлопнуты); групп ≤ 20 (`COACH_GROUPS_MAX`).
- Участники — только активные клиенты тренера (`pickClients`), остальные молча отбрасываются; при чтении — тоже только активные.
- Разрыв связи (`dropAssignments`) удаляет членство клиента в группах этого тренера.
- Тексты: «Группы», «Создать группу», «Название», «Изменить», «Удалить», «Удалить группу «…»?», «Клиенты останутся, удалится только группа», «Сохранить», «Все», «Введите название», «Не больше 40 символов», «Не больше 20 групп», «Такая группа уже есть», «Группа не найдена».
- Миграция через `prisma migrate dev` применяется сразу (см. прошлый опыт) — проверить, что частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не удалены в SQL новой миграции.
- e2e с несколькими контекстами — `--workers=8`.

## Review Focus

- `saveGroupAction` с id чужой группы — «Группа не найдена», ничего не меняется. → код Task 2 (ревью).
- Гонка названий: две вкладки создают «Утро» — уникальный индекс, вторая получает «Такая группа уже есть», а не 500. → код Task 2 (ловить P2002).
- `?group=` с чужим/удалённым id — список всех, без ошибки. → `inGroup` unit Task 1 + страница Task 2.
- Отвязанный клиент с оставшейся строкой членства (до миграции/гонка) — не показывается в группе и не отмечается кнопкой. → `getCoachGroups` фильтрует активными (Task 2).
- 21-я группа при гонке двух созданий — допустимо превышение на 1 (проверка вне блокировки). → принять, отметить в ревью.

---

### Task 1: Правила групп (чистые)

**Files:** Create `lib/coach/groups.ts`, `lib/coach/groups.test.ts`.

**Interfaces — Produces:**

```ts
export const COACH_GROUPS_MAX = 20;
export const groupSchema: z.ZodType<{ name: string }>; // trim; «Введите название» / «Не больше 40 символов»
export function groupKey(name: string): string;
export type CoachGroupView = { id: string; name: string; clientIds: string[] };
export function inGroup<T extends { id: string }>(rows: T[], group: CoachGroupView | null | undefined): T[];
export function addGroup(picked: string[], members: string[], available: string[]): string[];
```

- [ ] **Step 1: Failing tests**

```ts
groupSchema.safeParse({ name: "   " }).success === false; // «Введите название»
groupSchema.safeParse({ name: "а".repeat(41) }).success === false;
groupSchema.parse({ name: "  Утро  " }).name === "Утро";
groupKey("  Утро   ПН ") === "утро пн";
inGroup(rows, { id: "g", name: "x", clientIds: ["b"] }) → [b]; inGroup(rows, null) → rows
addGroup(["a"], ["c", "a", "x"], ["a", "b", "c"]) → ["a", "c"] // порядок как в available, x вне списка
```

- [ ] **Step 2:** `npx vitest run lib/coach/groups.test.ts` — FAIL (module not found).
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** тот же тест — PASS.
- [ ] **Step 5: Commit** `feat(coach): client group rules`

### Task 2: Данные, actions, UI

**Files:** Modify `prisma/schema.prisma` (+ миграция `coach_groups`), `lib/coach/actions.ts` (`dropAssignments`), `components/coach/client-picker.tsx`, `components/coach/assign-dialog.tsx`, `components/coach/assign-many.tsx`, `components/coach/copy-plan-dialog.tsx`, `components/coach/client-plan.tsx`, `components/coach/client-list.tsx`, `app/(app)/coach/page.tsx`, `app/(app)/coach/clients/[id]/page.tsx`, `e2e/db.ts`; Create `lib/coach/group-queries.ts`, `lib/coach/group-actions.ts`, `components/coach/groups-dialog.tsx`, `components/coach/group-filter.tsx`, `e2e/coach-groups.spec.ts`.

**Interfaces:**

- Consumes: Task 1; `requireCoach`, `pickClients`, `clientIdsSchema`-подобная проверка массива (≤ `ASSIGN_MANY_MAX`... для групп — без потолка, но массив строк).
- Produces:
  - `getCoachGroups(coachId: string): Promise<CoachGroupView[]>` (по `name`, только активные клиенты).
  - `saveGroupAction(id: string | null, input: { name: string; clientIds: string[] }): Promise<{ ok: true } | { ok: false; error: string }>`; `deleteGroupAction(id: string): Promise<{ ok: true } | { ok: false; error: string }>`.
  - `ClientPicker` — необязательный `groups?: CoachGroupView[]`: над списком кнопки с названием группы (`aria-label="Отметить группу «…»"`), `onChange(addGroup(picked, g.clientIds, clients.map(c => c.id)))`.
  - `GroupsButton({ groups, clients })`, `GroupFilter({ groups, active })` (ссылки `?group=<id>`, «Все» → `/coach`, `aria-current` у выбранной).
  - `ClientRow` в списке получает `groups: string[]` (названия) — значки; для этого `ClientList` принимает необязательный `groupNames?: Record<string, string[]>` (clientId → названия).

Схема: `CoachGroup { id cuid, coachId, name, nameKey, createdAt; coach User @relation("CoachGroupCoach", onDelete: Cascade); members CoachGroupMember[]; @@unique([coachId, nameKey]) }`, `CoachGroupMember { groupId, clientId, createdAt; group onDelete Cascade; client User @relation("CoachGroupClient", onDelete: Cascade); @@id([groupId, clientId]); @@index([clientId]) }`.

`saveGroupAction`: `requireCoach` → `groupSchema` → массив строк → активные клиенты → `pickClients`; создание: `count ≥ 20` → «Не больше 20 групп»; транзакция (по очереди): create/update (`where: { id, coachId }` — нет → «Группа не найдена»), `deleteMany` участников + `createMany`; `P2002` → «Такая группа уже есть».

- [ ] **Step 1: Failing e2e** (`e2e/coach-groups.spec.ts`; тренер + Аня/Боря/Вика — как `coach-assign-many.spec.ts`)

```ts
test("create a group, filter the list, pick the group when assigning", ...)
// /coach → «Группы» → «Создать группу» → Название «Утро» → отметить Аню и Борю → «Сохранить» → в диалоге «Утро» · 2
// закрыть → фильтр: ссылка «Утро (2)» → список «Клиенты» содержит Аню и Борю, не Вику; у Ани значок «Утро»
// «Назначить нескольким» → «Отметить группу «Утро»» → Аня и Боря checked, Вика нет
test("rename, duplicate name, delete", ...)
// создать «Утро» и «Вечер»; «Изменить» у «Вечер» → «утро» → «Такая группа уже есть»; → «Онлайн» → «Сохранить» → в списке «Онлайн»
// «Удалить» у «Онлайн» → подтверждение «Клиенты останутся, удалится только группа» → «Удалить» → «Онлайн» нет
test("a removed client leaves the group", ...)
// группа «Утро» с Аней и Борей → карточка Ани → «Удалить клиента» → «Удалить» → /coach → «Утро (1)»; coachGroupMembers(тренер) === 1
```

Хелпер `coachGroupMembers(coachLogin): Promise<number>` — число строк `CoachGroupMember` у групп тренера.

- [ ] **Step 2:** `npm run build && npx playwright test coach-groups --workers=8` — FAIL.
- [ ] **Step 3:** схема + `npx prisma migrate dev --name coach_groups` (проверить SQL на чужие `DROP INDEX`), запросы, actions, `dropAssignments`, UI.
- [ ] **Step 4:** `npm run build && npx playwright test coach-groups coach-assign-many coach-copy-plan coach.spec --workers=8` — PASS; `npm run typecheck && npm run lint && npm test` — чисто.
- [ ] **Step 5: Commit** `feat(coach): client groups`

### Task 3: Документация и прогон

- [ ] **Step 1:** CLAUDE.md — пункт режима тренера: «Группы клиентов».
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.
- [ ] **Step 3: Commit** `docs: client groups in CLAUDE.md`
