# Публичная страница тренера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер публикует страницу `/trainer/<ник>` с описанием, честными цифрами и кнопкой «Заниматься», ведущей через регистрацию к экрану согласия.

**Architecture:** модель `CoachProfile` (1:1 с `User`); чистое ядро `lib/coach/profile.ts` (схема, `canPublish`, `visibleStats`); запросы `lib/coach/profile-queries.ts`; публичная страница в `app/(marketing)/trainer/[nick]` + route handler `/join`; редактор `/coach/page`; регистрация получает `next`.

**Tech Stack:** Next.js 16, Prisma 7 + PostgreSQL, Zod, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-coach-public-page-design.md`

## Global Constraints

- Пороги: `MIN_CLIENTS_FOR_STATS = 3`, `MIN_PLAN_ENTRIES = 5`, `MIN_ABOUT_TO_PUBLISH = 50`; поля: `displayName`/`city` ≤ 50, `about` ≤ 1000, специализаций ≤ 4.
- Коды: специализации `strength`, `mass`, `fat_loss`, `beginners`, `rehab`, `functional`; цифры `clients`, `workouts`, `records`, `plan`, `since`.
- Страница видна, только если `publishedAt` ≠ null и `isCoach`; иначе 404 (тренеру — предпросмотр с плашкой «Страница не опубликована — её видите только вы»).
- Ни имён, ни ников клиентов на странице.
- Редирект — только внутренние пути (`safeRedirectPath`).
- Тексты без рода; ссылка-кнопка — `<Link className={buttonVariants()}>`; цвета — семантические токены; анимированные числа — точное значение в `sr-only` (или без анимации).
- Цели Метрики: `trainer_page_join`, `coach_page_published`.
- Миграция — новая таблица и enum; частичные индексы не трогать.

## Review Focus

1. Ник с другим регистром в адресе (`/trainer/COACH_demo`) → та же страница, canonical — ник как задан (Task 3 e2e открывает в нижнем регистре).
2. `next` с внешним адресом (`//evil.com`, `/\evil.com`, `https://…`) в регистрации → `/dashboard` (Task 1 unit).
3. «О себе» с `<script>` или Markdown → выводится текстом, в JSON-LD `<` экранирован (Task 3 e2e проверяет, что текст виден буквально).
4. Тренер сменил ник после публикации → старый адрес 404, новый работает; sitemap — новый (по построению: поиск по `nicknameKey`, sitemap из БД).
5. Тренер выключил режим тренера → страница 404 и из sitemap пропадает (Task 4 e2e).

---

### Task 1: Ядро профиля и безопасный редирект

**Files:** Create `lib/coach/profile.ts`, `lib/coach/profile.test.ts`, `lib/auth/redirect.ts`, `lib/auth/redirect.test.ts`; Modify `lib/auth/actions.ts` (импорт `safeRedirectPath` вместо локальной)

**Interfaces — Produces:**
- `SPECIALTIES: Record<string, string>`, `FORMAT_LABELS: Record<"ONLINE" | "OFFLINE" | "BOTH", string>`, `STAT_CODES`, `MIN_*`
- `coachProfileSchema` → `{ displayName: string | null; city: string | null; format; specialties: string[]; about: string; hiddenStats: string[] }`
- `canPublish(p: { about: string }, nickname: string | null): string | null`
- `type CoachStats = { clients: number; workouts: number; records: number; plan: number | null; planTotal: number; since: Date | null }`
- `visibleStats(s: CoachStats, hidden: string[]): { code: string; value: string; label: string }[]` — `value` — число/процент/дата строкой, `label` — подпись по спеке
- `safeRedirectPath(value: unknown, fallback = "/dashboard"): string` — отклоняет не-строки, не начинающиеся с `/`, `//…`, `/\…`

- [ ] **Step 1: failing tests** — схема (пустые → null, 51 символ имени — ошибка, 5 специализаций — ошибка, `"yoga"` — ошибка, повтор — ошибка, `hiddenStats: ["x"]` — ошибка); `canPublish` (нет ника → «Сначала задайте ник», 49 символов → «Расскажите о себе — минимум 50 символов», ок → null); `visibleStats` (2 клиента — только `clients` и `since`; 3 — плюс `workouts`, `records`; `plan` только при `planTotal ≥ 5`, формат «86 % плана выполнено»; `hidden: ["clients"]` — нет `clients`; `since: null` — нет; «1 клиент», «2 клиента», «5 клиентов»; `since` — «в Hero Fit с октября 2026»); `safeRedirectPath` (`/coach/join/X` → как есть; `//evil.com`, `/\evil.com`, `https://evil.com`, `null` → `/dashboard`).
- [ ] **Step 2:** `npx vitest run lib/coach/profile.test.ts lib/auth/redirect.test.ts` — FAIL
- [ ] **Step 3:** implement
- [ ] **Step 4:** PASS; `npx tsc --noEmit`
- [ ] **Step 5:** commit `feat(coach): public profile core; safe redirect helper`

### Task 2: Модель, редактор и публикация

**Files:** `prisma/schema.prisma` (`CoachFormat`, `CoachProfile`, `User.coachProfile`) + миграция `coach_profile`; Create `lib/coach/profile-queries.ts` (`getCoachPublicStats`), `lib/coach/profile-actions.ts`, `components/coach/profile-editor.tsx`, `app/(app)/coach/page/page.tsx`; Modify `app/(app)/coach/page.tsx` (ссылка «Публичная страница» → `/coach/page`), `lib/analytics/goals.ts`; Test `e2e/coach-page.spec.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: `getCoachPublicStats(coachId: string, now?: Date): Promise<CoachStats>` (по спеке, раздел «Цифры»); `saveCoachProfileAction(input): Promise<Result>`; `publishCoachProfileAction(on: boolean): Promise<Result>`; e2e `coachProfile(login, { about, publish?, hiddenStats?, city?, displayName? })` в `e2e/db.ts`

- [ ] **Step 1: failing e2e:** «coach fills and publishes the page; short about is refused» — тренер (`enableCoach`) на `/coach/page`: «Имя на странице» «Иван Тренер», «Город» «Казань», специализация «Сила», «О себе» 20 символов → «Сохранить» → «Опубликовать» → тост «Расскажите о себе — минимум 50 символов»; «О себе» 60 символов → «Сохранить» → «Опубликовать» → видна ссылка `/trainer/<ник>` и кнопка «Снять с публикации».
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** schema + migration (проверить SQL); actions через `requireCoach`; редактор (поля по спеке, переключатели цифр с текущим значением из `getCoachPublicStats` и пометкой «появится при 3+ клиентах»).
- [ ] **Step 4:** `npm run typecheck && npm run build && npx playwright test coach-page coach` — PASS
- [ ] **Step 5:** commit `feat(coach): coach profile editor and publishing`

### Task 3: Публичная страница, «Заниматься», регистрация с `next`

**Files:** Modify `lib/coach/profile-queries.ts` (+ `getPublicCoach(nick)`); Create `app/(marketing)/trainer/[nick]/page.tsx`, `app/(marketing)/trainer/[nick]/join/route.ts`; Modify `proxy.ts` (`PUBLIC_PREFIXES` + `/trainer/`), `app/(auth)/register/page.tsx` + `components/auth/auth-forms.tsx` (`next` — скрытое поле, ссылка «Войти» с `next`), `lib/auth/actions.ts` (`registerAction` → `safeRedirectPath(next)`; тренер с галочкой — `/coach`), `lib/seo.ts` (`coachJsonLd`); Test `e2e/coach-page.spec.ts`

**Interfaces:** Consumes `getCoachPublicStats` (Task 2). Produces `getPublicCoach(nick: string): Promise<{ id; nickname; coachCode; profile: CoachProfile } | null>` (`isCoach = true`, профиль есть; публикацию проверяет страница)

- [ ] **Step 1: failing e2e:**
  - «guest joins from the public page» — `coachProfile(coach, { about: 60 символов, publish: true, city: "Казань" })`; гость (новый контекст) открывает `/trainer/<ник в нижнем регистре>` → видит имя/ник, «Казань», «О себе», «Заниматься» → регистрация (форма) → URL `/coach/join/…` → «Разрешить» → `activeCoachLinks(guestLogin)` содержит тренера;
  - «unpublished page: 404 for guests, preview for the coach» — `request.get` гостем → 404; тренер видит плашку;
  - «stats appear from 3 clients; hidden stat is not shown» — 2 клиента (`linkCoach`) → нет «тренировок клиентов»; третий → есть; `hiddenStats: ["clients"]` → нет «клиента»;
  - «a client of the coach sees «Вы занимаетесь с этим тренером»»;
  - «about is rendered as text» — «О себе» с `<b>жирный</b>` → виден буквально `<b>жирный</b>`.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** implement (страница — `connection()`, `generateMetadata` по спеке, JSON-LD через `jsonLd`; кнопка по смотрящему через `getCurrentUser`; route handler — 404 для неопубликованной, `queueGoal`, редирект)
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build && npx playwright test coach-page coach-signup auth` — PASS
- [ ] **Step 5:** commit `feat(coach): public coach page with join flow`

### Task 4: Sitemap, подсказка в настройках, политика, сид, документация

**Files:** `app/sitemap.ts` (опубликованные страницы с `isCoach`); `components/…/settings` поле ника — подсказка при опубликованной странице; `app/(marketing)/privacy/page.tsx` (пункт по спеке); `prisma/seed.ts` (профиль `demo.coach`, опубликован); `CLAUDE.md`; Test `e2e/coach-page.spec.ts`

- [ ] **Step 1: failing e2e:** «sitemap lists published coach pages only» — опубликованная страница есть в `sitemap.xml`; снять с публикации → нет; опубликовать и выключить режим тренера (`update "User" set "isCoach" = false`) → нет и страница 404.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** implement; сид — `npm run db:seed` дважды без ошибок
- [ ] **Step 4:** полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --workers=4` — зелёное
- [ ] **Step 5:** commit `feat(coach): coach pages in sitemap, privacy note, demo profile, docs`
