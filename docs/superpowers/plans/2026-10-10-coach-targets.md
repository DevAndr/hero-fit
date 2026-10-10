# Персональные задания тренера клиенту — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер задаёт клиенту «подходы × повторы × вес» по упражнениям назначенного шаблона; при запуске шаблона клиентом задание важнее истории, в редакторе — пометка «от тренера: …».

**Architecture:** новая таблица `CoachTarget` (клиент + шаблон + упражнение). Чистое ядро `lib/coach/targets.ts` (подстановка подходов, формат, схема) используется запуском (`fromTemplate`), диалогом тренера и пометкой в редакторе. Разрыв связи удаляет задания вместе с назначениями.

**Tech Stack:** Next.js 16 (server actions, RSC), Prisma 7 + PostgreSQL, Zod, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-coach-targets-design.md`

## Global Constraints

- Пределы задания: подходы 1…20 (целое), повторы 1…100 (целое), вес 0…1000 (дробный); каждое поле может быть `null`.
- Приоритеты: подходы — задание → `targetSets` шаблона; повторы — задание → `targetReps` шаблона → история (по номеру подхода, затем последний) → 0; вес — задание → история (по номеру подхода, затем последний) → `targetWeight` шаблона → 0.
- Задания читаются только для шаблона активного тренера (`CoachLink.endedAt = null`, `template.userId = coachId`) и только при источниках `template:` и `plan:`; `repeat:`/`recovery` — без заданий.
- Тексты: «от тренера: 4 × 8 · 60 кг» (пустые поля пропускаются), «в прошлый раз: 62,5 × 6 · 3 подхода, 5 окт.», «ещё не выполнялось», «Задания по шаблонам», «задано N из M упражнений», «заданий нет», «Шаблон не назначен клиенту». Тексты без рода.
- Доступ тренера — только через `requireClientOf` (`lib/coach/access.ts`); `hideWeights` на задания не влияет.
- Цель Метрики `coach_targets` — при первом сохранении заданий по шаблону для клиента.
- Ссылка-кнопка — `<Link className={buttonVariants()}>`; цвета — только семантические токены.
- После `prisma migrate dev` проверить, что миграция не удаляет частичные индексы `CoachLink_active_client` и `CoachComment_workout_general` (Prisma их не видит).

## Review Focus

1. Тренер убрал упражнение из шаблона после заданий → «задано N из M» и диалог считают только текущие упражнения шаблона; строка задания по убранному упражнению не применяется (Task 3 — тест на счётчик; Task 2 — запуск берёт упражнения шаблона).
2. Вес с запятой «62,5» в диалоге → сохраняется 62.5 (Task 3 — e2e вводит «62,5»).
3. Клиент отключил тренера и запускает прежний шаблон повтором (`repeat:`) → заданий нет и пометки нет (Task 2 — после отключения заданий в БД нет; пометка — Task 4).
4. Тренер выключил режим тренера, связь активна → задания продолжают применяться у клиента (как назначения); диалог тренеру недоступен (404 через `requireClientOf`) — поведение по построению, отдельного теста не нужно.
5. Чужой `exerciseId` или шаблон, не назначенный клиенту, в `saveTargetsAction` → отказ без записи (Task 3 — unit на проверку состава через чистую `validateTargetItems`).

---

### Task 1: Чистое ядро заданий

**Files:**
- Create: `lib/coach/targets.ts`
- Test: `lib/coach/targets.test.ts`

**Interfaces:**
- Produces:
  - `type Target = { sets: number | null; reps: number | null; weight: number | null }`
  - `type PlannedSet = { weight: number; reps: number }`
  - `plannedSets(te: { targetSets: number; targetReps: number | null; targetWeight: number | null }, lastSets: PlannedSet[], target?: Target): PlannedSet[]`
  - `formatTarget(t: Target): string | null` — `null`, если все поля пустые; иначе «от тренера: …»
  - `targetSchema` (Zod, объект `{ exerciseId: string, sets, reps, weight }` с пределами из Global Constraints) и `targetsSchema = z.array(targetSchema).max(MAX_EXERCISES)`
  - `isEmptyTarget(t: Target): boolean`
  - `validateTargetItems(items: { exerciseId: string }[], templateExerciseIds: string[]): boolean` — все `exerciseId` из шаблона, без повторов

- [ ] **Step 1: Write the failing tests** (`lib/coach/targets.test.ts`)

```ts
const te = { targetSets: 3, targetReps: 10, targetWeight: 20 };
const last = [{ weight: 50, reps: 8 }, { weight: 55, reps: 6 }];

test("без задания — прежние правила", () => {
  expect(plannedSets(te, last)).toEqual([{ weight: 50, reps: 10 }, { weight: 55, reps: 10 }, { weight: 55, reps: 10 }]);
  expect(plannedSets({ ...te, targetReps: null }, last)).toEqual([{ weight: 50, reps: 8 }, { weight: 55, reps: 6 }, { weight: 55, reps: 6 }]);
  expect(plannedSets(te, [])).toEqual(Array(3).fill({ weight: 20, reps: 10 }));
  expect(plannedSets({ targetSets: 2, targetReps: null, targetWeight: null }, [])).toEqual(Array(2).fill({ weight: 0, reps: 0 }));
});
test("полное задание важнее шаблона и истории", () => {
  expect(plannedSets(te, last, { sets: 4, reps: 8, weight: 60 })).toEqual(Array(4).fill({ weight: 60, reps: 8 }));
});
test("частичное задание — только заданные поля", () => {
  expect(plannedSets(te, last, { sets: null, reps: null, weight: 62.5 })).toEqual(Array(3).fill({ weight: 62.5, reps: 10 }));
  expect(plannedSets(te, last, { sets: 2, reps: null, weight: null })).toEqual([{ weight: 50, reps: 10 }, { weight: 55, reps: 10 }]);
});
test("formatTarget", () => {
  expect(formatTarget({ sets: 4, reps: 8, weight: 60 })).toBe("от тренера: 4 × 8 · 60 кг");
  expect(formatTarget({ sets: null, reps: null, weight: 62.5 })).toBe("от тренера: 62,5 кг");
  expect(formatTarget({ sets: 4, reps: 8, weight: null })).toBe("от тренера: 4 × 8");
  expect(formatTarget({ sets: 5, reps: null, weight: null })).toBe("от тренера: 5 подходов");
  expect(formatTarget({ sets: null, reps: 12, weight: null })).toBe("от тренера: по 12 повторов");
  expect(formatTarget({ sets: null, reps: null, weight: null })).toBeNull();
});
test("targetSchema — пределы", () => {
  const ok = { exerciseId: "x", sets: 20, reps: 100, weight: 1000 };
  expect(targetSchema.safeParse(ok).success).toBe(true);
  expect(targetSchema.safeParse({ ...ok, sets: 0 }).success).toBe(false);
  expect(targetSchema.safeParse({ ...ok, reps: 0 }).success).toBe(false);
  expect(targetSchema.safeParse({ ...ok, weight: 1000.5 }).success).toBe(false);
  expect(targetSchema.safeParse({ exerciseId: "x", sets: null, reps: null, weight: null }).success).toBe(true);
});
test("validateTargetItems", () => {
  expect(validateTargetItems([{ exerciseId: "a" }], ["a", "b"])).toBe(true);
  expect(validateTargetItems([{ exerciseId: "c" }], ["a", "b"])).toBe(false);
  expect(validateTargetItems([{ exerciseId: "a" }, { exerciseId: "a" }], ["a"])).toBe(false);
});
```

Склонения «подход/подходов», «повтор/повторов» — `plural` из `lib/format.ts`, вес — с запятой (`toLocaleString("ru-RU")`).

- [ ] **Step 2: Run** `npx vitest run lib/coach/targets.test.ts` — FAIL (модуль не найден)
- [ ] **Step 3: Implement** `lib/coach/targets.ts` (без `server-only` — используется и клиентом). Правила `plannedSets` — ровно как в Global Constraints; без задания совпадают с текущим телом `fromTemplate` (`lib/workouts/actions.ts:44-54`).
- [ ] **Step 4: Run** `npx vitest run lib/coach/targets.test.ts` — PASS
- [ ] **Step 5: Commit** `feat(coach): targets core — planned sets, format, schema`

### Task 2: Модель, запуск с заданиями, удаление при разрыве

**Files:**
- Modify: `prisma/schema.prisma` (модель `CoachTarget` — как в спеке; обратные связи `User.coachTargets`, `WorkoutTemplate.coachTargets`, `Exercise.coachTargets`)
- Create: миграция `prisma migrate dev --name coach_targets`
- Create: `lib/coach/target-queries.ts` (server-only)
- Modify: `lib/workouts/actions.ts` (`fromTemplate`)
- Modify: `lib/coach/actions.ts:22-25` (`dropAssignments`)
- Modify: `e2e/db.ts` (хелпер)
- Test: `e2e/coach-targets.spec.ts`

**Interfaces:**
- Consumes: `plannedSets`, `Target` (Task 1)
- Produces:
  - `getTemplateTargets(clientId: string, templateId: string): Promise<Map<string, Target>>` — пусто, если шаблон не принадлежит активному тренеру клиента; ключ — `exerciseId`
  - e2e: `coachTarget(clientLogin: string, templateId: string, exerciseName: string, t: { sets?: number; reps?: number; weight?: number }): Promise<void>`

- [ ] **Step 1: Write failing e2e** (`e2e/coach-targets.spec.ts`; `setup`/`another`/`nickOf`/`localDate` — как в `e2e/coach-plan.spec.ts`, вынести общие в `e2e/coach.ts`, если копий станет три):
  - «assigned template starts with the coach's targets; another client gets own history»: `coachTarget(клиентА, tpl, "Приседания со штангой", { sets: 4, reps: 8, weight: 60 })`, назначение на сегодня 23:30, клиент А «Начать» с дашборда → в регионе «Приседания со штангой» 4 поля «Вес, подход N» со значением `60` и повторы `8`; клиент Б того же тренера (`linkCoach`) с прошлой тренировкой `quickWorkout(…, "Приседания со штангой", [{ weight: "40", reps: "5" }])` → вес подхода 1 = `40`;
  - ««От тренера» start applies targets»: запуск из региона «От тренера» → вес подхода 1 = `60`;
  - «disconnecting removes the coach's targets»: клиент «Отключить тренера» → `select count(*) from "CoachTarget" where "clientId" = …` = 0.
- [ ] **Step 2: Run** `npx playwright test coach-targets --project=desktop` — FAIL (нет таблицы/хелпера)
- [ ] **Step 3: Schema + migration**; проверить SQL миграции на `DROP INDEX` частичных индексов (Global Constraints).
- [ ] **Step 4: Implement** `getTemplateTargets`; в `fromTemplate` — `const targets = await getTemplateTargets(userId, id)` и `sets: plannedSets(te, lastSets, targets.get(te.exerciseId))`; в `dropAssignments` — `tx.coachTarget.deleteMany({ where: { clientId, template: { userId: coachId } } })`; хелпер `coachTarget`.
- [ ] **Step 5: Run** `npm run typecheck && npx vitest run && npm run build && npx playwright test coach-targets coach-plan` — PASS
- [ ] **Step 6: Commit** `feat(coach): CoachTarget model; assigned templates start with the coach's targets`

### Task 3: Тренер — «Задания по шаблонам» и диалог

**Files:**
- Modify: `lib/coach/target-queries.ts` (+ `getClientTargets`)
- Modify: `lib/coach/templates.ts` (экспорт отбора актуальных назначений с явным `coachId`: `assignedTemplateWhere(clientId, coachId, since)`)
- Create: `lib/coach/target-actions.ts` (`"use server"`)
- Create: `components/coach/client-targets.tsx`
- Modify: `components/coach/client-plan.tsx` (раздел после «Ближайшие 2 недели»), `app/(app)/coach/clients/[id]/page.tsx` (данные для вкладки `plan`)
- Modify: `lib/analytics/goals.ts` (`coach_targets` в `GOALS`)
- Test: `e2e/coach-targets.spec.ts`, `lib/analytics/goals.test.ts` (если там перечисление целей)

**Interfaces:**
- Consumes: `targetsSchema`, `validateTargetItems`, `isEmptyTarget`, `Target` (Task 1); `requireClientOf`
- Produces:
  - `type ClientTemplateTargets = { templateId: string; name: string; exercises: { exerciseId: string; name: string; template: { sets: number; reps: number | null; weight: number | null }; target: Target | null; last: { date: string; sets: PlannedSet[] } | null }[] }`
  - `getClientTargets(clientId: string, coachId: string, timeZone: string, now?: Date): Promise<ClientTemplateTargets[]>`
  - `saveTargetsAction(clientId: string, templateId: string, items: { exerciseId: string; sets: number | null; reps: number | null; weight: number | null }[]): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write failing e2e:**
  - «coach sets targets in the dialog; client starts with them»: тренер на `?tab=plan` → регион «Задания по шаблонам» содержит «Ноги — база · заданий нет» → кнопка «Задания: Ноги — база» → в диалоге для «Приседания со штангой» «Подходы» `4`, «Повторы» `8`, «Вес, кг» `62,5` → «Сохранить» → строка «задано 1 из 2 упражнений»; клиент запускает → вес подхода 1 = `62.5`, подходов 4;
  - «clearing all fields removes the target»: после `coachTarget(…)` очистить три поля → «Сохранить» → «заданий нет», `CoachTarget` count = 0;
  - «dialog shows the client's last result»: у клиента `quickWorkout(…, "Приседания со штангой", [{ weight: "50", reps: "6" }])` → в диалоге «в прошлый раз: 50 × 6 · 1 подход»; у «Жим ногами» — «ещё не выполнялось».
- [ ] **Step 2: Run** — FAIL
- [ ] **Step 3: Implement** запрос, action (транзакция: `deleteMany` для пустых, `upsert` по `clientId_templateId_exerciseId` для остальных; до записи — `count` строк по шаблону и клиенту для цели `coach_targets`; `revalidatePath` `/coach/clients/<id>` и `/training`), раздел и диалог (`Dialog` из `components/ui/dialog`, поля — `NumberCell`-подобные числовые поля как в `components/templates/template-editor.tsx`, разбор — `parseNumber` из `components/training/workout-state.ts`; placeholder пустого поля — что подставится без задания: подходы и повторы шаблона, вес — последний вес клиента или вес шаблона; подписи полей для скринридера «Подходы: <упражнение>» и т. п.). «Задано N из M» — по упражнениям шаблона (Review Focus 1).
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm run build && npx playwright test coach-targets coach-plan` — PASS
- [ ] **Step 5: Commit** `feat(coach): coach sets per-client targets for assigned templates`

### Task 4: Пометка «от тренера» в редакторе

**Files:**
- Modify: `app/(app)/training/page.tsx` (в `Promise.all` — `workout.templateId ? getTemplateTargets(user.id, workout.templateId) : new Map()`, в редактор — `Record<exerciseId, string>` из `formatTarget`)
- Modify: `components/training/workout-editor.tsx` (prop `coachTargets: Record<string, string>` → `ExerciseBlock`)
- Modify: `components/training/exercise-block.tsx` (prop `coachTarget?: string`, строка под названием рядом с `HintBadge`, `text-muted-foreground text-sm`)
- Test: `e2e/coach-targets.spec.ts`

**Interfaces:**
- Consumes: `getTemplateTargets` (Task 2), `formatTarget` (Task 1)

- [ ] **Step 1: Write failing e2e:** в сценарии Task 2 после запуска — в регионе «Приседания со штангой» текст «от тренера: 4 × 8 · 60 кг», у «Жим ногами» — нет «от тренера»; после отключения тренера и `repeat:` прошлой тренировки (кнопка «Повторить» в сводке) — «от тренера» отсутствует (Review Focus 3).
- [ ] **Step 2: Run** — FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm run build && npx playwright test coach-targets training offline` — PASS
- [ ] **Step 5: Commit** `feat(coach): «от тренера» target label in the workout editor`

### Task 5: Сид и документация

**Files:**
- Modify: `prisma/seed.ts` (`seedCoachPlans`: для `demo.masha` по шаблону «Ноги — база» — первому упражнению `{ sets: 4, reps: 8, weight: <рабочий вес Маши + 2,5> }`, второму — только вес; удалять и создавать заново при каждом сиде)
- Modify: `CLAUDE.md` (строка про режим тренера — по разделу «Документация» спеки)

- [ ] **Step 1:** `npm run db:seed` дважды подряд без ошибок; `select count(*) from "CoachTarget"` для Маши = 2
- [ ] **Step 2:** полный прогон: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --workers=4` — всё зелёное
- [ ] **Step 3: Commit** `chore(coach): demo targets in seed, docs`
