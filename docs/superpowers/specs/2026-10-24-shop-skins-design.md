# Скины — темы магазина со своим фоном

Дата: 2026-10-24 · Ветка: `feat/shop-skins` → `release/2027-04-skins` · Флаг: `shop` (как у всего магазина)

## Зачем

Темы магазина (11 штук) перекрашивают только акцент — 4 токена (`primary`, `primary-foreground`, `ring`, `chart-1`),
фон и карточки остаются стандартными, поэтому темы почти не отличаются друг от друга. Нужны «уникальные» темы,
которые меняют вид кабинета целиком: фон, карточки, рамки, графики. Это легендарная косметика — цель для накопления
монет.

## Решения

- Скин — второй подвид `kind: "theme"` с полной палитрой **одного** режима. У скина свой режим (тёмный или светлый);
  пока он надет, выбор «светлая / тёмная / системная» в `/settings` на кабинет не действует, снял — вернулся.
- Четыре скина: «Киберпанк», «Глубина», «Кузница» (тёмные), «Сепия» (светлая).
- Редкость `legendary`, цена 2000 монет (новое значение `PRICES.theme.legendary`).
- Применение (вариант 1 из трёх рассмотренных): палитра пишется в оба селектора `:root:root` и `:root.dark`, а
  клиентский `ThemeModeLock` держит класс режима на `<html>`. Отклонены: `forcedTheme` через cookie в корневом layout
  (делает динамическими все страницы, включая статический лендинг) и CSS-классы скинов в `globals.css` (палитры выпадают
  из каталога и unit-тестов, CSS всех скинов грузится на каждой странице).

## Модель

`lib/shop/catalog.ts`:

```ts
export type SkinPalette = {
  background: string; foreground: string;
  card: string; cardForeground: string;
  popover: string; popoverForeground: string;
  primary: string; primaryForeground: string;
  secondary: string; secondaryForeground: string;
  muted: string; mutedForeground: string;
  accent: string; accentForeground: string;
  border: string; input: string; ring: string;
  chart1: string; chart2: string; chart3: string; chart4: string; chart5: string;
  series1: string; series2: string; series3: string; series4: string; series5: string;
  xp: string; streak: string;
  sidebar: string; sidebarForeground: string;
  sidebarPrimary: string; sidebarPrimaryForeground: string;
  sidebarAccent: string; sidebarAccentForeground: string;
  sidebarBorder: string; sidebarRing: string;
};

// kind: "theme" — одно из двух:
{ kind: "theme"; light: ThemeTokens; dark: ThemeTokens }          // обычная тема — без изменений
{ kind: "theme"; mode: "dark" | "light"; palette: SkinPalette }   // скин
```

Все значения палитры — hex (`#rrggbb`), чтобы их проверял `contrast()` (`lib/shop/contrast.ts`).

Не входят в палитру и остаются из `globals.css`: `destructive`, `warning`/`warning-foreground`, зоны пульса
`zone-0…5`, `recovery-*`, `glow-*`, `radius`. Это смысловые цвета (ошибка, предупреждение, «нужен отдых»), одинаковые
во всех темах; их видимость на карточке скина проверяет тест.

Помощники: `isSkin(item)` — сужение типа; `skinOf(code)` — скин по коду или `null`.

### Скины

| Код | Название | Режим | `background` / `card` | `primary` | `chart2` |
|---|---|---|---|---|---|
| `theme:cyberpunk` | Киберпанк | dark | `#0d0221` / `#1a0b2e` | `#ff2e97` | `#00e5ff` |
| `theme:abyss` | Глубина | dark | `#04121f` / `#0b2236` | `#2dd4bf` | `#60a5fa` |
| `theme:forge` | Кузница | dark | `#14110f` / `#221c18` | `#f97316` | `#facc15` |
| `theme:sepia` | Сепия | light | `#f4ecd8` / `#fbf6ea` | `#8b4513` | `#b45309` |

Стартовые значения; остальные токены подбираются при реализации так, чтобы прошли тесты контраста (ниже), и
уточняются по ручному осмотру.

## Применение

### Стиль — `themeStyle` (`lib/shop/theme-style.ts`)

- Обычная тема — вывод не меняется (4 токена для `:root:root` и `:root.dark`).
- Скин — все токены палитры одним блоком для `:root:root` и для `:root.dark` плюс `color-scheme: dark|light`.
  Цвета верны уже в серверном HTML, независимо от класса режима.

### Замок режима — `ThemeModeLock` (`components/shop/theme-mode-lock.tsx`, client)

Рендерится в `app/(app)/layout.tsx` рядом с `<style>`, только если надет скин (и включён `shop`).

- `useLayoutEffect`: на `<html>` убрать `light`/`dark`, добавить `mode` скина, `style.colorScheme = mode`.
- `MutationObserver` на атрибут `class` у `<html>`: если `next-themes` (смена системной темы, Telegram `setTheme`)
  вернул другой класс — поставить класс скина обратно.
- При размонтировании — отключить наблюдатель и вернуть класс и `color-scheme` по `resolvedTheme` из `useTheme()`.
- localStorage (`theme`) не трогает: выбор пользователя сохраняется.

Мгновение до эффекта у `<html>` может стоять «чужой» класс — цвета уже верные (стиль в оба селектора), отличаться
могут только `dark:`-варианты (28 мест), это допустимо.

Лендинг (`app/(marketing)`) скины не затрагивают: стиль и замок — только в layout кабинета.

### `/settings` → «Оформление»

Пока надет скин, над переключателем строка: «Сейчас надета тема «<название>» — она всегда <тёмная|светлая>. Снять —
в магазине» со ссылкой на `/shop?tab=theme`. Переключатель работает: выбор сохранится и применится после снятия.
В Telegram Mini App (`TelegramThemeNote`) — то же пояснение.

### Telegram Mini App

Скин важнее схемы Telegram: `TelegramMiniApp` вызывает `setTheme`, замок возвращает класс скина. Цвет шапки, фона и
нижней панели Telegram берётся из фона страницы (`pageBackground()`) — это фон скина.

### Магазин

- Превью скина (`ItemPreview`, `components/shop/item-dialog.tsx`): одна мини-карточка в палитре скина — фон, карточка
  с заголовком и приглушённым текстом, кнопка `primary`, полоска из `chart1…chart3`; подпись «Тёмная тема» /
  «Светлая тема».
- Карточка в каталоге — значок редкости «Легендарная» (как у других предметов).

## Тесты

### Unit — `lib/shop/catalog.test.ts`, `lib/shop/theme-style.test.ts`

Для каждого скина (WCAG-контраст):

| Пара | Порог |
|---|---|
| `foreground`/`background`, `cardForeground`/`card`, `popoverForeground`/`popover`, `sidebarForeground`/`sidebar` | ≥ 7 |
| `mutedForeground` на `card` и на `background` | ≥ 4.5 |
| `primaryForeground`/`primary`, `secondaryForeground`/`secondary`, `accentForeground`/`accent`, `sidebarPrimaryForeground`/`sidebarPrimary`, `sidebarAccentForeground`/`sidebarAccent` | ≥ 4.5 |
| `primary`, `ring`, `xp`, `streak`, `chart1…5`, `series1…5` на `card` | ≥ 3 |
| `border` на `card` | ≥ 1.3 |
| `destructive`, `warning` (hex-эквиваленты из `globals.css` для режима скина) на `card` | ≥ 3 |

Плюс: все значения — `#rrggbb`; `mode` — `dark`/`light`; `rarity = legendary`, `price = 2000`;
`themeStyle(скин)` содержит каждый токен в обоих селекторах и `color-scheme`; `themeStyle(обычная тема)` — прежняя строка.

### e2e — `e2e/shop-skins.spec.ts`

- Светлая системная тема, надет «Киберпанк» (`equipItem`) → на `/dashboard` у `<html>` класс `dark`, `--background`
  = `#0d0221`, `color-scheme: dark`; после перезагрузки — так же.
- Тёмная системная тема, надета «Сепия» → класс `light`.
- Снятие скина → режим по выбору пользователя (светлая система → `light`).
- Покупка: 2000 монет (`setCoins`) → магазин, превью с «Тёмная тема», «Купить за 2000» → «Надеть»; баланс − 2000.
- `/settings` при надетом скине — строка «Сейчас надета тема…».
- Лендинг у пользователя со скином — без палитры скина.

### Ручной осмотр

Скриншоты desktop и mobile в каждом скине: дашборд, тренировка с таймером, статистика, магазин, настройки. Нечитаемое —
правка палитры (тесты остаются зелёными).

## Документация и релиз

- `docs/features/shop.md` — скины, `ThemeModeLock`, правило «скин важнее режима и Telegram».
- «Что нового» релиза — пункт со `flag: "shop"`.
