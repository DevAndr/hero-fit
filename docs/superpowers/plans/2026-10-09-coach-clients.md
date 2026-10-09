# Режим тренера, этап 1 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Тренер включает режим, приглашает клиента ссылкой, клиент соглашается, тренер видит список клиентов и их тренировки, статистику и карту мышц (только чтение); любая сторона разрывает связь.

**Architecture:** Связь — таблица `CoachLink` (активная = `endedAt IS NULL`, одна на клиента — частичный уникальный индекс). Доступ — единая проверка `requireClientOf(clientId)`. Данные клиента читаются существующими запросами с `userId = clientId`; вёрстка `/stats`, `/stats/exercises/[id]`, `/workouts/[id]` выносится в компоненты и переиспользуется страницами тренера.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, React 19, Tailwind, shadcn/Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-coach-clients-design.md`

## Global Constraints

- Ветка `feat/coach-clients`; Next.js 16 — сверяться с `node_modules/next/dist/docs/`.
- Без новых зависимостей. Цвета — семантические токены. Тексты — на «ты» в интерфейсе тренера и клиента, без рода.
- Тренер и клиент видят друг друга по `clientDisplayName`: ник → `User.name` → «Клиент». Логин и почта не показываются никому.
- Нет активной связи / не тренер / чужие данные → `notFound()` (404), никогда не 403 (не раскрываем существование).
- `hideWeights` к тренеру не применяется.
- Код тренера — формат и нормализация как у кода друга (`generateFriendCode`, `normalizeFriendCode` из `lib/social/league.ts`).
- Цели Метрики: `coach_enabled`, `coach_client_joined`.
- Unit — только чистые функции; работа с БД — e2e. Перед коммитом: `npm run typecheck`, `npm run lint`, `npm test`.

## Review Focus

1. Страница или действие тренера без `requireClientOf` → утечка данных чужого клиента. Тест: e2e «тренер без связи — 404» на каждый маршрут тренера (карточка, тренировка, упражнение) — Task 4.
2. Тренер выключил режим — `/coach*` должны отдавать 404, а не показывать клиентов. Тест — Task 4 («coach mode off hides clients»).
3. Две вкладки клиента жмут «Разрешить» разным тренерам одновременно — не должно остаться двух активных связей (частичный индекс + транзакция). Покрыто индексом; тест — Task 2 (повтор accept тем же кодом без ошибки) и проверка индекса SQL-запросом в e2e.
4. Неделя «2 из 3» и «вчера» у клиента в другом часовом поясе — считать в `User.timeZone` клиента, а не тренера. Тест — unit `lastWorkoutLabel` с поясом (Task 1); неделя — `getCoachClients` передаёт `client.timeZone` в расчёт недели (Task 4, проверка в ревью).
5. Тренер открывает свою же ссылку или ссылку, когда он уже тренер этого клиента, — понятные сообщения без создания связи. Тест — Task 2.

---

### Task 1: Данные, доступ, чистые функции

**Files:**
- Modify: `prisma/schema.prisma` (`CoachLink`, `User.isCoach`, `User.coachCode`, отношения, `NotificationType.COACH`)
- Create: миграция `prisma/migrations/<ts>_coach_link/migration.sql` (`--create-only`, дописать частичный индекс)
- Modify: `lib/auth/dal.ts` (`CurrentUser.isCoach` в select и типе)
- Modify: `lib/analytics/goals.ts`, `lib/analytics/goals.test.ts`
- Create: `lib/coach/clients.ts`, `lib/coach/clients.test.ts`, `lib/coach/access.ts`

**Interfaces:**
- Produces:
  - `CurrentUser.isCoach: boolean`
  - `lib/coach/clients.ts` (чистые):
    - `clientDisplayName(u: { nickname: string | null; name: string | null }): string`
    - `type ClientRow = { id: string; name: string; level: number; lastWorkoutAt: Date | null; linkedAt: Date; weekCount: number; streak: number; hints: number }`
    - `type ClientFlags = { inactive: boolean; hints: number }`
    - `clientFlags(row: ClientRow, now: Date): ClientFlags` — `inactive`: последняя тренировка ≥ 7 суток назад, или тренировок нет и `linkedAt` ≥ 7 суток назад
    - `sortClients(rows: ClientRow[], now: Date): ClientRow[]` — сначала `inactive` (давние выше; без тренировок — выше всех неактивных), затем `hints > 0` (по давности последней тренировки, давние выше), затем остальные по свежести (свежие выше)
    - `lastWorkoutLabel(at: Date | null, now: Date, timeZone: string): string` — «сегодня», «вчера», «N дней назад» (по календарным дням в поясе), «ещё не тренировался»
  - `lib/coach/access.ts` (server-only): `requireCoach(): Promise<CurrentUser>`; `requireClientOf(clientId: string): Promise<{ coach: CurrentUser; client: { id: string; nickname: string | null; name: string | null; timeZone: string; xp: number }; linkedAt: Date }>`; `activeCoachOf(clientId: string): Promise<{ id: string; nickname: string | null; name: string | null; linkedAt: Date } | null>`
  - `GOALS` += `"coach_enabled"`, `"coach_client_joined"`

- [ ] **Step 1: Failing tests** `lib/coach/clients.test.ts` (now = `2026-10-09T12:00:00Z`, пояс `Europe/Moscow`):
  - `clientDisplayName`: `{nickname:"iron", name:"Иван"}` → `"iron"`; `{null,"Иван"}` → `"Иван"`; `{null,null}` → `"Клиент"`;
  - `clientFlags`: тренировка 7 дней назад → `inactive: true`; 6 дней 23 ч → `false`; нет тренировок, связь 8 дней → `true`; нет тренировок, связь 2 дня → `false`; `hints` пробрасывается;
  - `sortClients`: [свежий без меток, неактивный 10 дней, с подсказками 2 дня, неактивный без тренировок, свежий 1 день] → порядок: без тренировок, 10 дней, с подсказками, 1 день назад, сегодня;
  - `lastWorkoutLabel`: 23:30 МСК вчера при now 00:30 МСК → «вчера»; null → «ещё не тренировался»; 3 дня → «3 дня назад»; 5 → «5 дней назад».
  - goals: `parseGoals("coach_enabled.coach_client_joined")` → оба.

- [ ] **Step 2: Run** `npx vitest run lib/coach lib/analytics` — FAIL.

- [ ] **Step 3: Implement**
  - schema по спеке (`endedBy String?`, индексы `[coachId, endedAt]`, `[clientId, endedAt]`), `User.isCoach Boolean @default(false)`, `User.coachCode String? @unique`, `NotificationType.COACH`;
  - миграция `--create-only`, в конец: `CREATE UNIQUE INDEX "CoachLink_active_client" ON "CoachLink"("clientId") WHERE "endedAt" IS NULL;`; `npx prisma migrate dev`, `npx prisma generate`;
  - `clients.ts` — функции выше; `plural` из `lib/format`;
  - `access.ts`: `requireCoach` — `requireUser()` + `isCoach`, иначе `notFound()`; `requireClientOf` — `requireCoach()` + `db.coachLink.findFirst({ where: { coachId, clientId, endedAt: null }, include: client select })`, иначе `notFound()`; `activeCoachOf` — активная связь клиента с данными тренера.

- [ ] **Step 4: Run** `npx vitest run lib/coach lib/analytics` — PASS; `npm run typecheck` — чисто.

- [ ] **Step 5: Commit** `feat(coach): CoachLink model, access checks, client list helpers`

### Task 2: Режим тренера, приглашение, согласие, разрыв

**Files:**
- Create: `lib/coach/actions.ts` ("use server"), `lib/coach/queries.ts` (server-only, `ensureCoachCode`, `getCoachByCode`)
- Create: `app/(app)/coach/join/[code]/page.tsx`, `components/coach/join-consent.tsx`, `components/coach/coach-settings.tsx` (карточки «Режим тренера» и «Мой тренер»)
- Modify: `app/(app)/settings/page.tsx`, `components/app/nav.ts` / `nav-links.tsx` (пункт «Клиенты» только при `isCoach`), `components/app/user-menu.tsx` (пункт «Клиенты»), `components/app/app-shell.tsx` (проброс `isCoach`)
- Modify: `app/(marketing)/privacy/page.tsx` (пункт про тренера), `lib/legal.ts` (дата редакции)
- Create: `e2e/coach.spec.ts` (сценарии этой задачи), Modify: `e2e/db.ts` (`linkCoach(coachLogin, clientLogin)`, `setNickname(login, nick)`, `enableCoach(login)`)

**Interfaces:**
- Consumes: Task 1 — `requireCoach`, `activeCoachOf`, `clientDisplayName`, `CurrentUser.isCoach`, `NotificationType.COACH`, goals
- Produces:
  - `setCoachModeAction(on: boolean): Promise<{ ok: true } | { ok: false; error: string }>` — без ника `{ ok: false, error: "Сначала задайте ник" }`; при первом включении — `ensureCoachCode` и цель `coach_enabled`
  - `acceptCoachAction(code: string): Promise<never>` (redirect `/dashboard`) — транзакция: закрыть активную связь клиента (`endedBy: "switch"`, уведомление прежнему), создать новую, уведомление тренеру, цель `coach_client_joined`
  - `endCoachLinkAction(): Promise<void>` (клиент), `removeClientAction(clientId: string): Promise<never>` (тренер, redirect `/coach`)
  - `ensureCoachCode(userId): Promise<string>`, `getCoachByCode(code): Promise<{ id; nickname; name; isCoach } | null>`
  - e2e-хелперы `linkCoach`, `enableCoach`, `setNickname`

- [ ] **Step 1: Failing e2e** `e2e/coach.spec.ts`:
  - `coach mode needs a nickname`: `/settings` → карточка «Режим тренера», переключатель неактивен и текст «Сначала задайте ник»; задать ник (форма на `/friends`) → включить → на `/coach` видны ссылка (`/coach/join/`) и код;
  - `client accepts via link (sign-in round trip)`: тренер включён (хелперы), гость открывает ссылку → `/login?next=…` → регистрация/вход → экран «Тренер <ник> просит доступ…» → «Разрешить» → `/dashboard`; у тренера в колокольчике «Новый клиент»; повторное открытие ссылки клиентом → «Вы уже занимаетесь с <ник>»;
  - `own and unknown codes`: тренер открывает свою ссылку → «Это ваша ссылка»; `/coach/join/ZZZZZZZZ` → «Ссылка недействительна»;
  - `switching coaches ends the old link`: клиент связан с A (`linkCoach`), открывает ссылку B → «Сейчас ваш тренер — A» → «Разрешить» → у A уведомление «перешёл к другому тренеру»; SQL: у клиента ровно одна связь с `endedAt IS NULL` и она с B;
  - `client disconnects`: `/settings` → «Мой тренер: <ник>» → «Отключить тренера» → подтверждение → карточки нет; у тренера уведомление «отключил доступ»;
  - `nav shows «Клиенты» only for coaches`.

- [ ] **Step 2: Run** `npm run build && npx playwright test coach` — FAIL.

- [ ] **Step 3: Implement** по спеке (сценарии «Включение», «Приглашение», «Согласие», «Разрыв»); ссылка — `${env.APP_URL}/coach/join/<код без дефиса>`; кнопка «Скопировать» — `navigator.clipboard.writeText` + тост; карточка «Мой тренер» — только при активной связи; уведомления — `notify(tx, …, { type: COACH, … }, { push: true })`; политика — пункт из раздела спеки «Политика конфиденциальности».

- [ ] **Step 4: Run** `npm run build && npx playwright test coach friends settings` — PASS.

- [ ] **Step 5: Commit** `feat(coach): coach mode, invite link, client consent and disconnect`

### Task 3: Вынести вёрстку статистики и сводки в компоненты (без изменения поведения)

**Files:**
- Create: `components/stats/stats-view.tsx` (из `app/(app)/stats/page.tsx`), `components/stats/exercise-progress-view.tsx` (из `app/(app)/stats/exercises/[id]/page.tsx`), `components/workouts/workout-summary-view.tsx` (из `app/(app)/workouts/[id]/page.tsx`)
- Modify: эти три страницы — только загрузка данных и рендер компонента

**Interfaces:**
- Produces:
  - `<StatsView data={…} basePath="/stats" />` — ссылки на упражнения `${basePath}/exercises/${id}`
  - `<ExerciseProgressView data={…} backHref="/stats" />`
  - `<WorkoutSummaryView workout={…} meta={…} viewer={{ xp, timeZone, currentStreak }} readOnly={false} exerciseHref={(exerciseId) => string} actions={ReactNode} />` — при `readOnly` нет действий (шаблон, «Поделиться»), сундука босса и `OfflineCleanup`
  - Точные типы `data` — то, что страница сейчас собирает перед JSX; вынести тип рядом с компонентом (`StatsViewData` и т. д.)

- [ ] **Step 1: Guard tests** — существующие e2e уже покрывают поведение: запустить `npx playwright test stats training boss share-story achievements` и записать результат как базовый (PASS).

- [ ] **Step 2: Refactor** — перенос JSX без изменений разметки и текстов; страницы оставляют `requireUser`, загрузку и `metadata`.

- [ ] **Step 3: Run** `npm run typecheck && npm run lint && npm run build && npx playwright test stats training boss share-story achievements` — PASS, те же тесты.

- [ ] **Step 4: Commit** `refactor: extract stats, exercise progress and workout summary views`

### Task 4: Кабинет тренера

**Files:**
- Create: `app/(app)/coach/page.tsx`, `app/(app)/coach/clients/[id]/page.tsx`, `app/(app)/coach/clients/[id]/workouts/[wid]/page.tsx`, `app/(app)/coach/clients/[id]/exercises/[exId]/page.tsx`
- Create: `components/coach/client-list.tsx`, `components/coach/invite-card.tsx`, `components/coach/client-header.tsx` (шапка + «Удалить клиента»), `components/coach/client-workouts.tsx` (лента с подгрузкой)
- Modify: `lib/coach/queries.ts` (`getCoachClients(coachId): Promise<ClientRow[]>`, `getClientWorkouts(clientId, cursor, limit = 20)`)
- Modify: `e2e/coach.spec.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1 — `requireCoach`, `requireClientOf`, `sortClients`, `clientFlags`, `lastWorkoutLabel`, `ClientRow`; Task 2 — `ensureCoachCode`, `removeClientAction`; Task 3 — `StatsView`, `ExerciseProgressView`, `WorkoutSummaryView`
- Produces: маршруты `/coach`, `/coach/clients/[id]?tab=overview|workouts|stats`, `/coach/clients/[id]/workouts/[wid]`, `/coach/clients/[id]/exercises/[exId]`

- [ ] **Step 1: Failing e2e** (дополнить `e2e/coach.spec.ts`):
  - `coach sees client list with flags`: два клиента (`linkCoach`), у одного тренировка 8 дней назад (`seedWorkouts`), у другого вчера → первая строка — неактивный с меткой «7+ дней без тренировок», вторая — «вчера»;
  - `coach opens client's workout with weights despite hideWeights`: клиент с `hideWeights = true` (SQL) делает `quickWorkout` 60 кг → тренер: `/coach` → клиент → вкладка «Тренировки» → тренировка → виден «60» (кг) и объём; нет кнопок «Сохранить как шаблон» и «Поделиться»; вкладки «Обзор» (виден `data-testid="body-map"`) и «Статистика» открываются, упражнение ведёт на график;
  - `no link — 404 everywhere`: другой тренер открывает `/coach/clients/<id>`, `/coach/clients/<id>/workouts/<wid>`, `/coach/clients/<id>/exercises/<exId>` → 404;
  - `client disconnect revokes access`: после «Отключить тренера» те же адреса у тренера → 404;
  - `coach removes client`: «Удалить клиента» → подтверждение → `/coach` без клиента; у клиента нет карточки «Мой тренер», есть уведомление;
  - `coach mode off hides clients`: выключить режим → `/coach` → 404, пункта «Клиенты» нет; включить → клиент снова в списке.

- [ ] **Step 2: Run** `npm run build && npx playwright test coach` — FAIL на новых сценариях.

- [ ] **Step 3: Implement** по разделу спеки «Интерфейс»: каждая страница `/coach/clients/[id]*` начинается с `requireClientOf(params.id)`; `/coach` — `requireCoach()`; неделя и серия — в `client.timeZone`; подсказки — `getProgressionHints(clientId, ids упражнений за 30 дней)`; лента — курсор `(finishedAt, id)` как в `getFeed`; тренировка — `getWorkoutSummary(clientId, wid)` + `WorkoutSummaryView readOnly`; упражнение — `getExerciseProgress(clientId, exId)` + `ExerciseProgressView backHref`. CLAUDE.md — строка по разделу спеки «Документация».

- [ ] **Step 4: Run** `npm run build && npx playwright test coach stats training` — PASS; затем полный `npx playwright test` — без новых падений.

- [ ] **Step 5: Ручная проверка** — скриншоты `/coach` и карточки клиента на 390 px и 1280 px.

- [ ] **Step 6: Commit** `feat(coach): coach dashboard — client list, client card, read-only workouts and stats`
