# Избранные упражнения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ★ на упражнениях, избранные сверху во всех списках, чип «★ Избранное» в фильтре.

**Architecture:** таблица `FavoriteExercise`; `listExercises` отдаёт `favorite` и сортирует; клиентский `FavoritesProvider` с оптимистичным `toggleFavoriteAction`; кнопка ★ в карточке и строках выбора; фильтр получает группу `"FAVORITES"`.

**Tech Stack:** Next.js 16, Prisma 7, React, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-favorite-exercises-design.md`

## Global Constraints

- Ветка `feat/favorite-exercises` от `release/2026-12-next`; готово — `merge --no-ff`, ветка удаляется.
- Без флага. Миграция одна, SQL проверить: частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не удалять.
- Тексты точно: «★ Избранное» (чип), «Избранное» (секция), «В избранное: <название>» / «Убрать из избранного: <название>», «Отмечайте ★ упражнения, которые делаете чаще всего», «Не удалось сохранить избранное», «Нет сети — не удалось сохранить».
- Цвета — семантические токены; звезда в избранном — `fill-current text-xp`.
- Новая связь с `User` и `Exercise` — «Мои данные» и удаление аккаунта (CLAUDE.md, сквозные правила).

## Review Focus

1. Клик ★ в строке `ExercisePicker` не должен выбирать упражнение, в `ExerciseCatalog` — не начинать перетаскивание — e2e Task 2.
2. Быстрые двойные клики ★ — итог совпадает с последним состоянием (идемпотентное действие с явным `favorite`) — unit/e2e Task 2.
3. ★ на одном списке тренировки (каталог ПК) видна в другом (диалог) без перезагрузки — общий провайдер — e2e Task 2.
4. Чужое/архивное упражнение в `toggleFavoriteAction` — отказ — e2e Task 1 (запрос действия напрямую не нужен; проверка `visibleExercisesWhere` в коде + unit не требуется) — ревью.
5. Экспорт без id — unit Task 1.

---

### Task 1: Данные, запрос, действие, выгрузка

**Files:** `prisma/schema.prisma` (+ миграция `add_favorite_exercises`), `lib/exercises/favorites.ts` (+ `.test.ts`), `lib/exercises/queries.ts`, `lib/exercises/actions.ts`, `lib/account/export.ts`, `lib/account/export-queries.ts`, `lib/account/export.test.ts`.

**Produces:** `ExerciseItem.favorite: boolean`; `sortFavoritesFirst<T extends { favorite: boolean; name: string }>(items: T[]): T[]` (стабильно, по `localeCompare("ru")` внутри); `toggleFavoriteAction(exerciseId, favorite)`; раздел выгрузки `favoriteExercises: { exercise: string; createdAt: Date }[]`.

- [ ] Тесты: `sortFavoritesFirst` — `[{b,false},{a,true},{c,true}]` → `a, c, b`; `buildExport` — `favoriteExercises` из `[{ exercise: "Присед", createdAt, id: "x" }]` → без `id`; `EXPORT_SECTIONS` содержит `"favoriteExercises"`. Запуск — FAIL.
- [ ] Схема + `npx prisma migrate dev --name add_favorite_exercises`, проверить SQL; реализация. Тесты PASS, `npm run typecheck` чисто (подправить литералы `ExerciseItem` в тестах, если есть).
- [ ] Commit `feat(exercises): favorite exercises data, query and action`.

### Task 2: Интерфейс, e2e, документация

**Files:** `components/exercises/favorites.tsx` (новый: `FavoritesProvider`, `useFavorites`, `FavoriteButton`), `components/training/exercise-filter.tsx`, `components/training/exercise-picker.tsx`, `components/training/exercise-catalog.tsx`, `components/training/exercise-swap-dialog.tsx`, `components/training/workout-editor.tsx`, `components/templates/template-editor.tsx`, `components/exercises/exercise-card.tsx`, `app/(app)/exercises/page.tsx`, `e2e/favorite-exercises.spec.ts`, `e2e/account-data.spec.ts`, `docs/features/training.md`, `docs/features/platform.md` (раздел выгрузки).

**Consumes:** Task 1.

- [ ] e2e (desktop + mobile), сценарии:
  - `"star on /exercises: favorites section, filter, unstar"` — ★ «Жим ногами» → секция «Избранное» первой содержит его; `/exercises?group=favorites` — только он; снять ★ → пусто с подсказкой.
  - `"star while picking in a workout: filter chip, first after reload"` — пустая тренировка, выбор упражнения (диалог на mobile / каталог на desktop): ★ «Жим ногами» не добавляет упражнение; чип «★ Избранное» показывает только его; перезагрузка — первый в списке.
  - `"star is shared between lists on the page"` (desktop) — ★ в каталоге → в диалоге «Другое упражнение…» замены он со звездой.
  - `account-data.spec.ts`: `"my data: favorite exercises are exported and go with the account"` — ★ встроенного → выгрузка `favoriteExercises` = `[{ exercise, createdAt }]`; удаление аккаунта проходит.
  Запуск — FAIL.
- [ ] Реализация по спеке. `npm run build && npx playwright test e2e/favorite-exercises.spec.ts e2e/account-data.spec.ts e2e/training.spec.ts e2e/training-dnd.spec.ts e2e/exercise-swap.spec.ts --workers=8` — PASS; typecheck, lint, unit — чисто.
- [ ] Документация; commit `feat(exercises): star favorite exercises in all lists`; merge в релиз.
