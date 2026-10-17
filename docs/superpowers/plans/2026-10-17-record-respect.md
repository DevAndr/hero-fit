# Респект за рекорд — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в ленте друзей и гильдии можно дать «респект» за рекорд в упражнении чужой тренировки; автор получает уведомление и ачивки за полученные респекты; 👊 и респекты попадают в «Мои данные».

**Architecture:** по образцу 👊 (`Kudos`, `toggleKudosAction`, `notifyKudos`): таблица `RecordRespect`, агрегат в SQL ленты (`feedPage`), чистая группировка рекордов по упражнению в `lib/social/feed.ts`, кнопка в `ActivityFeed`. Ачивки — новая лестница в `definitions.ts` со статистикой из `getAchievementStats`.

**Tech Stack:** Next.js 16 (server actions), Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-record-respect-design.md`

## Global Constraints

- Только русский в интерфейсе; тексты — дословно из спеки.
- Без фича-флага.
- Миграция: только таблица `RecordRespect` и значение `SOCIAL` в `AchievementCategory`; в SQL нет `DROP INDEX` для `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- Новая связь с `User` и `Exercise` → удаление аккаунта и «Мои данные» (`lib/account/*`, `e2e/account-data.spec.ts`).
- e2e с двумя контекстами — `--workers=8`; друзей связывать `makeFriends` (`e2e/db.ts`); даты — через `E2E_TZ`/`localAt`.
- Ссылка-кнопка — `<Link className={buttonVariants()}>`; цвета — семантические токены; бесконечных анимаций нет.
- Видимость и запреты — как у 👊 (`canSeeWorkout`); XP за сам респект не начисляется.

## Review Focus

1. Автор включил `hideWeights` после респектов: значения весовых рекордов скрыты, счётчик и кнопка на месте — тест в Task 2 (e2e 2).
2. Тренировка с рекордами по двум упражнениям: респект на одно не меняет счётчик другого — unit `groupRecords` + e2e 1 (Task 2).
3. Автор удалил аккаунт: в выгрузке друга `respectsGiven.to = null` не ломает экспорт; респекты на тренировках автора удалены — Task 4.
4. Подделанный `exerciseId` / тренировка без рекорда — ошибка без записи — unit `recordExercise` (Task 1), проверка в `toggleRespectAction` до записи (Task 2).
5. Двойной клик и гонка двух вкладок — одна запись (P2002), уведомление обновляется, а не дублируется — e2e 1 (Task 2, два быстрых клика).

---

### Task 1: Модель, миграция, чистая группировка

**Files:**
- Modify: `prisma/schema.prisma` (модель `RecordRespect` из спеки; обратные связи `User.recordRespects`, `Workout.recordRespects`, `Exercise.recordRespects`; `AchievementCategory` + `SOCIAL // социальное: респекты за рекорды`)
- Create: migration `record_respect` (`npx prisma migrate dev --name record_respect --create-only` → проверить SQL → `npx prisma migrate dev`; правки схемы точечно, без `prisma format` всего файла)
- Modify: `components/achievements/category.ts` (`SOCIAL: "Социальное"`; иконка — по образцу соседних, если там есть карта иконок)
- Modify: `lib/social/feed.ts`, Test: `lib/social/feed.test.ts`

**Interfaces — Produces (`lib/social/feed.ts`):**
```ts
export type RespectInfo = { count: number; byMe: boolean; names: string[] };
export type FeedRecordGroup = {
  exerciseId: string;
  exerciseName: string;
  records: { type: RecordType; value: number | null }[];
  respect: RespectInfo;
};
// FeedRow: + respects: { exerciseId: string; count: number; byMe: boolean; names: string[] | null }[] | null
// FeedEntry: поле `records` заменяется на `respects: FeedRecordGroup[]`
export function groupRecords(
  records: { exerciseId: string; exerciseName: string; type: RecordType; value: number | null }[],
  respects: FeedRow["respects"],
): FeedRecordGroup[];
export function respectLabel(r: RespectInfo): string;   // как kudosLabel
export function respectNotice(exerciseName: string, names: string[]): { title: string; body: string };
export function recordExercise(meta: unknown, exerciseId: string): string | null; // название упражнения, если в meta.records (isFinishMeta) есть рекорд с этим exerciseId, иначе null
```
`groupRecords`: порядок групп — первое появление упражнения; внутри — порядок `meta.records`; респект без совпадения — `{ count: 0, byMe: false, names: [] }`. `toFeedEntry` строит `respects` из `meta.records` (уже с `hideWeights`-обнулением весовых значений, как сейчас) и `row.respects`. `respectNotice`: `title = "🏆 Респект за рекорд: " + exerciseName`; `body` — первые 2 ника через «, », при > 2 — « и ещё N».

- [ ] **Step 1: тесты в `lib/social/feed.test.ts`:**
  - `groupRecords: типы одного упражнения — одна группа, порядок первого появления` — `[Жим ONE_RM 105, Присед MAX_WEIGHT 140, Жим MAX_WEIGHT 100]` → группы `[Жим (ONE_RM, MAX_WEIGHT), Присед]`.
  - `groupRecords: респект — только своему упражнению` — `respects [{ exerciseId: жим, count: 2, byMe: true, names: ["Маша"] }]` → у Жима `{2, true, ["Маша"]}`, у Приседа `{0, false, []}`.
  - `toFeedEntry: hideWeights — весовые значения null, повторы остаются, группа и респект на месте`.
  - `respectLabel` — `{0}` → `""`; `{3, byMe, ["Маша","Борис"]}` → `"Вы, Маша и ещё 1"`.
  - `recordExercise` — meta с рекордом жима → `"Жим лёжа"`; чужой `exerciseId` → `null`; `null`/битая meta → `null` (Review Focus 4: подделанный id).
  - `respectNotice` — `("Жим лёжа", ["Маша"])` → `{ title: "🏆 Респект за рекорд: Жим лёжа", body: "Маша" }`; 3 ника → `"Маша, Борис и ещё 1"`.
- [ ] **Step 2:** `npx vitest run lib/social/feed.test.ts` → FAIL.
- [ ] **Step 3:** схема, миграция (проверить SQL), `npx prisma generate`; реализовать функции; поправить потребителей `FeedEntry.records` (компонент ленты — временно рендерит группы без кнопки), чтобы typecheck был чистым.
- [ ] **Step 4:** `npx vitest run lib/social/feed.test.ts` → PASS; `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 5:** коммит `feat(social): record respect — model and grouped records`.

### Task 2: Действие, уведомление, кнопка в ленте

**Files:**
- Modify: `lib/social/queries.ts` (в SQL `feedPage` — поле `respects`: `json_agg` по `RecordRespect` тренировки, сгруппированный по `exerciseId`: `count`, `byMe` (`userId = смотрящий`), `names` — до 3 последних ников, как `kudosNames`)
- Modify: `lib/social/actions.ts` (`toggleRespectAction`, `notifyRespect`)
- Modify: `components/social/activity-feed.tsx` (строки групп + `RespectButton`)
- Modify: `e2e/db.ts` (хелперы `seedRespects(ownerLogin, workoutId, exerciseId, n)` — n фиктивных друзей с респектами, `respectCount(workoutId)`, при необходимости `latestWorkoutId(login)` / `seedRecordWorkout`)
- Create: `e2e/record-respect.spec.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
export async function toggleRespectAction(workoutId: string, exerciseId: string): Promise<Result>; // Result как у toggleKudosAction
```
Ошибки (тексты): недоступна — «Тренировка недоступна»; своя — «Свой рекорд отметить нельзя»; нет рекорда (`recordExercise(meta XpEvent WORKOUT_COMPLETED тренировки, exerciseId) === null`) — «Рекорд не найден». Toggle как `toggleKudosAction` (`deleteMany` → иначе `create`, P2002 игнор). После постановки — `notifyRespect(workoutId, exerciseId, ownerId, friend)`: url `${friend ? "/friends" : "/guild"}#w-<id>`; группировка — непрочитанное `SOCIAL` с тем же `url` и `title` обновляется (title/body/createdAt), иначе `notify(..., { push: owner.notifySocial && names.length === 1 })`; тексты — `respectNotice`. `revalidatePath("/friends")`, `revalidatePath("/guild")`.
Кнопка: `variant` и `aria-pressed` как `KudosButton`; иконка `Trophy`; счётчик (пусто при 0); `aria-label` «Дать респект <ник> за <упражнение>» / «Убрать респект у <ник> за <упражнение>»; `title` — `respectLabel`; на своей записи — без кнопки, но с числом и `title`, если > 0. Строка: «🏆 <упражнение>: <тип> <значение>, …» (`RECORD_LABEL`, `recordText`-логика); длинные названия — `break-words`/`min-w-0`.

- [ ] **Step 1: e2e `e2e/record-respect.spec.ts`** (desktop + mobile, где не сказано иначе; два контекста):
  1. `a friend gives respect to a record; the author is notified once; removing decreases` — автор (рекорды по двум упражнениям) + друзья F1, F2: F1 жмёт кнопку жима дважды быстро → 1 запись (`respectCount`), `aria-pressed=true`, счётчик «1»; у автора уведомление «🏆 Респект за рекорд: <жим>» с телом «<F1>»; F2 жмёт → то же уведомление (одно, `notificationTitles` содержит заголовок один раз) с телом «<F2>, <F1>»; у кнопки приседа счётчик пуст; F1 снимает → «1».
  2. `own record has no button; a workout without records has none; hidden weights keep the button` — автор видит свой рекорд без кнопки; запись без рекордов — нет кнопок; `setPrivacy(author, { hideWeights: true })` → у друга значения весовых рекордов не показаны, кнопка есть.
  3. `a guild mate (not a friend) gives respect in /guild` — уведомление с url `/guild#w-<id>` (`notificationUrls`).
  4. `mobile: no horizontal scroll with a long exercise name` (проект mobile, `scrollWidth - clientWidth === 0`).
- [ ] **Step 2:** `npm run build && npx playwright test e2e/record-respect.spec.ts --workers=8` → FAIL.
- [ ] **Step 3:** реализовать запрос, действие, уведомление, кнопку.
- [ ] **Step 4:** `npm run build && npx playwright test e2e/record-respect.spec.ts e2e/friends.spec.ts e2e/guild.spec.ts --workers=8` → PASS (существующие ленты не сломаны; имена файлов — сверить с `e2e/`); `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 5:** коммит `feat(social): record respect — action, notification, feed button`.

### Task 3: Ачивки за полученные респекты

**Files:**
- Modify: `lib/achievements/definitions.ts` (`AchievementStats.respectsReceived: number`, в пустой статистике `0`; лестница после «Задания клуба»: `fixed: [5, 25, 100]`, `value: s.respectsReceived`, коды/названия/описания/XP — дословно из спеки: `respect:5` «Заметили» XP 30, `respect:25` «Уважаемый» XP 60, `respect:100` «Легенда зала» XP 120, описание «Получить N респектов за рекорды» через `plural`)
- Modify: `lib/achievements/engine.ts` (`respectsReceived` в `getAchievementStats` — `COUNT(*)` респектов на тренировках пользователя)
- Modify: `lib/social/actions.ts` (после `notifyRespect` — `await quietly(() => evaluateAchievementsNow(ownerId), …)` по образцу других мест с `evaluateAchievementsNow`)
- Test: `lib/achievements/definitions.test.ts`; e2e — новый тест в `e2e/record-respect.spec.ts`

- [ ] **Step 1:** unit: `respect ladder: 4 → none, 5 → respect:5 «Заметили», 25 → +respect:25, 100 → +respect:100; category SOCIAL; описания и XP` (по образцу тестов соседних лестниц).
- [ ] **Step 2:** e2e 6 `the fifth respect awards «Заметили»` (desktop): `seedRespects(author, workout, жим, 4)` → друг ставит 5-й через UI → `achievementCodes(author)` содержит `respect:5`; повтор снятия/постановки не выдаёт второй раз.
- [ ] **Step 3:** FAIL → реализовать → `npx vitest run lib/achievements/definitions.test.ts` PASS, `npm run build && npx playwright test e2e/record-respect.spec.ts --workers=8` PASS, `npm run typecheck && npm run lint && npm test` чисто.
- [ ] **Step 4:** коммит `feat(achievements): respect ladder for received record respects`.

### Task 4: «Мои данные», удаление аккаунта, документация

**Files:**
- Modify: `lib/account/export-queries.ts`, `lib/account/export.ts` (+ `export.test.ts`): разделы `respectsGiven: { workoutDate, exercise, to }[]`, `respectsReceived: { workoutDate, exercise, from }[]`, `kudosGiven: { workoutDate, to }[]`, `kudosReceived: { workoutDate, from }[]` (`workoutDate` — `finishedAt` тренировки, ники — `nickname | null`); в `EXPORT_SECTIONS`; в CSV не входят
- Modify: `e2e/account-data.spec.ts` (обе стороны видят 👊 и респект; удаление аккаунта автора → `respectCount` его тренировки 0, у друга в выгрузке `respectsGiven` пуст)
- Modify: `docs/features/social.md` (лента: респекты), `docs/features/game.md` (лестница `respect:*`, категория SOCIAL); `/privacy` — если в разделе про ленту перечислены 👊, добавить респекты

- [ ] **Step 1:** тесты (`export.test.ts` — разделы и отсутствие id; e2e выше) → FAIL.
- [ ] **Step 2:** реализовать; документация.
- [ ] **Step 3:** `npm run build && npx playwright test e2e/account-data.spec.ts --workers=8` PASS; полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` → зелёный (чужие флейки — перезапуск файла отдельно, описать).
- [ ] **Step 4:** коммит `feat(account): respects and kudos in data export`.
