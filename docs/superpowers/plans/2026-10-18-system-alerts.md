# Системные оповещения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** админ создаёт бегущую строку или попап с окном показа и режимом закрытия; вошедшие пользователи видят их в кабинете.

**Architecture:** таблицы `SystemAlert` и `SystemAlertDismissal`; чистые правила видимости в `lib/alerts/rules.ts`; layout `(app)` одним запросом грузит активные и ближайшие (24 ч) оповещения, клиентский `SystemAlerts` в `AppShell` показывает их по времени; админка `/admin/alerts` на server actions за `requireAdmin`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, Zod, shadcn/ui (Base UI), Tailwind, Lucide, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-system-alerts-design.md`

## Global Constraints

- Ветка `feat/system-alerts` от `release/2026-12-alerts`; по готовности — `git merge --no-ff` в релизную ветку.
- Весь текст интерфейса — по-русски; цвета — только семантические токены `app/globals.css` (обе темы).
- `body` 1–500 символов, `title` ≤ 80 (обязателен у `POPUP`), `ctaLabel` ≤ 30, `ctaHref` — `/…` (не `//`) или `https://…`.
- Строк одновременно ≤ 3; попап — по одному; порядок `CRITICAL` → `WARNING` → `INFO`, внутри — новее `startsAt` выше.
- `POPUP` + `NEVER` запрещено; `endsAt > startsAt`; `endsAt` может быть пусто.
- Загрузка в layout — в `quietly` (сбой → пустой список); запрос берёт `startsAt <= now + 24 ч`.
- Бесконечная прокрутка — только пока текст не влезает, пауза на hover/focus, при reduced motion — без анимации.
- `SystemAlertDismissal` — каскад от `User` и `SystemAlert`, в «Мои данные» не входит.
- Ссылки, оформленные кнопкой, — `<Link className={buttonVariants()}>`; Next.js 16 — сверяться с `node_modules/next/dist/docs/`.
- Миграция: проверить SQL — частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не должны удаляться.

## Review Focus

- Оповещение, у которого `endsAt` наступил при открытой вкладке, должно исчезнуть без перезагрузки (таймер `nextChange`) — тест в Task 3.
- `sessionStorage` недоступен (приватный режим, Telegram WebView) — закрытие `SESSION` всё равно скрывает до перезагрузки, без ошибки — тест чистой обёртки в Task 3.
- `dismissAlertAction` на удалённое оповещение (админ удалил, пока вкладка открыта) — тихо `ok`, не 500 — тест в Task 3.
- Попап открыт, а админ выключил оповещение — после следующей загрузки его нет; очередь из двух попапов — второй появляется после закрытия первого — e2e в Task 3.
- Админ редактирует `kind` с `BANNER/NEVER` на `POPUP` — сервер отвергает `NEVER` даже если клиент прислал — тест схемы в Task 1.

---

### Task 1: Данные и чистые правила

**Files:**
- Modify: `prisma/schema.prisma` (модели и enum из спеки; `User.alertDismissals SystemAlertDismissal[]`)
- Create: `prisma/migrations/<ts>_system_alerts/migration.sql` (через `npx prisma migrate dev --name system_alerts`)
- Create: `lib/alerts/rules.ts`, `lib/alerts/rules.test.ts`
- Create: `lib/alerts/schema.ts`, `lib/alerts/schema.test.ts`

**Interfaces:**
- Produces:
  - `type AlertView = { id: string; kind: "BANNER" | "POPUP"; tone: "INFO" | "WARNING" | "CRITICAL"; title: string | null; body: string; ctaLabel: string | null; ctaHref: string | null; dismiss: "NEVER" | "SESSION" | "FOREVER"; startsAt: string; endsAt: string | null }` (даты — ISO; `enabled` в клиент не уходит — загрузка берёт только включённые)
  - `isLive(a: Pick<AlertView,"startsAt"|"endsAt">, now: Date): boolean`
  - `alertOrder(a: AlertView, b: AlertView): number` (компаратор)
  - `visibleBanners(alerts: AlertView[], now: Date, hidden: ReadonlySet<string>): AlertView[]` — `MAX_BANNERS = 3`
  - `nextPopup(alerts: AlertView[], now: Date, hidden: ReadonlySet<string>): AlertView | null`
  - `nextChange(alerts: AlertView[], now: Date): Date | null`
  - `safeHref(href: string): boolean`
  - `alertInputSchema` (Zod), `type AlertInput = z.infer<…>`: `{ kind, tone, title?: string, body, ctaLabel?: string, ctaHref?: string, dismiss, startsAt: string (ISO), endsAt?: string (ISO) }`; пустые строки → `undefined` (`trim`)

- [ ] **Step 1: Модели и миграция.** Добавить в схему, `npx prisma migrate dev --name system_alerts`, просмотреть SQL (только CREATE TYPE/TABLE/INDEX, без DROP).
- [ ] **Step 2: Падающие тесты `rules.test.ts`:**
  - `isLive`: `startsAt == now` → true; `endsAt == now` → false; `endsAt null` → true; `startsAt > now` → false.
  - `alertOrder`: `[INFO новее, CRITICAL старше, WARNING]` → `CRITICAL, WARNING, INFO`; два `INFO` — новее первым.
  - `visibleBanners`: 5 живых строк → 3; скрытый id исключён; попапы не попадают.
  - `nextPopup`: скрытый первый → возвращает второй; нет живых → `null`.
  - `nextChange`: будущий `startsAt` через 10 мин и `endsAt` через 5 мин → момент через 5 мин; только прошлые моменты → `null`.
  - `safeHref`: true — `/whats-new`, `https://t.me/x`; false — `javascript:alert(1)`, `//evil.com`, `http://x.ru`, `whats-new`, `""`.
- [ ] **Step 3: Падающие тесты `schema.test.ts`:** попап без `title` → ошибка «Заголовок обязателен для попапа»; `POPUP` + `NEVER` → «Попап нельзя сделать незакрываемым»; `endsAt` ≤ `startsAt` → «Конец показа — позже начала»; `ctaLabel` без `ctaHref` (и наоборот) → «Укажите и подпись, и ссылку кнопки»; `ctaHref: "javascript:x"` → «Ссылка — /путь или https://»; `body` 501 символ → ошибка; валидная строка без конца и кнопки → `success`.
- [ ] **Step 4:** `npx vitest run lib/alerts` — FAIL (нет модулей).
- [ ] **Step 5:** Реализовать `rules.ts` и `schema.ts` (refine-проверки — `superRefine` с `path` на поле).
- [ ] **Step 6:** `npx vitest run lib/alerts` — PASS; `npm run typecheck` — чисто.
- [ ] **Step 7: Commit** `feat(alerts): SystemAlert models, visibility rules and form schema`.

### Task 2: Загрузка, действие закрытия, удаление аккаунта

**Files:**
- Create: `lib/alerts/queries.ts` (server-only), `lib/alerts/actions.ts` (`"use server"`)
- Modify: `e2e/db.ts` (хелперы), `e2e/account-data.spec.ts`

**Interfaces:**
- Consumes: `AlertView` (Task 1).
- Produces:
  - `getUserAlerts(userId: string, now?: Date): Promise<AlertView[]>` — `enabled: true`, `startsAt <= now + 24 ч`, `OR [endsAt null, endsAt > now]`, `dismissals: { none: { userId } }`, `select` только полей `AlertView`, даты → ISO.
  - `dismissAlertAction(id: string): Promise<{ ok: true }>` — `requireUser`; `id` не строка или длина > 64 → `ok`; `createMany({ data: [{ alertId, userId }], skipDuplicates: true })` в try/catch на P2003 (нет оповещения) → `ok`. Без `revalidatePath` (клиент уже скрыл).
  - e2e: `createAlert(a: Partial<…> & { kind: "BANNER" | "POPUP"; body: string }): Promise<string>` (SQL insert, по умолчанию `startsAt = now() - 1 min`, `enabled = true`, `dismiss = 'FOREVER'`, `tone = 'INFO'`), `clearAlerts(): Promise<void>`, `alertDismissals(login: string): Promise<number>`, `dismissAlertFor(login: string, alertId: string): Promise<void>`.

- [ ] **Step 1: Падающий e2e** в `account-data.spec.ts`: «alert dismissal does not block deletion» — `createAlert({ kind: "BANNER", body: "e2e-deleted", enabled: false })` (выключено — соседние спеки его не видят), запись о закрытии для пользователя через SQL-хелпер `dismissAlertFor(login, id)`, удаление аккаунта → `userExists` false и `alertDismissals` = 0.
- [ ] **Step 2:** Реализовать `queries.ts`, `actions.ts`, хелперы `e2e/db.ts`.
- [ ] **Step 3:** `npm run build && npx playwright test account-data --project=desktop --workers=8` — PASS (каскад из Task 1).
- [ ] **Step 4: Commit** `feat(alerts): load user alerts and dismiss action`.

### Task 3: Показ в кабинете — строка и попап

**Files:**
- Modify: `app/globals.css` (`--warning`, `--warning-foreground` в обеих темах + `--color-warning*` в `@theme`; янтарный: светлая `oklch(0.769 0.188 70.08)` / текст `oklch(0.279 0.077 45.635)`, тёмная `oklch(0.828 0.189 84.429)` / текст `oklch(0.279 0.077 45.635)`), CSS-анимация `@keyframes alert-marquee` (translateX от 0 до -100% + gap)
- Create: `components/alerts/system-alerts.tsx` (клиент: таймер `nextChange`, скрытые, очередь), `components/alerts/alert-banner.tsx`, `components/alerts/alert-popup.tsx`, `components/alerts/hidden-store.ts` + `hidden-store.test.ts`
- Modify: `components/app/app-shell.tsx` (проп `alerts?: ReactNode`, рендер над `<header>` в колонке контента — строки не липкие, шапка остаётся sticky), `app/(app)/layout.tsx` (`quietly(() => getUserAlerts(user.id), [])` в `Promise.all`)
- Modify: `playwright.config.ts` (проект `alerts-global`), Create: `e2e/system-alerts.spec.ts`

**Interfaces:**
- Consumes: `AlertView`, `visibleBanners`, `nextPopup`, `nextChange` (Task 1); `getUserAlerts`, `dismissAlertAction`, `createAlert`, `clearAlerts` (Task 2).
- Produces:
  - `<SystemAlerts alerts={AlertView[]} />`; `<AlertBanner alert onDismiss?: () => void />` и `<AlertPopup alert open onDismiss?: () => void />` — без `onDismiss` действия не показываются (для превью в Task 4).
  - `hidden-store.ts`: `readSessionHidden(storage: Pick<Storage,"getItem"> | null): Set<string>`, `writeSessionHidden(storage: Pick<Storage,"setItem"> | null, ids: Set<string>): void` — ключ `hf_alerts_hidden`, JSON-массив, любые исключения/битый JSON → пустой набор / молча.

Поведение (из спеки): строка — `role="region"` `aria-label="Оповещение"`, иконки `Info`/`TriangleAlert`/`OctagonAlert`, крестик `aria-label="Закрыть оповещение"` только при `dismiss !== "NEVER"`; переполнение — `ResizeObserver`, класс прокрутки только при переполнении, `motion-reduce:` — без анимации, `truncate`, по нажатию на текст — раскрыть (`aria-expanded`). Попап — `Dialog`, кнопки «Понятно» и CTA; закрытие диалога любым способом = dismiss. Нажатие CTA = dismiss. Внешняя ссылка — `target="_blank" rel="noopener noreferrer"`. `FOREVER` — скрыть локально сразу, затем `dismissAlertAction` (ошибку игнорировать); `SESSION` — в набор и `writeSessionHidden(sessionStorage)`.

- [ ] **Step 1: Падающий unit `hidden-store.test.ts`:** чтение `null` storage → пусто; битый JSON → пусто; `getItem` бросает → пусто; запись и чтение `{a,b}` через фейковый storage → `{a,b}`; `setItem` бросает → без исключения.
- [ ] **Step 2:** Реализовать `hidden-store.ts`; `npx vitest run components/alerts` — PASS.
- [ ] **Step 3: Проект Playwright:** `GLOBAL_ALERTS = /system-alerts\.spec\.ts/` в `testIgnore` у `desktop`, `mobile` и `clubs-global`; `{ name: "alerts-global", testMatch: GLOBAL_ALERTS, dependencies: ["clubs-global"], use: { ...devices["Desktop Chrome"] } }`.
- [ ] **Step 4: Падающие e2e `system-alerts.spec.ts`** (`mode: "serial"`, `beforeEach` → `clearAlerts()`, `afterAll` → `clearAlerts()`):
  - строка `FOREVER`: видна на `/dashboard` (region «Оповещение» с текстом), закрытие → пропала, `reload` → нет, `alertDismissals(login)` = 1;
  - `SESSION`: закрыть → пропала, `reload` в той же вкладке → нет, новый контекст того же пользователя (вход заново) → видна;
  - `NEVER`: кнопки «Закрыть оповещение» нет;
  - запланированное (`startsAt = now + 1 ч`) не видно; выключенное (`enabled: false`) не видно;
  - уходит по времени: `endsAt = now + 3 s` → видна, затем `expect(...).toBeHidden({ timeout: 10_000 })` без перезагрузки;
  - два попапа (`CRITICAL` и `INFO`): виден диалог с заголовком критичного, «Понятно» → виден второй, «Понятно» → диалогов нет;
  - длинная строка (400 символов) при `reducedMotion: "reduce"`: нажатие на текст → `aria-expanded="true"`;
  - CTA `/whats-new` в строке: нажатие → URL `/whats-new`, строки нет.
- [ ] **Step 5:** Добавить токены, компоненты, проп `AppShell`, загрузку в layout.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm run build && npx playwright test system-alerts --project=alerts-global` — PASS. Глазами проверить светлую и тёмную темы на desktop и 390 px (Playwright MCP скриншоты).
- [ ] **Step 7: Commit** `feat(alerts): banner and popup in the app shell`.

### Task 4: Админка `/admin/alerts`

**Files:**
- Create: `app/(app)/admin/alerts/page.tsx`, `components/alerts/admin/alert-form.tsx` (клиент), `components/alerts/admin/alert-list-item.tsx`, `lib/alerts/admin-actions.ts` (`"use server"`), `lib/alerts/admin-queries.ts` (server-only), `lib/alerts/admin-view.ts` + `admin-view.test.ts`
- Modify: `components/app/user-menu.tsx` (пункт «Оповещения» → `/admin/alerts` после «Флаги», иконка `Megaphone`), `e2e/system-alerts.spec.ts`

**Interfaces:**
- Consumes: `alertInputSchema`, `AlertInput` (Task 1); `AlertBanner`, `AlertPopup` без `onDismiss` для превью (Task 3).
- Produces:
  - `groupAlerts<T extends { enabled: boolean; startsAt: Date; endsAt: Date | null }>(rows: T[], now: Date): { live: T[]; planned: T[]; past: T[] }` в `admin-view.ts` — выключенные и закончившиеся → `past`; `live` и `planned` — по `startsAt` возрастанию, `past` — убыванию.
  - `getAlertsAdmin(): Promise<(SystemAlert & { _count: { dismissals: number } })[]>`
  - `saveAlertAction(id: string | null, input: unknown): Promise<{ ok: true } | { ok: false; error: string }>` — `requireAdmin`, `alertInputSchema.safeParse`, create (с `createdBy: admin.login`) или update; `revalidatePath("/", "layout")`; лог `[alerts] <login>: save <id>`.
  - `toggleAlertAction(id: string, enabled: boolean)`, `deleteAlertAction(id: string)` — тот же `Result`, `requireAdmin`, `revalidatePath("/", "layout")`.

Страница: `requireAdmin`, `PageHeader` «Оповещения» («Бегущая строка и попапы для всех в кабинете»), кнопка «Новое оповещение» открывает форму, секции «Идут сейчас» / «Запланированы» / «Прошедшие и выключенные» (`aria-label` по заголовку, пустая — «Нет»). Элемент: вид, тон, начало—конец в `admin.timeZone` (`Intl.DateTimeFormat("ru-RU", { timeZone, dateStyle: "short", timeStyle: "short" })`, конец пуст → «пока не выключат»), режим закрытия, «Закрыли: N», `Switch` «Включено», «Изменить», «Удалить» (через `AlertDialog`). Форма: `RadioGroup` вида и тона, `Input` заголовка (только попап), `Textarea` текста со счётчиком `n/500`, подпись и ссылка кнопки, `RadioGroup` режима («Нельзя закрыть» скрыт у попапа, при смене на попап `NEVER` → `FOREVER`), `datetime-local` начала (по умолчанию сейчас) и конца; при отправке — `new Date(v).toISOString()`; ошибка сервера — под формой; живое превью.

- [ ] **Step 1: Падающий unit `admin-view.test.ts`:** живое, будущее, закончившееся, выключенное живое → по группам; сортировки по спеке.
- [ ] **Step 2:** Реализовать `admin-view.ts`; vitest — PASS.
- [ ] **Step 3: Падающие e2e** (в `system-alerts.spec.ts`): не админ → `/admin/alerts` 404; админ создаёт строку «Техработы в 23:00» с режимом «Можно закрыть навсегда» → в «Идут сейчас», в шапке у админа видна; второй пользователь закрывает → у админа «Закрыли: 1»; выключение → у второго после reload нет; выбор «Попап» скрывает «Нельзя закрыть»; попап без заголовка → ошибка «Заголовок обязателен для попапа»; удаление → элемента нет.
- [ ] **Step 4:** Реализовать запросы, actions, страницу, форму, пункт меню.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test system-alerts --project=alerts-global` — PASS.
- [ ] **Step 6: Документация:** раздел «Системные оповещения» в `docs/features/platform.md` (модели, правила, режимы, `/admin/alerts`, проект `alerts-global`, e2e-хелперы); строка в `CLAUDE.md` «Фичи — подробности» → упоминание оповещений в описании `platform.md`.
- [ ] **Step 7: Commit** `feat(alerts): admin page to schedule alerts`.

### Task 5: Проверка и слияние в релиз

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — всё зелёное (записать числа).
- [ ] **Step 2:** Ревью ветки (`superpowers:requesting-code-review`), правки — отдельными коммитами.
- [ ] **Step 3:** `git checkout release/2026-12-alerts && git merge --no-ff feat/system-alerts && git branch -d feat/system-alerts`.
