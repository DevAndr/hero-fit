# Telegram Mini App: оформление под Telegram

Подпроект 3 из 3 интеграции с Telegram (1 — бот: привязка и уведомления; 2 — Mini App: вход и регистрация; оба
готовы).

## Цель

Внутри Telegram Hero Fit выглядит и ведёт себя как «родное» приложение, а не как сайт во фрейме: системная кнопка
«Назад», тема в тон Telegram без стыка с его шапкой, вибрация на игровых событиях, приложение не закрывается
случайным свайпом посреди тренировки. Фирменные цвета (primary, XP, огонь серии) сохраняются.

Сейчас SDK Telegram подключается только на `/tg`; после входа (`location.replace` на `/dashboard`) внутри Telegram
открыт обычный сайт.

## Решения

- **Признак Mini App — сессия.** `Session.embedded` (ставится только входом через Mini App) → `requireUser()`
  возвращает `embedded`. Layout `(app)` для таких сессий подключает `telegram-web-app.js` и провайдер
  `TelegramMiniApp`; обычные пользователи сайта скрипт не грузят. На клиенте дополнительно — непустой
  `WebApp.initData` (встроенная сессия, открытая в обычном браузере, ничего не меняет). Скрытие элементов решается на
  сервере по `embedded` — без мигания.
- **Тема: схема Telegram + фирменные цвета.** `colorScheme` Telegram → `setTheme("light" | "dark")` next-themes, по
  событию `themeChanged` — заново. `themeParams` в токены не подставляем. Шапка, фон и нижняя панель Telegram
  (`setHeaderColor`/`setBackgroundColor`/`setBottomBarColor`) — вычисленный `--background` текущей темы (после смены
  класса на `<html>`). Выбор темы в `/settings` заменяется строкой «Тема — как в Telegram».
- **Запуск:** `ready()`, `expand()`, `disableVerticalSwipes()` (свайп вниз мешает прокрутке и перетаскиванию).
- **Подтверждение закрытия** (`enableClosingConfirmation`) — только пока открыт редактор активной тренировки
  (`useClosingConfirmation(active)`, на размонтировании — `disable…`).
- **Кнопка «Назад» (BackButton):** скрыта на корневых разделах — `NAV_ITEMS` и `/coach`; на остальных видна,
  нажатие — `router.back()`, если в истории приложения есть предыдущая страница, иначе `router.push(backTarget)`.
  Родитель — чистая `backTarget(pathname)` (`lib/telegram/back.ts`): `null` для корня, иначе ближайший раздел
  (`/workouts/<id>` → `/training`, `/stats/exercises/<id>` → `/stats`, `/coach/clients/<id>` → `/coach`,
  `/coach/page` → `/coach`, `/settings`, `/recap` → `/dashboard`). Наличие истории — счётчик переходов в провайдере
  (первая страница после `/tg` — без истории).
- **Вибрация** — `haptic(kind)` (`lib/telegram/webapp.ts`): в Telegram — `HapticFeedback`
  (`notificationOccurred("success" | "warning")`, `impactOccurred("light")`), вне Telegram — прежнее поведение
  (`navigator.vibrate` только там, где он уже был). Точки: подтверждение подхода — `light`; конец отдыха —
  `warning` (вместо `navigator.vibrate`, который на iOS не работает); новый уровень, рекорд, ачивка — `success`.
- **Безопасные зоны:** `safeAreaInset` + `contentSafeAreaInset` → CSS-переменные `--tg-safe-top/bottom/left/right`
  на `<html>` (по событиям `safeAreaChanged`/`contentSafeAreaChanged`), шапка и нижняя панель кабинета добавляют их
  к отступам; вне Telegram — 0.
- **Скрываем в Telegram:** выбор темы, push-блоки (`notification-settings`, подсказка в `user-menu`, push таймера
  отдыха) — Web Push во webview Telegram не работает, уведомления идут через бота.

## Модули

- `lib/telegram/webapp.ts` — типы используемой части `WebApp`, `tg()` (нет SDK или пустой `initData` → `null`),
  `tgSupports(version)` (`isVersionAtLeast`), `haptic(kind)`; каждый вызов SDK — в `try`, ошибка глотается.
- `lib/telegram/back.ts` — `backTarget(pathname)`, `isRootPath(pathname)`.
- `lib/telegram/theme.ts` — чистые: схема Telegram → тема next-themes; CSS-цвет → `#rrggbb` для `setHeaderColor`.
- `components/telegram/telegram-mini-app.tsx` — провайдер (`next/script` SDK, запуск, тема, BackButton, безопасные
  зоны), контекст `useTelegram()` → `{ inTelegram }`, хук `useClosingConfirmation(active)`.
- `lib/auth/dal.ts` — `embedded` в `CurrentUser`; `app/(app)/layout.tsx` — провайдер и флаг для `AppShell`/страниц.

## Деградация

Старые клиенты не знают части методов (`disableVerticalSwipes` — 7.7, `setBottomBarColor` — 7.10, безопасные зоны
— 8.0): вызов — только при `tgSupports` или наличии метода. SDK не загрузился — обычный сайт. Вне Telegram ни
поведение, ни вёрстка не меняются.

## Тесты

- Unit: `backTarget`/`isRootPath`, схема → тема, цвет → hex.
- e2e (`e2e/telegram-polish.spec.ts`): `mockTelegram` пишет вызовы в `window.__tgCalls` и умеет посылать события
  (`themeChanged`, нажатие BackButton). Сценарии: вход через `/tg` → BackButton скрыта на дашборде, видна на
  вложенной странице, нажатие уводит назад; тёмная/светлая схема применяется и меняется по событию, цвет шапки
  передан; подтверждение подхода → `HapticFeedback`; в редакторе тренировки включено подтверждение закрытия, после
  завершения — выключено; в `/settings` нет выбора темы и push; обычный вход — SDK не запрашивается.

## Вне подпроекта

MainButton/SecondaryButton Telegram, полноэкранный режим (`requestFullscreen`), «Добавить на главный экран»,
`themeParams` в токенах, CloudStorage, оплата Stars, вход на сайте через Login Widget.
