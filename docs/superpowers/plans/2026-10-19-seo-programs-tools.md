# SEO: страницы программ и калькулятор DOTS/Wilks — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** публичные страницы пяти программ тренировок с кнопкой «Начать программу» и публичный калькулятор DOTS/Wilks — под поисковые запросы, с индексацией и разметкой.

**Architecture:** программы описаны один раз в `lib/programs/builtin.ts` — из него сид создаёт встроенные шаблоны, а статические страницы `/training-programs/*` берут тексты и дни. «Начать программу» — обработчик GET, создающий тренировку общей функцией из `lib/workouts/`. DOTS/Wilks — чистые функции и клиентская форма на странице по образцу `/tools/1rm`.

**Tech Stack:** Next.js 16 App Router (статические страницы, route handlers), Prisma 7, Tailwind + shadcn/ui, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-seo-programs-tools-design.md`

## Global Constraints

- Публичные адреса: `/training-programs`, `/training-programs/<slug>`, `/training-programs/<slug>/start`, `/tools/dots-wilks`.
- Slug: `push-pull-legs`, `full-body`, `5x5`, `upper-lower`, `beginner`.
- Имена существующих программ и дней в БД не меняются: `Push / Pull / Legs` (Push, Pull, Legs), `Full Body` (Full Body), `5×5` (5×5 — день A, 5×5 — день B). Новые: `Верх / Низ` (Верх, Низ), `Для новичка` (Новичок — день A, Новичок — день B).
- Цель Метрики — `program_start`.
- Без фича-флага.
- Тексты — только о том, что есть в приложении; без медицинских обещаний.
- Цвета — семантические токены; числовые поля — с `selectOnFocus`; ссылка-кнопка — `<Link className={buttonVariants()}>`, но «Начать программу» — `<a href>` (обработчик, без префетча).
- `description` страницы ≤ 160 символов.

## Review Focus

1. Повторный сид на проде (шаблоны уже есть) не создаёт дублей и не меняет id существующих шаблонов. → unit в Task 1 (функция планирования сида — чистая) и проверка в e2e-сиде.
2. Гость регистрируется с `next=/training-programs/<slug>/start` — после регистрации попадает в обработчик и получает тренировку, а не на дашборд. → e2e в Task 3.
3. Пользователь с идущей тренировкой жмёт «Начать программу» — новая тренировка не создаётся, текущая не теряется. → e2e в Task 3.
4. Пустые или нулевые поля калькулятора, вес тела вне диапазона формулы — нет `NaN`/`Infinity` в выводе. → unit в Task 4.
5. Неизвестный slug — 404 и на странице, и на `/start` (не 500). → e2e в Task 3.

---

### Task 1: Модуль программ и сид

**Files:**
- Create: `lib/programs/builtin.ts`, `lib/programs/builtin.test.ts`
- Modify: `prisma/seed.ts` (удалить `PROGRAMS` и `SeedTemplate`, `seedPrograms` берёт дни из `BUILTIN_PROGRAMS`; лог — число дней)

**Interfaces:**
- Produces: `BuiltinDay`, `BuiltinProgram`, `BUILTIN_PROGRAMS`, `programBySlug(slug: string): BuiltinProgram | null` — поля как в спеке, раздел «Модуль»; `seedDays(): { program: string; name: string; description: string; exercises: [string, number, number][] }[]` — плоский список дней всех программ в порядке модуля (для сида).

- [ ] **Step 1:** тесты:
  - slug уникальны и соответствуют `/^[a-z0-9-]+$/`; набор slug = пять из Global Constraints;
  - `programBySlug("5x5")?.program === "5×5"`, `programBySlug("nope") === null`;
  - у каждой программы `days.length ≥ 1`, у каждого дня ≥ 1 упражнение, подходы и повторы > 0;
  - `faq.length ≥ 4`, `description.length ≤ 160`, `forWhom.length` от 3 до 4, `schedule.length ≥ 1`;
  - имена дней и программ существующих трёх совпадают с Global Constraints, упражнения/подходы/повторы этих трёх — как в нынешнем `prisma/seed.ts` (перенести значения в тест-таблицу);
  - `seedDays()` возвращает 9 дней, пары `program`+`name` уникальны.
- [ ] **Step 2:** `npx vitest run lib/programs` → FAIL.
- [ ] **Step 3:** модуль: данные по спеке (новые дни — дословно из спеки), тексты всех пяти программ на русском — заголовки из спеки, FAQ на живые вопросы. Модуль без `server-only` и без БД.
- [ ] **Step 4:** сид использует `seedDays()`; неизвестное упражнение по-прежнему бросает ошибку (это и есть проверка «все упражнения есть в каталоге» — e2e-база сидится при каждом прогоне). `npm run db:seed` дважды подряд → без ошибок, в БД 9 встроенных шаблонов (`select count(*) from "WorkoutTemplate" where "userId" is null` → 9).
- [ ] **Step 5:** `npx vitest run lib/programs && npm run typecheck && npm run lint` → PASS.
- [ ] **Step 6:** commit `feat(programs): builtin programs module, seed upper/lower and beginner`.

### Task 2: Страницы программ

**Files:**
- Create: `app/(marketing)/training-programs/page.tsx`, `app/(marketing)/training-programs/[slug]/page.tsx`, `components/marketing/program-card.tsx` (карточка программы для списка и «Других программ»)
- Modify: `lib/seo.ts` (`PUBLIC_SITEMAP` + `programJsonLd`), `lib/seo.test.ts` (если есть — иначе создать), `proxy.ts` (`PUBLIC_PAGES` += `/training-programs`; `PUBLIC_PREFIXES` += `/training-programs/`), `components/marketing/site-footer.tsx` (ссылка «Программы тренировок»), `app/(marketing)/page.tsx` (ссылка на программы рядом с калькуляторами или в «Как это работает»)
- Test: `e2e/seo-programs.spec.ts` (новый)

**Interfaces:**
- Consumes: `BUILTIN_PROGRAMS`, `programBySlug` (Task 1); `jsonLd`, `absoluteUrl`, `Breadcrumbs`/`ToolCta` (`components/marketing/tool-cta.tsx`).
- Produces: `programJsonLd(origin: string, p: BuiltinProgram): object[]` (BreadcrumbList, ExercisePlan, FAQPage); страница ссылается на `/training-programs/<slug>/start` (обработчик — Task 3).

- [ ] **Step 1:** тесты:
  - unit `lib/seo.test.ts`: `sitemapEntries(...)` содержит `/training-programs` и все пять `/training-programs/<slug>`;
  - unit: `programJsonLd` — три объекта, у `ExercisePlan` есть `name`, `activityFrequency`, у `FAQPage` вопросов столько же, сколько `faq`;
  - e2e без входа: `/training-programs` — `h1` «Программы тренировок в зал», 5 ссылок на программы; `/training-programs/5x5` — `h1` из модуля, `link[rel=canonical]` оканчивается на `/training-programs/5x5`, `script[type="application/ld+json"]` разбирается `JSON.parse` и содержит `ExercisePlan`; таблица дня содержит «Приседания со штангой» и «5 × 5»; кнопка «Начать программу» ведёт на `/training-programs/5x5/start`; `/training-programs/nope` → 404.
- [ ] **Step 2:** `npx vitest run lib/seo.test.ts` и `npm run build && npx playwright test e2e/seo-programs.spec.ts` → FAIL.
- [ ] **Step 3:** реализация по спеке (раздел «Страницы программ»), `generateStaticParams`, `dynamicParams = false` или `notFound()` для неизвестного slug; метаданные через `generateMetadata`.
- [ ] **Step 4:** тесты → PASS; `npx playwright test e2e/landing.spec.ts` (шапка/подвал не сломаны, «header fits») → PASS.
- [ ] **Step 5:** commit `feat(seo): public training program pages`.

### Task 3: «Начать программу»

**Files:**
- Create: `app/(marketing)/training-programs/[slug]/start/route.ts`
- Modify: `lib/workouts/actions.ts` (вынести создание PLANNED-тренировки в `createPlannedWorkout`), новый файл `lib/workouts/create.ts` (сама функция, `server-only`), `lib/analytics/goals.ts` (`program_start`), `deploy/README.md` (цель в списке целей Метрики)
- Test: `e2e/seo-programs.spec.ts`

**Interfaces:**
- Consumes: `programBySlug` (Task 1).
- Produces: `createPlannedWorkout(userId: string, source: string): Promise<void>` в `lib/workouts/create.ts` — тело нынешнего `createWorkoutAction` после проверки активной тренировки (разбор `source`, шаблон, план, повтор, кардио, `db.workout.create`); `createWorkoutAction` вызывает её, поведение не меняется.

- [ ] **Step 1:** e2e (падают):
  - гость: «Начать программу» на `/training-programs/beginner` → `/register?next=…/start` → регистрация → `/training`, в редакторе упражнения «Новичок — день A» («Приседания со штангой», «Жим штанги лёжа», «Тяга верхнего блока», «Скручивания»);
  - вошедший без активной тренировки: `/training-programs/upper-lower/start` → `/training`, в редакторе «Жим штанги лёжа» и «Разгибание рук на блоке»;
  - вошедший с идущей тренировкой: `/training-programs/5x5/start` → `/training`, число тренировок пользователя не изменилось (хелпер `e2e/db.ts`);
  - `/training-programs/nope/start` → 404.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/seo-programs.spec.ts` → FAIL.
- [ ] **Step 3:** рефакторинг `createPlannedWorkout` → `npx playwright test e2e/training.spec.ts e2e/templates*.spec.ts e2e/calendar*.spec.ts` → PASS (регрессия старта из шаблона, повтора и плана).
- [ ] **Step 4:** обработчик по спеке (раздел «Начать программу»), образец — `app/(marketing)/trainer/[nick]/join/route.ts`; шаблон — `db.workoutTemplate.findFirst({ where: { userId: null, program, name: days[0].name } })`.
- [ ] **Step 5:** e2e → PASS; `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 6:** commit `feat(seo): start a program from its public page`.

### Task 4: Калькулятор DOTS/Wilks

**Files:**
- Create: `lib/progress/strength-score.ts`, `lib/progress/strength-score.test.ts`, `app/(marketing)/tools/dots-wilks/page.tsx`, `components/marketing/strength-score-calculator.tsx` (клиент)
- Modify: `lib/seo.ts` (`PUBLIC_SITEMAP` += `/tools/dots-wilks`), `proxy.ts` (`PUBLIC_PAGES` += `/tools/dots-wilks`), `components/marketing/site-footer.tsx`, ссылки на калькулятор со страниц `/tools/1rm` и программ
- Test: `e2e/seo-programs.spec.ts`

**Interfaces:**
- Produces: `type Sex = "male" | "female"`; `dots(total: number, bodyweight: number, sex: Sex): number`; `wilks(total: number, bodyweight: number, sex: Sex): number`; `dotsLevel(score: number): "Начинающий" | "Любитель" | "Продвинутый" | "Мастер" | "Элита"`. При `total ≤ 0` или `bodyweight ≤ 0` (или нечисле) — `0`.

- [ ] **Step 1:** unit:
  - опорные значения из спеки (±0.01): м 600/100 → 369.31 / 365.15; м 500/80 → 344.77 / 341.35; ж 300/60 → 332.56 / 334.47; ж 400/70 → 404.50 / 397.94;
  - ограничение веса: `dots(500, 250, "male") === dots(500, 210, "male")`; `wilks(300, 20, "female") === wilks(300, 26.51, "female")`;
  - `dots(0, 80, "male") === 0`, `dots(500, 0, "male") === 0`, `dots(NaN, 80, "male") === 0`;
  - `dotsLevel(199.99) === "Начинающий"`, `dotsLevel(200) === "Любитель"`, `dotsLevel(499.99) === "Мастер"`, `dotsLevel(500) === "Элита"`.
- [ ] **Step 2:** `npx vitest run lib/progress/strength-score.test.ts` → FAIL.
- [ ] **Step 3:** функции по коэффициентам спеки → unit PASS.
- [ ] **Step 4:** e2e (падает): `/tools/dots-wilks` без входа — `h1`, canonical; ввести «мужчина», вес 100, присед 220, жим 150, тяга 230 → «Сумма 600 кг», «DOTS 369,31», «Wilks 365,15», «Продвинутый»; режим «только сумма» 400, женщина, вес 70 → DOTS «404,50» и «Мастер». Числа — в формате `ru-RU`.
- [ ] **Step 5:** страница и форма по образцу `/tools/1rm` (`Breadcrumbs`, `ToolCta`, `toolJsonLd`, FAQ), поля с `selectOnFocus`, текст по спеке → e2e PASS.
- [ ] **Step 6:** commit `feat(seo): DOTS and Wilks calculator`.

### Task 5: Документация и проверка ветки

**Files:**
- Modify: `docs/features/platform.md` (лендинг и SEO: страницы программ, модуль, обработчик старта, цель, калькулятор)

- [ ] **Step 1:** обновить документацию.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` → всё зелёное.
- [ ] **Step 3:** commit `docs(seo): programs and DOTS calculator`.
