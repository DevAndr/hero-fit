# Избранные упражнения

Дата: 2026-10-18. Релиз: `release/2026-12-next`. Без фича-флага.

## Зачем

Быстрее находить свои частые упражнения во всех списках: ★ на упражнении, избранные — сверху, чип «★ Избранное» в фильтре.

## Данные

- `FavoriteExercise { userId, exerciseId, createdAt }`, `@@id([userId, exerciseId])`, обе связи `onDelete: Cascade`, `@@index([exerciseId])`. Встроенные упражнения (`userId = null`) тоже можно отметить — поэтому отдельная таблица, а не поле упражнения.
- `ExerciseItem.favorite: boolean`. `listExercises` выбирает его (`favorites: { where: { userId }, select: { userId: true } }`) и сортирует: избранные первыми, внутри — по названию (`sortFavoritesFirst`, чистая функция, `lib/exercises/favorites.ts`).
- Архивные и скрытые флагом упражнения не показываются (как сейчас); запись избранного у архивного остаётся (вернётся при «воскрешении»).

## Действие

`toggleFavoriteAction(exerciseId: string, favorite: boolean): Promise<{ ok: true } | { ok: false; error: string }>` (`lib/exercises/actions.ts`): `requireUser`; упражнение должно быть видимым пользователю (`visibleExercisesWhere`), иначе `{ ok: false, error: "Упражнение не найдено" }`; `favorite` → `upsert`/`createMany skipDuplicates`, иначе `deleteMany`; идемпотентно; без `revalidatePath` (в Next 16 он перерисовал бы текущую страницу — `/training` посреди тренировки); `/exercises` обновляется `router.refresh()` провайдера (`refreshAfterSave`), провайдер там с `key` по фильтру.

## Интерфейс

- `FavoritesProvider` (`components/exercises/favorites.tsx`, клиент): начальный набор — id с `favorite`; `useFavorites()` → `{ has(id), toggle(exercise) }`. `toggle` меняет набор сразу, вызывает действие; ошибка или сеть — откат и тост «Не удалось сохранить избранное» (без сети — «Нет сети — не удалось сохранить»).
- `FavoriteButton({ exercise })`: `Button variant="ghost" size="icon-sm"`, иконка `Star` (залитая `fill-current text-xp` в избранном), `aria-pressed`, `aria-label` «В избранное: <название>» / «Убрать из избранного: <название>». Клик не всплывает (строки — кнопки/перетаскивание).
- Где ★: карточка `/exercises` (`ExerciseCard`), строки `ExercisePicker` (тренировка на телефоне и шаблоны), `ExerciseCatalog` (тренировка на ПК), каталог «Другое упражнение…» в замене.
- Фильтр: `useExerciseFilter` получает группу `"FAVORITES"` (тип `MuscleGroup | "FAVORITES" | null`), фильтрует по `useFavorites().has`; в `ExerciseFilterControls` первым чипом — «★ Избранное» (перед «Все»). Без провайдера (`useFavorites` вне контекста) — по `exercise.favorite`.
- `/exercises`: провайдер вокруг списка; без фильтра — первой секция «Избранное» (если есть), дальше по группам (избранные остаются и в своих группах); `?group=favorites` — только избранные; чип «★ Избранное» в ряду фильтров. Пусто при `?group=favorites` — «Отмечайте ★ упражнения, которые делаете чаще всего».
- Провайдер ставится в `workout-editor.tsx` и `template-editor.tsx` (данные — тот же `exercises`).
- Сортировка на клиенте после ★ не меняется (список не прыгает) — до следующей загрузки.

## Сквозное

- «Мои данные»: раздел `favoriteExercises` — `[{ exercise: <название>, createdAt }]` (без id), только JSON; `EXPORT_SECTIONS`.
- Удаление аккаунта — каскадом; `rehomeExercises` записи других о моих упражнениях не переносит (каскад при удалении упражнения).
- Без сети: фильтр и порядок — по загруженным данным; ★ требует сети.

## Тесты

- Unit: `sortFavoritesFirst`; `buildExport` — `favoriteExercises` без лишних полей.
- e2e `e2e/favorite-exercises.spec.ts` (desktop + mobile): ★ на `/exercises` → секция «Избранное», `?group=favorites`, снятие; ★ в выборе тренировки → чип «★ Избранное» показывает его, после перезагрузки — первым в списке; ★ встроенного и своего; «Мои данные» содержит `favoriteExercises`; удаление аккаунта с избранным проходит.

## Документация

`docs/features/training.md` — абзац «Избранные упражнения»; пункт «Что нового» — при сборке релиза.
