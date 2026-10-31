# Питание, подпроект 2: дневник питания — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дневник на `/nutrition`: записи еды по 4 приёмам с ккал/БЖУ, итог дня против нормы, навигация по дням, «Недавние», «Повторить вчерашний», «Добавить сегодня».

**Architecture:** Таблица `FoodEntry` (местная дата строкой), чистые функции итогов/дат/приёмов в `lib/nutrition/diary.ts`, схема в `food-schema.ts`, запросы и server actions рядом; страница `/nutrition` получает `?date` и рендерит итог дня и блоки приёмов над карточками подпроекта 1.

**Tech Stack:** Next.js 16, Prisma 7, Zod, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-nutrition-diary-design.md`

## Global Constraints

- Флаг `nutrition` везде: страница (уже), каждое действие → `notFound()` без флага.
- Только свои записи: каждое изменение — по `{ id, userId }`.
- Дата — местная (`dayKey(now, user.timeZone)`), будущие не принимаются, не старше `today − 365`.
- Поля: название 1…80 (trim), ккал целое 0…5000, Б/Ж/У 0…500 с шагом 0,1, пусто → `null`, запятая — разделитель.
- Числовые поля — `selectOnFocus`; цвета — семантические токены (`primary`, `destructive`); ссылка-кнопка — `buttonVariants`.
- Ошибки формы возвращают `values` (форма React сбрасывается после action).
- Миграция — проверить SQL (частичные индексы не трогать), затем `npx prisma generate`.
- Новая связь с `User` → «Мои данные» (раздел `food`) и каскадное удаление.

## Review Focus

1. Повторное «Повторить вчерашний» (двойной клик) не задваивает записи — проверка «приём пуст» внутри транзакции; e2e в Task 5 кликает дважды.
2. Чужой id в `update`/`delete`/`copy` → ничего не меняется и нет 500 — в коде только `updateMany`/`deleteMany`/`findFirst` с `userId` (Task 3); тестом не покрыто, ревьюер проверяет явно.
3. `?date=` мусор или будущее → сегодня, без ошибки — тест `parseDiaryDate` в Task 1 и e2e `?date=2999-01-01` в Task 5.
4. Добавление в прошлый день сохраняет запись в этот день, а не в сегодня — e2e в Task 5.
5. Название «Овсянка» и «овсянка» — одна позиция в «Недавних» — проверка в e2e Task 5.

---

### Task 1: Чистые функции и схема

**Files:**
- Create: `lib/nutrition/diary.ts`, `lib/nutrition/food-schema.ts`
- Test: `lib/nutrition/diary.test.ts`, `lib/nutrition/food-schema.test.ts`

**Interfaces:**
- Produces:
  - `type Meal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK"`, `MEALS: Meal[]` (в этом порядке), `MEAL_LABELS: Record<Meal, string>` («Завтрак», «Обед», «Ужин», «Перекус»).
  - `defaultMeal(hour: number): Meal`.
  - `type Macros = { kcal: number; protein: number; fat: number; carbs: number }`; `dayTotals(entries: { meal: Meal; kcal: number; protein: number | null; fat: number | null; carbs: number | null }[]): { total: Macros; byMeal: Record<Meal, Macros> }` (граммы — до 0,1).
  - `balance(eaten: number, norm: number): { left: number } | { over: number }` (`eaten <= norm` → `left`).
  - `parseDiaryDate(raw: string | string[] | undefined, today: string): string`; `MAX_DIARY_DAYS = 365`.
  - `foodEntrySchema` (Zod): `meal`, `name`, `kcal`, `protein`, `fat`, `carbs`; `type FoodEntryInput`.

- [ ] **Step 1: Write failing tests**
  - `defaultMeal`: 10 → BREAKFAST, 11 → LUNCH, 15 → LUNCH, 16 → DINNER, 20 → DINNER, 21 → SNACK, 3 → BREAKFAST.
  - `dayTotals`: две записи завтрака (300 ккал, Б 10; 200 ккал, Б null, Ж 5.55) и ужин 500 → `total` `{ kcal: 1000, protein: 10, fat: 5.6, carbs: 0 }`, `byMeal.BREAKFAST.kcal` 500, `byMeal.LUNCH` нули.
  - `balance(1450, 2760)` → `{ left: 1310 }`; `balance(2880, 2760)` → `{ over: 120 }`; `balance(2760, 2760)` → `{ left: 0 }`.
  - `parseDiaryDate`: `"2026-10-30"` при today `"2026-10-31"` → `"2026-10-30"`; `undefined`, `"abc"`, `["x"]`, `"2026-02-30"`, `"2026-11-01"` → today; `"2025-01-01"` → `"2025-10-31"`.
  - `foodEntrySchema`: `{ meal: "LUNCH", name: "  Гречка  ", kcal: "350", protein: "12,5", fat: "", carbs: "60" }` → `{ meal: "LUNCH", name: "Гречка", kcal: 350, protein: 12.5, fat: null, carbs: 60 }`; ошибки: `name` "" и 81 символ, `kcal` "-1"/"5001"/"12.5", `protein` "501", `meal` "X".
- [ ] **Step 2: Run** `npx vitest run lib/nutrition/diary.test.ts lib/nutrition/food-schema.test.ts` → FAIL (модули не найдены).
- [ ] **Step 3: Implement** per Interfaces (`parseDiaryDate` — `^\d{4}-\d{2}-\d{2}$` и проверка, что `new Date(raw + "T00:00:00Z")` даёт ту же дату; сравнение строк; нижняя граница — `addDays(today, -365)` из `lib/dates`).
- [ ] **Step 4: Run** те же тесты → PASS.
- [ ] **Step 5: Commit** `feat(nutrition): diary totals, meals, dates and entry schema`.

### Task 2: Модель, «Мои данные», /privacy

**Files:**
- Modify: `prisma/schema.prisma` (enum `Meal`, модель `FoodEntry`, `foodEntries FoodEntry[]` в `User`), миграция `npx prisma migrate dev --name food_entries`
- Modify: `lib/account/export-queries.ts` (запрос `db.foodEntry.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], select: { date, meal, name, kcal, protein, fat, carbs, createdAt } })` → поле `food`), `lib/account/export.ts` (`food: unknown[]` в типе, ключ в списке разделов рядом с `bodyWeight`, `food: raw.food`), `lib/account/export.test.ts`
- Modify: `app/(marketing)/privacy/page.tsx` (пункт о данных для нормы: «…и дневник питания (что и сколько вы съели), если вы его ведёте»)

- [ ] **Step 1: Test** — в `export.test.ts` фикстура `food: [{ date: "2026-10-30", meal: "BREAKFAST", name: "Овсянка", kcal: 300, protein: 10, fat: null, carbs: 50, createdAt: … }]`, ожидание `out.food[0].name === "Овсянка"`.
- [ ] **Step 2: Run** `npx vitest run lib/account` → FAIL.
- [ ] **Step 3: Implement** схема + миграция (проверить SQL) + `npx prisma generate` + выгрузка + /privacy.
- [ ] **Step 4: Run** `npx vitest run lib/account && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(nutrition): food entries table, my data, privacy`.

### Task 3: Запросы и действия

**Files:**
- Create: `lib/nutrition/food-queries.ts`, `lib/nutrition/food-actions.ts`

**Interfaces:**
- Consumes: Task 1 (`foodEntrySchema`, `parseDiaryDate`, `Meal`), `dayKey` (`lib/daily-login`), `addDays` (`lib/dates`).
- Produces:
  - `type FoodEntryRow = { id: string; meal: Meal; name: string; kcal: number; protein: number | null; fat: number | null; carbs: number | null }`.
  - `getDiaryDay(userId: string, date: string): Promise<{ entries: FoodEntryRow[]; yesterdayMeals: Meal[] }>`.
  - `type RecentFood = { name: string; kcal: number; protein: number | null; fat: number | null; carbs: number | null }`; `getRecentFoods(userId: string, today: string): Promise<RecentFood[]>` — один `$queryRaw`: окно `date >= today − 30`, `GROUP BY lower(name)`, `ORDER BY count(*) DESC, max(createdAt) DESC`, `LIMIT 8`; значения — из последней записи группы (`DISTINCT ON` в подзапросе или `array_agg(... ORDER BY createdAt DESC)[1]`).
  - `type FoodFormState = { ok?: boolean; errors?: Partial<Record<keyof FoodEntryInput, string[]>>; values?: Record<string, string> }`.
  - `addFoodEntryAction(date: string, _prev: FoodFormState, formData: FormData): Promise<FoodFormState>` (дата — `parseDiaryDate(date, today)`: будущая или мусорная превращается в сегодня, старше года — в границу года);
  - `updateFoodEntryAction(id: string, _prev: FoodFormState, formData: FormData): Promise<FoodFormState>` (`updateMany({ where: { id, userId } })`, `count === 0` → `{ errors: { name: ["Запись не найдена"] } }`);
  - `deleteFoodEntryAction(id: string): Promise<void>` (`deleteMany({ where: { id, userId } })`);
  - `copyFoodEntryToTodayAction(id: string): Promise<void>`;
  - `repeatYesterdayMealAction(date: string, meal: Meal): Promise<void>` — `$transaction`: если в `(date, meal)` есть записи — выход; иначе `createMany` копий из `(date − 1, meal)` с сохранением порядка.

- [ ] **Step 1: Implement** (логика ветвлений — в чистых функциях Task 1; запросы проверяет e2e Task 5).
- [ ] **Step 2: Run** `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 3: Commit** `feat(nutrition): diary queries and actions`.

### Task 4: Интерфейс

**Files:**
- Create: `components/nutrition/day-nav.tsx`, `components/nutrition/day-summary.tsx`, `components/nutrition/meal-block.tsx`, `components/nutrition/food-entry-dialog.tsx`
- Modify: `app/(app)/nutrition/page.tsx` (`searchParams.date` → `parseDiaryDate`, `getDiaryDay`, `getRecentFoods`), `components/nutrition/profile-dialog.tsx` (если нужно открыть анкету из «Посчитать норму» — переиспользовать `NutritionProfileDialog` с `label="Посчитать норму"` и `variant`-ссылкой)

**Interfaces:**
- Consumes: Task 1 (`dayTotals`, `balance`, `MEALS`, `MEAL_LABELS`), Task 3 (запросы, действия), `getNutritionView` (норма).
- Produces (для e2e):
  - навигация: ссылки «Предыдущий день» / «Следующий день» (`aria-label`); на сегодня «Следующий день» — `aria-disabled="true"` без `href`; заголовок дня «Сегодня» / «Вчера» / «30 октября».
  - `region` «Итог дня»: `data-testid="day-kcal"` с текстом вида «1 450 / 2 760 ккал» (без нормы — «1 450 ккал»), строка «Осталось 1 310» или «+120 сверх нормы».
  - `region` с именем приёма («Завтрак» …): сумма «500 ккал», `listitem` на запись (название, «Б 10 · Ж 5,6 · У 50», «300 ккал»), кнопка «Добавить», у пустого приёма при вчерашних записях — «Повторить вчерашний», меню записи — кнопка `aria-label="Действия: <название>"` с пунктами «Изменить», «Удалить», «Добавить сегодня» (только не на сегодня).
  - Диалог `role="dialog"` «Добавить: Завтрак» / «Изменить запись»: радио приёмов по `MEAL_LABELS`, поля «Название», «Ккал», «Белки, г», «Жиры, г», «Углеводы, г», группа кнопок «Недавние» (кнопка на позицию с текстом названия), «Сохранить».

- [ ] **Step 1: Implement** компоненты и страницу (порядок: навигация, итог дня, 4 блока, затем `NormCard`, `BurnCard`).
- [ ] **Step 2: Run** `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 3: Commit** `feat(nutrition): diary UI on /nutrition`.

### Task 5: e2e и документация

**Files:**
- Create: `e2e/nutrition-diary.spec.ts`
- Modify: `e2e/db.ts` (`addFoodEntry(login, { date, meal, name, kcal, protein? })`), `e2e/account-data.spec.ts` (раздел `food`), `docs/features/nutrition.md`

- [ ] **Step 1: Write e2e** (флаг через `addFlagUser`, даты — через `E2E_TZ`):
  - `add breakfast → meal total and day total; with a profile shows what is left` — `setNutritionProfile` + `logWeight` 80 (норма 2 760 при мужском поле — пол через анкету или `gender` в хелпере), «Добавить» в «Завтрак», «Овсянка», 300, Б 10 → в блоке «300 ккал», `day-kcal` «300 / 2 760 ккал», «Осталось 2 460».
  - `edit and delete an entry`.
  - `recent foods fill the form; case-insensitive` — две записи из БД «Овсянка» и «овсянка» вчера → в «Недавних» одна кнопка «Овсянка» (последнее написание), клик заполняет «Ккал».
  - `repeat yesterday's meal, double click does not duplicate` — вчерашний завтрак из БД (2 записи), сегодня «Повторить вчерашний» (двойной клик) → ровно 2 записи.
  - `add to today from yesterday` — `?date=<вчера>`, меню записи → «Добавить сегодня» → на сегодня запись есть, вчера осталась.
  - `adding on a past day saves to that day` — `?date=<вчера>`, «Добавить» → запись видна во вчерашнем дне, сегодня пусто.
  - `next day is disabled on today; a future date opens today` — `?date=2999-01-01` → заголовок «Сегодня», «Следующий день» с `aria-disabled="true"`.
  - `over the norm shows +N` — анкета + запись 3 000 ккал → «+240 сверх нормы».
  - `account-data.spec.ts`: после `addFoodEntry` выгрузка содержит `food[0].name`.
- [ ] **Step 2: Run** `npm run build && npx playwright test e2e/nutrition-diary.spec.ts e2e/nutrition.spec.ts e2e/account-data.spec.ts --workers=8` → PASS.
- [ ] **Step 3: Docs** — раздел «Дневник» в `docs/features/nutrition.md`.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 5: Commit** `test(nutrition): diary e2e, my data; docs`.
