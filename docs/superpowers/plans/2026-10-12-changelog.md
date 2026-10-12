# «Что нового» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Релизы в файле `RELEASES`, публичная `/changelog` со ссылками на лендинге и плашкой, «Что нового» в кабинете с точкой до просмотра.

**Architecture:** Данные — TS-файл в репозитории; чистые `visibleRelease`/`hasUnseen`; флаги пунктов — через `flagOn` (гость) или `isEnabled` (пользователь); просмотр — `User.changelogSeen`.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-changelog-design.md`

## Global Constraints

- Ветка `feat/changelog` от `release/2026-11-assistant`; слияние — по решению пользователя.
- Тексты релизов — человеческие, без «флаг», «админка», «feat(…)».
- Публичная страница: пункт с `flag` — только при 100 % (правило гостя `flagOn(key, state, null)`); ссылка — только у публичных путей (`/`, `/#…`, `/tools/…`, `/changelog`).
- Плашка на главной — если последний релиз не старше 60 дней.
- Новые пользователи — `changelogSeen` = id последнего релиза.
- Миграция не трогает частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.

## Review Focus

1. Все пункты релиза скрыты флагом → релиз не показывается вовсе (ни пустого заголовка) → тест в Task 1.
2. `changelogSeen` указывает на удалённый/переименованный id → считается, что новое есть (точка), без ошибки → тест в Task 1.
3. Гость на `/changelog` не видит ссылок на закрытые страницы (`/goals`, `/guild`) — только текст → тест в Task 1 (`visibleRelease` с `publicOnly`).
4. Пользователь из Telegram Mini App (регистрация без пароля) — без точки, как и обычная регистрация → Task 3 (обе точки создания).
5. Открытие `/whats-new` дважды или в двух вкладках — без ошибок и лишних записей (условный `updateMany`) → Task 3.

---

### Task 1: Данные и чистые функции

**Files:**
- Create: `lib/changelog/types.ts`, `lib/changelog/releases.ts`, `lib/changelog/view.ts`, `lib/changelog/view.test.ts`

**Interfaces:**
- Produces:
  - `export type ChangeItem = { text: string; href?: string; flag?: FlagKey }`
  - `export type Release = { id: string; date: string; title: string; summary: string; new: ChangeItem[]; improved?: ChangeItem[]; fixed?: ChangeItem[] }`
  - `export const RELEASES: Release[]` (новые сверху)
  - `export const SECTIONS = [["new", "Новое"], ["improved", "Улучшено"], ["fixed", "Исправлено"]] as const`
  - `export function isPublicHref(href: string): boolean`
  - `export function visibleRelease(r: Release, opts: { enabled: (flag: FlagKey) => boolean; publicOnly: boolean }): Release | null` — без скрытых пунктов, пустые разделы — `[]`/`undefined`, релиз без пунктов — `null`; при `publicOnly` у непубличных `href` ссылка снимается
  - `export function latestReleaseId(releases: Release[]): string | null`
  - `export function hasUnseen(releases: Release[], seenId: string | null): boolean` — `true`, если `seenId` null или не найден или не первый
  - `export function isRecent(release: Release, today: string, days = 60): boolean`

- [ ] **Step 1: Падающие тесты** `view.test.ts` (фикстура `rel(id, date, items)`):
  - пункт с выключенным флагом скрыт; все пункты под выключенным флагом → `null`;
  - `publicOnly`: `href: "/goals"` → у пункта нет `href`; `href: "/#guilds"` и `/tools/1rm` — остаются;
  - `hasUnseen([b, a], null)` → true; `"b"` → false; `"a"` → true; `"zzz"` → true; пустой список → false;
  - `isRecent` — 60 дней включительно true, 61 — false;
  - данные `RELEASES`: `id` уникальны, `date` по убыванию и формата `YYYY-MM-DD`, в каждом хотя бы один пункт, все `flag` — `isFlagKey`, в текстах нет слов «флаг», «админ».
- [ ] **Step 2:** `npx vitest run lib/changelog` — FAIL.
- [ ] **Step 3: Реализовать** типы, функции и первую запись `RELEASES`: `id: "2026-10"`, `date` — сегодняшняя, `title: "Гильдии, рейды и цели"`, `summary` и `new` — гильдии (`/guild`), рейд-босс недели, цели и журнал веса (`/goals`), ачивки тренера и награды на странице тренера, «Ты стал сильнее» в итогах недели и «Месяц к месяцу» (`flag: "strength_analytics"`), прогноз целей (`flag: "strength_analytics"`); `improved` — по желанию (напр. итоги недели с блоком рейда).
- [ ] **Step 4:** `npx vitest run lib/changelog && npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(changelog): releases data and view rules`.

---

### Task 2: Публичная `/changelog` и лендинг

**Files:**
- Create: `app/(marketing)/changelog/page.tsx`, `components/changelog/release-list.tsx` (общий список, проп `releases: Release[]`), `components/marketing/whats-new-link.tsx`
- Modify: `proxy.ts` (`/changelog` в `PUBLIC_PAGES`), `lib/seo.ts` (`PUBLIC_SITEMAP` `{ path: "/changelog", priority: 0.5, changeFrequency: "weekly" }`, тексты страницы), `components/marketing/site-footer.tsx` (колонка «Продукт» — «Что нового»), `components/marketing/site-header.tsx` (после «Тарифы» — «Что нового» → `/changelog`), `app/(marketing)/page.tsx` (плашка `WhatsNewLink` над `h1` героя)
- Test: `e2e/changelog.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`RELEASES`, `visibleRelease`, `isRecent`, `SECTIONS`); `getFlagStates`, `flagOn` (lib/flags).

- [ ] **Step 1: e2e RED** `changelog.spec.ts`: «guest opens the changelog from the landing footer»: `page.goto("/")`, `getByRole("contentinfo").getByRole("link", { name: "Что нового" }).click()` → URL `/changelog`, `getByRole("heading", { name: "Гильдии, рейды и цели" })` видим, текст «Ты стал сильнее» отсутствует (флаг выключен, `resetFlag("strength_analytics")` в начале), ссылка с плашки главной (`getByRole("link", { name: /^Новое:/ })`) ведёт на `/changelog#2026-10`. Запустить на текущем билде — FAIL.
- [ ] **Step 2: Реализовать** `ReleaseList` (`article` на релиз, `id={r.id}`, `h2` — `title`, дата «12 октября 2026», `summary`, разделы `h3` по `SECTIONS`, пункт — `Link` при `href`, иначе текст); страница: `connection()`, `getFlagStates()`, `RELEASES.map(r => visibleRelease(r, { enabled: (f) => flagOn(f, states.get(f) ?? null, null), publicOnly: true })).filter(Boolean)`; metadata (title «Что нового в Hero Fit», canonical). `WhatsNewLink` — server component: последний видимый релиз и `isRecent` → ссылка «Новое: <title> →» на `/changelog#<id>`, иначе ничего.
- [ ] **Step 3:** `npm run typecheck && npm run build && npx playwright test changelog landing --workers=8` — PASS.
- [ ] **Step 4: Commit** `feat(changelog): public changelog page and landing links`.

---

### Task 3: «Что нового» в кабинете

**Files:**
- Create: `prisma/migrations/<ts>_changelog_seen/` (`npx prisma migrate dev --name changelog_seen`), `app/(app)/whats-new/page.tsx`, `lib/changelog/actions.ts` (server-only `markChangelogSeen`)
- Modify: `prisma/schema.prisma` (`User.changelogSeen String?` с комментарием), `lib/auth/dal.ts` (`changelogSeen` в select и `CurrentUser`), `lib/auth/actions.ts:92` и `lib/telegram/mini-app.ts:45` (`changelogSeen: latestReleaseId(RELEASES)` при создании), `components/app/user-menu.tsx` (пункт «Что нового» с точкой; проп `unseen: boolean`), `components/app/app-shell.tsx` (точка на аватаре — `unseen = hasUnseen(RELEASES, user.changelogSeen)`), `e2e/db.ts` (`setChangelogSeen(login, id | null)`), `CLAUDE.md` (пункт «Что нового» + шаг чек-листа релиза: запись в `RELEASES` в PR релиза)
- Test: `e2e/changelog.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`RELEASES`, `hasUnseen`, `latestReleaseId`, `visibleRelease`), Task 2 (`ReleaseList`), `isEnabled` (lib/flags/server).
- Produces: `export async function markChangelogSeen(userId: string, id: string): Promise<void>` — `db.user.updateMany({ where: { id: userId, NOT: { changelogSeen: id } }, data: { changelogSeen: id } })` плюс случай `null` (`OR: [{ changelogSeen: null }, { NOT: { changelogSeen: id } }]`).

- [ ] **Step 1: e2e RED** в `changelog.spec.ts`: «new user has no dot; old user sees the dot until /whats-new»: `registerUser` → `getByTestId("whats-new-dot")` count 0; `setChangelogSeen(login, null)`, reload → точка видна; открыть меню профиля → «Что нового» → URL `/whats-new`, заголовок релиза видим; reload → точки нет. Запустить — FAIL.
- [ ] **Step 2: Миграция и схема**, `npx prisma generate`; проверить SQL (только `ADD COLUMN`).
- [ ] **Step 3: Реализовать**: `CurrentUser.changelogSeen`; создание пользователей; `markChangelogSeen`; страница `/whats-new` (`requireUser`, видимые релизы с `enabled: f => isEnabled(f, user.id)` — заранее `enabledFlags(user.id)`, `publicOnly: false`, `ReleaseList`, затем `markChangelogSeen(user.id, latest)` если `hasUnseen`; `revalidatePath` не нужен — следующий рендер layout уже читает новое значение); меню и точка (`span data-testid="whats-new-dot"` с `aria-label="Есть новое"` на аватаре, `size-2 rounded-full bg-primary`).
- [ ] **Step 4:** `npx vitest run && npm run typecheck && npm run lint && npm run build && npx playwright test changelog --workers=8` — PASS.
- [ ] **Step 5: Commit** `feat(changelog): what's new in the app with an unseen dot`; затем полный прогон `npm run test:e2e -- --workers=8`.
