# Режим тренера, этап 3: комментарии тренера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер комментирует завершённую тренировку клиента целиком и по упражнениям, клиент видит комментарии в сводке и получает уведомление.

**Architecture:** модель `CoachComment` (частичный уникальный индекс для общего комментария); actions в `lib/coach/comment-actions.ts` через `requireClientOf`; чистые проверки в `lib/coach/comments.ts`; `WorkoutSummaryView` получает слот `renderComment(workoutExerciseId | null)` — страница тренера кладёт туда редактор, страница клиента — показ.

**Tech Stack:** Next.js 16, Prisma 7 (`migrate diff` + ручной частичный индекс + `migrate deploy`), Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-coach-comments-design.md`

## Global Constraints

- Тексты (дословно): блок — «Комментарий тренера»; кнопка у упражнения — «Заметка»; плашка у клиента — «Тренер: <текст>»; подпись общего у клиента — «Комментарий тренера · <ник>, <дата>»; уведомление — заголовок `Комментарий тренера к «<тренировка>»`, тело — `commentPreview(text)`; ошибки — «Введите комментарий», «Не длиннее 1000 символов», «Тренировка не найдена».
- Длина: trim, 1…1000; превью — 120 символов + «…».
- Миграция: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` + дописать `CREATE UNIQUE INDEX "CoachComment_workout_general" ON "CoachComment"("workoutId") WHERE "workoutExerciseId" IS NULL;`; `migrate deploy`, `generate`.
- Цель Метрики `coach_comment` — в `GOALS`, только при создании.
- e2e — ники из логина (`nickOf`), связь — `enableCoach`/`linkCoach`, тренировка клиента — `seedWorkouts` или `quickWorkout`.

## Review Focus

- Тренер передаёт `workoutExerciseId` из чужой тренировки или `workoutId` чужого клиента — отказ «Тренировка не найдена».
- Тренер сохраняет комментарий к незавершённой (IN_PROGRESS) тренировке клиента — отказ.
- Два быстрых «Сохранить» одного общего комментария (гонка) — один комментарий (upsert / P2002 → обновление), не 500.
- Другой тренер (бывший) пытается удалить комментарий — отказ; после разрыва связи комментарии бывшего видны клиенту.
- Уведомление: несколько комментариев подряд до прочтения — одно уведомление, push один раз.

---

### Task 1: модель, actions, уведомления

**Files:** `prisma/schema.prisma` + миграция `<ts>_coach_comments`; Create `lib/coach/comments.ts`, `lib/coach/comments.test.ts`, `lib/coach/comment-actions.ts`; Modify `lib/analytics/goals.ts`.

**Interfaces:**
- Produces: `commentTextSchema` (zod string trim 1…1000 с текстами ошибок), `commentPreview(text: string): string`.
- Produces: `saveCoachCommentAction(clientId: string, workoutId: string, workoutExerciseId: string | null, text: string): Promise<{ ok: true } | { ok: false; error: string }>` — upsert по (workoutId, workoutExerciseId) среди комментариев этого тренера; создание → уведомление (группировка по url `/workouts/<id>`, тип COACH, `readAt: null`) + цель; `deleteCoachCommentAction(clientId: string, commentId: string): Promise<Result>`; оба — `revalidatePath` страниц тренировки клиента и тренера.
- Produces: `getWorkoutComments(workoutId: string, coachId?: string): Promise<CommentView[]>` (`lib/coach/comments-queries.ts`), `CommentView = { id; workoutExerciseId: string | null; text; coachName: string; updatedAt: Date }`; `markCommentsRead(clientId, workoutId)`.

- [ ] Unit RED: `commentTextSchema` — `"  "` → «Введите комментарий», 1001 символ → «Не длиннее 1000 символов», `" ок "` → `"ок"`; `commentPreview("a".repeat(130))` → 120 «a» + «…», короткий — без изменений. → FAIL → реализация → PASS.
- [ ] Схема + миграция с частичным индексом; deploy; generate.
- [ ] Actions + queries; `npm run typecheck && npm run lint && npm test` → чисто. Commit `feat(coach): CoachComment model and actions`.

### Task 2: интерфейс тренера и клиента, e2e

**Files:** Create `components/coach/coach-comment.tsx`, `e2e/coach-comments.spec.ts`; Modify `components/workouts/workout-summary-view.tsx` (prop `renderComment?: (workoutExerciseId: string | null) => ReactNode` — после сетов упражнения и перед footer), `app/(app)/coach/clients/[id]/workouts/[wid]/page.tsx`, `app/(app)/workouts/[id]/page.tsx` (показ + `markCommentsRead`), `app/(app)/coach/clients/[id]/page.tsx` + `lib/coach/queries.ts` (`getClientWorkouts` → `_count.coachComments` этого тренера → 💬).

- [ ] e2e RED: сценарии из спеки (общий + заметка → клиент видит, одно уведомление; правка и удаление; 💬; чужой тренер 404; после разрыва — видно).
- [ ] `CoachCommentEditor` (client: текст / «Изменить» / «Удалить» / textarea + «Сохранить» / «Отмена»; для упражнения — свёрнут под кнопкой «Заметка»), `CoachCommentNote` (клиент: плашка / блок с подписью).
- [ ] build + `npx playwright test coach-comments coach --workers=6` → PASS; typecheck/lint/unit. Commit `feat(coach): comment UI for coach and client`.

### Task 3: сид и документация

- [ ] `seedDemoCoach`: общий комментарий и заметка к первому упражнению свежей тренировки Маши (пересоздаются). Сид дважды → по одному.
- [ ] CLAUDE.md — этап 3 в строке режима тренера.
- [ ] Полный `npx playwright test --workers=6` → зелёный. Commit `chore(coach): demo comments in seed, docs`.
