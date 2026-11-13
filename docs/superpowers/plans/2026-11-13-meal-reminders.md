# Напоминания о приёмах пищи — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь на `/nutrition` заводит до 6 ежедневных напоминаний (время + приём пищи) и получает уведомление в это время, если приём за сегодня ещё не записан.

**Architecture:** Таблица `MealReminder`; решение «пора» — чистая функция в `lib/nutrition/reminders.ts`; отправка — новый шаг `meals` тика уведомлений по образцу `lib/stretching/course-tick.ts`; настройка — диалог из меню «⋮» «Итога дня», каждое изменение сохраняется сразу серверным действием.

**Tech Stack:** Next.js 16 (Server Actions), Prisma 7 + PostgreSQL, Zod, shadcn/ui на Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-meal-reminders-design.md` — читать перед каждой задачей.

## Global Constraints

- Ветка `feat/meal-reminders` (от `release/2028-11-meal-reminders`). Коммиты — в неё, сообщения по-русски в принятом стиле (`feat(meal-reminders): …`), в конце `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Весь текст интерфейса, комментарии и отчёты — по-русски.
- Всё под флагом `nutrition` (`isEnabled("nutrition", userId)` из `lib/flags/server`); отдельного флага нет.
- Лимит — 6 напоминаний (`MAX_MEAL_REMINDERS`), окно опоздания — 60 минут (`MEAL_REMIND_WINDOW_MIN`), время — целые минуты 0…1439 от местной полуночи.
- Местное время и день — только через `dayKey`/`safeTimeZone` из `lib/daily-login` и `User.timeZone`; в e2e — через `E2E_TZ`/`E2E_TZ_OFFSET`/`localAt`, не через пояс процесса.
- Цвета — только семантические токены; ссылка-кнопка — `<Link className={buttonVariants()}>`; переключатели Base UI в e2e искать по роли `switch`.
- После правки `schema.prisma` — `npx prisma generate`; в SQL новой миграции не должно быть `DROP INDEX` для `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`, `StretchCourse_active`.
- Next.js 16: перед кодом сверяться с `node_modules/next/dist/docs/`.
- e2e тика — только `runTick(request, now, "meals")` (один шаг).

## Review Focus

1. Чужой или мусорный `id` в `update`/`delete` (не строка, id другого пользователя) — ничего не меняется, ответ `{ ok: false }`, без исключения. Тест — задача 2.
2. Двойной клик «Добавить напоминание» при 5 напоминаниях — седьмое не создаётся, и два параллельных добавления на одно время не роняют действие (ошибка уникальности → текст). Тест — задача 2.
3. Некорректный `User.timeZone` (мусор в базе) — тик не падает и не останавливает остальных (`safeTimeZone`; в SQL-отборе — тоже). Тест — задача 3.
4. Пользователь с напоминаниями, у которого выключили флаг `nutrition`, — уведомления не уходят, `remindedDay` не трогается. Тест — задача 3.
5. Мусор из `<input type="time">` (пустая строка после очистки поля) — строка не сохраняется и не уходит на сервер, прежнее значение остаётся. Тест — задача 4.

---

### Task 1: Схема и чистая логика

**Files:**
- Modify: `prisma/schema.prisma` (enum `NotificationType`, модель `User` — обратная связь, новая модель после `FoodEntry`)
- Create: миграция `prisma/migrations/<ts>_meal_reminders/`
- Create: `lib/nutrition/reminders.ts`
- Test: `lib/nutrition/reminders.test.ts`

**Interfaces:**
- Produces:
  - Prisma: `MealReminder { id, userId, meal: Meal, minutes: Int, enabled: Boolean, remindedDay: String?, createdAt }`, `@@unique([userId, minutes])`, `@@index([enabled, minutes])`; `User.mealReminders`; `NotificationType.MEAL_REMINDER`.
  - `MAX_MEAL_REMINDERS = 6`, `MEAL_REMIND_WINDOW_MIN = 60`
  - `mealReminderSchema` — `z.object({ meal: z.enum(Meal), minutes: z.number().int().min(0).max(1439) })`
  - `parseTime(value: string): number | null`, `formatTime(minutes: number): string`
  - `localMinutes(now: Date, timeZone: string): number`
  - `mealReminderDue(input: { now: Date; timeZone: string; minutes: number; enabled: boolean; remindedDay: string | null }): { day: string } | null`
  - `alreadyPassedToday(now: Date, timeZone: string, minutes: number): boolean` — `localMinutes >= minutes`
  - `mealReminderText(meal: Meal, minutes: number): { title: string; body: string }`
  - `nextDefault(existing: { meal: Meal; minutes: number }[]): { meal: Meal; minutes: number } | null`

- [ ] **Step 1: Схема.** Добавить модель из раздела «Данные» спеки, `MEAL_REMINDER // напоминание о приёме пищи` в `NotificationType`, `mealReminders MealReminder[]` в `User`. `npm run db:migrate -- --name meal_reminders`, проверить SQL миграции на отсутствие `DROP INDEX` (см. Global Constraints), `npx prisma generate`.

- [ ] **Step 2: Падающие тесты** в `lib/nutrition/reminders.test.ts`:

```ts
const base = { timeZone: "Europe/Moscow", minutes: 14 * 60, enabled: true, remindedDay: null };
const at = (iso: string) => new Date(iso); // 2026-11-13T11:00:00Z = 14:00 МСК

describe("mealReminderDue", () => {
  it("ровно в срок", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T11:00:00Z") })).toEqual({ day: "2026-11-13" }));
  it("за минуту до срока — нет", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T10:59:59Z") })).toBeNull());
  it("+59 минут — да", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T11:59:00Z") })).toEqual({ day: "2026-11-13" }));
  it("+60 минут — нет", () => expect(mealReminderDue({ ...base, now: at("2026-11-13T12:00:00Z") })).toBeNull());
  it("выключено — нет", () => expect(mealReminderDue({ ...base, enabled: false, now: at("2026-11-13T11:00:00Z") })).toBeNull());
  it("уже решено сегодня — нет", () => expect(mealReminderDue({ ...base, remindedDay: "2026-11-13", now: at("2026-11-13T11:00:00Z") })).toBeNull());
  it("решено вчера — да", () => expect(mealReminderDue({ ...base, remindedDay: "2026-11-12", now: at("2026-11-13T11:00:00Z") })).toEqual({ day: "2026-11-13" }));
  it("день — местный: 00:30 МСК при minutes=30", () =>
    expect(mealReminderDue({ ...base, minutes: 30, now: at("2026-11-13T21:30:00Z") })).toEqual({ day: "2026-11-14" }));
  it("23:30 не переходит через полночь", () =>
    expect(mealReminderDue({ ...base, minutes: 23 * 60 + 30, now: at("2026-11-13T21:10:00Z") })).toBeNull()); // 00:10 МСК
});

describe("время", () => {
  it("parseTime", () => {
    expect(parseTime("09:05")).toBe(545);
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("23:59")).toBe(1439);
    for (const bad of ["", "24:00", "9:5", "12:60", "ab:cd", "12:30:00"]) expect(parseTime(bad)).toBeNull();
  });
  it("formatTime", () => { expect(formatTime(545)).toBe("09:05"); expect(formatTime(0)).toBe("00:00"); expect(formatTime(1439)).toBe("23:59"); });
  it("localMinutes", () => expect(localMinutes(at("2026-11-13T11:07:00Z"), "Europe/Moscow")).toBe(14 * 60 + 7));
  it("alreadyPassedToday", () => {
    expect(alreadyPassedToday(at("2026-11-13T11:00:00Z"), "Europe/Moscow", 14 * 60)).toBe(true);
    expect(alreadyPassedToday(at("2026-11-13T11:00:00Z"), "Europe/Moscow", 14 * 60 + 1)).toBe(false);
  });
});

describe("mealReminderText", () => {
  it.each([
    ["BREAKFAST", 540, "Завтрак · 09:00", "Запишите завтрак в дневник"],
    ["LUNCH", 840, "Обед · 14:00", "Запишите обед в дневник"],
    ["DINNER", 1200, "Ужин · 20:00", "Запишите ужин в дневник"],
    ["SNACK", 1020, "Перекус · 17:00", "Запишите перекус в дневник"],
  ] as const)("%s", (meal, minutes, title, body) => expect(mealReminderText(meal, minutes)).toEqual({ title, body }));
});

describe("nextDefault", () => {
  it("пусто → завтрак 09:00", () => expect(nextDefault([])).toEqual({ meal: "BREAKFAST", minutes: 540 }));
  it("есть завтрак → обед 14:00", () => expect(nextDefault([{ meal: "BREAKFAST", minutes: 480 }])).toEqual({ meal: "LUNCH", minutes: 840 }));
  it("порядок: завтрак, обед, перекус, ужин", () =>
    expect(nextDefault([{ meal: "BREAKFAST", minutes: 540 }, { meal: "LUNCH", minutes: 840 }])).toEqual({ meal: "SNACK", minutes: 1020 }));
  it("время по умолчанию занято другим приёмом → +30 минут до свободного", () =>
    expect(nextDefault([{ meal: "SNACK", minutes: 540 }])).toEqual({ meal: "BREAKFAST", minutes: 570 }));
  it("все четыре есть → перекус через 30 минут после последнего", () =>
    expect(nextDefault([
      { meal: "BREAKFAST", minutes: 540 }, { meal: "LUNCH", minutes: 840 }, { meal: "SNACK", minutes: 1020 }, { meal: "DINNER", minutes: 1200 },
    ])).toEqual({ meal: "SNACK", minutes: 1230 }));
  it("последнее в 23:45 → ищет свободное с 00:00 шагом 30", () =>
    expect(nextDefault([
      { meal: "BREAKFAST", minutes: 540 }, { meal: "LUNCH", minutes: 840 }, { meal: "SNACK", minutes: 1020 }, { meal: "DINNER", minutes: 1425 },
    ])).toEqual({ meal: "SNACK", minutes: 0 }));
  it("6 штук → null", () => expect(nextDefault(Array.from({ length: 6 }, (_, i) => ({ meal: "SNACK" as const, minutes: i * 60 })))).toBeNull());
});
```

- [ ] **Step 3:** `npx vitest run lib/nutrition/reminders.test.ts` — падает (модуля нет).

- [ ] **Step 4: Реализация `lib/nutrition/reminders.ts`.** Без `server-only` (импортируется клиентским диалогом) и без импорта клиента Prisma — только `@/generated/prisma/enums`. `localMinutes` — через `Intl.DateTimeFormat` с `hourCycle: "h23"` (посмотреть, как сделан `localHour` в `lib/stretching/course.ts`, и переиспользовать подход). Названия приёмов — из `lib/nutrition/diary.ts` (там `MEALS` с подписями); если подписи в нужном падеже/регистре нет — локальная таблица в этом файле. `nextDefault`: порядок и время по умолчанию — завтрак 540, обед 840, перекус 1020, ужин 1200; занятое время сдвигается по +30 (по модулю 1440) до свободного.

- [ ] **Step 5:** `npx vitest run lib/nutrition/reminders.test.ts` — зелёный; `npm run typecheck` — чисто.

- [ ] **Step 6: Коммит** — `feat(meal-reminders): схема и правила напоминаний`.

---

### Task 2: Действия, запрос, выгрузка

**Files:**
- Create: `lib/nutrition/reminder-actions.ts`, `lib/nutrition/reminder-queries.ts`
- Modify: `lib/nutrition/reminders.ts`, `lib/nutrition/reminders.test.ts` (`canAddReminder`)
- Modify: `lib/account/export-queries.ts`, `lib/account/export.ts`, `lib/account/export.test.ts`
- Modify: `e2e/db.ts` (хелперы), `e2e/account-data.spec.ts`

**Interfaces:**
- Consumes: всё из Task 1.
- Produces:
  - `canAddReminder(existing: { minutes: number }[], minutes: number): "limit" | "taken" | null`
  - `type MealReminderResult = { ok: true } | { ok: false; error: string }`
  - `addMealReminderAction(input: { meal: string; minutes: number }): Promise<MealReminderResult>`
  - `updateMealReminderAction(id: string, patch: { meal?: string; minutes?: number; enabled?: boolean }): Promise<MealReminderResult>`
  - `deleteMealReminderAction(id: string): Promise<MealReminderResult>`
  - `type MealReminderView = { id: string; meal: Meal; minutes: number; enabled: boolean }`
  - `getMealReminders(userId: string): Promise<{ reminders: MealReminderView[]; canPush: boolean }>`
  - e2e (`e2e/db.ts`): `addMealReminder(login, { meal, minutes, enabled?, remindedDay? }): Promise<string>` (id), `mealReminders(login): Promise<{ meal: string; minutes: number; enabled: boolean; remindedDay: string | null }[]>` по `minutes`, `mealReminderNotifications(login): Promise<{ title: string; body: string }[]>`.

- [ ] **Step 1: Действия.** Образец доступа — `diaryUser()` в `lib/nutrition/food-actions.ts` (`requireUser` + флаг → `notFound()`). Тексты ошибок:
  - лимит — «Не больше 6 напоминаний»;
  - занятое время (предварительная проверка и перехват P2002) — «На это время уже есть напоминание»;
  - плохие данные / не найдено / `id` не строка — «Напоминание не найдено — обновите страницу» (для `add` с плохими данными — «Проверьте время и приём пищи»).

  `add`: транзакция с блокировкой строки `User` (`SELECT … FOR UPDATE`, как в «Повторить вчерашний» в том же `food-actions.ts`), счёт ≥ 6 → ошибка. `add` и `update` со сменой `minutes`: если `alreadyPassedToday(now, tz, minutes)` — `remindedDay = dayKey(now, tz)`; иначе при `update` `remindedDay` не трогать. `update`/`delete` — `updateMany`/`deleteMany` с `where: { id, userId }`, `count === 0` → «не найдено». В конце успешного — `revalidatePath("/nutrition")`. Пустой `patch` — `{ ok: true }` без записи.

- [ ] **Step 2: Запрос.** `getMealReminders`: напоминания по `minutes asc`; `canPush` — есть хотя бы одна `PushSubscription` пользователя или `User.telegramChatId` не пуст (сверить по `lib/notifications/push.ts` и `lib/telegram/send.ts`, какие ещё условия у каналов — например, подписки ntfy хранятся в той же таблице или отдельно; учесть все каналы, по которым реально уйдёт push).

- [ ] **Step 3: Выгрузка — падающий тест.** В `lib/account/export.test.ts` во входные данные добавить `mealReminders: [{ id: "mr_secret", userId: "u_secret", meal: "LUNCH", minutes: 840, enabled: true, remindedDay: "2026-11-13", createdAt: new Date("2026-11-01T10:00:00Z") }]`, в ожидаемое — `mealReminders: [{ meal: "LUNCH", time: "14:00", enabled: true }]`; существующая проверка «секретов нет в выгрузке» должна покрыть `mr_secret`. `npx vitest run lib/account/export.test.ts` — падает.

- [ ] **Step 4: Выгрузка — реализация.** `export-queries.ts` — `db.mealReminder.findMany({ where: { userId }, orderBy: { minutes: "asc" } })`; `export.ts` — раздел `mealReminders` рядом с `food`, время через `formatTime`. Тест зелёный. В `e2e/account-data.spec.ts` — добавить напоминание хелпером и проверить, что раздел есть в файле выгрузки и что после удаления аккаунта строк `MealReminder` нет (по образцу проверок `food`).

- [ ] **Step 5: Проверка добавления — чистая часть.** Добавить в `lib/nutrition/reminders.ts` `canAddReminder(existing: { minutes: number }[], minutes: number): "limit" | "taken" | null` и использовать её в `add` внутри транзакции. Тест в `lib/nutrition/reminders.test.ts`: `"limit"` при 6 напоминаниях, `"taken"` при совпадении времени, `"limit"` важнее `"taken"`, иначе `null`. Гонки (блокировка, P2002) и чужой `id` (Review Focus 1–2) проверяются через интерфейс — e2e в задаче 4, шаг 1, пункт 6.

- [ ] **Step 6:** `npm run typecheck && npm run lint && npx vitest run lib/nutrition lib/account` — чисто. Коммит — `feat(meal-reminders): действия, запрос и выгрузка`.

---

### Task 3: Шаг тика и доставка

**Files:**
- Create: `lib/nutrition/reminder-tick.ts`
- Modify: `lib/notifications/service.ts` (`TICK_STEPS`, `runNotificationTick`), `lib/notifications/push.ts` (тег типа), `components/notifications/notification-bell.tsx` (иконка)
- Modify: все `Record<NotificationType, …>`, на которые укажет typecheck (Telegram, фильтры ленты и т.п.)
- Test: `e2e/nutrition-reminders.spec.ts`

**Interfaces:**
- Consumes: `mealReminderDue`, `mealReminderText`, `MEAL_REMIND_WINDOW_MIN` (Task 1); e2e-хелперы (Task 2).
- Produces: `processMealReminders(now: Date): Promise<number>`; шаг `"meals"` в `TICK_STEPS`.

- [ ] **Step 1: Падающие e2e** в `e2e/nutrition-reminders.spec.ts`, `describe("тик")`. Каждый тест: `registerUser`, `addFlagUser("nutrition", login)`, пояс пользователя — `E2E_TZ` (посмотреть в `e2e/nutrition-diary.spec.ts` и `e2e/tz.ts`, как тесты задают пояс и строят момент через `localAt`). «Сегодня 14:00» = `localAt(today, "14:00")`. Напоминание — `addMealReminder(login, { meal: "LUNCH", minutes: 840 })`.
  1. Тик в 14:00, обед пуст → `mealReminderNotifications` = `[{ title: "Обед · 14:00", body: "Запишите обед в дневник" }]`; уведомление видно в колокольчике; повторный тик в 14:05 → по-прежнему одно; `mealReminders(login)[0].remindedDay` = сегодня.
  2. Обед записан (`addFoodEntry` на сегодня, `LUNCH`) → после тика уведомлений нет, `remindedDay` = сегодня.
  3. Записан только завтрак → уведомление про обед уходит (сверка именно по приёму).
  4. Тик в 13:59 → нет, `remindedDay` пуст; тик в 15:00 → нет, `remindedDay` пуст.
  5. `enabled: false` → нет.
  6. Флаг `nutrition` у пользователя не включён → нет, `remindedDay` пуст (Review Focus 4).
  7. `User.timeZone = 'Not/AZone'` у одного пользователя (прямой SQL через `e2e/db.ts`), у второго — нормальный пояс: тик отвечает 200, второй получает уведомление (Review Focus 3).
  8. Два напоминания одного пользователя на 14:00 (обед) и 14:30 (перекус), тик в 14:40 → два уведомления.

  Тесты шага идут с часами «сегодня» и только шагом `"meals"` — соседей не задевают; если понадобится глобальное состояние — `mode: "serial"`.

- [ ] **Step 2:** `npm run build && npm run test:e2e -- nutrition-reminders --project=desktop` (имя проекта сверить в `playwright.config.ts`) — падает: шага `meals` нет.

- [ ] **Step 3: Реализация `processMealReminders`** по разделу «Тик» спеки, структура — как `lib/stretching/course-tick.ts` (бюджет 1 с, `take`/`LIMIT 500`, транзакция с условным `updateMany`). Отбор кандидатов — `$queryRaw` с `JOIN "User"`; местные минуты считать в SQL как в `processStreakReminders` (`${now}::timestamptz AT TIME ZONE u."timeZone"`). Некорректный пояс роняет такой SQL целиком, поэтому в запросе отсекать пояса, которых нет в `pg_timezone_names` (`JOIN pg_timezone_names z ON z.name = u."timeZone"`) — пользователь с мусорным поясом пропускается, остальные идут. Записи дневника — один `findMany` по `userId in (…)` и `date in (…)`, сверка `(userId, date, meal)` в коде. Порядок внутри транзакции: `updateMany({ where: { id, enabled: true, OR: [{ remindedDay: null }, { remindedDay: { not: day } }] }, data: { remindedDay: day } })`; `count === 1` и приём пуст → `notify(tx, userId, { type: MEAL_REMINDER, ...mealReminderText(meal, minutes), url: "/nutrition" }, { push: true })`. Флаг проверять до транзакции; без флага — `continue` без записи.

- [ ] **Step 4: Подключение.** `"meals"` в `TICK_STEPS` после `"course"`; в `runNotificationTick` — блок по образцу `course` с логом `[meals] шаг напоминаний о приёмах пищи упал`. В `push.ts` — `MEAL_REMINDER: "hero-fit-meal"`; в `notification-bell.tsx` — `MEAL_REMINDER: { icon: Utensils, color: "text-xp" }`. `npm run typecheck` покажет остальные исчерпывающие таблицы по `NotificationType` — заполнить по аналогии с `COURSE_REMINDER`. Android (`Notifications.kt`) не трогать: неизвестный тип уходит в канал по умолчанию, как `COURSE_REMINDER`.

- [ ] **Step 5:** `npm run build && npm run test:e2e -- nutrition-reminders --project=desktop` — зелёный; `npm run typecheck && npm run lint && npm test` — чисто.

- [ ] **Step 6: Коммит** — `feat(meal-reminders): шаг тика и доставка`.

---

### Task 4: Окно «Напоминания»

**Files:**
- Create: `components/nutrition/meal-reminders-dialog.tsx`
- Modify: `components/nutrition/summary-menu.tsx`, `components/nutrition/day-summary.tsx`, `app/(app)/nutrition/page.tsx`
- Test: `e2e/nutrition-reminders.spec.ts`

**Interfaces:**
- Consumes: действия и `MealReminderView`, `getMealReminders` (Task 2); `parseTime`, `formatTime`, `nextDefault`, `MAX_MEAL_REMINDERS` (Task 1).
- Produces: `MealRemindersDialog({ open, onOpenChange, reminders, canPush })`; у `SummaryMenu` и `DaySummary` — новые пропсы `reminders: MealReminderView[]`, `canPush: boolean`.

- [ ] **Step 1: Падающие e2e**, `describe("окно")` (desktop + mobile, пользователь с флагом):
  1. Меню «Настройки итога дня» → «Напоминания…» → диалог с заголовком «Напоминания о приёмах пищи» и текстом «Напоминаний пока нет». «Добавить напоминание» → строка «Завтрак», время `09:00`, переключатель включён. Ещё раз → «Обед», `14:00`. После перезагрузки страницы обе на месте, по возрастанию времени.
  2. Сменить время первой на `08:15` и приём на «Перекус», выключить переключатель → `mealReminders(login)` = `[{ meal: "SNACK", minutes: 495, enabled: false, … }, …]`; после перезагрузки — то же в окне.
  3. Удалить строку (кнопка `aria-label="Удалить напоминание 08:15"`) → строки нет в окне и в базе.
  4. Шесть напоминаний (хелпером) → кнопка «Добавить напоминание» выключена, виден текст «Не больше 6 напоминаний».
  5. Сменить время строки на уже занятое → уведомление «На это время уже есть напоминание», в поле — прежнее время, в базе без изменений.
  6. Review Focus 1–2: при 5 напоминаниях два быстрых клика «Добавить напоминание» → в базе ровно 6. Строку, удалённую в базе за спиной интерфейса (прямой SQL), попытаться выключить → уведомление «Напоминание не найдено — обновите страницу», исключения на странице нет (`page.on("pageerror")` пуст).
  7. Review Focus 5: очистить поле времени (`fill("")`) и увести фокус → в поле вернулось прежнее время, в базе без изменений, запросов действия не было.
  8. Подсказка: у нового пользователя без подписок виден текст «Чтобы напоминания приходили на телефон, включите уведомления» со ссылкой на `/settings`; с привязанным Telegram или push-подпиской (поставить SQL-ом) — текста нет.
  9. Новое напоминание на уже наступившее сегодня время: `addMealReminder` не подходит — добавить через окно, сменить время на «час назад» (от местного сейчас), затем `runTick(request, сейчас, "meals")` → уведомлений нет, `remindedDay` = сегодня.

- [ ] **Step 2:** прогон — падает (пункта меню нет).

- [ ] **Step 3: Диалог.** Образцы — `components/nutrition/calorie-bar-dialog.tsx` (диалог из того же меню) и `summary-menu.tsx` (`useOptimistic` + `useTransition`, ошибка — `toast.error`). Строка: `<input type="time">` (shadcn `Input`) с `aria-label="Время напоминания"`, выбор приёма (`Select` из `components/ui`, `aria-label="Приём пищи"`, порядок как в `MEALS`), `Switch` с `aria-label="Напоминание <ЧЧ:ММ> включено"`, кнопка удаления с иконкой `Trash2`. Время сохраняется по `blur`/`change` только при `parseTime(value) !== null` и отличии от текущего; иначе поле возвращается к `formatTime(minutes)`. Ошибка действия → `toast.error(result.error)`, исключение сети → «Не удалось сохранить — проверьте связь»; оптимистичное состояние откатывается само по завершении перехода. «Добавить напоминание» — `nextDefault(reminders)`, выключена при `reminders.length >= MAX_MEAL_REMINDERS` или пока идёт переход. Вёрстка: на 375 px строка помещается без горизонтальной прокрутки.

- [ ] **Step 4: Подключение.** `page.tsx` — `getMealReminders(user.id)` в существующий `Promise.all`; прокинуть через `DaySummary` в `SummaryMenu`; пункт `<DropdownMenuItem>Напоминания…</DropdownMenuItem>` — последним, показывается всегда; обновить JSDoc `SummaryMenu` и `DaySummary`. Проверить, что `DaySummary` не используется на дашборде с другим набором пропсов (`grep DaySummary`).

- [ ] **Step 5:** `npm run build && npm run test:e2e -- nutrition-reminders nutrition-diary nutrition-bar-styles --workers=8` — зелёный (соседние спеки меню не сломаны).

- [ ] **Step 6: Проверка глазами.** Запустить приложение, открыть окно в светлой и тёмной теме на desktop и 375 px, снять скриншоты; убедиться, что строки не ломаются и переключатель/удаление достижимы с клавиатуры.

- [ ] **Step 7: Коммит** — `feat(meal-reminders): окно напоминаний на /nutrition`.

---

### Task 5: Документация и слияние

**Files:**
- Modify: `docs/features/nutrition.md`, `app/(marketing)/privacy/page.tsx`

- [ ] **Step 1:** `docs/features/nutrition.md` — новый пункт «Напоминания о приёмах пищи» (спека, план, модель, файлы, правила окна и `remindedDay`, шаг `meals`, e2e и хелперы) в стиле соседних пунктов; в первой строке про e2e (последний пункт файла) — упоминание `e2e/nutrition-reminders.spec.ts`.
- [ ] **Step 2:** `/privacy` — в пункт о данных питания добавить «время напоминаний о приёмах пищи, если вы их настроили». Если текст политики продублирован ещё где-то (`grep "дневник питания (что и сколько"`) — поправить и там.
- [ ] **Step 3: Полный прогон:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`. Результат (число пройденных/пропущенных) записать в отчёт.
- [ ] **Step 4: Коммит** — `docs(meal-reminders): описание фичи и политика`.
- [ ] **Step 5:** Ревью всей ветки (superpowers:requesting-code-review), правки. Затем — по согласованию с пользователем — `git switch release/2028-11-meal-reminders && git merge --no-ff feat/meal-reminders`, удалить ветку фичи. Версию и «Что нового» не трогать — это шаг релиза.
