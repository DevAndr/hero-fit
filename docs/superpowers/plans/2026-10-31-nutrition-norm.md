# Питание, подпроект 1: норма и расход — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/nutrition` под флагом `nutrition`: анкета, дневная норма ккал и БЖУ, «≈ N ккал» за тренировки (MET или WHOOP), плитка в сводке тренировки.

**Architecture:** Расчёты — чистые функции в `lib/nutrition/` (норма, расход, схема), данные — четыре nullable-поля `User` + существующие `gender` и `BodyWeightEntry`, запросы собирают состав тренировок и вес на дату, страница — серверный компонент с клиентским диалогом анкеты.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, Zod, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-nutrition-norm-design.md`

## Global Constraints

- Всё под флагом `nutrition` (`isEnabled("nutrition", userId)` / `useFlag("nutrition")`); без флага `/nutrition` → `notFound()`.
- Цвета — только семантические токены; ссылка-кнопка — `<Link className={buttonVariants()}>`.
- Числовые поля анкеты — `selectOnFocus` (`components/ui/select-on-focus.ts`).
- Все тексты на русском, оценка расхода всегда с «≈».
- Границы: рост 120…230, год рождения 1926…(текущий год − 14), вес 30…300.
- Коэффициенты: `SEDENTARY` 1.2, `LIGHT` 1.375, `MODERATE` 1.55, `HIGH` 1.725, `VERY_HIGH` 1.9; цель `LOSE` 0.85, `MAINTAIN` 1, `GAIN` 1.10; минимум 1200 (жен.) / 1500 (муж.); норма — до 10, расход — до 5.
- MET: `REPS` 5.0, `TIME` 4.0, `CARDIO` 7.0, `STRETCH` 2.5.
- Миграция: проверить SQL — не удалять частичные индексы (`CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`, `StretchCourse_active`).
- После смены схемы — `npx prisma generate`.

## Review Focus

1. Вес в журнале записан только после даты тренировки → берём самую раннюю запись (не `null`, иначе у новичков расхода нет) — тест в Task 1 (`weightOn`).
2. Тренировка только из разминки или без отмеченных подходов → `null`, а не MET 0 или деление на ноль — тест в Task 1.
3. WHOOP подключён, но карточка не `data` (pending/нет совпадения) → откат на MET — тест в Task 3 (логика `pickKcal` в `burn.ts`, unit в Task 1).
4. Пол в настройках не указан → в анкете не выбран, сохранение без пола — ошибка поля, а не 500 — тест схемы в Task 1 и e2e в Task 5.
5. Граница возраста: `birthYear = текущий − 14` проходит, `− 13` — нет — тест схемы в Task 1.

---

### Task 1: Чистые расчёты и схема

**Files:**
- Create: `lib/nutrition/norm.ts`, `lib/nutrition/burn.ts`, `lib/nutrition/schema.ts`
- Test: `lib/nutrition/norm.test.ts`, `lib/nutrition/burn.test.ts`, `lib/nutrition/schema.test.ts`

**Interfaces:**
- Produces:
  - `type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "HIGH" | "VERY_HIGH"`, `type NutritionGoal = "LOSE" | "MAINTAIN" | "GAIN"` (строки совпадают с enum Prisma из Task 2; в `norm.ts` — свои типы, чтобы файл был чистым), `ACTIVITY_FACTORS: Record<ActivityLevel, number>`, `GOAL_FACTORS: Record<NutritionGoal, number>`, `ACTIVITY_LABELS`, `GOAL_LABELS` (подписи и пояснения из спеки).
  - `dailyNorm(i: { gender: "MALE" | "FEMALE" | null; birthYear: number | null; heightCm: number | null; weightKg: number | null; activity: ActivityLevel | null; goal: NutritionGoal | null }, year: number): Norm | null`, где `Norm = { kcal: number; protein: number; fat: number; carbs: number; bmr: number; factor: number; goalPct: number }` (`goalPct`: −15 / 0 / 10; `bmr` округлён до целого).
  - `MET: Record<"REPS" | "TIME" | "CARDIO" | "STRETCH", number>`; `workoutKcal(i: { kinds: ("REPS" | "TIME" | "CARDIO" | "STRETCH")[]; durationSec: number | null; weightKg: number | null; whoopKcal: number | null }): { kcal: number; source: "met" | "whoop" } | null` — `kinds` по одному элементу на выполненный рабочий подход.
  - `weightOn(entries: { date: string; weight: number }[], date: string): number | null` — последняя запись с `date <= date`, иначе самая ранняя, пустой список → `null` (в `burn.ts`).
  - `nutritionProfileSchema` (Zod, `lib/nutrition/schema.ts`) — поля `gender`, `birthYear`, `heightCm`, `weight`, `activity`, `goal`; числа через `z.coerce`; `type NutritionProfileInput = z.infer<…>`; верхняя граница года — `new Date().getFullYear() - 14` при разборе.

- [ ] **Step 1: Write failing tests**

`norm.test.ts`:
- `dailyNorm({ gender: "MALE", birthYear: 1996, heightCm: 180, weightKg: 80, activity: "MODERATE", goal: "MAINTAIN" }, 2026)` → `bmr` 1780 (10·80 + 6.25·180 − 5·30 + 5), `kcal` 2760 (1780·1.55 = 2759 → 2760), `goalPct` 0, `protein` 144, `fat` 72, `carbs` `Math.round((2760 − 4·144 − 9·72) / 4)` = 384.
- то же с `gender: "FEMALE"` → `bmr` 1614, `kcal` 2500 (1614·1.55 = 2501.7 → 2500).
- `goal: "LOSE"` (мужчина) → `kcal` 2350 (2759·0.85 = 2345.2 → 2350), `protein` 160 (2.0 г/кг), `goalPct` −15; `GAIN` → 3030 (2759·1.1 = 3034.9 → 3030), `goalPct` 10.
- минимум: `FEMALE`, 45 кг, 150 см, 1956, `SEDENTARY`, `LOSE` → `kcal` 1200.
- углеводы не меньше 0: вес 150 кг, рост 150, `FEMALE`, 1950, `SEDENTARY`, `LOSE` → `carbs >= 0`.
- любой `null` из шести полей → `null`.

`burn.test.ts`:
- `workoutKcal({ kinds: ["REPS","REPS","REPS"], durationSec: 3600, weightKg: 80, whoopKcal: null })` → `{ kcal: 400, source: "met" }`.
- смешанный `["REPS","CARDIO"]`, 1800 с, 70 кг → MET 6.0 → 210.
- `whoopKcal: 512` → `{ kcal: 512, source: "whoop" }` даже без веса.
- `kinds: []` или `weightKg: null` или `durationSec: null`/0 → `null`.
- `weightOn([{date:"2026-10-01",weight:80},{date:"2026-10-10",weight:78}], "2026-10-05")` → 80; `"2026-10-20"` → 78; `"2026-09-01"` → 80; `[]` → `null`.

`schema.test.ts`:
- валидный ввод (строки из формы) проходит и даёт числа;
- `birthYear` = текущий − 14 проходит, − 13 — ошибка; рост 119/231, вес 29/301 — ошибки;
- без `gender` — ошибка поля `gender`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/nutrition`
Expected: FAIL (модули не найдены)

- [ ] **Step 3: Implement `norm.ts`, `burn.ts`, `schema.ts` per Interfaces**

Округления: `kcal` — `Math.round(x / 10) * 10` после применения минимума к неокруглённому; расход — `Math.round(x / 5) * 5`. MET — среднее арифметическое по `kinds`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/nutrition`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/nutrition
git commit -m "feat(nutrition): daily norm, workout burn and profile schema"
```

### Task 2: Схема БД, флаг, действия, «Мои данные», /privacy

**Files:**
- Modify: `prisma/schema.prisma` (enum `ActivityLevel`, `NutritionGoal`; в `User`: `heightCm Int?`, `birthYear Int?`, `activityLevel ActivityLevel?`, `nutritionGoal NutritionGoal?` с `///`-комментарием про спеку)
- Create: `prisma/migrations/<ts>_nutrition_profile/migration.sql` (через `npx prisma migrate dev --name nutrition_profile`)
- Modify: `lib/flags/registry.ts` (`nutrition`: «Питание: норма калорий и БЖУ, расход на тренировках», `expires: "2027-06-30"`)
- Create: `lib/nutrition/actions.ts`
- Modify: `lib/account/export.ts` (`PROFILE_FIELDS` += четыре поля), `lib/account/export-queries.ts` при необходимости, `lib/account/export.test.ts`
- Modify: `app/(marketing)/privacy/page.tsx` (пункт про рост, год рождения, активность и цель питания)

**Interfaces:**
- Consumes: `nutritionProfileSchema` (Task 1); `writeWeight(tx, userId, tz, weight)` из `lib/goals/mutations.ts`.
- Produces:
  - `saveNutritionProfileAction(_prev: NutritionFormState, formData: FormData): Promise<NutritionFormState>`, `type NutritionFormState = { ok?: boolean; errors?: Partial<Record<keyof NutritionProfileInput, string[]>> }` — `requireUser`, без флага — `notFound()`, разбор схемы (ошибки → `{ errors }`), в транзакции `user.update` (четыре поля + `gender`) и `writeWeight`; `revalidatePath("/nutrition")`.
  - `clearNutritionProfileAction(): Promise<void>` — обнуляет четыре поля, `revalidatePath("/nutrition")`.

- [ ] **Step 1: Обновить `export.test.ts`** — ожидаемый профиль содержит `heightCm`, `birthYear`, `activityLevel`, `nutritionGoal`.
- [ ] **Step 2: Run** `npx vitest run lib/account` → FAIL.
- [ ] **Step 3: Схема, миграция (`npx prisma migrate dev --name nutrition_profile`, проверить SQL), `npx prisma generate`, флаг, `PROFILE_FIELDS`, actions, текст /privacy.**
- [ ] **Step 4: Run** `npx vitest run lib/account lib/flags && npm run typecheck` → PASS.
- [ ] **Step 5: Commit**

```bash
git add prisma lib/flags lib/nutrition/actions.ts lib/account "app/(marketing)/privacy"
git commit -m "feat(nutrition): profile fields, flag, save/clear actions, my data"
```

### Task 3: Запросы

**Files:**
- Create: `lib/nutrition/queries.ts`

**Interfaces:**
- Consumes: `dailyNorm`, `workoutKcal`, `weightOn` (Task 1); `whoopAvailable`, `getWhoopCard` (`lib/whoop/queries.ts`; WHOOP-ккал = `card.kind === "data" ? card.summary.kcal : null`); `dayKey`, `localMidnight` (как в `lib/stats/queries.ts`).
- Produces:
  - `getNutritionView(userId: string, tz: string, now: Date): Promise<NutritionView>`,
    `NutritionView = { profile: { gender, birthYear, heightCm, weightKg, activity, goal }; norm: Norm | null; hasWeight: boolean; burn: { totalKcal: number; days: { date: string; kcal: number }[]; workouts: { id: string; name: string; finishedAt: Date; kcal: number; source: "met" | "whoop" }[] } }` — 7 местных дней, включая сегодня; тренировки `COMPLETED` с `finishedAt` в окне; `kinds` — выполненные (`completedAt` не null) не-разминочные подходы; тренировки с `null`-оценкой в список не входят.
  - `getWorkoutBurn(userId: string, workout: { id: string; durationSec: number | null; finishedAt: Date | null }, tz: string): Promise<{ kcal: number; source: "met" } | null>` — без WHOOP (в сводке при WHOOP-карточке плитка не показывается).

- [ ] **Step 1: Implement** (запросов БД не мокаем; логика — в чистых функциях Task 1, проверка — e2e Task 5).
- [ ] **Step 2: Run** `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 3: Commit**

```bash
git add lib/nutrition/queries.ts
git commit -m "feat(nutrition): nutrition view and workout burn queries"
```

### Task 4: Интерфейс

**Files:**
- Modify: `components/app/nav.ts` (`NUTRITION_NAV_ITEM = { href: "/nutrition", label: "Питание", icon: Apple, mobile: false }`), `components/app/nav-links.tsx` (после «Целей» при `useFlag("nutrition")`), `components/app/user-menu.tsx` (пункт `lg:hidden`, как «Растяжка»)
- Create: `app/(app)/nutrition/page.tsx`, `components/nutrition/norm-card.tsx`, `components/nutrition/burn-card.tsx`, `components/nutrition/profile-dialog.tsx`
- Modify: `app/(app)/workouts/[id]/page.tsx` + `components/workouts/workout-summary-view.tsx` (проп `burnKcal?: number | null`, плитка «≈ N ккал» при отсутствии `whoopCard`)

**Interfaces:**
- Consumes: `getNutritionView`, `getWorkoutBurn` (Task 3); actions (Task 2); `ACTIVITY_LABELS`, `GOAL_LABELS` (Task 1).
- Produces (для e2e): регионы `aria-label` «Норма на день», «Расход на тренировках»; кнопки «Заполнить», «Изменить данные»; диалог `role="dialog"` с именем «Данные для нормы», поля с подписями «Год рождения», «Рост, см», «Вес, кг», радио «Мужской»/«Женский», варианты активности и цели как радио с подписями из `ACTIVITY_LABELS`/`GOAL_LABELS`, кнопки «Сохранить», «Очистить данные питания» (+ `alertdialog` с «Очистить»); `data-testid="norm-kcal"` с числом ккал (`toLocaleString("ru-RU")`), `data-testid="burn-total"`; в сводке — плитка с подписью «Ккал» и значением «≈ N».

Строка расчёта: `Основной обмен {bmr} × {factor} ({активность}) {− 15 % (похудение) | + 10 % (набор) | пусто}`; столбики по дням — простые `div` с высотой в процентах от максимума (без библиотеки графиков), подписи дней «пн…вс».

- [ ] **Step 1: Implement** компоненты и страницу; `page.tsx`: `requireUser`, флаг → `notFound()`, `getNutritionView(user.id, safeTimeZone(user.timeZone), new Date())`.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint` → чисто.
- [ ] **Step 3: Commit**

```bash
git add components app
git commit -m "feat(nutrition): /nutrition page, profile dialog, burn tile in summary"
```

### Task 5: e2e и документация

**Files:**
- Create: `e2e/nutrition.spec.ts`
- Modify: `e2e/account-data.spec.ts` (поля питания в выгрузке), `e2e/db.ts` (хелпер `setNutritionProfile(login, {...})` при необходимости)
- Create: `docs/features/nutrition.md`; Modify: `CLAUDE.md` (строка `docs/features/nutrition.md` в «Фичи — подробности»)

**Interfaces:**
- Consumes: `addFlagUser`, `seedWorkouts`, `logWeight` (`e2e/db.ts`), `registerUser` (`e2e/helpers.ts`).

- [ ] **Step 1: Write e2e**
  - `without the flag /nutrition is 404 and there is no menu item` — `page.goto` → статус 404; на `/dashboard` нет ссылки «Питание».
  - `empty state → profile → norm and macros` — флаг, «Заполнить», мужчина 1996/180/80, «Средняя активность», «Поддержание» → `norm-kcal` = «2 760», белок «144 г», жиры «72 г», углеводы «384 г», строка расчёта содержит «1780 × 1,55».
  - `saving without gender shows a field error` — в анкете пол не выбран → ошибка поля, диалог открыт.
  - `burn: a seeded workout with weight shows ≈ kcal on /nutrition and in the summary` — `logWeight(login, <дата 3 дня назад>, 80)`, `seedWorkouts(login, "Жим лёжа", [{ weight: 60, reps: 10, sets: 3 }])` (1 ч, вчера) → `burn-total` = «≈ 400 ккал», в сводке тренировки плитка «≈ 400».
  - `clear returns the empty state` — после анкеты «Очистить данные питания» → «Очистить» → снова «Заполнить».
  - В `account-data.spec.ts`: после анкеты выгрузка содержит `heightCm: 180`, `activityLevel: "MODERATE"`.
- [ ] **Step 2: Run** `npm run build && npx playwright test e2e/nutrition.spec.ts e2e/account-data.spec.ts --workers=8` → PASS.
- [ ] **Step 3: Docs** — `docs/features/nutrition.md` (модель, формулы, MET, флаг, файлы, e2e), строка в `CLAUDE.md`.
- [ ] **Step 4: Full checks** — `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 5: Commit**

```bash
git add e2e docs CLAUDE.md
git commit -m "test(nutrition): e2e for norm, burn and my data; docs"
```
