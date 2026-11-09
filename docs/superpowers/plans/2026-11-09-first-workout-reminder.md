# Первая тренировка: напоминание, герой черновика, рассылка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Больше новичков завершают первую тренировку: диалог «Когда тренировка?» с напоминанием, герой «Твоя тренировка готова», кампания `DRAFT_WAITING` и метрика «Потренировались».

**Architecture:** Время — обычная `PlanEntry`, привязанная к черновику через `Workout.planKey`, поэтому работают готовые напоминания и календарь. Письмо — необязательное дополнение к шагу `reminders`. Кампания и метрика расширяют движок `lib/campaigns`.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Base UI / shadcn, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-first-workout-reminder-design.md`

## Global Constraints

- Весь пользовательский текст — на русском, точные формулировки из спеки.
- Флаг `first_workout_reminder` закрывает диалог и новый герой. Правка глушения напоминаний и части кампаний — без него.
- Цвета — только семантические токены; ссылка-кнопка — `<Link className={buttonVariants()}>`; поля даты и времени — по образцу календаря.
- Новые поля пользовательских данных — в «Мои данные» (`lib/account/*`).
- SQL миграции проверить: индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`, `StretchCourse_active` не удаляются.
- После смены ветки и правки схемы — `npx prisma generate`.
- e2e с глобальным флагом — `mode: "serial"`, только desktop. Даты — только через `E2E_TZ`/`localAt`. `runTick` — с одним шагом.
- Сообщения коммитов — в формате истории (`feat(...)`), в конце строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push и MR — только по отдельной просьбе пользователя.

## Review Focus

1. Два таба или двойной клик по «Готово»: создаётся одна `PlanEntry`, вторая попытка не привязывает черновик заново (тест — Task 3).
2. Пояс пользователя не Москва: «Сегодня вечером» и 19:00 считаются по `User.timeZone`, а не по серверу (тест — Task 2).
3. Аккаунт без email (вход через Telegram): галочки нет, а `emailReminder: true` с клиента не сохраняется и письмо не уходит (тесты — Task 3, Task 4).
4. Тренировку начали и закончили до напоминания: ни push, ни письма (тест — Task 4).
5. Из черновика удалили все упражнения после создания: `DRAFT_WAITING` его не выбирает (тест — Task 9).

---

### Task 1: Ветки, схема, миграция, флаг

**Files:**
- Modify: `prisma/schema.prisma`, `lib/flags/registry.ts`
- Create: `prisma/migrations/<timestamp>_first_workout_reminder/migration.sql`

**Interfaces:**
- Produces: `Workout.scheduleAskedAt: DateTime?`, `PlanEntry.emailReminder: Boolean @default(false)`, `CampaignSend.trainedAt: DateTime?`, `CampaignCondition.DRAFT_WAITING`, флаг `first_workout_reminder`.

- [ ] **Step 1: Создать ветки от свежего main**

```bash
git fetch origin
git switch -c release/2028-06-first-workout origin/main
git switch -c feat/first-workout-reminder
```
Изменённый `.env.example` и `.playwright-mcp/` не трогать и не добавлять в коммиты.

- [ ] **Step 2: Закоммитить спеку и план**

`git add` только двух файлов в `docs/superpowers/`, сообщение `docs: спека и план напоминания о первой тренировке`.

- [ ] **Step 3: Добавить поля и значение перечисления в схему, флаг в реестр**

Описание флага: «Первая тренировка: диалог „Когда тренировка?“, герой черновика», `expires: "2027-06-30"`.

- [ ] **Step 4: Создать миграцию без применения**

Run: `npx prisma migrate dev --create-only --name first_workout_reminder`

Expected: файл SQL с тремя `ALTER TABLE` и `ALTER TYPE ... ADD VALUE`; нет `DROP INDEX` из Global Constraints (лишние — удалить).

- [ ] **Step 5: Дописать backfill в конец миграции**

```sql
UPDATE "CampaignSend" s SET "trainedAt" = (
  SELECT min(w."finishedAt") FROM "Workout" w
  WHERE w."userId" = s."userId" AND w.status = 'COMPLETED'
    AND w."finishedAt" >= s."sentAt" AND w."finishedAt" <= s."sentAt" + interval '72 hours'
);
```

- [ ] **Step 6: Применить и проверить**

Run: `npm run db:migrate && npx prisma generate && npm run typecheck`
Expected: миграция применена, типы без ошибок.

- [ ] **Step 7: Commit** — `feat(first-workout): поля для напоминания и метрики, флаг`.

---

### Task 2: Правила диалога (чистые функции)

**Files:**
- Create: `lib/workouts/schedule.ts`, `lib/workouts/schedule.test.ts`

**Interfaces:**
- Consumes: `occurrenceStart` (`lib/plans/reminders.ts`), `dayKey` (`lib/daily-login.ts`), `addDays` (`lib/dates.ts`).
- Produces:
  - `shouldAskSchedule(w: { status: string; planKey: string | null; courseId?: string | null; scheduleAskedAt: Date | null }, completed: number): boolean`
  - `schedulePresets(now: Date, tz: string): { evening: Slot | null; tomorrow: Slot }`, где `type Slot = { date: string; time: string }`
  - `slotError(slot: Slot, now: Date, tz: string): string | null`
  - константы `SCHEDULE_TIME = "19:00"`, `EVENING_CUTOFF_HOUR = 18`, `MAX_SCHEDULE_DAYS = 30`.

- [ ] **Step 1: Написать падающие тесты**

```ts
describe("shouldAskSchedule", () => {
  const w = { status: "PLANNED", planKey: null, courseId: null, scheduleAskedAt: null };
  it("новичок с черновиком", () => expect(shouldAskSchedule(w, 0)).toBe(true));
  it("есть завершённые", () => expect(shouldAskSchedule(w, 1)).toBe(false));
  it("уже привязан", () => expect(shouldAskSchedule({ ...w, planKey: "e:1" }, 0)).toBe(false));
  it("уже спрашивали", () => expect(shouldAskSchedule({ ...w, scheduleAskedAt: new Date() }, 0)).toBe(false));
  it("занятие курса", () => expect(shouldAskSchedule({ ...w, courseId: "c" }, 0)).toBe(false));
  it("идёт тренировка", () => expect(shouldAskSchedule({ ...w, status: "IN_PROGRESS" }, 0)).toBe(false));
});
describe("schedulePresets", () => {
  it("до 18:00 — сегодня и завтра в 19:00", () => {
    expect(schedulePresets(new Date("2026-11-09T14:59:00Z"), "Europe/Moscow")).toEqual({
      evening: { date: "2026-11-09", time: "19:00" }, tomorrow: { date: "2026-11-10", time: "19:00" },
    });
  });
  it("с 18:00 вечера нет", () => expect(schedulePresets(new Date("2026-11-09T15:00:00Z"), "Europe/Moscow").evening).toBeNull());
  it("считает по поясу пользователя", () => {
    // 15:00 UTC: в Москве 18:00 (поздно), в Лондоне 15:00 (можно), в Токио уже 00:00 следующего дня
    expect(schedulePresets(new Date("2026-11-09T15:00:00Z"), "Europe/London").evening).toEqual({ date: "2026-11-09", time: "19:00" });
    expect(schedulePresets(new Date("2026-11-09T15:00:00Z"), "Asia/Tokyo").evening).toEqual({ date: "2026-11-10", time: "19:00" });
  });
});
describe("slotError", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("будущее — ок", () => expect(slotError({ date: "2026-11-10", time: "08:00" }, now, "Europe/Moscow")).toBeNull());
  it("прошлое — ошибка", () => expect(slotError({ date: "2026-11-09", time: "14:00" }, now, "Europe/Moscow")).toBe("Выберите время в будущем"));
  it("30 дней — ок, 31 — нет", () => {
    expect(slotError({ date: "2026-12-09", time: "08:00" }, now, "Europe/Moscow")).toBeNull();
    expect(slotError({ date: "2026-12-10", time: "08:00" }, now, "Europe/Moscow")).toBe("Можно запланировать не дальше чем на 30 дней");
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/workouts/schedule.test.ts`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать функции** в `lib/workouts/schedule.ts`. Час определять через `Intl.DateTimeFormat` с `timeZone: tz`, момент слота — `occurrenceStart(slot, tz)`.

- [ ] **Step 4: Убедиться, что тесты проходят** — та же команда, PASS.

- [ ] **Step 5: Commit** — `feat(first-workout): правила диалога «Когда тренировка?»`.

---

### Task 3: Серверные действия диалога

**Files:**
- Create: `lib/workouts/schedule-actions.ts`, `lib/workouts/schedule-actions.test.ts`

**Interfaces:**
- Consumes: Task 2; `entryKey` (`lib/plans/expand.ts`); `planDateSchema` (`lib/plans/schema.ts`); `isEnabled`.
- Produces:
  - `scheduleDraftAction(input: { workoutId: string; date: string; time: string; emailReminder: boolean }): Promise<{ ok: true } | { ok: false; error: string }>`
  - `dismissScheduleAction(workoutId: string): Promise<void>`

- [ ] **Step 1: Написать падающие тесты** (по образцу `lib/errors/record.test.ts`: `vi.mock` для `server-only`, `@/lib/db`, `@/lib/auth/dal`, `@/lib/flags/server`, `next/cache`)

Имена и утверждения:
- `«привязывает черновик и создаёт запись»`: `planEntry.create` получает `title: workout.name`, `templateId`, `date`, `time`, `emailReminder: true`; `workout.updateMany` — `where: { id, userId, status: "PLANNED", planKey: null }`, `data` содержит `planKey: "e:<id записи>"` и `scheduleAskedAt`.
- `«второй вызов откатывает запись»`: `workout.updateMany` вернул `count: 0` → результат `{ ok: false, error: "Тренировка уже запланирована" }`, транзакция прервана throw.
- `«без email галочка не сохраняется»`: `user.email = null`, вход `emailReminder: true` → `planEntry.create` с `emailReminder: false`.
- `«флаг выключен»`: `{ ok: false }`, `planEntry.create` не вызывается.
- `«время в прошлом»`: `{ ok: false, error: "Выберите время в будущем" }`.

- [ ] **Step 2: Убедиться, что тесты падают** — `npx vitest run lib/workouts/schedule-actions.test.ts`, FAIL.

- [ ] **Step 3: Реализовать** (`"use server"`, `requireUser`). Часовой пояс — `safeTimeZone(user.timeZone)`. Запись и привязка — в одной `db.$transaction`; ноль обновлённых строк — `throw` собственной ошибки, перехваченной снаружи и превращённой в результат выше. `durationMin: 60`. В конце `revalidatePath` для `/training`, `/dashboard`, `/calendar`. `dismissScheduleAction` — `updateMany` с `where: { id, userId, scheduleAskedAt: null }`.

- [ ] **Step 4: Убедиться, что тесты проходят**, PASS.

- [ ] **Step 5: Commit** — `feat(first-workout): сохранение времени тренировки`.

---

### Task 4: Напоминание и письмо

**Files:**
- Modify: `lib/plans/reminders.ts`, `lib/plans/reminders.test.ts`, `lib/plans/queries.ts:74,94`, `lib/notifications/service.ts:194-216`
- Create: `lib/plans/reminder-mail.ts`, `lib/plans/reminder-mail.test.ts`

**Interfaces:**
- Produces в `lib/plans/reminders.ts`:
  - опция `duePlanReminders` переименована: `hasRunningWorkout: boolean`
  - `planReminderUrl(o: Pick<Occurrence, "key" | "date">, activePlanKey: string | null): string`
  - `planReminderMail(o: Pick<Occurrence, "title" | "time" | "date">, today: string, appUrl: string): { subject: string; text: string }`
- Produces в `lib/plans/queries.ts`: поле `hasRunningWorkout: boolean` результата `getCalendar`.
- Produces в `lib/plans/reminder-mail.ts`: `sendPlanReminderMail(userId: string, o: Pick<Occurrence, "key" | "title" | "time" | "date">, today: string): Promise<void>`.

- [ ] **Step 1: Написать падающие тесты**

В `reminders.test.ts` заменить `hasActiveWorkout` на `hasRunningWorkout` и добавить:

```ts
it("черновик не глушит: достаточно hasRunningWorkout = false", () => {
  expect(duePlanReminders([occ("a", "2026-10-08", "16:00")], base).map((o) => o.key)).toEqual(["a"]);
});
it("выполненное вхождение не напоминается", () => {
  expect(duePlanReminders([occ("a", "2026-10-08", "16:00")], { ...base, doneKeys: new Set(["a"]) })).toEqual([]);
});
it("ссылка: привязанный черновик — на тренировку", () => {
  expect(planReminderUrl({ key: "e:1", date: "2026-10-08" }, "e:1")).toBe("/training");
  expect(planReminderUrl({ key: "e:2", date: "2026-10-08" }, "e:1")).toBe("/calendar?date=2026-10-08");
  expect(planReminderUrl({ key: "e:2", date: "2026-10-08" }, null)).toBe("/calendar?date=2026-10-08");
});
it("письмо: тема и служебный текст", () => {
  const m = planReminderMail({ title: "Грудь", time: "19:00", date: "2026-10-08" }, "2026-10-08", "https://hero-fit.ru");
  expect(m.subject).toBe("Тренировка сегодня в 19:00");
  expect(m.text).toContain("Грудь");
  expect(m.text).toContain("https://hero-fit.ru/training");
  expect(m.text).toContain("Вы попросили напомнить об этой тренировке в Hero Fit");
  expect(planReminderMail({ title: "Грудь", time: "00:30", date: "2026-10-09" }, "2026-10-08", "https://x").subject).toBe("Тренировка завтра в 00:30");
});
```

`reminder-mail.test.ts` (мок `server-only`, `@/lib/db`, `@/lib/mail`, `@/lib/env`), `sendMail` — шпион:
- `«шлёт при галочке и адресе»` — ключ `e:1`, запись `{ emailReminder: true, user: { email: "a@b" } }` → один вызов с `to: "a@b"`;
- `«без галочки не шлёт»`; `«без адреса не шлёт»`;
- `«серия не шлёт»` — ключ `s:1:2026-10-08`, запрос к базе не выполняется;
- `«ошибка SMTP не бросает»` — `sendMail` отклонён, функция завершается без ошибки, вызван `console.error`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/plans/reminders.test.ts lib/plans/reminder-mail.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `reminders.ts` и `reminder-mail.ts`**. `sendPlanReminderMail` находит запись по id из ключа `e:<id>` с `where: { id, userId, emailReminder: true }`, выбирая `user.email`. Адрес приложения — `env.APP_URL`.

- [ ] **Step 4: Дополнить `getCalendar`**: в запросе `active` добавить `status` к `select`; `hasRunningWorkout: active?.status === WorkoutStatus.IN_PROGRESS`.

- [ ] **Step 5: Подключить в `processPlanReminders`**: передать `hasRunningWorkout: calendar.hasRunningWorkout`; `url: planReminderUrl(o, calendar.activePlanKey)`. Из транзакции вернуть признак, что строка `PlanReminder` создана, и после коммита при `true` вызвать `sendPlanReminderMail(user.id, o, today)`.

- [ ] **Step 6: Убедиться, что тесты и типы проходят**

Run: `npx vitest run lib/plans && npm run typecheck`
Expected: PASS, без ошибок типов.

- [ ] **Step 7: Commit** — `feat(first-workout): напоминание с черновиком и письмо по просьбе`.

---

### Task 5: Диалог в интерфейсе

**Files:**
- Create: `components/training/schedule-dialog.tsx`
- Modify: `app/(app)/training/page.tsx`, `components/training/workout-editor.tsx` (`Props`, рендер `Editor`), `lib/workouts/queries.ts` (`ActiveWorkout`, `getActiveWorkout`)

**Interfaces:**
- Consumes: Task 2, Task 3; `usePush()` (`.subscribe()`, `.supported`, `.subscription`, `.busy` — сверить с `components/notifications/push-provider.tsx`); `createTelegramLinkAction`; `getTelegramStatus`.
- Produces:
```ts
type ScheduleAsk = {
  workoutId: string;
  presets: { evening: Slot | null; tomorrow: Slot };
  today: string;
  email: string | null;
  telegram: TelegramStatus;
};
export function ScheduleDialog(props: { ask: ScheduleAsk }): JSX.Element;
```
`WorkoutEditor` получает необязательный проп `scheduleAsk: ScheduleAsk | null`.

- [ ] **Step 1: Передать поле** `scheduleAskedAt: string | null` через `ActiveWorkout`.

- [ ] **Step 2: Собрать `scheduleAsk` на странице**: только при `isEnabled("first_workout_reminder", user.id)` и `shouldAskSchedule(workout, completed)`, где `completed` — `db.workout.count` по `COMPLETED`; иначе `null`. Запросы `getTelegramStatus` и email — только в этом случае.

- [ ] **Step 3: Реализовать `ScheduleDialog`** на `Dialog` проекта.
  - Шаг 1, заголовок «Когда тренировка?»: кнопка «Начинаю сейчас» (основная), «Сегодня вечером» (если `presets.evening`), «Завтра», «Выбрать дату и время» (поля `type="date"` и `type="time"`, кнопка «Дальше», ошибка — от `scheduleDraftAction`).
  - Шаг 2, заголовок «Как напомнить?»: строка выбранного времени; push — кнопка «Включить push» при `supported` и без подписки, иначе строка «Напомним push-уведомлением», если подписка есть; Telegram — при `telegram.enabled`: `linked` → «Напомним в Telegram», иначе кнопка «Подключить Telegram» с открытием окна как в `TelegramCard`; чекбокс «Напомнить на почту (адрес)» при наличии `email`; кнопка «Готово».
  - «Начинаю сейчас» и закрытие на шаге 1 — `dismissScheduleAction`. «Готово» и закрытие на шаге 2 — `scheduleDraftAction` с выбранным слотом (при закрытии `emailReminder: false`, если галочку не ставили; поставленная — сохраняется). Ошибка действия — `toast.error`, диалог закрывается, редактор доступен.

- [ ] **Step 4: Отрисовать диалог** в `WorkoutEditor` при `scheduleAsk`.

- [ ] **Step 5: Проверить типы и lint**

Run: `npm run typecheck && npm run lint`
Expected: без ошибок. Поведение проверяет e2e в Task 9.

- [ ] **Step 6: Commit** — `feat(first-workout): диалог «Когда тренировка?»`.

---

### Task 6: Герой дашборда

**Files:**
- Create: `lib/dashboard/draft-hero.ts`, `lib/dashboard/draft-hero.test.ts`, `lib/dashboard/draft-hero-queries.ts`
- Modify: `components/dashboard-v3/week-hero.tsx`, `app/(app)/dashboard/page.tsx:240-254`

**Interfaces:**
- Produces:
  - `draftHeroCopy(d: { name: string; exercises: number; hasCompleted: boolean; slot: { date: string; time: string } | null }, today: string): { headline: string; detail: string | null; cta: string }`
  - `getDraftHero(userId: string): Promise<{ name; exercises; hasCompleted; slot } | null>` — только статус `PLANNED`.
  - у `WeekHero` необязательные пропсы `detail?: string | null`, `cta?: string`.

- [ ] **Step 1: Написать падающие тесты**

```ts
const today = "2026-11-09";
it("с упражнениями и временем", () => expect(draftHeroCopy({ name: "Грудь", exercises: 5, hasCompleted: false, slot: { date: today, time: "19:00" } }, today))
  .toEqual({ headline: "Твоя тренировка готова", detail: "«Грудь» · 5 упражнений · сегодня в 19:00", cta: "Начать тренировку" }));
it("без времени", () => expect(draftHeroCopy({ name: "Грудь", exercises: 1, hasCompleted: true, slot: null }, today).detail).toBe("«Грудь» · 1 упражнение"));
it("завтра и дата", () => {
  expect(draftHeroCopy({ name: "Г", exercises: 2, hasCompleted: false, slot: { date: "2026-11-10", time: "19:00" } }, today).detail).toContain("завтра в 19:00");
  expect(draftHeroCopy({ name: "Г", exercises: 2, hasCompleted: false, slot: { date: "2026-11-14", time: "19:00" } }, today).detail).toContain("14 ноября в 19:00");
});
it("пустой у новичка", () => expect(draftHeroCopy({ name: "Г", exercises: 0, hasCompleted: false, slot: null }, today))
  .toEqual({ headline: "Собери первую тренировку", detail: null, cta: "Собрать тренировку" }));
it("пустой у опытного", () => expect(draftHeroCopy({ name: "Г", exercises: 0, hasCompleted: true, slot: null }, today).headline).toBe("Твоя тренировка ждёт упражнений"));
```

- [ ] **Step 2: Убедиться, что тесты падают** — `npx vitest run lib/dashboard/draft-hero.test.ts`, FAIL.

- [ ] **Step 3: Реализовать** `draftHeroCopy` (склонение — `plural` из `lib/format`) и `getDraftHero` (`_count.exercises`, наличие `COMPLETED`, `getOccurrence(userId, planKey)` при `planKey`).

- [ ] **Step 4: Подключить**: на странице при `isEnabled("first_workout_reminder", user.id)` вызвать `getDraftHero`; при результате заменить `headline`, передать `detail` и `cta`. `today` — `dayKey(now, userTz)`. Без флага или без черновика — как сейчас. Кнопка по-прежнему ведёт на `/training`.

- [ ] **Step 5: Проверить** — `npx vitest run lib/dashboard && npm run typecheck`, PASS.

- [ ] **Step 6: Commit** — `feat(first-workout): герой «Твоя тренировка готова»`.

---

### Task 7: Условие кампании DRAFT_WAITING

**Files:**
- Modify: `lib/campaigns/rules.ts`, `lib/campaigns/rules.test.ts`, `lib/campaigns/schema.ts:26`, `lib/campaigns/schema.test.ts`, `lib/campaigns/conditions.ts`, `components/admin/campaign-form.tsx:16,39-43`, `e2e/db.ts:1821`

**Interfaces:**
- Consumes: `CampaignCondition.DRAFT_WAITING` (Task 1).
- Produces: `conditionLabel("DRAFT_WAITING", n)` → `Черновик ждёт ${n} ${день/дня/дней}`.

- [ ] **Step 1: Написать падающие тесты** в `rules.test.ts` и `schema.test.ts`

```ts
it("при равном days черновик важнее «не тренировался»", () => {
  const r = pickCampaigns(new Map([["u", [c("a", "NEVER_TRAINED", 1, new Date("2026-01-01")), c("b", "DRAFT_WAITING", 1, new Date("2026-02-01"))]]]));
  expect(r.get("u")?.id).toBe("b");
});
it("больший days всё равно важнее", () => {
  const r = pickCampaigns(new Map([["u", [c("a", "NEVER_TRAINED", 7), c("b", "DRAFT_WAITING", 1)]]]));
  expect(r.get("u")?.id).toBe("a");
});
it("подпись условия", () => expect(conditionLabel("DRAFT_WAITING", 2)).toBe("Черновик ждёт 2 дня"));
```
`schema.test.ts`: `campaignSchema` принимает `condition: "DRAFT_WAITING"` и требует `days`.

- [ ] **Step 2: Убедиться, что тесты падают** — `npx vitest run lib/campaigns`, FAIL.

- [ ] **Step 3: Реализовать `better`, `conditionLabel`, `campaignSchema`.**

- [ ] **Step 4: Добавить ветку в `campaignCandidates`**. В фильтре «регистрация ≥ 24 ч» исключить и `DRAFT_WAITING`. Запрос (`d` — через `LATERAL` самый свежий `PLANNED`):

```sql
SELECT u.id AS "userId", d.id AS episode FROM "User" u
CROSS JOIN LATERAL (
  SELECT w.id, w."createdAt" FROM "Workout" w
  WHERE w."userId" = u.id AND w.status = 'PLANNED' ORDER BY w."createdAt" DESC LIMIT 1
) d
WHERE <base>
  AND ((d."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE u."timeZone")::date <= <today> - <n>::int
  AND EXISTS (SELECT 1 FROM "WorkoutExercise" we WHERE we."workoutId" = d.id)
  AND NOT EXISTS (SELECT 1 FROM "Workout" w WHERE w."userId" = u.id AND w.status = 'COMPLETED')
```

- [ ] **Step 5: Форма админки и тип e2e**: значение `DRAFT_WAITING`, подпись «Собрал тренировку и не начал», `daysLabel: "Дней с создания черновика"`. Добавить значение в `CampaignSeed`.

- [ ] **Step 6: Проверить** — `npx vitest run lib/campaigns && npm run typecheck`, PASS.

- [ ] **Step 7: Commit** — `feat(campaigns): условие «черновик ждёт»`.

---

### Task 8: «Потренировались», выгрузка, privacy

**Files:**
- Modify: `lib/campaigns/rules.ts`, `lib/campaigns/queries.ts`, `lib/workouts/finish.ts:137`, `components/admin/campaign-list.tsx:24,41`, `lib/account/export-queries.ts:94,175,206,244`, `lib/account/export.ts:75,260`, `lib/account/export.test.ts`, `app/(marketing)/privacy/page.tsx:57,89`
- Create: `lib/campaigns/trained.ts`, `lib/campaigns/trained.test.ts`

**Interfaces:**
- Produces: `TRAIN_WINDOW_MS = 72 * 3_600_000` (`rules.ts`), `trainedWindow(finishedAt: Date): { gte: Date; lte: Date }` (`rules.ts`), `markCampaignsTrained(tx: Prisma.TransactionClient, userId: string, finishedAt: Date): Promise<void>` (`trained.ts`), `CampaignRow.trained30: number`.

- [ ] **Step 1: Написать падающие тесты**

```ts
// rules.test.ts
it("окно 72 часа до завершения", () => {
  const f = new Date("2026-11-09T12:00:00Z");
  expect(trainedWindow(f)).toEqual({ gte: new Date("2026-11-06T12:00:00Z"), lte: f });
});
```
`trained.test.ts`: `tx.campaignSend.updateMany` вызван с `where: { userId, trainedAt: null, sentAt: trainedWindow(f) }`, `data: { trainedAt: f }`. В `export.test.ts` добавить `trainedAt` в `campaignSends` и `emailReminder` в план.

- [ ] **Step 2: Убедиться, что тесты падают** — `npx vitest run lib/campaigns lib/account`, FAIL.

- [ ] **Step 3: Реализовать `trainedWindow`, `markCampaignsTrained`** и вызвать `await markCampaignsTrained(tx, userId, now)` в `finishWorkout` сразу после проверки `claimed.count === 0`.

- [ ] **Step 4: Статистика админки**: в `listCampaigns` третий `groupBy` по `trainedAt: { not: null }`, поле `trained30`; в `campaign-list.tsx` рядом с «Вернулись» — `· Потренировались {c.trained30} · {процент} %`.

- [ ] **Step 5: «Мои данные»**: `trainedAt` в выборке и выводе `campaignSends`, `emailReminder` в `planEntries`.

- [ ] **Step 6: `/privacy`**: в список целей (строка 57) пункт «Чтобы напомнить о тренировке на почту, если вы сами об этом попросили.»; в строке о почтовом сервисе (89) заменить пример на «(например, для восстановления пароля или напоминания о тренировке по вашей просьбе)».

- [ ] **Step 7: Проверить** — `npx vitest run lib/campaigns lib/account && npm run typecheck`, PASS.

- [ ] **Step 8: Commit** — `feat(campaigns): метрика «потренировались»; privacy и выгрузка`.

---

### Task 9: e2e и документация

**Files:**
- Create: `e2e/first-workout.spec.ts`
- Modify: `e2e/campaigns.spec.ts`, `e2e/account-data.spec.ts`, `docs/features/training.md`, `docs/features/platform.md`

Файл `first-workout.spec.ts`: `test.describe.configure({ mode: "serial", timeout: 90_000 })`, только desktop, `setFlag("first_workout_reminder", { enabled: true, percent: 100 })` в `beforeAll` и выключение в `afterAll`.

- [ ] **Step 1: Написать сценарии `e2e/first-workout.spec.ts`**
  - `«новичок: Начинаю сейчас»`: зарегистрировать, создать тренировку → виден диалог «Когда тренировка?»; «Начинаю сейчас» → диалог закрыт; перезагрузка → диалога нет.
  - `«новичок: выбор времени»`: «Завтра» → «Как напомнить?» → «Напомнить на почту» → «Готово»; `/calendar?date=<завтра>` показывает тренировку; в БД `planKey` начинается с `e:`, `emailReminder = true`.
  - `«нет диалога с завершённой тренировкой»`: `seedWorkouts` до входа на `/training`.
  - `«две вкладки: одна запись»`: два `page` на `/training`, в обоих «Завтра» → «Готово»; `select count(*) from "PlanEntry"` у пользователя равно 1.
  - `«герой»`: с упражнениями — «Твоя тренировка готова», кнопка «Начать тренировку»; пустой новичок — «Собери первую тренировку»; с запуском тренировки — «Продолжить тренировку».
  - `«напоминание при черновике»`: `linkTelegram`, слот завтра, `runTick(request, <час до начала минус 5 минут>, "reminders")` → уведомление типа `PLAN` со ссылкой `/training`; строка `PlanReminder` одна после второго тика.

- [ ] **Step 2: Дополнить `e2e/campaigns.spec.ts`** (`tick` уже с шагом `campaigns`):
  - `DRAFT_WAITING` отправляет одно сообщение на черновик с эпизодом = id черновика; второй тик не отправляет;
  - черновик, из которого удалены все упражнения, не выбирается;
  - при завершении тренировки в окне `trainedAt` заполнен, при наличии только захода — `null` при заполненном `returnedAt`; в списке админки есть «Потренировались 1».

- [ ] **Step 3: Дополнить `e2e/account-data.spec.ts`:** ожидание `campaignSends` содержит `trainedAt: null`.

- [ ] **Step 4: Прогнать**

Run: `npm run build && npm run test:e2e -- first-workout campaigns account-data --workers=8`
Expected: все прошли (mobile по первому файлу пропущен).

- [ ] **Step 5: Обновить документацию** — `docs/features/training.md` (диалог, `scheduleAskedAt`, герой, глушит только идущая тренировка), `docs/features/platform.md` (`DRAFT_WAITING`, `trainedAt`, письмо-напоминание только по просьбе).

- [ ] **Step 6: Commit** — `test(first-workout): e2e; документация`.

---

### Task 10: Слияние в релиз и сборка релиза

**Files:**
- Modify: `package.json`, `package-lock.json`, `lib/changelog/releases.ts`

- [ ] **Step 1: Влить фичу**

```bash
git switch release/2028-06-first-workout
git merge --no-ff feat/first-workout-reminder
git branch -d feat/first-workout-reminder
```

- [ ] **Step 2: Поднять версию** — `npm version minor --no-git-tag-version` (ожидается 0.38.0).

- [ ] **Step 3: Запись в «Что нового»** первой в `RELEASES`: `id: "2028-06-first-workout"`, `version: "0.38.0"`, `date` — дата сборки; пункт с `flag: "first_workout_reminder"`: «Собрали тренировку, но ещё не в зале? Выберите, когда пойдёте, и мы напомним — в push, Telegram или на почту».

- [ ] **Step 4: Полный прогон**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`
Expected: всё зелёное; падения разобрать и сообщить как есть.

- [ ] **Step 5: Commit** — `chore(release): 0.38.0`. Push и MR — только когда попросит пользователь.
