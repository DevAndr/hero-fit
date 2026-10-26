# Совместная тренировка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Два друга связывают свои тренировки в сессию, видят друг друга (опрос раз в 5 с), шлют 👊 и получают бонус XP за реальное пересечение.

**Architecture:** Таблица `TrainingSession` связывает две обычные `Workout`. Правила — чистые функции `lib/together/rules.ts`; БД — `queries.ts`/`close.ts`; действия — `actions.ts`; срез партнёра — route handler `app/api/together/[id]/route.ts`; UI — полоса партнёра в редакторе тренировки, страница `/together/[id]`, карточка на дашборде, блок в сводке.

**Tech Stack:** Next.js 16 (App Router, server actions, route handlers), Prisma 7, Zod, Base UI/shadcn, sonner, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-train-together-design.md`

## Global Constraints

- Ветка `feat/train-together` от `release/2027-09-together`; вливается в релиз `--no-ff`.
- Флаг `together` (`lib/flags/registry.ts`, `expires: "2027-06-30"`), по умолчанию выключен; без флага — нет кнопки, `/together/<id>` и API — 404, действия — ошибка «Недоступно».
- Константы (`lib/together/rules.ts`): `INVITE_TTL_MIN = 15`, `SESSION_MAX_H = 4`, `MIN_OVERLAP_MIN = 20`, `POLL_MS = 5000`, `CHEER_GAP_MS = 10_000`, `OFFLINE_AFTER_MS = 30_000`; бонус `max(5, round(0.1 × xpEarned))`.
- Только принятые друзья с флагом; у человека не больше одной открытой сессии (`INVITED`/`ACTIVE`).
- Отмена тренировки удаляет её (`cancelWorkoutAction` → `deleteMany`): поэтому обе ссылки на тренировки — `onDelete: SetNull`, а отмена закрывает сессию как «Выйти» (бонуса нет — как в спеке, где бонус требует обе `COMPLETED`).
- `queueGoal` — только в server actions (`lib/analytics/queue-usage.test.ts`).
- Уведомления — `notify(tx, userId, { type: "SOCIAL", … }, { push })` из `lib/notifications/service.ts`.
- Тексты — по-русски, без внутренних терминов. Имя партнёра — как в ленте друзей (ник или имя — тот же хелпер, что в `components/social`).
- e2e с флагом — desktop, `mode: "serial"`, `--workers=8`; флаг включать `setFlag`/`addFlagUser`, сбрасывать `resetFlag` в `afterAll`.
- Перед MR — полный прогон: `npx prisma generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.

## Review Focus

1. Двойной клик / две вкладки на «Присоединиться» или «Позвать» — не две открытые сессии (транзакция с `FOR UPDATE` строк `User`) — тест в Task 2.
2. Оба завершают почти одновременно — бонус ровно один раз каждому (`bonusAt` ставится условным `updateMany … where bonusAt: null`) — тест в Task 3.
3. Партнёр удалил аккаунт или отменил тренировку посреди сессии — опрос отдаёт `ENDED` с событием `left`, а не 500/404 у оставшегося — тест в Task 4.
4. Граница суток для «одного бонуса в день» — по поясу каждого получателя, не сервера — тест в Task 1 и Task 3.
5. Скрытые веса партнёра никогда не уходят в ответ API (не только не рисуются) — тест в Task 1 (срез) и Task 4 (ответ route).

---

### Task 1: Схема, флаг и чистые правила

**Files:**
- Modify: `prisma/schema.prisma` (enum `TrainingSessionStatus`, модели `TrainingSession`, `SessionCheer`, `XpReason.TOGETHER_BONUS`, обратные связи в `User` и `Workout`)
- Create: миграция `npx prisma migrate dev --name train_together` (проверить SQL: частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не удаляются)
- Modify: `lib/flags/registry.ts` (`together`)
- Create: `lib/together/rules.ts`, `lib/together/rules.test.ts`

**Interfaces:**
- Produces:
  - `type SessionStatus = "INVITED" | "ACTIVE" | "ENDED" | "DECLINED" | "EXPIRED"`
  - `sessionState(s: { status: SessionStatus; createdAt: Date; acceptedAt: Date | null }, now: Date): SessionStatus`
  - `inviteExpiresAt(createdAt: Date): Date`
  - `overlapMinutes(a: { startedAt: Date; finishedAt: Date }, b: { startedAt: Date; finishedAt: Date }): number`
  - `type BonusInput = { status: WorkoutStatus | null; startedAt: Date | null; finishedAt: Date | null; totalSets: number }`
  - `type NoBonus = "not_finished" | "short_overlap" | "no_sets" | "already_today" | "left"`
  - `bonusEligible(a: BonusInput, b: BonusInput, hadBonusToday: boolean): true | NoBonus` (для получателя `a`)
  - `bonusXp(xpEarned: number): number`
  - `type SnapshotExercise = { name: string; sets: { reps: number; weight: number | null; done: boolean }[]; record: boolean }`
  - `partnerSnapshot(exercises: { name: string; exerciseId: string; sets: { reps: number; weight: number; done: boolean }[] }[], bests: Map<string, number>, hideWeights: boolean): { exercises: SnapshotExercise[]; current: { exercise: string; doneSets: number; totalSets: number } | null }`
  - `canCheer(lastCheerAt: Date | null, now: Date): boolean`
  - константы из Global Constraints

Схема — как в спеке («Данные»), с отличием: `hostWorkoutId String? @unique` и `guestWorkoutId String? @unique`, обе связи `onDelete: SetNull`; `endReason String?` (`"left" | "cancelled" | "timeout"` — для причины в сводке).

- [ ] **Step 1: Тесты `lib/together/rules.test.ts`** — значения:
  - `sessionState`: `INVITED`, создано 14:59 мин назад → `INVITED`; 15:00 → `EXPIRED`; `ACTIVE`, `acceptedAt` 3 ч 59 мин → `ACTIVE`; 4 ч → `ENDED`; `ENDED`/`DECLINED` — как есть.
  - `overlapMinutes`: [10:00–11:00] и [10:40–12:00] → 20; не пересекаются → 0.
  - `bonusEligible`: пересечение 19 мин → `"short_overlap"`, 20 → `true`; `b.status = IN_PROGRESS` → `"not_finished"`; `a.totalSets = 0` → `"no_sets"`; `hadBonusToday` → `"already_today"`; `b` = `null`-поля (вышел/отменил) → `"not_finished"`.
  - `bonusXp(30) = 5`, `bonusXp(120) = 12`, `bonusXp(0) = 5`.
  - `partnerSnapshot`: при `hideWeights` у всех подходов `weight === null`, а `record` остаётся `true` для подхода с весом 100 при лучшем 90; `JSON.stringify` результата не содержит `"100"`; `current` — первое упражнение с невыполненными подходами после последнего выполненного (`{ exercise, doneSets: 3, totalSets: 5 }`); все выполнены → `null`; упражнение без лучшего (первое в жизни) — `record: false`.
  - `canCheer`: `null` → true; 9 999 мс → false; 10 000 мс → true.
- [ ] **Step 2:** `npx vitest run lib/together` — FAIL (нет модуля).
- [ ] **Step 3:** Схема + миграция + `npx prisma generate`; флаг `together: { description: "Совместная тренировка с другом", expires: "2027-06-30" }`; реализация `rules.ts`.
- [ ] **Step 4:** `npx vitest run lib/together lib/flags` — PASS; `npm run typecheck` — чисто.
- [ ] **Step 5:** Commit `feat(together): schema, flag and pure rules`.

### Task 2: Приглашение, принятие, отклонение, выход, 👊

**Files:**
- Create: `lib/together/queries.ts`, `lib/together/actions.ts`, `lib/together/queries.test.ts` (если в проекте есть DB-тесты — иначе покрытие в e2e Task 8)
- Modify: `lib/workouts/actions.ts` (`startWorkoutAction` — привязка гостя; `cancelWorkoutAction` — закрыть сессию до удаления), `lib/analytics/goals.ts` (`together_invite`, `together_join`, `together_bonus`)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `openSessionOf(client, userId: string, now: Date): Promise<TrainingSession | null>` — открытая с учётом `sessionState`
  - `inviteCandidates(userId: string): Promise<{ id: string; name: string; together: number }[]>` — принятые друзья с флагом; сортировка: число прошлых сессий ↓, затем последний визит ↓
  - actions (все `requireUser()` + `isEnabled("together", user.id)`; результат `{ ok: true, … } | { ok: false; error: string }`):
    - `inviteAction(workoutId: string, friendId: string)` → `{ ok: true; sessionId: string; expiresAt: string }`
    - `cancelInviteAction(sessionId: string)`
    - `acceptAction(sessionId: string)` → `{ ok: true; workoutId: string | null }` (`null` → клиент ведёт на `/training`)
    - `declineAction(sessionId: string)`
    - `leaveAction(sessionId: string)`
    - `cheerAction(sessionId: string)`
  - `attachGuestWorkout(tx, userId: string, workoutId: string, now: Date): Promise<void>` — вызывается из `startWorkoutAction`
  - `endSession(tx, sessionId: string, reason: "left" | "cancelled" | "timeout", now: Date): Promise<void>`

Правила: одна открытая сессия — транзакция, `SELECT id FROM "User" WHERE id IN (…) ORDER BY id FOR UPDATE` (`tx.$queryRaw`), затем `openSessionOf` для обоих. Уведомления: приглашение — `notify(tx, guestId, { type: "SOCIAL", title: "<Имя> в зале", body: "Тренируйся вместе — приглашение действует 15 минут", url: "/together/<id>" }, { push: true })`; отклонение — хозяину `{ push: false }`, «<Имя> не сможет сейчас». Лениво истёкшие статусы сохраняются при записи (`updateMany where status: INVITED`). `cancelWorkoutAction`: перед `deleteMany` — `endSession(…, "cancelled")` для открытой сессии этой тренировки. Цели: `queueGoal("together_invite")` в `inviteAction`, `"together_join"` в `acceptAction`.

- [ ] **Step 1:** Тест на гонку (DB-тест, если в репо есть паттерн; иначе — в e2e Task 8 шаг «две вкладки»): два параллельных `acceptAction`/`inviteAction` → одна открытая сессия.
- [ ] **Step 2:** Реализация `queries.ts`, `actions.ts`, правок `lib/workouts/actions.ts`, целей.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npx vitest run lib/together lib/analytics` — PASS.
- [ ] **Step 4:** Commit `feat(together): invite, accept, decline, leave, cheer`.

### Task 3: Закрытие сессии, бонус и ачивки «Вместе»

**Files:**
- Create: `lib/together/close.ts`
- Modify: `lib/workouts/actions.ts` (`finishWorkoutAction` — после успешного `finishWorkout` вызвать `closeIfDone`), `lib/achievements/definitions.ts` (лестница), `lib/achievements/engine.ts` (`togetherBonuses` в статистике), их тесты

**Interfaces:**
- Consumes: Task 1, `endSession` (Task 2), `levelProgress`, `evaluateAchievements`, `notify`, `dayKey`/`safeTimeZone` (`lib/daily-login`).
- Produces:
  - `closeIfDone(workoutId: string, now: Date): Promise<{ bonus: { userId: string; amount: number }[] }>`
  - статистика ачивок: `togetherBonuses: number` = `xpEvent.count({ where: { userId, reason: "TOGETHER_BONUS" } })`

`closeIfDone`: транзакция; сессия `ACTIVE` с этой тренировкой; если обе тренировки `COMPLETED` или хозяин `COMPLETED` при пустой `guestWorkoutId` — `updateMany({ where: { id, status: ACTIVE }, data: { status: ENDED, endedAt } })`; `count === 0` → ничего (повтор/гонка). Для каждого участника `bonusEligible` (`hadBonusToday` — есть `XpEvent TOGETHER_BONUS` с `createdAt` в местных сутках получателя по `finishedAt` его тренировки); подходящим — `XpEvent { reason: TOGETHER_BONUS, amount: bonusXp(xpEarned), meta: { sessionId } }`, `User.xp`/`level`, `evaluateAchievements`, `notify(… { title: "+N XP — тренировка с <Имя>", url: "/workouts/<id>" }, { push: true })`; `bonusAt = now`. `queueGoal("together_bonus")` — в `finishWorkoutAction`, если бонус достался текущему пользователю.

Лестница: `fixed: [1, 10, 50]`, `code: together:${n}`, `category: "SOCIAL"`, названия `1 → «Вдвоём веселее»`, `10 → «Напарники»`, `50 → «Неразлучные»`, описание `Потренироваться вместе с другом` / `${n} совместных тренировок`, `xpReward: 1 → 30, 10 → 60, 50 → 120`.

- [ ] **Step 1:** Тесты `definitions.test.ts`: `together:1/10/50` есть, категория `SOCIAL`, открываются при `togetherBonuses` 1/10/50.
- [ ] **Step 2:** FAIL → реализация → PASS (`npx vitest run lib/achievements lib/together`).
- [ ] **Step 3:** Commit `feat(together): close session, XP bonus and achievements`.

### Task 4: Срез партнёра — API опроса

**Files:**
- Create: `app/api/together/[id]/route.ts`, `lib/together/snapshot.ts`

**Interfaces:**
- Consumes: `partnerSnapshot`, `sessionState` (Task 1).
- Produces: `GET /api/together/<id>?since=<ISO>` → JSON формата из спеки («Синхронизация»), плюс `role: "host" | "guest"`; `loadPartnerSnapshot(sessionId: string, viewerId: string, since: Date | null, now: Date)` в `snapshot.ts`.

Не участник / нет флага / нет сессии → 404 (`requireUser` — 401 по правилам API). `bests` — один запрос: максимальный вес по `exerciseId` среза в завершённых тренировках партнёра, кроме текущей. События: `record` — упражнения, где `record` стал `true` (по `completedAt` подходов > `since`); `finished` — тренировка партнёра `COMPLETED` с `finishedAt > since`; `left` — `endReason in ("left", "cancelled")` и `endedAt > since` (сессия жива в БД, даже если тренировка партнёра удалена — `SetNull`). Ленивое истечение: если `sessionState` дал `EXPIRED`/`ENDED`, а в БД иное — сохранить (`endReason: "timeout"`).

- [ ] **Step 1:** Unit-тест на сборку ответа (`snapshot.ts` — чистая часть `buildResponse(...)`): при `hideWeights` в JSON нет весов; при удалённой тренировке партнёра — `partner: null`, `status: "ENDED"`, событие `left`.
- [ ] **Step 2:** FAIL → реализация → PASS; `npm run typecheck`.
- [ ] **Step 3:** Commit `feat(together): partner snapshot API`.

### Task 5: Редактор тренировки — «Вместе», приглашение, полоса партнёра

**Files:**
- Create: `components/together/use-together.ts` (опрос), `components/together/invite-sheet.tsx`, `components/together/partner-bar.tsx`
- Modify: `components/training/workout-editor.tsx` (кнопка в шапке, полоса под шапкой), страница, рендерящая редактор (`app/(app)/training/page.tsx`) — передать `together: { enabled: boolean; sessionId: string | null }`

**Interfaces:**
- Consumes: actions (Task 2), API (Task 4), константы (Task 1).
- Produces: `useTogether(sessionId: string | null): { data: SnapshotResponse | null; offline: boolean; refresh(): void }` — опрос `POLL_MS` при `document.visibilityState === "visible"`, стоп на конечных статусах, `offline` после `OFFLINE_AFTER_MS` без успешного ответа; `since` — время последнего ответа.

UI (подписи — точно): кнопка `aria-label="Вместе"`; лист «Позвать друга» со строками друзей и кнопками «Позвать»; пусто — «Пока некого позвать: добавьте друзей» со ссылкой `/friends`. Ожидание — «Ждём <Имя>… mm:ss» + «Отменить». Полоса — `role="region" aria-label="Партнёр"`: имя, «<Упражнение> · N из M подходов», время в зале, кнопка `aria-label="Отправить 👊"`, меню с «Выйти из сессии»; раскрытие — список упражнений партнёра (`8 × 80 кг` или `8 повторов`), значок «Рекорд». `offline` — `opacity-60` и «нет связи». Тосты: `"<Имя>: новый рекорд — <упражнение>!"`, `"<Имя> прислал 👊"`, `"<Имя> закончил тренировку"`, `"<Имя> вышел из сессии"`. Учитывать «уменьшить движение» (без бесконечных анимаций).

- [ ] **Step 1:** Реализация; `npm run typecheck && npm run lint`.
- [ ] **Step 2:** Ручная проверка — `npm run dev`, два браузера, флаг включён в `/admin/flags`.
- [ ] **Step 3:** Commit `feat(together): invite sheet and partner bar in the workout editor`.

### Task 6: Страница приглашения, дашборд, экран старта

**Files:**
- Create: `app/(app)/together/[id]/page.tsx`, `components/together/invite-card.tsx` (клиентские кнопки), `components/together/dashboard-invite.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (карточка сверху), `components/training/start-screen.tsx` (баннер «Тренировка с <Имя>», когда сессия `ACTIVE` без `guestWorkoutId`)

**Interfaces:**
- Consumes: `openSessionOf`, `sessionState`, `acceptAction`, `declineAction`.

`/together/<id>`: участник-гость, `INVITED` — «<Имя> тренируется с HH:MM», кнопки «Присоединиться» / «Отклонить»; «Присоединиться» → `workoutId ? /training : /training` (редактор активной тренировки или экран старта — оба по `/training`). Иначе — текст по статусу: «Приглашение истекло», «Приглашение отменено», «Вы уже тренируетесь вместе» и ссылка «К тренировке» (`/training`). Не участник или без флага — `notFound()`. Метаданные: `title: "Тренировка вместе"`.

- [ ] **Step 1:** Реализация; `npm run typecheck && npm run lint`.
- [ ] **Step 2:** Commit `feat(together): invite page, dashboard card, start banner`.

### Task 7: Сводка, «Мои данные», админка, «Что нового», документация

**Files:**
- Create: `components/together/summary-block.tsx`
- Modify: `app/(app)/workouts/[id]/page.tsx` (блок «Вместе с <Имя>»), `lib/account/export-queries.ts`, `lib/account/export.ts` (+ тест), `lib/admin/metrics-queries.ts`, `components/admin/feature-usage.tsx`, `lib/changelog/releases.ts`, `docs/features/social.md`, `CLAUDE.md` (строка `docs/features/social.md` — «совместная тренировка»)

Сводка: длительность, подходы, рекорды партнёра; «Тренировались одновременно N мин»; бонус — «+N XP за тренировку вместе» / «Бонус придёт, когда <Имя> закончит» / причина по `NoBonus`: `short_overlap` — «Пересеклись меньше 20 минут», `already_today` — «Бонус за совместную тренировку сегодня уже был», `no_sets` — «В одной из тренировок нет подходов», `left` — «Кто-то вышел из сессии».

Выгрузка: раздел `trainingSessions: { date, role: "позвал" | "позвали", partner: nickname, status, bonusXp }[]` и `cheersSent: number`. Админка «Фичи» → «Совместные тренировки»: `сессий ${7д} / ${30д}, принято ${%}, с бонусом ${%}`. «Что нового» — новая запись релиза (версия поднимается при сборе релиза; если запись уже есть — пункт в `new` с `flag: "together"`): «Тренируйтесь вместе с другом: видно, что он делает, можно прислать 👊, а за совместную тренировку — бонус XP».

- [ ] **Step 1:** Тест выгрузки (`lib/account/export.test.ts`): раздел есть, без чужих данных кроме ника.
- [ ] **Step 2:** FAIL → реализация → PASS; `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 3:** Commit `feat(together): summary block, data export, admin metrics, docs`.

### Task 8: e2e

**Files:**
- Create: `e2e/train-together.spec.ts`
- Modify: `e2e/db.ts` (`shiftSession(id, { createdAt?, acceptedAt? })`, `shiftWorkoutStart(workoutId, minutes)`), `e2e/account-data.spec.ts`

`test.describe.configure({ mode: "serial" })`, только desktop, два контекста, друзья через `makeFriends`, флаг — `setFlag("together", { enabled: true })` в `beforeAll`, `resetFlag` в `afterAll`. Сценарии (имена):
1. `invite → accept with a running workout → partner bar updates after a set → cheer arrives`
2. `accept without a workout → start screen → the started workout is linked`
3. `decline; invite expires after 15 minutes`
4. `leave the session — no bonus for anyone`
5. `bonus for both after the second finishes; second bonus the same day — none` (старт сдвигается на 30 мин назад)
6. `two tabs accept at once — one session`
7. `partner hides weights — no weights in the API response`
8. `flag off — no «Вместе» button, /together/<id> is 404`
- `account-data.spec.ts`: в выгрузке раздел совместных тренировок; удаление аккаунта гостя — у хозяина сводка открывается без блока.

- [ ] **Step 1:** `npm run build && npx playwright test e2e/train-together.spec.ts e2e/account-data.spec.ts --project=desktop --workers=8` — PASS.
- [ ] **Step 2:** Полный прогон из Global Constraints — зелёный.
- [ ] **Step 3:** Commit `test(together): e2e`; влить в `release/2027-09-together` `--no-ff`, удалить ветку фичи.
