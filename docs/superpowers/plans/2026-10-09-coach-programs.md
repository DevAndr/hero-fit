# Режим тренера, этап 2: назначение тренировок — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер назначает свои шаблоны в календарь клиента, клиент запускает их в один клик, тренер видит выполнение.

**Architecture:** назначение — обычные `PlanSeries`/`PlanEntry` клиента с новым полем `coachId`; весь календарный слой (`expandPlans`, `planEdit`, `matchPlans`, `applyPlanOps`) переиспользуется, `coachId` протаскивается сквозь него. Доступ к шаблону тренера — одна функция `templateAccessible`. Тренерские actions — в `lib/coach/plan-actions.ts`, проверка — `requireClientOf`.

**Tech Stack:** Next.js 16 (server actions, `PageProps`), Prisma 7 (миграция через `migrate diff` + `migrate deploy`), Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-coach-programs-design.md`

## Global Constraints

- Миграцию генерировать `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` в `prisma/migrations/<ts>_coach_plans/migration.sql`, применять `npx prisma migrate deploy`, затем `npx prisma generate`. Частичный индекс `CoachLink_active_client` не трогать.
- `coachId` у исключения серии не читается — принадлежность берётся из серии.
- Тексты (дословно): ошибка клиенту — «Назначено тренером — изменить может только он»; пометка — «от тренера · <ник>»; раздел `/training` — «От тренера»; подсказка в карточке — «Назначено тренером»; уведомление клиенту — заголовок «Новый план от тренера», тело `assignmentText`; уведомление тренеру — заголовок «Тренировка выполнена», тело «<ник>: выполнено «<название>»»; статусы у тренера — «выполнено», «пропущено клиентом», «не сделано», «сегодня», «запланировано».
- Даты назначений — в поясе клиента (`safeTimeZone(client.timeZone)`); «до» по умолчанию — дата + 8 недель − 1 день.
- Цель Метрики `coach_assign` — добавить в `GOALS` (`lib/analytics/goals.ts`).
- Ссылки-кнопки — `<Link className={buttonVariants()}>`; цвета — только семантические токены.
- e2e: связь — `enableCoach`/`linkCoach` (`e2e/db.ts`), ники — из времени логина (уникальность между прогонами).

## Review Focus

- Клиент вызывает `updatePlanAction`/`deletePlanAction` с ключом исключения серии тренера (`s:<seriesId>:<date>`) — должен получить ошибку, а не изменить план (проверка по серии, не по записи исключения).
- Клиент ушёл к другому тренеру (`acceptCoachAction` switch) — назначения прежнего удаляются, шаблоны прежнего больше не запускаются.
- Тренер вызывает свои actions с `key` вхождения, которое клиент создал сам (`coachId = null`) или назначил другой тренер — отказ.
- Пропуск назначенной разовой → `cancelled = true`; повторный пропуск или запуск отменённой — «не найдено», не падение.
- Назначение с шаблоном чужого тренера / встроенным — отказ «Шаблон не найден» (только свои шаблоны тренера).

---

### Task 1: `coachId` в календаре и защита назначенного у клиента

**Files:**
- Modify: `prisma/schema.prisma` (`PlanSeries`, `PlanEntry`, `User` — обратные связи `coachPlanSeries`/`coachPlanEntries`), миграция `prisma/migrations/<ts>_coach_plans/`
- Modify: `lib/plans/expand.ts`, `lib/plans/edit.ts`, `lib/plans/queries.ts`, `lib/plans/mutations.ts`, `lib/plans/actions.ts`
- Create: `lib/coach/templates.ts`
- Modify: `lib/workouts/actions.ts` (`fromTemplate`)
- Test: `lib/plans/expand.test.ts`, `lib/plans/edit.test.ts`

**Interfaces:**
- Produces: `PlanSeriesRow.coachId: string | null`, `PlanEntryRow.coachId: string | null`, `Occurrence.coachId: string | null` (серия и её исключения — из серии, разовая — из записи); `planEdit` «following» → `createSeries.data.coachId` = `series.coachId`.
- Produces: `templateAccessible(userId: string, templateId: string): Promise<boolean>` (`lib/coach/templates.ts`, server-only).
- Produces: `skipOccurrence(userId, key)` — для разовой с `coachId` ставит `cancelled: true` (op `cancelEntry` в `PlanOp`: `{ op: "cancelEntry"; entryId: string }`).
- Produces: `assertNotCoachPlan` — внутренняя проверка в `updatePlanAction`/`deletePlanAction`, ошибка — текст из Global Constraints.

- [ ] **Step 1: Unit-тесты (RED)** — в `expand.test.ts`: `expandPlans` с серией `coachId: "c1"` и её исключением (`coachId: null` в записи) → оба вхождения `coachId === "c1"`; разовая с `coachId: "c2"` → `"c2"`; своя → `null`. В `edit.test.ts`: `planEdit(seriesTarget с coachId "c1", "following", {time: "09:00"})` → op `createSeries` с `data.coachId === "c1"`; `planEdit` для разовой без изменений (существующие тесты зелёные после добавления поля в фикстуры).
- [ ] **Step 2:** `npx vitest run lib/plans` → FAIL (нет `coachId`).
- [ ] **Step 3:** схема + миграция (`coachId String?`, relation `onDelete: SetNull`, `@@index([userId, coachId])` у обоих), `migrate deploy`, `generate`; поле в типах/`seriesSelect`/`entrySelect`/`expandPlans`/`planEdit`/`getOccurrence`.
- [ ] **Step 4:** `npx vitest run lib/plans` → PASS.
- [ ] **Step 5:** `templateAccessible`: свой/встроенный ИЛИ (`activeCoachOf(userId)` = X и шаблон `userId = X` и есть `PlanSeries`/`PlanEntry` клиента с `coachId = X, templateId`). `fromTemplate` в `createWorkoutAction` ищет шаблон по id, если `templateAccessible` (вместо `OR: [{ userId }, { userId: null }]`). `templateAllowed` в `lib/plans/actions.ts` остаётся только свои/встроенные (клиент не ставит шаблон тренера в свой план). `getCalendar` — имена шаблонов: добавить в `OR` шаблоны с `userId` = активный тренер.
- [ ] **Step 6:** `cancelEntry` в `PlanOp` и `applyPlanOps` (`updateMany where {id, userId, seriesId: null} data {cancelled: true}`); `skipOccurrence` — для разовой с `coachId` → `cancelEntry`, иначе как было. `updatePlanAction`/`deletePlanAction` — после `target(...)`: если `getOccurrence(...).occurrence.coachId` → `{ ok: false, error: "Назначено тренером — изменить может только он" }`.
- [ ] **Step 7:** `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 8:** Commit `feat(coach): coachId on plans, template access for clients, protect assigned plans`.

### Task 2: тренер назначает — actions, вкладка «План», разрыв связи

**Files:**
- Create: `lib/coach/assign.ts` (чистые), `lib/coach/assign.test.ts`, `lib/coach/plan-actions.ts` ("use server"), `lib/coach/plan-queries.ts`, `components/coach/assign-dialog.tsx`, `components/coach/client-plan.tsx`, `e2e/coach-plan.spec.ts`
- Modify: `app/(app)/coach/clients/[id]/page.tsx` (вкладка `plan`), `lib/coach/actions.ts` (удаление назначений при разрыве и switch), `lib/coach/queries.ts` + `components/coach/client-list.tsx` («план 2/3»), `lib/analytics/goals.ts`, `e2e/db.ts`

**Interfaces:**
- Consumes: Task 1 — `coachId` в рядах, `applyPlanOps`, `planEdit`, `planTarget`, `getOccurrence`.
- Produces: `assignmentText(input: { templateName: string; date: string; weekdays: number[] }): string` — разово «<шаблон> на 13 окт.», серии «<шаблон>, пн/ср/пт с 13 окт.» (дни через «/» по порядку пн→вс, `WEEKDAYS_SHORT` в нижнем регистре; дата — `d MMM` ru-RU без года).
- Produces: `assignInputSchema` = `planInputSchema.omit({ title: true }).extend({ templateId: z.string().min(1), endDate: planDateSchema.nullable() })`, проверка `endDate ≥ date`.
- Produces (actions, все начинают с `requireClientOf(clientId)` и `requireCoach`): `assignWorkoutAction(clientId: string, input: AssignInput): Promise<Result>`; `updateAssignmentAction(clientId: string, key: string, scope: PlanScope, patch: unknown): Promise<Result>`; `deleteAssignmentAction(clientId: string, key: string, scope: PlanScope): Promise<Result>`. Правка/удаление — только если `getOccurrence(clientId, key).occurrence.coachId === coach.id`, иначе «Тренировка в календаре не найдена». Шаблон — только `userId = coach.id`, иначе «Шаблон не найден».
- Produces: `getClientPlan(coachId: string, clientId: string, tz: string, now?: Date): Promise<{ upcoming: CoachPlanItem[]; past: CoachPlanItem[] }>` — назначения этого тренера: `upcoming` — сегодня…+13 дней, `past` — −28…вчера (новые сверху); `CoachPlanItem = MatchedOccurrence | (Occurrence & { status: "skipped" })` (отменённые разовые и отменённые исключения серий тренера в диапазоне → `skipped`).
- Produces: `ClientRow.plan: { done: number; total: number } | null` — неделя клиента (пн…вс в его поясе), только назначения текущего тренера.
- Produces (e2e/db.ts): `coachTemplate(coachLogin: string, name: string): Promise<string>` — шаблон тренера с 2 встроенными упражнениями, возвращает id.

- [ ] **Step 1: Unit (RED)** — `assign.test.ts`: `assignmentText({templateName: "Ноги — база", date: "2026-10-13", weekdays: []})` → `"Ноги — база на 13 окт."`; `weekdays: [4, 0, 2]` → `"Ноги — база, пн/ср/пт с 13 окт."`; `assignInputSchema` отвергает `endDate < date` и пустой `templateId`.
- [ ] **Step 2:** `npx vitest run lib/coach` → FAIL.
- [ ] **Step 3:** `lib/coach/assign.ts` → PASS.
- [ ] **Step 4: e2e (RED)** `coach-plan.spec.ts`: (а) тренер на вкладке «План» назначает шаблон по пн/ср/пт → в списке «Ближайшие» есть вхождения со статусом «запланировано»; клиент открывает `/calendar?date=<ближайший пн>` и видит событие с «от тренера · <ник тренера>»; у клиента есть уведомление «Новый план от тренера»; (б) тренер без связи открывает `/coach/clients/<id>?tab=plan` → 404; (в) клиент отключает тренера в `/settings` → в его календаре события нет.
- [ ] **Step 5:** `npx playwright test coach-plan --project=desktop` → FAIL.
- [ ] **Step 6:** actions (создание как `createPlanAction` + `coachId`, `title` = имя шаблона; серии — `endDate` из ввода; уведомление клиенту `notify(tx, clientId, {type: COACH, title, body: assignmentText(...), url: "/calendar?date=<первая дата>"}, {push: true})`; `queueGoal("coach_assign")`; `revalidatePath` страницы клиента), `getClientPlan`, `AssignDialog` (шаблон — Select из своих шаблонов тренера, дата, время, длительность `PLAN_DURATIONS`, дни недели, «до»; режим edit — дата/время/шаблон + выбор scope для серии), `ClientPlan` (две секции, статус-бейджи текстами из Global Constraints, «выполнено» — ссылка `${base}/workouts/<id>`, у будущих — «Изменить»/«Удалить»), вкладка `{ id: "plan", label: "План" }` в `TABS`. Разрыв: в транзакциях `endCoachLinkAction`, `removeClientAction`, switch в `acceptCoachAction` — `planSeries.deleteMany({ where: { userId: clientId, coachId } })` и `planEntry.deleteMany({ where: { userId: clientId, coachId, seriesId: null } })`. «план 2/3» в `ClientList` при `plan`.
- [ ] **Step 7:** `npx playwright test coach-plan coach` (desktop + mobile) → PASS; `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 8:** Commit `feat(coach): assign templates to client calendar, plan tab with statuses`.

### Task 3: клиент — пометки, «От тренера», запуск, уведомление тренеру

**Files:**
- Modify: `components/calendar/calendar-view.tsx` (`CalendarEvent.coachName: string | null`; перетаскивание выключено при `coachName`), `components/calendar/event-card.tsx`, `components/calendar/week-dnd.tsx`/`week-grid.tsx` (по месту — без drag у назначенных), `app/(app)/calendar/page.tsx`, карточка «Сегодня по плану» на дашборде, `lib/plans/queries.ts` (`CalendarData.coachName: string | null` — ник активного тренера), `lib/workouts/queries.ts` (`getStartOptions` → `coachTemplates`), `components/training/start-screen.tsx`, `lib/workouts/finish.ts`
- Modify: `lib/coach/templates.ts` — `getAssignedTemplates(clientId: string): Promise<{ id: string; name: string; exercises: number }[]>`
- Test: `e2e/coach-plan.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`Occurrence.coachId`, `templateAccessible`, `cancelEntry`), Task 2 (`coachTemplate`, actions для подготовки — или SQL).
- Produces: в `finishWorkout` (в транзакции) — если `planKey` и вхождение с `coachId` = активный тренер: `notify(tx, coachId, { type: COACH, title: "Тренировка выполнена", body: "<ник>: выполнено «<название>»", url: "/coach/clients/<clientId>/workouts/<workoutId>" }, { push: true })`.

- [ ] **Step 1: e2e (RED)** в `coach-plan.spec.ts`: (г) клиент: «Сегодня по плану» (назначение на сегодня) с пометкой «от тренера», запуск → в редакторе упражнения шаблона; завершает → у тренера на вкладке «План» статус «выполнено», у тренера уведомление «Тренировка выполнена»; (д) в карточке события назначенного нет «Изменить»/«Удалить», есть «Назначено тренером»; «Пропустить» на сегодня → у тренера «пропущено клиентом»; (е) `/training` — раздел «От тренера» с шаблоном, запуск в один клик; после разрыва связи раздела нет, а POST `template:<id тренера>` даёт пустую тренировку («Тренировка» без упражнений).
- [ ] **Step 2:** `npx playwright test coach-plan --project=desktop` → новые FAIL.
- [ ] **Step 3:** реализация по Files; пометка — `coachName` из `CalendarData` для вхождений с `coachId` (у клиента один активный тренер; вхождение с `coachId` неактивного не встречается — удаляются при разрыве).
- [ ] **Step 4:** `npx playwright test coach-plan coach calendar training` (desktop + mobile) → PASS; `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 5:** Commit `feat(coach): client sees assigned plans, starts coach templates, coach notified on completion`.

### Task 4: сид, удаление шаблона, документация

**Files:**
- Modify: `prisma/seed.ts` (`seedDemoCoach`), `components/templates/delete-template-button.tsx` + страница шаблонов (счётчик назначений), `CLAUDE.md`, `app/(marketing)/privacy/page.tsx` — не трогать (данные те же).

- [ ] **Step 1:** сид: у `demo.coach` шаблон «Ноги — база» (встроенные: присед со штангой, румынская тяга, жим ногами, подъёмы на носки — по имени из сида; 3×8, 3×10, 3×12, 4×15), пересоздаётся; серии Маше пн/ср/пт с понедельника прошлой недели (`Europe/Moscow`) на 8 недель, `coachId = demo.coach`, время 19:00. `npm run db:seed` дважды → без дублей (проверить SQL: 3 серии у Маши с `coachId`).
- [ ] **Step 2:** диалог удаления шаблона — если есть назначения (`planSeries` + разовые `planEntry` с этим `templateId` и `coachId = userId`, уникальные клиенты) — строка «Назначен N клиентам» (`plural`).
- [ ] **Step 3:** CLAUDE.md — дополнить строку режима тренера (этап 2: `coachId` у планов, `templateAccessible`, права клиента, удаление при разрыве, вкладка «План», сид).
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → чисто; полный `npm run build && npm run test:e2e` → зелёный (известные нагрузочные флейки — перепрогнать по одному).
- [ ] **Step 5:** Commit `chore(coach): demo assignments in seed, delete-template warning, docs`.
