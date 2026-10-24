# Скины магазина — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** четыре легендарные темы магазина со своим фоном и режимом («Киберпанк», «Глубина», «Кузница», «Сепия»).

**Architecture:** скин — второй подвид `kind: "theme"` в каталоге с полной hex-палитрой одного режима; `themeStyle`
пишет её в `:root:root` и `:root.dark`, клиентский `ThemeModeLock` в layout кабинета держит класс режима на `<html>`.
Обычные темы не меняются.

**Tech Stack:** Next.js 16 (App Router), React 19, next-themes 0.4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-shop-skins-design.md`

## Global Constraints

- Ветка `feat/shop-skins` от `release/2027-04-skins`; в релизную — `--no-ff` после ревью.
- Всё под флагом `shop` (как весь магазин): без флага ни стиля, ни замка.
- Значения палитры — только `#rrggbb`.
- Цена скина — 2000 (`PRICES.theme.legendary = 2000`), `rarity: "legendary"`, `acquire: "coins"`.
- Коды: `theme:cyberpunk`, `theme:abyss`, `theme:forge`, `theme:sepia`; названия «Киберпанк», «Глубина», «Кузница», «Сепия».
- localStorage `theme` (выбор пользователя) скин не меняет никогда.
- Лендинг (`app/(marketing)`) скины не затрагивают.
- Тексты интерфейса — по-русски, как в спеке.

## Review Focus

1. Скин надет, системная тема меняется на лету → кабинет остаётся в режиме скина (тест — Task 3).
2. Telegram Mini App шлёт `themeChanged` при надетом скине → режим скина держится (тест — Task 3).
3. Скин снят → режим возвращается к выбору пользователя без перезагрузки (тест — Task 3).
4. В `themeCode` лежит код, которого нет в каталоге (удалённый предмет) → ни стиля, ни замка, кабинет стандартный (тест — Task 2, `themeStyle` не вызывается: `itemByCode` → `null`; проверка в unit-тесте `skinOf("theme:nope") === null`).
5. Пользователь со скином открывает лендинг → лендинг в его собственном режиме и стандартной палитре (тест — Task 3).

---

### Task 1: Модель скина, четыре палитры, тесты контраста

**Files:**
- Modify: `lib/shop/catalog.ts` (типы, `PRICES.theme.legendary`, фабрика `skin`, 4 скина, `isSkin`, `skinOf`)
- Modify: `lib/shop/contrast.ts` (hex-эквиваленты смысловых цветов)
- Modify: `components/shop/item-dialog.tsx` (только чтобы компилировалось: обычная тема сужается через `!isSkin`; превью скина — Task 4)
- Test: `lib/shop/catalog.test.ts`

**Interfaces:**
- Produces:
  - `export type SkinPalette` — ровно поля из спеки (раздел «Модель»).
  - `ShopItem` для темы — `{ kind: "theme"; light: ThemeTokens; dark: ThemeTokens } | { kind: "theme"; mode: "dark" | "light"; palette: SkinPalette }`.
  - `export type SkinItem = ShopItem & { kind: "theme"; mode: "dark" | "light"; palette: SkinPalette }`.
  - `export function isSkin(item: ShopItem): item is SkinItem` — `"palette" in item`.
  - `export function skinOf(code: string | null | undefined): SkinItem | null` — через `itemByCode`.
  - `export const SEMANTIC_HEX = { light: { destructive: "#e7000b", warning: "#fe9a00" }, dark: { destructive: "#ff6467", warning: "#ffb900" } } as const` в `contrast.ts` (hex-эквиваленты `--destructive`/`--warning` из `app/globals.css`).

- [ ] **Step 1: Тесты** — в `catalog.test.ts`:
  - обновить счётчик тем: `of("theme")` — 15; `expect(of("theme").filter(isSkin).map((i) => i.code)).toEqual(["theme:cyberpunk", "theme:abyss", "theme:forge", "theme:sepia"])`;
  - `it("скины: легендарные за 2000, режим и hex")` — у каждого `rarity === "legendary"`, `price === 2000`, `acquire === "coins"`; `mode` у трёх первых `"dark"`, у Сепии `"light"`; каждое значение `palette` соответствует `/^#[0-9a-f]{6}$/`;
  - `it("скины: контраст")` — пороги из таблицы спеки (раздел «Тесты»), смысловые цвета — `SEMANTIC_HEX[skin.mode]` на `palette.card`; сообщение — `${code} ${пара}`;
  - `it("скин по коду")` — `skinOf("theme:cyberpunk")?.name === "Киберпанк"`, `skinOf("theme:ocean") === null`, `skinOf("theme:nope") === null`, `skinOf(null) === null`;
  - существующий тест «темы: primary виден…» — пропускать скины (`if (i.kind !== "theme" || isSkin(i)) continue`).
- [ ] **Step 2:** `npx vitest run lib/shop/catalog.test.ts` — FAIL (нет `isSkin`/скинов).
- [ ] **Step 3: Реализация.** Фабрика `skin(id, name, mode, palette)` рядом с `theme(...)`, скины — в конец блока «Темы». Стартовые значения из таблицы спеки (`background`, `card`, `primary`, `chart2`); остальные токены подобрать так, чтобы прошли пороги: `foreground`/`cardForeground` — почти белый (тёмные) или тёмно-коричневый `#3b2a1a` (Сепия); `popover` = `card`; `sidebar` = `background`; `input` = `border`; `ring` = `primary`; `sidebarPrimary` = `primary`; `xp`/`streak` — тёплые жёлтый/оранжевый, светлее на тёмных и темнее на Сепии. `item-dialog.tsx`: в `ItemPreview` ветку темы ограничить `!isSkin(item)` (скин пока рисуется как обычный предмет-заглушка — достаточно не ломать типы).
- [ ] **Step 4:** `npx vitest run lib/shop` и `npm run typecheck` — PASS. Если тип `ShopItem` ломает другие места (`lib/shop/*`, `components/shop/*`), сужать через `isSkin`.
- [ ] **Step 5: Commit** — `feat(shop): skin palettes — four legendary themes with their own background`.

### Task 2: `themeStyle` для скина

**Files:**
- Modify: `lib/shop/theme-style.ts`
- Test: `lib/shop/theme-style.test.ts` (новый)

**Interfaces:**
- Consumes: `isSkin`, `SkinItem`, `SkinPalette` (Task 1).
- Produces: `themeStyle(item: ShopItem & { kind: "theme" }): string` — та же сигнатура; для скина — палитра в оба селектора.
  Соответствие полей и CSS-переменных — kebab-case с цифрой через дефис: `cardForeground` → `--card-foreground`,
  `chart1` → `--chart-1`, `series3` → `--series-3`, `sidebarPrimaryForeground` → `--sidebar-primary-foreground`.

- [ ] **Step 1: Тесты:**
  - `it("обычная тема — прежняя строка")` — для `itemByCode("theme:ocean")` строка равна `":root:root{--primary:#0369a1;--primary-foreground:#ffffff;--ring:#0284c7;--chart-1:#0284c7;}:root.dark{--primary:#38bdf8;--primary-foreground:#082f49;--ring:#38bdf8;--chart-1:#38bdf8;}"`;
  - `it("скин — все токены в обоих селекторах и color-scheme")` — для каждого скина: строка содержит `:root:root{` и `:root.dark{`; для каждого ключа палитры `--<kebab>:<значение>;` встречается ровно 2 раза; `color-scheme:<mode>;` — 2 раза.
- [ ] **Step 2:** `npx vitest run lib/shop/theme-style.test.ts` — FAIL на втором тесте.
- [ ] **Step 3:** Реализация в `theme-style.ts`; блок скина: `color-scheme:${mode};` + все токены.
- [ ] **Step 4:** тесты PASS.
- [ ] **Step 5: Commit** — `feat(shop): skin style — full palette for both selectors`.

### Task 3: `ThemeModeLock` в кабинете

**Files:**
- Create: `components/shop/theme-mode-lock.tsx` (client)
- Modify: `app/(app)/layout.tsx` (рядом с `<style>{themeStyle(theme)}</style>`)
- Test: `e2e/shop-skins.spec.ts` (новый)

**Interfaces:**
- Consumes: `isSkin` (Task 1), `themeStyle` (Task 2); `useTheme().resolvedTheme` из `next-themes`.
- Produces: `export function ThemeModeLock({ mode }: { mode: "dark" | "light" }): null`.

- [ ] **Step 1: e2e** (helpers: `registerUser`, `addFlagUser("shop")`, `equipItem(login, "theme", code)` из `e2e/db.ts`):
  - `test("dark skin locks the cabinet dark even on a light system")` — `emulateMedia({ colorScheme: "light" })`, надет `theme:cyberpunk` → `/dashboard`: `html` с классом `dark`; `getComputedStyle(html).getPropertyValue("--background").trim() === "#0d0221"`; `getComputedStyle(html).colorScheme === "dark"`; `reload` — то же; затем `emulateMedia({ colorScheme: "light" → "dark" → "light" })` — класс остаётся `dark` (Review Focus 1);
  - `test("light skin locks the cabinet light on a dark system")` — `theme:sepia`, тёмная система → класс `light`, `--background` `#f4ecd8`;
  - `test("taking the skin off returns the user's own mode")` — светлая система, надет Киберпанк, на `/shop?tab=theme` открыть «Стандартная» → «Надеть» → без перезагрузки класс `light` (Review Focus 3);
  - `test("Telegram theme change does not beat the skin")` — Mini App (`openMiniApp`/`tgEmit` из `e2e/telegram-polish.spec.ts`, вынести в `e2e/telegram-webapp.ts`, если они локальные) со `colorScheme: "light"`, надет Киберпанк → класс `dark`; `tgEmit(page, "themeChanged", { colorScheme: "light" })` → всё ещё `dark` (Review Focus 2);
  - `test("the landing keeps the user's own look")` — светлая система, надет Киберпанк, `goto("/")` → класс `light`, `--background` не `#0d0221` (Review Focus 5).
- [ ] **Step 2:** `npm run build && npx playwright test shop-skins --project=desktop` — FAIL (класс не тот).
- [ ] **Step 3: Реализация.** `useLayoutEffect`: снять `light`/`dark`, добавить `mode`, `style.colorScheme = mode`; `MutationObserver` на `attributeFilter: ["class"]` — если класс режима не `mode`, вернуть (без бесконечного цикла: менять только при расхождении). Очистка — `disconnect()` и класс/`colorScheme` по `resolvedTheme ?? "dark"`. В layout: `{theme?.kind === "theme" && isSkin(theme) ? <ThemeModeLock mode={theme.mode} /> : null}`.
- [ ] **Step 4:** e2e PASS (desktop и mobile).
- [ ] **Step 5: Commit** — `feat(shop): ThemeModeLock keeps the skin's mode in the cabinet`.

### Task 4: Превью скина в магазине, покупка

**Files:**
- Modify: `components/shop/item-dialog.tsx` (`ItemPreview`)
- Test: `e2e/shop-skins.spec.ts`

**Interfaces:**
- Consumes: `isSkin`, `SkinItem` (Task 1).
- Produces: превью с `data-testid="skin-preview"` и подписью «Тёмная тема» / «Светлая тема».

- [ ] **Step 1: e2e** — `test("buying a skin: preview, price and the balance")`: `setCoins(login, 2000)`, `/shop?tab=theme`, открыть «Киберпанк» → `getByTestId("skin-preview")` виден и содержит «Тёмная тема»; кнопка «Купить за 2000» → затем «Надеть»; `coinBalance(login) === 0`; на `/dashboard` класс `dark`.
- [ ] **Step 2:** FAIL (нет `skin-preview`).
- [ ] **Step 3:** Превью — мини-карточка: внешний блок `background`, внутри карточка `card`/`border` с заголовком (`cardForeground`) и строкой `mutedForeground`, кнопка `primary`/`primaryForeground`, полоска из трёх сегментов `chart1…chart3`; под ней подпись режима. Цвета — инлайн-стилем из палитры (как у обычных тем).
- [ ] **Step 4:** e2e PASS.
- [ ] **Step 5: Commit** — `feat(shop): skin preview in the shop`.

### Task 5: Пояснение в «Оформлении» и в Mini App

**Files:**
- Modify: `components/app/theme-settings.tsx` (`ThemeSettings`, `TelegramThemeNote` — проп `skin`)
- Modify: `app/(app)/settings/page.tsx:50` (передать скин: `skinOf(user.themeCode)` при флаге `shop`)
- Test: `e2e/shop-skins.spec.ts`

**Interfaces:**
- Consumes: `skinOf` (Task 1).
- Produces: `ThemeSettings({ skin }: { skin?: { name: string; mode: "dark" | "light" } | null })`, `TelegramThemeNote` — тот же проп.

- [ ] **Step 1: e2e** — `test("settings explain the worn skin")`: надет Киберпанк → `/settings`: в регионе «Оформление» текст «Сейчас надета тема «Киберпанк» — она всегда тёмная. Снять — в магазине», ссылка «в магазине» ведёт на `/shop?tab=theme`; переключатель «Тема» по-прежнему кликабелен. Без скина строки нет.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Строка — над `RadioGroup` (и под заголовком в `TelegramThemeNote`), `text-sm text-muted-foreground`, ссылка — `text-primary hover:underline`.
- [ ] **Step 4:** e2e PASS; `npm run typecheck && npm run lint` — чисто.
- [ ] **Step 5: Commit** — `feat(settings): explain that a worn skin fixes the mode`.

### Task 6: Осмотр скинов, документация

**Files:**
- Modify: `lib/shop/catalog.ts` (только палитры, если осмотр выявит нечитаемое)
- Modify: `docs/features/shop.md`

- [ ] **Step 1:** Временный спек (не коммитить) снимает desktop и mobile в каждом скине: `/dashboard` (прокрутка до конца — кусками), `/training` с открытой тренировкой и таймером, `/stats`, `/shop?tab=theme`, `/settings`. Сохранять в scratchpad.
- [ ] **Step 2:** Просмотреть; нечитаемое (текст на фоне, подписи графиков, рамки, бейджи, `dark:`-места) — поправить палитру; `npx vitest run lib/shop` — PASS.
- [ ] **Step 3:** `docs/features/shop.md` — абзац про скины: подвид темы с `mode`/`palette`, 4 кода, цена, `themeStyle` в оба селектора, `ThemeModeLock` (скин важнее выбора в `/settings` и схемы Telegram, localStorage не трогает), лендинг не затрагивается, e2e — `e2e/shop-skins.spec.ts`.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test shop shop-skins theme landing-theme telegram --workers=8` — всё зелёное.
- [ ] **Step 5: Commit** — `docs(shop): skins` (+ правки палитры, если были).
