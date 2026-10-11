# Оценка тренировки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** после тренировки человек ставит тяжесть 1–10 и пишет заметку в сводке; видно в истории; тренер видит оценку клиента и получает уведомление при заметке или тяжести ≥ 9.

**Architecture:** поля в `Workout` (`rpe`, существующий `notes`, `feedbackNotifiedAt`); правила — чистые `lib/workouts/feedback.ts`; сохранение — server action с уведомлением тренеру в той же транзакции; показ — слот `feedback` в `WorkoutSummaryView`, колонка в истории, значок у тренера.

**Tech Stack:** Next.js 16 (server actions), Prisma 7, Zod, shadcn/Base UI (RadioGroup, Textarea), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-workout-feedback-design.md`

## Global Constraints

- Тяжесть — целое 1–10; заметка — `trim`, ≤ 500 символов, пустая → `null`.
- Подписи: 1–2 «Очень легко», 3–4 «Легко», 5–6 «Нормально», 7–8 «Тяжело», 9–10 «На пределе».
- Уведомление тренеру: только активный тренер, только при заметке или `rpe ≥ 9`, один раз на тренировку (`feedbackNotifiedAt`); тип `COACH`, `body` «Оценка тренировки», url `/coach/clients/<clientId>/workouts/<workoutId>`, `push: true`.
- Тексты: «Как прошла тренировка?», «Тяжесть», «Заметка», «Сохранить», «Изменить», «Оценка клиента», «Тяжесть 7 — Тяжело», значок «RPE 7». Без рода.
- Лента, лига, сторис оценку не получают (в `XpEvent.meta` не писать).
- Цвета — семантические токены.

## Review Focus

- Сохранение чужой или незавершённой тренировки (подделанный id в action) — отказ, ничего не пишется, тренер не уведомляется. → unit/e2e в Task 2 (e2e: action через UI чужой тренировки недоступен — проверка в коде; ревью).
- Клиент без тренера с заметкой — никаких уведомлений, `feedbackNotifiedAt` не ставится (иначе после появления тренера старая тренировка «молчит» — допустимо, но не должно падать). → e2e Task 2 (человек без тренера).
- Двойное нажатие «Сохранить» / две вкладки — одно уведомление (условный `updateMany` по `feedbackNotifiedAt: null`). → код Task 2, ревью.
- Заметка из пробелов — как пустая. → unit Task 1.
- Разрыв связи после уведомления, новый тренер — старые тренировки не уведомляют нового (уже отмечены) — ожидаемо. → ревью.

---

### Task 1: Правила оценки (чистые функции) и схема БД

**Files:**
- Modify: `prisma/schema.prisma` (`Workout.rpe Int?` с комментарием «тяжесть тренировки 1–10 (оценка в сводке)», `Workout.notes` — комментарий «заметка к оценке тренировки», `Workout.feedbackNotifiedAt DateTime?`)
- Create: `prisma/migrations/<timestamp>_workout_feedback/migration.sql` — **только** `npx prisma migrate dev --name workout_feedback` (не `--create-only` дважды: команда применяет сразу)
- Create: `lib/workouts/feedback.ts`, `lib/workouts/feedback.test.ts`

**Interfaces:**
- Produces:
  - `feedbackSchema` — Zod-объект `{ rpe: number (int 1..10), note: string | null }` (вход `note` — строка, выход — `null` для пустой после `trim`; `max(500, "Не больше 500 символов")`, `rpe` — сообщение «Выберите тяжесть от 1 до 10»).
  - `type Feedback = z.infer<typeof feedbackSchema>`
  - `rpeLabel(rpe: number): string`
  - `shouldNotifyCoach(f: { rpe: number; note: string | null; notifiedAt: Date | null }): boolean`
  - `feedbackNotice(name: string, rpe: number, note: string | null): string` — с заметкой: `${name}: тяжесть ${rpe}/10 · ${заметка, до 80 символов, длиннее — 79 + «…»}`; без: `${name}: тяжесть ${rpe}/10 — ${rpeLabel(rpe)}`.

- [ ] **Step 1: Write the failing tests** (`lib/workouts/feedback.test.ts`)

```ts
expect(feedbackSchema.safeParse({ rpe: 0, note: "" }).success).toBe(false);
expect(feedbackSchema.safeParse({ rpe: 11, note: "" }).success).toBe(false);
expect(feedbackSchema.safeParse({ rpe: 7.5, note: "" }).success).toBe(false);
expect(feedbackSchema.safeParse({ rpe: 7, note: "x".repeat(501) }).success).toBe(false);
expect(feedbackSchema.parse({ rpe: 7, note: "   " })).toEqual({ rpe: 7, note: null });
expect(feedbackSchema.parse({ rpe: 7, note: " болела спина " })).toEqual({ rpe: 7, note: "болела спина" });
expect([1, 2, 3, 6, 7, 8, 9, 10].map(rpeLabel)).toEqual(["Очень легко", "Очень легко", "Легко", "Нормально", "Тяжело", "Тяжело", "На пределе", "На пределе"]);
expect(shouldNotifyCoach({ rpe: 8, note: null, notifiedAt: null })).toBe(false);
expect(shouldNotifyCoach({ rpe: 9, note: null, notifiedAt: null })).toBe(true);
expect(shouldNotifyCoach({ rpe: 5, note: "плохо спал", notifiedAt: null })).toBe(true);
expect(shouldNotifyCoach({ rpe: 10, note: "x", notifiedAt: new Date() })).toBe(false);
expect(feedbackNotice("Маша", 9, null)).toBe("Маша: тяжесть 9/10 — На пределе");
expect(feedbackNotice("Маша", 10, "болела спина")).toBe("Маша: тяжесть 10/10 · болела спина");
expect(feedbackNotice("Маша", 6, "а".repeat(100))).toBe(`Маша: тяжесть 6/10 · ${"а".repeat(79)}…`);
```

- [ ] **Step 2: Run** `npx vitest run lib/workouts/feedback.test.ts` — FAIL (нет модуля).
- [ ] **Step 3: Implement** `feedback.ts`; схему и миграцию (`npx prisma migrate dev --name workout_feedback`, затем `git status` — одна новая папка миграции).
- [ ] **Step 4: Run** тест — PASS; `npm run typecheck` — чисто.
- [ ] **Step 5: Commit** `feat(workouts): workout feedback rules and fields`

### Task 2: Сохранение, карточка в сводке, тренеру — блок и уведомление

**Files:**
- Create: `lib/workouts/feedback-actions.ts`, `components/workouts/workout-feedback.tsx`
- Modify: `components/workouts/workout-summary-view.tsx` (проп `feedback?: ReactNode`, выводится над списком упражнений), `app/(app)/workouts/[id]/page.tsx` (передаёт `<WorkoutFeedback workoutId rpe note />`), `app/(app)/coach/clients/[id]/workouts/[wid]/page.tsx` (передаёт `<CoachFeedbackNote rpe note />` из `components/workouts/workout-feedback.tsx`; серверный, без клиентского кода)
- Create: `e2e/workout-feedback.spec.ts`

**Interfaces:**
- Consumes: Task 1 целиком; `notify` (`lib/notifications/service.ts`), `clientDisplayName` (`lib/coach/clients.ts`), `requireUser`.
- Produces:
  - `saveWorkoutFeedbackAction(workoutId: string, input: { rpe: number; note: string }): Promise<{ ok: true; rpe: number; note: string | null } | { ok: false; error: string }>`
  - `WorkoutFeedback({ workoutId, rpe, note }: { workoutId: string; rpe: number | null; note: string | null })` — клиентский.
  - `CoachFeedbackNote({ rpe, note }: { rpe: number | null; note: string | null })` — `null`, если `rpe === null`.

Action: `feedbackSchema.safeParse` → ошибка первого поля; транзакция: `tx.workout.updateMany({ where: { id, userId: user.id, status: COMPLETED }, data: { rpe, notes } })` — `count = 0` → `{ ok: false, error: "Тренировка не найдена" }`; активная связь клиента (`coachLink.findFirst({ clientId: user.id, endedAt: null })`); если есть и `shouldNotifyCoach` с текущим `feedbackNotifiedAt` — условный `updateMany({ where: { id, feedbackNotifiedAt: null }, data: { feedbackNotifiedAt: now } })`, при `count = 1` — `notify`. `revalidatePath(/workouts/<id>)`.

UI карточки: `<section aria-label="Как прошла тренировка?">`, заголовок; `RadioGroup aria-label="Тяжесть"` из 10 пунктов (подпись — число, `aria-label` пункта — «Тяжесть N»); под ней — `rpeLabel` выбранного; `Textarea` с `Label` «Заметка», `maxLength={500}`, счётчик «N/500»; «Сохранить» (`disabled` без тяжести и во время отправки). После `ok` — вид: «Тяжесть N — <подпись>», заметка, кнопка «Изменить» (возвращает форму с текущими значениями). Ошибка — `toast.error`.

Блок тренера: `<section aria-label="Оценка клиента">` «Оценка клиента» + «Тяжесть N — <подпись>» + заметка.

- [ ] **Step 1: Write the failing e2e** (`e2e/workout-feedback.spec.ts`; тренировка — `quickWorkout` из `e2e/helpers.ts`; тренер — как в `e2e/coach-signals.spec.ts` на ветке сигналов, здесь своими хелперами `enableCoach`/`linkCoach`; уведомления тренеру — SQL в `"Notification"` по `type = 'COACH'`, хелпер `coachNotifications` добавить в `e2e/db.ts`, если его ещё нет в `main`)

```ts
test("rate a workout: save, see it after reload, edit", ...)
// quickWorkout → region «Как прошла тренировка?» → radio «Тяжесть 7» → текст «Тяжело» → Заметка «болела спина» → Сохранить
// → виден «Тяжесть 7 — Тяжело» и «болела спина», кнопка «Изменить»; reload → то же;
// «Изменить» → «Тяжесть 5» → Сохранить → «Тяжесть 5 — Нормально».
test("the coach gets one notice for a hard workout and sees the rating", ...)
// клиент тренера: quickWorkout → 9 без заметки → Сохранить; coachNotifications(coach) → 1, title «<ник>: тяжесть 9/10 — На пределе»,
// url `/coach/clients/<id>/workouts/<wid>`; «Изменить» → 10 + «болела спина» → Сохранить → уведомлений всё ещё 1;
// тренер: /coach/clients/<id>/workouts/<wid> → region «Оценка клиента» содержит «Тяжесть 10 — На пределе» и «болела спина».
test("an easy workout without a note does not notify the coach", ...)
// 6 без заметки → Сохранить → виден «Тяжесть 6 — Нормально» → coachNotifications(coach) → [].
```

- [ ] **Step 2: Run** `npm run build && npx playwright test workout-feedback` — FAIL.
- [ ] **Step 3: Implement** action, компоненты, слоты на двух страницах.
- [ ] **Step 4: Run** `npm run build && npx playwright test workout-feedback coach-comments share-story` — PASS; `npm run typecheck`, `npm run lint` — чисто.
- [ ] **Step 5: Commit** `feat(workouts): rate a workout in the summary; the coach sees it and is notified`

### Task 3: Оценка в истории

**Files:**
- Modify: `lib/stats/queries.ts` (select `rpe: true` в последних тренировках, ~стр. 104), `components/stats/stats-view.tsx` (колонка «RPE» после «Время»: число или «—»), `lib/coach/queries.ts` (`getClientWorkouts` — select `rpe: true`), `app/(app)/coach/clients/[id]/page.tsx` (вкладка «Тренировки»: значок «RPE N» рядом с 💬, `rounded-full bg-muted px-1.5 text-xs`)
- Test: `e2e/workout-feedback.spec.ts`

**Interfaces:**
- Consumes: поле `Workout.rpe` (Task 1).

- [ ] **Step 1: Extend the e2e** — в первом тесте после сохранения 5: `/stats` → в region «История тренировок» строка тренировки содержит ячейку «5»; во втором — тренер на `/coach/clients/<id>?tab=workouts` видит «RPE 10».
- [ ] **Step 2: Run** `npm run build && npx playwright test workout-feedback` — FAIL на новых проверках.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run build && npx playwright test workout-feedback stats coach.spec` — PASS.
- [ ] **Step 5: Commit** `feat(stats): workout rating in the history`

### Task 4: Документация и полный прогон

- [ ] **Step 1:** `CLAUDE.md` — пункт «Оценка тренировки»: поля, `lib/workouts/feedback.ts`, action, правило уведомления тренеру, где показывается, что не попадает в ленту/сторис; e2e-хелперы.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — зелёное (таймауты под нагрузкой — `--last-failed`, указать).
- [ ] **Step 3: Commit** `docs: workout feedback in CLAUDE.md`
