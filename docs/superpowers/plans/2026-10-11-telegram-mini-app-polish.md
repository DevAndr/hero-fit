# Telegram Mini App: оформление — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** внутри Telegram кабинет Hero Fit получает системную «Назад», тему в тон Telegram, вибрацию, защиту от случайного закрытия и безопасные зоны; вне Telegram ничего не меняется.

**Architecture:** признак Mini App — `Session.embedded`, читается в `getCurrentUser` и отдаётся как `CurrentUser.embedded`. Layout `(app)` для встроенных сессий оборачивает кабинет в клиентский `TelegramMiniApp` (грузит SDK, запуск, тема, BackButton, безопасные зоны, контекст `useTelegram`). Логика — чистые функции в `lib/telegram/{back,theme}.ts`, обращения к SDK — только через `lib/telegram/webapp.ts`.

**Tech Stack:** Next.js 16 (App Router, `next/script`), next-themes, Telegram Web Apps SDK (`telegram-web-app.js`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-telegram-mini-app-polish-design.md`

## Global Constraints

- SDK — только `https://telegram.org/js/telegram-web-app.js`, только для `embedded`-сессий; обычные пользователи его не грузят.
- Любой вызов SDK — через `tg()`; вне Telegram (нет SDK или пустой `initData`) — no-op. Ошибка вызова глотается.
- Версии: `disableVerticalSwipes` — 7.7, `setBottomBarColor` — 7.10, `safeAreaInset`/`contentSafeAreaInset` и их события — 8.0; вызывать только при `tgSupports(<версия>)`.
- Тема: только `colorScheme` → `"light" | "dark"` next-themes; `themeParams` в токены не подставлять.
- Корневые разделы (BackButton скрыта): все `href` из `NAV_ITEMS` и `/coach`.
- Тексты: «Тема — как в Telegram».
- Next 16: перед кодом сверяться с `node_modules/next/dist/docs/` (`next/script` в client component).
- Цвета — семантические токены; новых бесконечных анимаций нет.

## Review Focus

- Встроенная сессия открыта в обычном браузере (SDK есть/нет, `initData` пуст) — кабинет как обычно, тема из `/settings` не перебивается, BackButton/haptic — no-op. → unit `tg()` в Task 1.
- Первая страница после `/tg` (истории нет) — «Назад» ведёт в родителя, а не из приложения. → e2e в Task 2.
- Смена темы Telegram во время работы — тема и цвет шапки обновляются, цвет берётся уже после смены класса на `<html>`. → e2e в Task 2.
- Подтверждение закрытия не «залипает» после завершения/отмены тренировки (размонтирование). → e2e в Task 3.
- Старый клиент без `isVersionAtLeast` или с версией < 7.7 — нет исключений, приложение работает. → unit `tgSupports` в Task 1.

---

### Task 1: Чистые модули Telegram

**Files:**
- Create: `lib/telegram/webapp.ts`, `lib/telegram/back.ts`, `lib/telegram/theme.ts`
- Test: `lib/telegram/webapp.test.ts`, `lib/telegram/back.test.ts`, `lib/telegram/theme.test.ts`

**Interfaces:**
- Produces:
  - `type WebApp` — используемая часть SDK: `initData`, `version`, `colorScheme`, `isVersionAtLeast?`, `ready`, `expand`, `disableVerticalSwipes?`, `enableClosingConfirmation`, `disableClosingConfirmation`, `setHeaderColor`, `setBackgroundColor`, `setBottomBarColor?`, `onEvent(name, cb)`, `offEvent(name, cb)`, `safeAreaInset?`, `contentSafeAreaInset?` (`{top,bottom,left,right}`), `BackButton: { show(); hide(); onClick(cb); offClick(cb) }`, `HapticFeedback: { impactOccurred(style); notificationOccurred(type) }`.
  - `tg(): WebApp | null` — `window.Telegram?.WebApp`, `null` на сервере, без SDK или при пустом `initData`.
  - `tgSupports(app: WebApp, version: string): boolean` — `isVersionAtLeast` если есть, иначе `false`; исключение → `false`.
  - `tgCall(fn: () => void): void` — выполнить, ошибку проглотить.
  - `haptic(kind: "light" | "success" | "warning"): void` — в Telegram: `light` → `impactOccurred("light")`, остальные → `notificationOccurred(kind)`; вне Telegram — ничего.
  - `isRootPath(pathname: string): boolean`, `backTarget(pathname: string): string | null` (`lib/telegram/back.ts`).
  - `themeForScheme(scheme: unknown): "light" | "dark"` — `"light"` только для `"light"`, иначе `"dark"`; `toHex(color: string): string | null` — `#rgb`/`#rrggbb`/`rgb(r, g, b)`/`rgba(...)` → `#rrggbb` (нижний регистр), иное → `null` (`lib/telegram/theme.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// back.test.ts
expect(isRootPath("/dashboard")).toBe(true);
expect(isRootPath("/coach")).toBe(true);
expect(isRootPath("/templates")).toBe(true);
expect(isRootPath("/workouts/abc")).toBe(false);
expect(backTarget("/dashboard")).toBeNull();
expect(backTarget("/workouts/abc")).toBe("/training");
expect(backTarget("/workouts/abc/story")).toBe("/training");
expect(backTarget("/stats/exercises/x")).toBe("/stats");
expect(backTarget("/coach/clients/x")).toBe("/coach");
expect(backTarget("/coach/page")).toBe("/coach");
expect(backTarget("/settings")).toBe("/dashboard");
expect(backTarget("/recap")).toBe("/dashboard");
expect(backTarget("/templates/x/edit")).toBe("/templates");
// theme.test.ts
expect(themeForScheme("light")).toBe("light");
expect(themeForScheme("dark")).toBe("dark");
expect(themeForScheme(undefined)).toBe("dark");
expect(toHex("#0B0D12")).toBe("#0b0d12");
expect(toHex("#fff")).toBe("#ffffff");
expect(toHex("rgb(11, 13, 18)")).toBe("#0b0d12");
expect(toHex("rgba(255, 255, 255, 0.5)")).toBe("#ffffff");
expect(toHex("oklch(0.2 0 0)")).toBeNull();
// webapp.test.ts — подменяя globalThis.window
// tg(): нет window.Telegram → null; initData "" → null; initData "x" → объект
// tgSupports: без isVersionAtLeast → false; бросает → false; ("7.7") при isVersionAtLeast → его ответ
// haptic("light") → impactOccurred("light"); haptic("success") → notificationOccurred("success"); без SDK — не бросает
```

`backTarget`: корень → `null`; иначе — самый длинный корневой путь (из `NAV_ITEMS` + `/coach`), являющийся префиксом сегментов, кроме самого пути; `/workouts/*` → `/training`; ничего не подошло → `/dashboard`.

- [ ] **Step 2: Run** `npx vitest run lib/telegram/back.test.ts lib/telegram/theme.test.ts lib/telegram/webapp.test.ts` — FAIL (модулей нет).

- [ ] **Step 3: Implement** три модуля по Interfaces. `toHex` для `oklch` — `null` (цвет из `getComputedStyle` в браузерах приходит как есть; Task 2 конвертирует через canvas, см. там).

- [ ] **Step 4: Run** те же тесты — PASS.

- [ ] **Step 5: Commit** `feat(telegram): pure helpers for Mini App — SDK access, haptics, back target, theme`

### Task 2: Провайдер Mini App — SDK, запуск, тема, BackButton, безопасные зоны

**Files:**
- Modify: `lib/auth/dal.ts` (`CurrentUser.embedded: boolean` из `session.embedded`)
- Create: `components/telegram/telegram-mini-app.tsx`
- Modify: `app/(app)/layout.tsx` (обёртка при `user.embedded`), `components/app/app-shell.tsx` (шапка: `pt-(--tg-safe-top)`), `components/app/nav-links.tsx` (нижняя панель: к `env(safe-area-inset-bottom)` прибавить `--tg-safe-bottom`), `app/globals.css` (`:root { --tg-safe-top: 0px; --tg-safe-bottom: 0px; }`)
- Modify: `e2e/telegram-webapp.ts` (`mockTelegram` — запись вызовов и события)
- Create: `e2e/telegram-polish.spec.ts`

**Interfaces:**
- Consumes: Task 1 целиком.
- Produces:
  - `TelegramMiniApp({ children }: { children: ReactNode })` — клиентский провайдер.
  - `useTelegram(): { inTelegram: boolean }` — вне провайдера `false`; внутри — `true` после того, как `tg()` вернул объект.
  - `useClosingConfirmation(active: boolean): void` — экспорт отсюда же (использует Task 3).
  - `mockTelegram(page, opts)` — дополнительно `opts.colorScheme?: "light" | "dark"`, `opts.version?: string` (по умолчанию `"8.0"`); SDK-заглушка пишет каждый вызов в `window.__tgCalls: [method: string, ...args][]` и хранит обработчики; e2e-хелперы `tgCalls(page)`, `tgEmit(page, event, patch?)` (`patch` — например `{ colorScheme: "light" }` применяется до вызова обработчиков), `tgBack(page)` (нажатие BackButton).

Провайдер:
1. `<Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={init} />`. Сверить с докой `next/script` в `node_modules/next/dist/docs/`.
2. `init`: `app = tg()`; нет — выход. `ready()`, `expand()`, при `tgSupports("7.7")` — `disableVerticalSwipes()`.
3. Тема: `setTheme(themeForScheme(app.colorScheme))`; на `themeChanged` — снова. Цвета шапки/фона/панели — в `useEffect` от `resolvedTheme`: `getComputedStyle(document.body).backgroundColor` → `toHex`; если `null` (oklch) — нарисовать пиксель цветом на 1×1 canvas и прочитать `getImageData` → hex. `setHeaderColor(hex)`, `setBackgroundColor(hex)`, при `tgSupports("7.10")` — `setBottomBarColor(hex)`.
4. BackButton: по `usePathname()` — `isRootPath` → `hide()`, иначе `show()`. Обработчик: счётчик переходов в `useRef` (увеличивается при смене `pathname`, первая страница — 0); `> 0` → `router.back()`, иначе `router.push(backTarget(pathname) ?? "/dashboard")`. `onClick`/`offClick` в эффекте.
5. Безопасные зоны при `tgSupports("8.0")`: `--tg-safe-top = safeAreaInset.top + contentSafeAreaInset.top`, `--tg-safe-bottom = safeAreaInset.bottom + contentSafeAreaInset.bottom` (px) на `document.documentElement`; обновлять на `safeAreaChanged`/`contentSafeAreaChanged`.
6. Все `onEvent` снимаются `offEvent` в cleanup.

- [ ] **Step 1: Write the failing e2e** (`e2e/telegram-polish.spec.ts`; вход — как в `telegram-app.spec.ts`: `mockTelegram` + `/tg` → «Начать» с согласием → `/dashboard`)

```ts
test("back button: hidden on root pages, goes back inside, to parent on first page", ...)
// /dashboard: последний вызов BackButton — hide; переход на /settings (по ссылке в меню) → show;
// tgBack → URL /dashboard. Затем page.goto("/stats") ... page.goto("/workouts/<id завершённой>") без истории
// в провайдере (полная загрузка) → tgBack → /training.
test("Telegram colour scheme sets the theme and the header colour", ...)
// mockTelegram colorScheme "light" → <html> class содержит "light"; в __tgCalls есть setHeaderColor с /^#[0-9a-f]{6}$/;
// tgEmit(page, "themeChanged", { colorScheme: "dark" }) → class "dark", новый setHeaderColor с другим цветом.
test("startup: ready, expand, vertical swipes off", ...)
// __tgCalls содержит ready, expand, disableVerticalSwipes; с version "7.0" — disableVerticalSwipes нет.
test("plain sign-in does not load the Telegram SDK", ...)
// registerUser; слушать page.on("request"): ни одного запроса к telegram.org на /dashboard и /settings.
```

Для «завершённой тренировки» — существующие хелперы e2e (`e2e/db.ts`), как в соседних спеках.

- [ ] **Step 2: Run** `npm run build && npx playwright test telegram-polish` — FAIL.

- [ ] **Step 3: Implement** `embedded` в `dal.ts` (select `embedded: true` у сессии), провайдер, обёртку в layout, CSS-переменные и отступы, расширение `mockTelegram` (существующие сценарии `telegram-app.spec.ts` не ломать: прежние поля заглушки остаются).

- [ ] **Step 4: Run** `npm run build && npx playwright test telegram-polish telegram-app` — PASS; `npm run typecheck && npm run lint` — чисто.

- [ ] **Step 5: Commit** `feat(telegram): Mini App provider — SDK in the cabinet, theme from Telegram, back button, safe areas`

### Task 3: Вибрация, подтверждение закрытия, скрытые элементы

**Files:**
- Modify: `components/training/exercise-block.tsx` (подтверждение подхода — `haptic("light")` в ветке `onComplete`)
- Modify: `components/training/rest-timer.tsx` (`notifyDone`: `haptic("warning")`, `navigator.vibrate` остаётся вне Telegram; `NotificationToggle` → `null` при `useTelegram().inTelegram`)
- Modify: `components/progress/level-up-bar.tsx` (`haptic("success")` в `onLevelUp`), `components/achievements/achievement-toaster.tsx` (`haptic("success")` один раз на пачку свежих), `components/workouts/workout-summary-view.tsx` (`haptic("success")` при `freshFinish && !readOnly && meta.records.length > 0`, один раз)
- Modify: `components/training/workout-editor.tsx` (`useClosingConfirmation(true)` — редактор открыт только для активной тренировки)
- Modify: `app/(app)/settings/page.tsx` (при `user.embedded`: вместо `<ThemeSettings />` — карточка с текстом «Тема — как в Telegram»; `PushDeviceCard` не рендерится)
- Test: `e2e/telegram-polish.spec.ts`

**Interfaces:**
- Consumes: `haptic` (Task 1), `useTelegram`, `useClosingConfirmation` (Task 2), `tgCalls`/`mockTelegram` (Task 2).
- Produces: —

`useClosingConfirmation(active)`: при `active` и наличии `tg()` — `enableClosingConfirmation()`, cleanup — `disableClosingConfirmation()`.

- [ ] **Step 1: Write the failing e2e**

```ts
test("set confirm vibrates through Telegram", ...)
// Mini App вход → /training → пустая тренировка → addToWorkout (e2e/helpers.ts) → «Подход 1 выполнен»
// → __tgCalls содержит ["impactOccurred", "light"].
test("closing confirmation only while the workout editor is open", ...)
// в редакторе: последний из enable/disableClosingConfirmation — enable; завершить тренировку
// (поток как в соседних спеках) → на сводке последний — disable.
test("settings in Telegram: theme follows Telegram, no push card", ...)
// /settings: виден текст «Тема — как в Telegram»; нет радиогруппы темы; нет PushDeviceCard (по её заголовку).
// Тот же /settings при обычном входе — выбор темы на месте.
```

- [ ] **Step 2: Run** `npm run build && npx playwright test telegram-polish` — новые FAIL.

- [ ] **Step 3: Implement** по списку файлов.

- [ ] **Step 4: Run** `npm run build && npx playwright test telegram-polish telegram-app training rest` — PASS (имена спеков сверить через `ls e2e`); `npm test`, `npm run typecheck`, `npm run lint` — чисто.

- [ ] **Step 5: Commit** `feat(telegram): haptics, closing confirmation during a workout, Telegram-only settings`

### Task 4: Документация и полный прогон

**Files:**
- Modify: `CLAUDE.md` (пункт «Telegram Mini App»: подпроект 3 — признак `CurrentUser.embedded`, `TelegramMiniApp`/`useTelegram`/`useClosingConfirmation`, `lib/telegram/{webapp,back,theme}.ts`, корневые разделы, тема только по `colorScheme`, `--tg-safe-*`, что скрыто в Telegram; e2e — `tgCalls`/`tgEmit`/`tgBack`)

- [ ] **Step 1:** обновить `CLAUDE.md`.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` — всё зелёное (флейки mobile с «Tearing down context» перезапустить `--last-failed`, в отчёте указать).
- [ ] **Step 3: Commit** `docs: Telegram Mini App polish in CLAUDE.md`
