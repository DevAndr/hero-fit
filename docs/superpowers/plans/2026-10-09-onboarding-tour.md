# Онбординг-экскурсия — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новый пользователь после регистрации проходит экскурсию по дашборду из 7 шагов и в конце запускает первую тренировку из готовой программы (или отказывается).

**Architecture:** Состояние «прошёл/нет» — `User.onboardedAt` в БД. Шаги и переходы — чистые функции в `lib/onboarding/tour.ts`; клиентский компонент подсвечивает элементы с атрибутом `data-tour` и ведёт по шагам; финал — формы в существующий `createWorkoutAction`. Завершение — server actions с целями Метрики.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, React 19, Tailwind, shadcn/Base UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-onboarding-tour-design.md`

## Global Constraints

- Ветка `feat/onboarding-tour`; Next.js 16 — перед кодом сверяться с `node_modules/next/dist/docs/`.
- Без новых зависимостей (экскурсия — своя).
- Цвета — только семантические токены; затемнение — `box-shadow: 0 0 0 9999px color-mix(in oklch, var(--background) 75%, transparent)`.
- Тексты на «ты», без рода; заголовки шагов — ровно из таблицы спеки.
- `ONBOARDING_TOUR: "on" | "off"`, по умолчанию `"on"`; в `playwright.config.ts` — `"off"`.
- Цели Метрики: `onboarding_done`, `onboarding_skip`.
- Шаблоны финала — встроенные (`userId = null`) с именами ровно `"Full Body"`, `"Push"`, `"5×5 — день A"`, в этом порядке; подписи «Для старта», «Первый день Push/Pull/Legs», «Силовая классика».
- «Уменьшить движение» — без анимаций и плавной прокрутки.
- Проверки перед каждым коммитом: `npm run typecheck`, `npm run lint`, `npm test`.
- Unit-тесты в проекте — только на чистые функции (без моков БД); работу с БД проверяют e2e.

## Review Focus

1. Выбор программы, когда уже есть активная тренировка → `createWorkoutAction` уводит на `/training`, но экскурсия всё равно должна считаться пройденной (отметка ставится до проверки активной тренировки). Тест — Task 3, e2e `program with active workout`.
2. Шаг, у которого элемент скрыт (`display: none`, например боковое меню на телефоне) — должен браться видимый элемент или шаг пропускается, а не подсветка нулевого прямоугольника в углу. Тест — Task 2 (`isAvailable` с скрытым элементом) и mobile-проект e2e в Task 3.
3. Двойной клик «Пропустить»/«Не сейчас» или повтор после перезагрузки — без ошибок и без двойной цели Метрики (`updateMany` по `onboardedAt: null`, цель только при `count === 1`). Тест — Task 3, e2e `skip on the second step` (двойной клик по «Пропустить» — без ошибки на странице).
4. Перезапуск из `/settings`, когда ежедневный сундук ещё не открыт — сундук не должен всплыть поверх экскурсии. Покрыто условием в layout (Task 3) и чистой функцией `chestAutoOpen` (Task 2).
5. `Esc` на финале — «Не сейчас», а не «Пропустить» (разные цели Метрики: на финале — `done`). Тест — Task 3 e2e.

---

### Task 1: Данные, окружение и server actions

**Files:**
- Create: `prisma/migrations/<timestamp>_onboarding/migration.sql` (через `npx prisma migrate dev --name onboarding --create-only`, затем дописать backfill)
- Modify: `prisma/schema.prisma` (model `User`)
- Modify: `lib/env.ts`, `.env.example`, `playwright.config.ts`
- Modify: `lib/analytics/goals.ts`, `lib/analytics/goals.test.ts`
- Modify: `lib/auth/dal.ts` (select `onboardedAt` в `CurrentUser`)
- Modify: `lib/auth/actions.ts` (`registerAction`)
- Modify: `lib/workouts/actions.ts` (`createWorkoutAction`)
- Create: `lib/onboarding/actions.ts`, `lib/onboarding/queries.ts`, `lib/onboarding/complete.ts`

**Interfaces:**
- Produces:
  - `User.onboardedAt: DateTime?`; `CurrentUser.onboardedAt: Date | null`
  - `env.ONBOARDING_TOUR: "on" | "off"`
  - `GOALS` += `"onboarding_done"`, `"onboarding_skip"`
  - `lib/onboarding/complete.ts` (server-only): `markOnboarded(userId: string): Promise<boolean>` — `true`, если отметка поставлена этим вызовом
  - `lib/onboarding/actions.ts` ("use server"): `completeOnboardingAction(reason: "done" | "skip"): Promise<void>`, `restartOnboardingAction(): Promise<never>` (redirect `/dashboard`)
  - `lib/onboarding/queries.ts`: `type OnboardingProgram = { id: string; name: string; exercises: number }`; `getOnboardingPrograms(): Promise<OnboardingProgram[]>`
  - `createWorkoutAction` принимает поле формы `onboarding=1`

- [ ] **Step 1: Failing tests**

`lib/analytics/goals.test.ts` — добавить: `parseGoals("onboarding_done.onboarding_skip")` → `["onboarding_done", "onboarding_skip"]`.

- [ ] **Step 2: Run** `npx vitest run lib/analytics` — FAIL (нет целей).

- [ ] **Step 3: Implement**
  - schema: `onboardedAt DateTime?` с `///`-комментарием «экскурсия завершена (любым способом); null — показать на дашборде»;
  - миграция `--create-only`, в конец SQL: `UPDATE "User" SET "onboardedAt" = NOW();` — затем `npx prisma migrate dev` и `npx prisma generate`;
  - `env.ts`: `ONBOARDING_TOUR: z.enum(["on", "off"]).default("on")` с комментарием как у `DAILY_CHEST_AUTOOPEN`; `.env.example` — строка с пояснением; `playwright.config.ts` — `ONBOARDING_TOUR: "off"` рядом с `DAILY_CHEST_AUTOOPEN` (обновить комментарий);
  - `registerAction`: `onboardedAt: env.ONBOARDING_TOUR === "off" ? new Date() : null` в `data`;
  - `markOnboarded` — `updateMany` по `{ id, onboardedAt: null }`;
  - `completeOnboardingAction(reason)`: `requireUser`, `markOnboarded`, при `true` — `queueGoal(reason === "done" ? "onboarding_done" : "onboarding_skip")`, `revalidatePath("/dashboard")`;
  - `restartOnboardingAction`: `requireUser`, `db.user.update({ onboardedAt: null })`, `redirect("/dashboard")`;
  - `createWorkoutAction`: **первой строкой после `requireUser`** — если `formData.get("onboarding") === "1"` и `markOnboarded` вернул `true` → `queueGoal("onboarding_done")`; дальше без изменений;
  - `getOnboardingPrograms`: `db.workoutTemplate.findMany({ where: { userId: null, name: { in: NAMES } }, select: { id, name, _count: { select: { exercises: true } } } })`, отсортировать по порядку `NAMES`.

- [ ] **Step 4: Run** `npx vitest run lib/analytics` — PASS; `npm run typecheck` — без ошибок (поведение действий проверяет e2e в Task 3).

- [ ] **Step 5: Commit** `feat(onboarding): onboardedAt, completion actions, program list`

### Task 2: Логика шагов (чистые функции)

**Files:**
- Create: `lib/onboarding/tour.ts`, `lib/onboarding/tour.test.ts`

**Interfaces:**
- Produces:
  - `type TourStepId = "welcome" | "xp" | "streak" | "boss" | "body-map" | "nav" | "first-workout"`
  - `type TourStep = { id: TourStepId; target?: "xp" | "streak" | "boss" | "body-map" | "nav"; title: string; text: string }`
  - `TOUR_STEPS: readonly TourStep[]` — 7 шагов в порядке и с заголовками из спеки
  - `nextStep(i: number, available: (s: TourStep) => boolean): number` — следующий доступный индекс, на последнем — `i`
  - `prevStep(i: number, available: (s: TourStep) => boolean): number` — предыдущий доступный, на первом — `i`
  - `stepNumber(i, available): { current: number; total: number }` — для счётчика «3 / 7» (только доступные шаги)
  - `chestAutoOpen(envOn: boolean, onboardedAt: Date | null): boolean` — `envOn && onboardedAt !== null`

- [ ] **Step 1: Failing tests** (`tour.test.ts`):
  - `TOUR_STEPS.map(s => s.id)` равно порядку из спеки; у `welcome` и `first-workout` нет `target`;
  - все доступны: `nextStep(0) === 1`, `nextStep(6) === 6`, `prevStep(0) === 0`, `prevStep(6) === 5`;
  - `body-map` недоступен: `nextStep(3) === 5`, `prevStep(5) === 3`;
  - недоступны все с `target`: `nextStep(0) === 6`, `prevStep(6) === 0`;
  - `available` возвращает `false` для `welcome`/`first-workout` — всё равно доступны (первый и последний — всегда);
  - `stepNumber(5, без body-map)` → `{ current: 5, total: 6 }`;
  - `chestAutoOpen(true, null) === false`, `chestAutoOpen(true, new Date()) === true`, `chestAutoOpen(false, new Date()) === false`.

- [ ] **Step 2: Run** `npx vitest run lib/onboarding/tour` — FAIL.

- [ ] **Step 3: Implement** в `lib/onboarding/tour.ts`; тексты шагов — по столбцу «Суть текста» спеки, 1–2 предложения, на «ты», без рода.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit** `feat(onboarding): tour steps and navigation`

### Task 3: Экскурсия в интерфейсе, финал, настройки, e2e

**Files:**
- Create: `components/onboarding/tour.tsx`, `components/onboarding/first-workout.tsx`, `components/onboarding/restart-button.tsx`, `e2e/onboarding.spec.ts`
- Modify: `app/(app)/dashboard/page.tsx` (`data-tour="xp"` на `section aria-label="Уровень"`, `data-tour="streak"` на корень `StreakCard`, рендер экскурсии)
- Modify: `components/boss/boss-card.tsx` (`data-tour="boss"` на корневой `section`), `components/progress/body-map.tsx` (`data-tour="body-map"` на корень), `components/app/nav-links.tsx` (`data-tour="nav"` на `nav` в `SidebarNav` и `BottomNav`)
- Modify: `app/(app)/layout.tsx` (`autoOpen={chestAutoOpen(env.DAILY_CHEST_AUTOOPEN === "on", user.onboardedAt)}`)
- Modify: `app/(app)/settings/page.tsx` (карточка «Экскурсия» с `RestartTourButton`)
- Modify: `e2e/db.ts` (`resetOnboarding(login: string)`), `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1 — `completeOnboardingAction`, `restartOnboardingAction`, `getOnboardingPrograms`, `OnboardingProgram`, `CurrentUser.onboardedAt`, `env.ONBOARDING_TOUR`; Task 2 — `TOUR_STEPS`, `nextStep`, `prevStep`, `stepNumber`, `chestAutoOpen`
- Produces: `<OnboardingTour programs={OnboardingProgram[]} />` (client); `<FirstWorkout programs onLater={() => void} onSelf={() => void} />`; `<RestartTourButton />`; `resetOnboarding(login)` в `e2e/db.ts` (`UPDATE "User" SET "onboardedAt" = NULL WHERE login = $1`)

- [ ] **Step 1: Failing e2e** `e2e/onboarding.spec.ts` (desktop + mobile). Общая подготовка: `registerUser(page)` → `resetOnboarding(login)` → `page.reload()`; экскурсия — `page.getByRole("dialog", { name: "Добро пожаловать в Hero Fit" })`.
  - `full tour → Full Body opens the workout editor`: «Поехали», затем «Далее» до диалога «Первая тренировка» (по пути видны заголовки «Уровень и опыт», «Недельный streak», «Босс недели», «Карта мышц», «Разделы»; счётчик первого шага `1 / 7`); клик карточки «Full Body» → URL `/training`, видны упражнения шаблона Full Body (первое имя из сида); `goto("/dashboard")` → диалога нет.
  - `back and Esc`: «Поехали» → «Назад» → снова «Добро пожаловать в Hero Fit»; `Escape` → диалог скрыт; `reload` → диалога нет.
  - `skip on the second step`: «Поехали» → двойной клик «Пропустить» → скрыт, на странице нет ошибки; `reload` → нет.
  - `final "Not now" stays on the dashboard`: дойти до финала, `Escape` (= «Не сейчас») → URL `/dashboard`, диалога нет; повторить с кнопкой «Не сейчас» не нужно.
  - `program with active workout`: SQL/UI создать активную тренировку (через `/training` → «Пустая тренировка»), `resetOnboarding`, дойти до финала, «Full Body» → URL `/training`; `goto("/dashboard")` → диалога нет.
  - `restart from settings`: `/settings` → «Показать экскурсию ещё раз» → URL `/dashboard`, виден «Добро пожаловать в Hero Fit».

- [ ] **Step 2: Run** `npm run build && npx playwright test onboarding` — FAIL (нет диалога).

- [ ] **Step 3: Implement**
  - `tour.tsx` ("use client"): состояние `index`; `available(step)` — нет `target` или есть элемент `document.querySelectorAll('[data-tour="<target>"]')` с ненулевым `getBoundingClientRect()` (первый такой); при смене шага — `scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })`, затем измерение; подсветка — `fixed` div по rect + 8 px, `rounded-xl`, `box-shadow: 0 0 0 9999px color-mix(in oklch, var(--background) 75%, transparent)`, `pointer-events: none`; под ним — `fixed inset-0` прозрачный слой, перехватывающий клики; пересчёт rect на `scroll`/`resize` через `requestAnimationFrame`; для шагов без цели — затемнение целиком и карточка по центру;
  - карточка: `role="dialog" aria-modal="true" aria-labelledby`, на `sm`+ под/над rect (что влезает), на мобильных — `fixed inset-x-4 bottom-20`; кнопки «Назад» (с шага 2), «Поехали»/«Далее», «Пропустить» (кроме финала), счётчик `stepNumber`; фокус на карточку при смене шага, Tab по кругу внутри; `keydown`: `ArrowRight`/`ArrowLeft`, `Escape` → на финале `onLater`, иначе skip;
  - skip → `completeOnboardingAction("skip")` и скрыть; «Не сейчас» → `completeOnboardingAction("done")` и скрыть; «Соберу сам» → `completeOnboardingAction("done")`, затем `router.push("/training")`;
  - `first-workout.tsx`: для каждой программы `<form action={createWorkoutAction}>` с hidden `source=template:<id>` и `onboarding=1`, кнопка-карточка: имя, подпись из Global Constraints, «N упражнений» (`plural` из `lib/format`), бейдж «Для старта» у Full Body; ниже «Соберу сам», «Не сейчас»;
  - dashboard: `const programs = user.onboardedAt === null && env.ONBOARDING_TOUR === "on" ? await getOnboardingPrograms() : null` и `{programs ? <OnboardingTour programs={programs} /> : null}`. В `ONBOARDING_TOUR=off` экскурсия всё равно показывается после `resetOnboarding`/перезапуска — `off` влияет только на регистрацию (Task 1), поэтому условие на дашборде — только `onboardedAt === null`;
  - `restart-button.tsx`: `<form action={restartOnboardingAction}>` с кнопкой «Показать экскурсию ещё раз»; в `/settings` — карточка «Экскурсия» с одной строкой описания;
  - CLAUDE.md — строка про онбординг по разделу «Документация» спеки.

- [ ] **Step 4: Run** `npm run build && npx playwright test onboarding daily-chest auth` — PASS; затем полный `npx playwright test` — без новых падений.

- [ ] **Step 5: Ручная проверка** — скриншоты шагов «Босс недели» и финала на 390 px и 1280 px (тёмная и светлая тема): подсветка совпадает с блоком, карточка не уходит за экран.

- [ ] **Step 6: Commit** `feat(onboarding): dashboard tour with first-workout picker`
