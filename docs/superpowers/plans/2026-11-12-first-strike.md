# «Первый удар» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** новичок без завершённых тренировок может один раз нанести боссу недели «Первый удар» — один подход упражнения без инвентаря — и получить 100 урона, 30 XP и ачивку.

**Architecture:** удар — отметка `User.firstStrikeAt` и запись `XpEvent(FIRST_STRIKE)`; новых таблиц нет. Урон добавляется в `weekDamage` по дате отметки. Интерфейс — один клиентский хост на дашборде (карточка + диалог), экскурсия ведёт в него через `/dashboard?strike=1`.

**Tech Stack:** Next.js 16 (server actions), Prisma 7, Vitest, Playwright, shadcn/ui (Base UI).

**Spec:** `docs/superpowers/specs/2026-11-12-first-strike-design.md`

## Global Constraints

- Ветка `feat/first-strike` (от `release/2028-09-first-strike`). Общение и отчёты — только по-русски.
- Всё под флагом `first_strike`; без флага поведение приложения не меняется.
- `FIRST_STRIKE_DAMAGE = 100`, `FIRST_STRIKE_XP = 30`; повторы 1–200, секунды планки 5–600; значения формы по умолчанию 10 и 30.
- Удар не трогает: серию недель, `User.weekWorkouts`, счётчик тренировок, статистику, лигу (`LEAGUE_REASONS` — белый список, не менять), гильдию, клуб, рейд, цели, итоги недели (кроме урона босса через `weekDamage`).
- Цвета — только семантические токены; анимации конечные и с учётом «уменьшить движение»; числовое поле — с `selectOnFocus`.
- Перед кодом Next.js сверяться с `node_modules/next/dist/docs/`. После миграции — `npx prisma generate`. Проверить SQL миграции: частичные индексы (`CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`, `StretchCourse_active`) не должны удаляться.
- E2e: даты только через `e2e/tz.ts`; флаг пользователю — `addFlagUser("first_strike", login)` (`e2e/db.ts`); экскурсия в e2e выключена, включается `resetOnboarding(login)`.
- Проверки каждой задачи: `npm run typecheck && npm run lint && npm test`; e2e — `npm run build && npx playwright test e2e/first-strike.spec.ts --workers=4`.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. Две вкладки или двойной клик «Ударить» — награда одна, вторая попытка получает «Первый удар уже нанесён» (тест в задаче 3).
2. После удара пользователь завершает настоящую тренировку на той же неделе — HP босса учитывает и удар, и тренировку, а «Урон боссу» в сводке показывает только урон тренировки (тест в задаче 3).
3. У пользователя есть только завершённая растяжка (`stretchOnly`) — удар доступен (unit в задаче 1, запрос в задаче 2).
4. Флаг выключили после удара — урон и ачивка остаются, карточка не появляется (тест в задаче 3).
5. Экскурсию перезапустили из `/settings` уже после удара — на шаге босса кнопки «Ударить сейчас» нет (тест в задаче 4).

---

### Task 1: Данные и правила

**Files:**
- Modify: `prisma/schema.prisma` (`User.firstStrikeAt DateTime?`, `XpReason.FIRST_STRIKE`), новая миграция `first_strike`
- Modify: `lib/flags/registry.ts` (флаг `first_strike`, описание «Первый удар: мини-тренировка для новичка», `expires: "2027-05-31"`)
- Modify: `lib/analytics/goals.ts` (`"first_strike"` в `GOALS`), `lib/auth/dal.ts` (`CurrentUser.firstStrikeAt: Date | null` + select)
- Create: `lib/first-strike/rules.ts`, `lib/first-strike/rules.test.ts`

**Interfaces:**
- Produces:
  - `FIRST_STRIKE_DAMAGE = 100`, `FIRST_STRIKE_XP = 30`
  - `type StrikeExercise = "squat" | "pushup" | "plank"`
  - `STRIKE_EXERCISES: readonly { code: StrikeExercise; label: string; unit: "reps" | "sec"; defaultValue: number }[]` — «Приседания» 10, «Отжимания» 10, «Планка» 30
  - `canStrike(p: { flag: boolean; firstStrikeAt: Date | null; completedWorkouts: number }): boolean`
  - `parseStrike(exercise: unknown, value: unknown): { ok: true; exercise: StrikeExercise; value: number } | { ok: false; error: string }`

- [ ] **Step 1: тесты `rules.test.ts`**

```ts
expect(canStrike({ flag: true, firstStrikeAt: null, completedWorkouts: 0 })).toBe(true);
expect(canStrike({ flag: false, firstStrikeAt: null, completedWorkouts: 0 })).toBe(false);
expect(canStrike({ flag: true, firstStrikeAt: new Date(), completedWorkouts: 0 })).toBe(false);
expect(canStrike({ flag: true, firstStrikeAt: null, completedWorkouts: 1 })).toBe(false);

expect(parseStrike("squat", 10)).toEqual({ ok: true, exercise: "squat", value: 10 });
expect(parseStrike("pushup", "200")).toEqual({ ok: true, exercise: "pushup", value: 200 });
expect(parseStrike("plank", 5)).toMatchObject({ ok: true });
for (const [e, v] of [["squat", 0], ["squat", 201], ["squat", 1.5], ["squat", ""], ["plank", 4], ["plank", 601], ["burpee", 10], ["squat", null]] as const)
  expect(parseStrike(e, v).ok).toBe(false);
expect(parseStrike("squat", 0)).toEqual({ ok: false, error: "Повторов — от 1 до 200" });
expect(parseStrike("plank", 4)).toEqual({ ok: false, error: "Секунд — от 5 до 600" });
expect(parseStrike("burpee", 10)).toEqual({ ok: false, error: "Выберите упражнение" });
```

- [ ] **Step 2:** `npm test -- lib/first-strike` — падает (модуля нет).
- [ ] **Step 3:** схема, миграция (`npx prisma migrate dev --name first_strike`, просмотреть SQL), `npx prisma generate`, флаг, цель, `CurrentUser`, `rules.ts`.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` — зелёные (тесты реестра флагов и целей Метрики могут требовать правок списков — обновить).
- [ ] **Step 5:** коммит `feat(first-strike): данные, флаг и правила`.

---

### Task 2: Сервер — удар, урон, ачивка, выгрузка

**Files:**
- Create: `lib/first-strike/queries.ts`, `lib/first-strike/actions.ts`
- Modify: `lib/boss/queries.ts` (`weekDamage`), `lib/achievements/definitions.ts` (+ тест рядом), `lib/achievements/engine.ts` (`getAchievementStats`), `lib/account/export.ts` (`PROFILE_FIELDS` + `firstStrikeAt`) и `lib/account/export-queries.ts` при необходимости, `lib/account/export.test.ts`, `app/(marketing)/privacy/page.tsx` только если там перечисляются поля профиля

**Interfaces:**
- Consumes: всё из Task 1; `getOrCreateBossWeek`, `getBossView` (`lib/boss/queries.ts`); `evaluateAchievements(tx, userId)`; `queueGoal`; `getOnboardingPrograms()`; `isEnabled("first_strike", userId)`.
- Produces:
  - `getStrikeOffer(user: { id: string; firstStrikeAt: Date | null }): Promise<boolean>` — `false` без запроса к БД, если `firstStrikeAt` задан или флаг выключен; иначе считает `Workout` со `status = COMPLETED` и `stretchOnly = false` и возвращает `canStrike(...)`.
  - `firstStrikeAction(input: { exercise: string; value: number }): Promise<StrikeResult>`
  - ```ts
    type StrikeResult =
      | { ok: true; xp: number; damage: number; xpBefore: number; xpAfter: number; boss: BossView;
          achievement: NewAchievement | null; hasDraft: boolean; programs: OnboardingProgram[] }
      | { ok: false; error: string };
    ```
    `xpAfter` — XP пользователя после удара и ачивок; `boss` — `getBossView` после удара; `hasDraft` — есть своя тренировка `PLANNED` или `IN_PROGRESS`; `programs` — пусто, если `hasDraft`.
  - `AchievementStats.firstStrike: boolean`; ачивка `firststrike:1`, категория `"BOSS"`, название «Первый удар», описание «Нанести боссу первый удар», `xpReward: 20`. В `nextGoals` не попадает (нет следующего порога, пока не получена — исключить из целей).

- [ ] **Step 1: unit-тесты**
  - `definitions`: при `firstStrike: true` в `earnedAchievements` есть `firststrike:1`, при `false` — нет; `nextGoals` для статистики по умолчанию не содержит `firststrike:1`.
  - `export.test.ts`: профиль выгрузки содержит `firstStrikeAt`.
- [ ] **Step 2:** `npm test` — новые тесты падают.
- [ ] **Step 3: `weekDamage`** — после `damageByWeek` прибавить `FIRST_STRIKE_DAMAGE` к `damage`, если `User.firstStrikeAt` попадает в неделю `week` в поясе `tz` (`weekKey(firstStrikeAt, tz) === week`); `crits` и `workouts` не меняются. `damageByWeek` не трогать (история HP и бестиарий — без удара).
- [ ] **Step 4: `firstStrikeAction`** — порядок из спеки: `requireUser`, флаг (`{ ok: false, error: "Недоступно" }`), `parseStrike`; транзакция: счётчик завершённых обычных тренировок (есть — `"Первый удар — только до первой тренировки"`), условный `updateMany({ where: { id, firstStrikeAt: null } })` (0 строк — `"Первый удар уже нанесён"`), `XpEvent` c `meta: { exercise, value }`, прибавка `xp` и пересчёт `level` (как в `lib/boss/actions.ts`), `getOrCreateBossWeek` и победа тем же условным `updateMany` по `defeatedAt`, что в `applyBoss` (`lib/workouts/finish.ts`), `evaluateAchievements`. После транзакции — `queueGoal("first_strike")`, сбор ответа. `revalidatePath` не вызывать: экран результата живёт в диалоге, страницу обновляет клиент при закрытии.
- [ ] **Step 5:** статистика ачивок, определение ачивки, выгрузка.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test` — зелёные.
- [ ] **Step 7:** коммит `feat(first-strike): действие удара, урон боссу, ачивка, выгрузка`.

---

### Task 3: Карточка и диалог в кабинете

**Files:**
- Create: `components/first-strike/first-strike-host.tsx` (клиентский: карточка + состояние диалога), `components/first-strike/first-strike-dialog.tsx` (экраны «удар» и «результат»)
- Modify: `app/(app)/dashboard/page.tsx` (`getStrikeOffer` в `Promise.all`, чтение `searchParams.strike`, хост над героем недели)
- Create: `e2e/first-strike.spec.ts`

**Interfaces:**
- Consumes: `firstStrikeAction`, `StrikeResult`, `getStrikeOffer`, `STRIKE_EXERCISES`; `BossSprite`, `BossHpBar`; `XpBar` (`components/progress/xp-bar.tsx`); `FirstWorkout` (`components/onboarding/first-workout.tsx`); `selectOnFocus`.
- Produces: `<FirstStrikeHost offer={boolean} autoOpen={boolean} boss={BossView | null} />` — рендерится на дашборде всегда; при `offer = false` и закрытом диалоге возвращает `null`. Карточка показывается, если `offer` и `user.onboardedAt !== null` (страница передаёт `offer` уже с этим условием для карточки; `autoOpen` — `offer && searchParams.strike === "1"`).

Поведение хоста: состояние диалога и результат удара хранятся в хосте, поэтому повторный рендер страницы с `offer = false` диалог не закрывает. При закрытии диалога — `router.replace("/dashboard")` и `router.refresh()`.

Тексты и testid:
- карточка `data-testid="first-strike-card"`: заголовок «Первый удар», текст «Нанеси первый удар боссу — один подход без инвентаря, 2 минуты», кнопка «Ударить»;
- диалог `data-testid="first-strike-dialog"`: заголовок «Первый удар», описание «Сделай один подход прямо сейчас — и босс получит первый удар»; группа упражнений `role="radiogroup"` с подписью «Упражнение»; поле с подписью «Повторы» / «Секунды»; кнопка «Ударить»;
- результат `data-testid="first-strike-result"`: «−100», «+30 XP», название ачивки; главная кнопка-ссылка «Продолжить черновик» (`/training`) при `hasDraft`, иначе `FirstWorkout` (его `onSelf` → `/training`, `onLater` → закрыть); кнопка «Позже».
- `FirstWorkout` шлёт `onboarding=1` — оставить как есть (экскурсия к этому моменту пройдена, `markOnboarded` вернёт `false`).

- [ ] **Step 1: e2e (падающие)** — в каждом тесте `registerUser`, затем `addFlagUser("first_strike", login)` и `page.reload()`:
  1. `card: strike hits the boss, pays XP and the achievement` — карточка видна, у босса «3000 / 3000 HP»; «Ударить» → в диалоге выбрать «Отжимания», ввести 12, «Ударить» → результат содержит «−100», «+30 XP», «Первый удар»; «Позже» → карточки нет, `boss-card` содержит «2900 / 3000 HP». В БД: одна запись `XpEvent` c `reason = 'FIRST_STRIKE'`, `amount = 30`, `meta = {"exercise":"pushup","value":12}`; есть `UserAchievement` `firststrike:1`; нет `workouts:1`; `"weekWorkouts" = 0` и `"currentStreak" = 0` у пользователя; `Workout` — 0 строк.
  2. `invalid input is refused` — значения `0`, `201`, пусто: видна ошибка, записей `FIRST_STRIKE` нет.
  3. `second tab gets "already struck"` — диалог открыт в двух вкладках (`context.newPage()`), удар в первой, затем во второй → «Первый удар уже нанесён»; запись одна.
  4. `no card after a completed workout` — `seedWorkouts(login, "Жим штанги лёжа", [{ weight: 60, reps: 8, sets: 1 }], 0)` → карточки нет, `/dashboard?strike=1` диалог не открывает.
  5. `no card without the flag` — без `addFlagUser` карточки нет.
  6. `strike then a real workout the same week` — после удара `quickWorkout(page, "Шраги со штангой", [{ weight: "60", reps: "10" }])` → сводка `boss-damage` содержит «Урон боссу: −100»; на дашборде «2800 / 3000 HP»; ачивка `workouts:1` есть.
  7. `flag turned off after the strike keeps the damage` — после удара убрать пользователя из флага прямым SQL (`array_remove` по `userIds`) → «2900 / 3000 HP», карточки нет.
  8. `stretch-only history still allows the strike` — завершённая тренировка с `"stretchOnly" = true` (вставка через `withDb`, по образцу `e2e/stretching*.spec.ts`) → карточка видна.
  9. `strike with a draft offers to continue it` — создать черновик (`/training` → «Пустая тренировка» + `addToWorkout`), вернуться в кабинет, ударить → в результате ссылка «Продолжить черновик».
  10. `account data` — после удара выгрузка JSON содержит `firstStrikeAt` в профиле; удаление аккаунта проходит (приёмы — из `e2e/account-data.spec.ts`).
- [ ] **Step 2:** `npm run build && npx playwright test e2e/first-strike.spec.ts --project=desktop --workers=4` — тесты падают на отсутствии карточки.
- [ ] **Step 3:** хост, диалог, правка дашборда. Анимация удара — приём из `components/boss/boss-bar.tsx` (`animateHit`, `prefersReducedMotion`).
- [ ] **Step 4:** сборка и `npx playwright test e2e/first-strike.spec.ts --workers=4` (desktop + mobile) — зелёные; `npx playwright test e2e/boss.spec.ts e2e/onboarding*.spec.ts e2e/dashboard*.spec.ts --workers=4` — без регрессий. Сделать скриншоты карточки и обоих экранов диалога на desktop и mobile, в светлой и тёмной теме, и посмотреть их.
- [ ] **Step 5:** коммит `feat(first-strike): карточка и диалог в кабинете`.

---

### Task 4: Вход из экскурсии

**Files:**
- Modify: `components/onboarding/tour.tsx`, `app/(app)/dashboard/page.tsx` (проп `strike`)
- Modify: `e2e/first-strike.spec.ts`

**Interfaces:**
- Consumes: `getStrikeOffer` (уже на дашборде), хост из Task 3 с `autoOpen`.
- Produces: `<OnboardingTour programs={...} strike={boolean} />`. На шаге `id === "boss"` при `strike` — кнопка «Ударить сейчас» (главная), «Далее» становится `variant="outline"`. Нажатие: `finish("done", () => router.push("/dashboard?strike=1"))`.

- [ ] **Step 1: e2e (падающие)**
  1. `tour: «Ударить сейчас» ends the tour and opens the strike` — `registerUser`, `addFlagUser`, `resetOnboarding(login)`, `/dashboard` → «Поехали», «Далее» до шага «Босс недели» → «Ударить сейчас» → диалог открыт, экскурсии нет; ударить → в результате список программ; выбрать «Full Body» → открыт `/training` с тренировкой. В БД `"onboardedAt"` не null.
  2. `tour without the flag has no strike button` — на шаге босса кнопки нет.
  3. `tour restarted after the strike has no strike button` — после удара `resetOnboarding(login)` → на шаге босса кнопки нет, карточки нет.
- [ ] **Step 2:** прогон — тесты 1 падают на отсутствии кнопки.
- [ ] **Step 3:** реализация.
- [ ] **Step 4:** сборка, `npx playwright test e2e/first-strike.spec.ts e2e/onboarding*.spec.ts --workers=4` — зелёные на desktop и mobile.
- [ ] **Step 5:** коммит `feat(first-strike): удар из экскурсии`.

---

### Task 5: Метрика админки и документация

**Files:**
- Modify: `lib/admin/metrics-queries.ts` (`FeatureUsage.firstStrikes`, `FeatureUsage.firstStrikesTrained`, запрос в `getFeatureUsage`), `components/admin/feature-usage.tsx` (строка «Первый удар» — «N, из них с тренировкой M»), существующий e2e/unit админки, если он перечисляет строки
- Modify: `docs/features/game.md` (раздел «Первый удар»: флаг, правила, урон через `weekDamage`, что не затрагивается), `docs/features/training.md` (строка в «Онбординг»: кнопка шага босса и `?strike=1`)

**Interfaces:**
- Produces: `firstStrikes` — число пользователей с `firstStrikeAt`; `firstStrikesTrained` — из них с завершённой обычной тренировкой, у которой `finishedAt > firstStrikeAt`.

- [ ] **Step 1:** e2e в `e2e/first-strike.spec.ts`: `admin sees strike usage` — по образцу существующих тестов `/admin` (как становятся админом — см. `e2e/db.ts`, хелпер смены логина на админский): после удара строка «Первый удар» есть на `/admin`. Тест глобального состояния — `mode: "serial"`, только desktop, если так сделаны соседние тесты админки.
- [ ] **Step 2:** прогон — падает.
- [ ] **Step 3:** запрос, строка, документация.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test`, сборка, `npx playwright test e2e/first-strike.spec.ts e2e/admin*.spec.ts --workers=4` — зелёные.
- [ ] **Step 5:** коммит `feat(first-strike): метрика в админке и документация`.

---

## После плана

Слияние в `release/2028-09-first-strike` (`--no-ff`), версия, запись «Что нового» с `flag: "first_strike"` и полный прогон — отдельным шагом по решению пользователя.
