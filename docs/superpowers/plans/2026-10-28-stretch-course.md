# Курс «Сесть на шпагат» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 30 занятий в 5 этапах к шпагату: план в коде, прогресс в `StretchCourse`, занятие — обычная сессия растяжки с подставленным временем удержания, напоминания по дням.

**Architecture:** чистые функции плана — `lib/stretching/course.ts`; БД и экшены — `lib/stretching/course-queries.ts`, `course-actions.ts`; занятие создаётся веткой `course:<id>` в `createPlannedWorkout` (PLANNED, как программа растяжки), засчитывается в транзакции `finishWorkout`; напоминания — шаг тика `course`.

**Tech Stack:** Next.js 16 (server actions), Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-stretch-course-design.md`

## Global Constraints

- Флаг `stretch_course` (новый ключ в `lib/flags/registry.ts`, описание «Курс «Сесть на шпагат»: карточка на /stretching, занятия, напоминания», expires `2027-06-30`); всё — только при `stretching` **и** `stretch_course` (`courseAllowed(userId)`).
- Тексты — по-русски, «не до боли»: `SPLIT_CAUTION` из `lib/stretching/seed-data.ts`.
- Занятие — сессия растяжки (`stretchOnly`): XP `STRETCH_SESSION`, без серии и игровых зачётов — ничего в `finishWorkout`, кроме сдвига курса, не меняется.
- Частичный индекс `StretchCourse_active` — добавить в список в CLAUDE.md («Сквозные правила»).
- Новая связь с `User` — выгрузка и удаление (`lib/account/*`, `e2e/account-data.spec.ts`).
- Новые числовые поля ввода (замер) — с `selectOnFocus`.
- e2e: флаг пользователю через `addFlagUser` (оба флага); время — через `localAt`/`E2E_TZ`; тик — `runTick(request, now, "course")`.
- Отклонение от спеки (согласовано в плане): занятие создаётся **PLANNED** и открывается `/training`, «Начать» жмёт человек — как «Начать растяжку» по программе.

## Review Focus

- Двойное завершение / завершение старой тренировки курса — счётчик сдвигается ровно один раз (условие `courseSessionNo === nextSession`). Тест — Task 3.
- Заранее подставленное время без отметки подхода — занятие не засчитывается (подход «выполнен» только с `completedAt`). Тест — Task 3.
- Удалили упражнение из каталога? Встроенные не удаляются; но план ссылается на имена — все имена плана есть в `STRETCH_SEED`. Тест — Task 1.
- Пояс пользователя на другой стороне суток: напоминание по местному дню недели и 17:00, `remindedDay` — местный день. Тест — Task 5 (чистая функция с поясом `Etc/GMT-14`).
- Цель-навык удалили посреди курса — `goalId` → null, курс идёт, плашка замера не показывается, итог без сравнения. Тест — Task 4 (e2e).

---

### Task 1: Схема, флаг, план курса

**Files:**
- Modify: `prisma/schema.prisma`, `lib/flags/registry.ts`, `CLAUDE.md`
- Create: `prisma/migrations/<ts>_stretch_course/migration.sql` (через `prisma migrate dev --name stretch_course` + ручной SQL индекса)
- Create: `lib/stretching/course.ts`, `lib/stretching/course.test.ts`

**Interfaces — Produces:**
- Prisma: `enum StretchCourseStatus { ACTIVE MAINTENANCE COMPLETED ABANDONED }`; `model StretchCourse` — поля по спеке (`skill String`, `goalId String?` → `Goal` `onDelete: SetNull`, `remindDays Int[]`, `nextSession Int @default(1)`, `status`, `startedAt`, `finishedAt DateTime?`, `remindedDay String?`, `@@index([userId])`, `User` `onDelete: Cascade`); `Workout.courseId String?` (`onDelete: SetNull`), `Workout.courseSessionNo Int?`; `NotificationType.COURSE_REMINDER`; `User.notifyCourse Boolean @default(true)`.
- SQL в миграции: `CREATE UNIQUE INDEX "StretchCourse_active" ON "StretchCourse"("userId") WHERE status IN ('ACTIVE', 'MAINTENANCE');`
- `lib/stretching/course.ts` (чистый, без `server-only`):
  - `COURSE_SKILLS = ["SPLIT_LEFT", "SPLIT_RIGHT", "SPLIT_SIDE"] as const`, `type CourseSkill`, `isCourseSkill(k: string): k is CourseSkill`
  - `COURSE_SESSIONS = 30`, `STAGE_SIZE = 6`, `COURSE_REST_SEC = 15`
  - `stageOf(n: number): 1|2|3|4|5` (n > 30 → 5)
  - `isMeasureSession(n: number): boolean` — `[1, 7, 13, 19, 25, 30]`
  - `type CourseExercise = { name: string; sets: number; holdSec: number }`
  - `sessionPlan(skill: CourseSkill, n: number): CourseExercise[]` — таблицы спеки
  - `sessionTitle(n: number): string` — «Шпагат · занятие N», n > 30 → «Шпагат · поддержка»
  - `nextHoldSec(skill, n): number` — максимальное удержание следующего занятия (для сводки)

- [ ] **Step 1: Тесты `lib/stretching/course.test.ts`**
  - `stageOf`: 1→1, 6→1, 7→2, 12→2, 13→3, 19→4, 24→4, 25→5, 30→5, 31→5, 100→5
  - `isMeasureSession`: true для 1, 7, 13, 19, 25, 30; false для 2, 6, 31
  - `sessionPlan("SPLIT_LEFT", 1)`: 5 упражнений, все `sets: 2, holdSec: 30`, имена — «Выпад на сгибатели бедра», «Голубь», «Растяжка задней поверхности бедра лёжа», «Растяжка квадрицепса лёжа на боку», «Складка сидя»
  - `sessionPlan("SPLIT_LEFT", 7)` содержит «Ящерица» и «Полушпагат», `holdSec: 45`, `sets: 2`; `n = 13` — `sets: 3`, «Растяжка квадрицепса стоя» вместо «… лёжа на боку»
  - `sessionPlan(skill, 19)` содержит шпагат с опорой (продольный / поперечный по skill) с `holdSec: 60`; `n = 25` — он же `holdSec: 90`, остальные 60
  - `sessionPlan("SPLIT_LEFT", n)` равен `sessionPlan("SPLIT_RIGHT", n)` для всех n 1…30
  - `sessionPlan("SPLIT_SIDE", 1)`: «Бабочка», «Лягушка», «Широкая складка сидя», «Растяжка задней поверхности бедра лёжа»; `n = 7` + «Боковой выпад», «Ящерица»
  - `sessionPlan(skill, 31)` равен `sessionPlan(skill, 30)`
  - для всех skill и n 1…30 каждое имя есть в `STRETCH_SEED`
  - `sessionTitle(8)` = «Шпагат · занятие 8», `sessionTitle(31)` = «Шпагат · поддержка»
- [ ] **Step 2:** `npx vitest run lib/stretching/course.test.ts` — FAIL (модуля нет)
- [ ] **Step 3:** реализовать `course.ts`; схема, флаг, миграция (`npx prisma migrate dev --name stretch_course`, с `--create-only`, дописать индекс в SQL, затем `npx prisma migrate dev`; проверить, что SQL не удаляет `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`); строка про `StretchCourse_active` в CLAUDE.md
- [ ] **Step 4:** `npx vitest run lib/stretching` и `npm run typecheck` — PASS
- [ ] **Step 5:** commit `feat(stretch-course): schema, flag and course plan`

### Task 2: Курс на сервере — запросы, экшены, создание занятия

**Files:**
- Create: `lib/stretching/course-queries.ts`, `lib/stretching/course-actions.ts`, `lib/stretching/course-access.ts`
- Modify: `lib/workouts/create.ts`

**Interfaces — Consumes:** Task 1. `logStretchMeasurementAction` логика — вынести ядро транзакции в `lib/goals/stretch-measure.ts`: `writeMeasurement(tx, user: {id, timeZone}, goalId, cm, now): Promise<boolean | null>` (null — цели нет), экшен замера вызывает его — поведение без изменений.

**Produces:**
- `courseAllowed(userId: string): Promise<boolean>` — `stretching` && `stretch_course`
- `type CourseView = { id; skill: CourseSkill; status: "ACTIVE" | "MAINTENANCE"; nextSession: number; stage: number; remindDays: number[]; goalId: string | null; lastCm: number | null; startCm: number | null; finished: boolean /* finishedAt != null && status ACTIVE — показать итог */; weeks: number }`
- `getActiveCourse(userId): Promise<CourseView | null>` (startCm/lastCm — первый/последний `StretchMeasurement` цели с `date ≥ startedAt` местного дня)
- экшены (`"use server"`, все проверяют `courseAllowed`, иначе `{ ok: false, error: "Курс недоступен" }`):
  - `startCourseAction(input: { skill: string; remindDays: number[]; cm: number }): Promise<{ ok: true } | { ok: false; error: string }>` — Zod: skill ∈ `COURSE_SKILLS`, дни 0…6 без повторов, cm как `cmSchema`; есть ACTIVE/MAINTENANCE → «Курс уже идёт»; активная цель `STRETCH_SKILL` с этим `stretchSkill` → привязать, иначе создать её тем же путём, что `createGoalAction` (лимит активных целей → его текст ошибки); замер через `writeMeasurement`; уникальный индекс (P2002) → «Курс уже идёт»
  - `startCourseSessionAction(): Promise<void>` — redirect `/training`; активная тренировка есть → просто redirect; иначе `createPlannedWorkout(userId, "course:<id>")`
  - `setCourseDaysAction(days: number[])`, `abandonCourseAction()`, `finishCourseAction(choice: "maintain" | "again" | "done")` — maintain: `status MAINTENANCE`; again/done: `COMPLETED` (again — клиент сразу открывает диалог старта с тем же skill); все `revalidatePath("/stretching")`
- `createPlannedWorkout`: ветка `kind === "course"` — курс пользователя ACTIVE/MAINTENANCE с этим id; упражнения по именам `sessionPlan` (встроенные, `userId: null`), `sets × { weight: 0, reps: 0, durationSec: holdSec }`, `restSec: COURSE_REST_SEC`; `name = sessionTitle(n)`, `courseId`, `courseSessionNo = nextSession`; **без** перезаписи времени из прошлого раза (ветка `timedIds` пропускается для курса)

- [ ] **Step 1:** unit на чистую часть экшена старта — `courseStartSchema` (экспорт из `lib/stretching/course.ts`): принимает `{ skill: "SPLIT_SIDE", remindDays: [0, 2, 4], cm: 25 }`; отклоняет skill `"BRIDGE"`, день 7, повтор дня, cm 200.5 и 12.3
- [ ] **Step 2:** FAIL → реализовать схему → PASS
- [ ] **Step 3:** реализовать `course-access`, `course-queries`, `course-actions`, `writeMeasurement` + ветку в `create.ts`
- [ ] **Step 4:** `npm run typecheck && npm run lint && npx vitest run lib/goals lib/stretching lib/workouts` — PASS (поведение замера не изменилось)
- [ ] **Step 5:** commit `feat(stretch-course): start a course and create a course session`

### Task 3: Засчитывание занятия и строка в сводке

**Files:**
- Modify: `lib/workouts/finish.ts`, `lib/workouts/queries.ts` (`getWorkoutSummary`), `components/workouts/workout-summary-view.tsx`
- Create/Modify: `lib/stretching/course.ts` (+ тест)

**Produces:**
- чистая `courseAdvance(course: { status: string; nextSession: number; finishedAt: Date | null }, workout: { courseSessionNo: number | null; hasDoneSet: boolean }, now: Date): { nextSession: number; finishedAt?: Date } | null` — null, если не ACTIVE/MAINTENANCE, нет выполненных подходов или `courseSessionNo !== nextSession`; при переходе 30 → 31 в ACTIVE — `finishedAt: now`
- в транзакции `finishWorkout` после записи итогов: у тренировки `courseId` → прочитать курс, `courseAdvance`, `updateMany({ where: { id, nextSession: course.nextSession } })` (защита от гонки)
- в сводке (`getWorkoutSummary` → поле `course: { session: number; total: 30; nextStage: number; nextHoldSec: number; maintenance: boolean } | null`): строка `data-testid="summary-course"` — «Занятие N из 30 пройдено · следующее — этап S, X с»; поддержка — «Занятие поддержки пройдено»; после 30-го — «Курс пройден! Итог — на странице «Растяжка»»

- [ ] **Step 1:** тесты `courseAdvance`: (ACTIVE, 8, sessionNo 8, done) → `{ nextSession: 9 }`; sessionNo 7 → null; `hasDoneSet: false` → null; ABANDONED → null; (ACTIVE, 30, 30) → `{ nextSession: 31, finishedAt: now }`; (MAINTENANCE, 35, 35) → `{ nextSession: 36 }` без finishedAt
- [ ] **Step 2:** FAIL → реализовать → PASS
- [ ] **Step 3:** встроить в `finishWorkout` и сводку
- [ ] **Step 4:** `npm run typecheck && npx vitest run lib/workouts lib/stretching` — PASS
- [ ] **Step 5:** commit `feat(stretch-course): a finished session advances the course`

### Task 4: Интерфейс — карточка на /stretching, тренировка, e2e основного пути

**Files:**
- Create: `components/stretching/course-card.tsx`, `components/stretching/course-start-dialog.tsx`, `components/training/course-banner.tsx`, `e2e/stretch-course.spec.ts`
- Modify: `app/(app)/stretching/page.tsx`, `app/(app)/training/page.tsx`, `components/training/workout-editor.tsx` (prop `course?: { session: number; stage: number; maintenance: boolean; measure: { goalId: string; measureLabel: string } | null } | null`), `lib/workouts/queries.ts` (`ActiveWorkout.courseId/courseSessionNo`), `e2e/db.ts`

**Consumes:** Task 2 (`getActiveCourse`, экшены), Task 3.

Поведение и тексты — раздел спеки «Карточка на /stretching», «Старт», «Занятие», «Финал», «Бросить и дни»:
- карточка `section aria-label="Курс «Сесть на шпагат»"` над целями; без курса — «10 недель, 30 занятий» + «Начать курс»; с курсом — `STRETCH_SKILLS[skill].title`, «Этап S из 5 · Занятие N из 30» (`data-testid="course-progress"`), полоса, «Последний замер: X см», кнопка `startCourseSessionAction` «Начать занятие» / при `hasActiveWorkout` — ссылка «Продолжить тренировку»; «⋯» — «Дни напоминаний», «Бросить курс» (подтверждение); `finished` — итог «Было A см → стало B см · 30 занятий · W нед.» и три кнопки
- диалог старта: radio вида (3), чекбоксы дней пн…вс (по умолчанию пн/ср/пт), поле «Сейчас, см до пола» (`selectOnFocus`), `SPLIT_CAUTION`, «Начать курс»
- в редакторе тренировки: строка «Курс: этап S · занятие N из 30» / «Курс: поддержка» (`data-testid="course-line"`), подсказка «Разомнитесь 5 минут: ходьба, махи ногами. Не до боли», на занятии с замером и `goalId` — плашка «Замер: см до пола» с полем, «Сохранить» (`logStretchMeasurementAction`) и «Пропустить» (скрывает до перезагрузки)
- `e2e/db.ts`: `setCourseSession(login: string, n: number)` — `nextSession` активного курса

- [ ] **Step 1: e2e `e2e/stretch-course.spec.ts`** (флаги `stretching` + `stretch_course` пользователю):
  - «start a course: skill goal with the start measurement, first session 30 s holds and the measurement banner, finishing moves to session 2» — старт поперечного, 25 см → в целях «Поперечный шпагат», «Осталось 25 см»; «Начать занятие» → `/training`, «Начать», `course-line` «этап 1 · занятие 1 из 30», у «Бабочка» подход «0:30»; замер 24 → «Сохранить»; отметить один подход, завершить → `summary-course` «Занятие 1 из 30 пройдено · следующее — этап 1, 30 с»; `/stretching` → `course-progress` «Этап 1 из 5 · Занятие 2 из 30», «Последний замер: 24 см»
  - «a cancelled course session does not move the course» — начать занятие, отменить тренировку → «Занятие 1 из 30»
  - «finishing with no set checked does not count» — начать, завершить без отметок (как в редакторе: пустая тренировка не завершается/удаляется) → «Занятие 1 из 30»
  - «an existing skill goal is reused» — цель «Поперечный шпагат» заранее → старт курса → в целях одна такая цель
  - «final: session 30 → summary, «Закрепить» → maintenance» — `setCourseSession(login, 30)`, занятие, отметить подход, завершить → `summary-course` «Курс пройден»; `/stretching` → итог «Было 25 см», «Закрепить» → «Поддержка»; следующее занятие — «Шпагат · поддержка»
  - «skill goal deleted mid-course: no measurement banner, course goes on» — удалить цель, занятие 7 (`setCourseSession`) → плашки нет
  - «without stretch_course there is no course card» — только `stretching` → карточки нет
- [ ] **Step 2:** `npm run build && npx playwright test e2e/stretch-course.spec.ts` — FAIL
- [ ] **Step 3:** реализовать UI
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run build && npx playwright test e2e/stretch-course.spec.ts e2e/stretching.spec.ts --workers=8` — PASS
- [ ] **Step 5:** commit `feat(stretch-course): course card, start dialog and the session banner`

### Task 5: Напоминания

**Files:**
- Create: `lib/stretching/course-tick.ts`
- Modify: `lib/stretching/course.ts` (+ тест), `lib/notifications/service.ts` (`TICK_STEPS` + шаг), `lib/notifications/actions.ts`, `lib/notifications/queries.ts`, `components/notifications/notification-settings.tsx`, `e2e/stretch-course.spec.ts`

**Produces:**
- чистая `shouldRemindCourse(input: { now: Date; timeZone: string; remindDays: number[]; remindedDay: string | null; trainedToday: boolean }): { day: string } | null` — местный день недели (0 = пн) ∈ `remindDays`, местный час ≥ 17, `remindedDay !== day`, `!trainedToday`
- `courseReminderBody(c: { nextSession: number; status: string }): string` — «Сегодня занятие курса: этап S, занятие N из 30» / «Сегодня занятие поддержки шпагата»
- `processCourseReminders(now: Date): Promise<number>` — курсы ACTIVE/MAINTENANCE c непустыми `remindDays` у пользователей с `courseAllowed`; `trainedToday` — завершённая тренировка с этим `courseId` в местный день; `notify(tx, userId, { type: COURSE_REMINDER, title: "Курс «Сесть на шпагат»", body, url: "/stretching" }, { push: notifyCourse })` и `remindedDay = day` в одной транзакции
- тумблер `notifyCourse`: «Курс растяжки — занятия по дням», описание «Напоминание в выбранные дни после 17:00»

- [ ] **Step 1:** тесты `shouldRemindCourse`: пн 17:05 Москва, дни [0] → `{ day }`; 16:59 → null; вт → null; `remindedDay` = сегодня → null; `trainedToday` → null; `Etc/GMT-14` при UTC-времени вс 03:30 → местный пн 17:30 → напоминание с местным днём; `courseReminderBody` для 8 и для MAINTENANCE
- [ ] **Step 2:** FAIL → реализовать → PASS
- [ ] **Step 3:** шаг `course` в тике; тумблер
- [ ] **Step 4:** e2e «reminder: on a chosen day after 17:00 once» — старт с днём = сегодняшний местный, `runTick(request, localAt(сегодня, "17:30"), "course")` → в ленте уведомлений «Сегодня занятие курса: этап 1, занятие 1 из 30»; повторный тик → уведомление одно; выключить тумблер «Курс растяжки» у другого пользователя → ни одного
- [ ] **Step 5:** `npm run typecheck && npm run lint && npx vitest run lib/stretching lib/notifications && npx playwright test e2e/stretch-course.spec.ts --workers=8` — PASS
- [ ] **Step 6:** commit `feat(stretch-course): reminders on chosen days`

### Task 6: «Мои данные», документация, полный прогон

**Files:**
- Modify: `lib/account/export-queries.ts`, `lib/account/export.ts`, `lib/account/export.test.ts`, `e2e/account-data.spec.ts`, `docs/features/training.md`, спека (строка про PLANNED)

- [ ] **Step 1:** unit `export.test.ts`: `stretchCourses` — `[{ skill, status, remindDays, nextSession, startedAt, finishedAt }]` без `id`/`userId`/`goalId`
- [ ] **Step 2:** FAIL → реализовать → PASS
- [ ] **Step 3:** e2e в `account-data.spec.ts`: «stretch course: export lists it, deletion removes it» — курс (оба флага), JSON `stretchCourses[0].skill === "SPLIT_SIDE"`; удаление аккаунта → строки `StretchCourse` нет (хелпер `courseCount(login)` в `e2e/db.ts` до удаления по `userId`)
- [ ] **Step 4:** docs: абзац «Курс «Сесть на шпагат»» в `docs/features/training.md` (флаг, файлы, засчитывание, напоминания); в спеке «Занятие» — PLANNED и «Начать» вручную
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — PASS (результат — в отчёт)
- [ ] **Step 6:** commit `feat(stretch-course): my data export, docs`
