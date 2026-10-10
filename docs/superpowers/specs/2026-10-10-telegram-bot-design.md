# Telegram-бот: привязка и уведомления

Подпроект 1 из 3 интеграции с Telegram (дальше — Mini App со входом из Telegram, затем оформление под Telegram).

## Цель

Человек подключает Telegram в `/settings` — и уведомления Hero Fit (тренер, план, streak, ачивки, друзья, итоги недели, босс)
приходят сообщением от бота с кнопкой «Открыть». Особенно для тренеров и их клиентов: они и так общаются в Telegram.

## Решения

- Telegram — **в дополнение** к Web Push, не вместо. Отдельный переключатель «Присылать в Telegram»; переключатели
  по типам — общие для обоих каналов.
- Таймер отдыха (`REST`) в Telegram **не** уходит — только push.
- У каждого сообщения — кнопка «Открыть» на `url` уведомления. Других функций у бота нет (приглашение тренера через
  бота и `/today` — не в этом подпроекте).
- Приём сообщений от Telegram — webhook; опрос `getUpdates` — только для локальной разработки.

## Данные

`User`:
- `telegramChatId BigInt? @unique` — id личного чата с ботом (один Telegram — один аккаунт);
- `telegramUsername String?`;
- `telegramLinkedAt DateTime?`;
- `notifyTelegram Boolean @default(true)`.

`TelegramLinkToken`: `token String @id` (случайный base64url, 32 символа — допустимо в `start`-параметре),
`userId` (cascade), `expiresAt` (создание + 15 мин), `usedAt DateTime?`, `createdAt`.

## Окружение (`lib/env.ts`)

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` — без них интеграция выключена: блок в настройках скрыт, отправки нет,
  webhook отвечает 404 (как push без VAPID).
- `TELEGRAM_WEBHOOK_SECRET` — обязателен, если задан токен бота.
- `TELEGRAM_API_URL` — по умолчанию `https://api.telegram.org` (e2e подменяет на фейковый сервер).
- `TELEGRAM_POLLING=on` — локальная разработка: воркер в `instrumentation.ts` получает обновления через `getUpdates`
  (long polling) вместо webhook.

## Привязка

1. `/settings`, блок «Telegram» (рядом с уведомлениями): «Подключить» → `createTelegramLinkAction` создаёт токен →
   открывается `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>`.
2. Бот получает `/start <token>` → `handleUpdate`: чистая `linkTokenStatus(token, now)` → `ok | expired | used | missing`.
   При `ok` в одной транзакции: токен помечается `usedAt` (условно, `usedAt = null` — повтор не сработает), у прежнего
   владельца этого `chatId` (если другой аккаунт) — `telegramChatId = null`, пользователю — `chatId`, username,
   `telegramLinkedAt`. Ответ: «Готово, <ник или логин>! Сюда будут приходить уведомления Hero Fit».
3. Плохой токен: «Ссылка устарела — нажмите «Подключить» в настройках ещё раз» (+ ссылка на `/settings`, если адрес
   публичный). `/start` без токена — приветствие и ссылка на сайт. Любой другой текст — короткая подсказка.
4. Настройки обновляются при возврате на вкладку (`visibilitychange` → `router.refresh()`): «Подключён @username»,
   переключатель «Присылать в Telegram», «Отключить».

Отвязка (`telegramChatId`, username, linkedAt → null):
- «Отключить» в `/settings` (`unlinkTelegramAction`);
- `/stop` в боте (ответ «Уведомления отключены»);
- ответ 403 при отправке (бот заблокирован / чат удалён).

## Webhook

`POST /api/telegram/webhook` (route handler; `/api/` проходит через `proxy.ts` без редиректов):
- заголовок `X-Telegram-Bot-Api-Secret-Token` ≠ `TELEGRAM_WEBHOOK_SECRET` → 401; интеграция выключена → 404;
- тело — `Update`; разбирается только `message` личного чата с текстом, остальное — 200 без действий;
- всегда 200 после обработки (иначе Telegram повторяет), ошибки — в лог.

Регистрация — `npm run telegram:webhook` (`setWebhook` с `APP_URL/api/telegram/webhook`, `secret_token`,
`allowed_updates: ["message"]`); вызывается вручную после деплоя, шаг — в `deploy/README.md`.

## Отправка

`processDuePushes` (`lib/notifications/service.ts`) для каждой записи пачки параллельно вызывает `sendPushToUser` и
`sendTelegramToUser` (`lib/telegram/send.ts`). Telegram — только если у пользователя `telegramChatId`, `notifyTelegram`
и тип ≠ `REST`. Переключатели по типам уже применены при постановке в очередь (`{ push: prefs.notifyX }`), группировка
(👊, комментарии тренера — в очередь попадает только первое) сохраняется сама.

Сообщение — чистая `telegramMessage(payload, appUrl)` (`lib/telegram/format.ts`):
- `text`: `<b>{title}</b>\n{body}`, `parse_mode: "HTML"`, `title`/`body` экранированы (`&`, `<`, `>`);
- `reply_markup`: одна кнопка «Открыть» → `absoluteUrl(appUrl, url ?? "/dashboard")`; при непубличном `appUrl`
  (localhost, http) кнопки нет — Telegram отклоняет такие ссылки.

Клиент Bot API — `lib/telegram/api.ts` на `fetch` (без библиотек): `callBot(method, params)` с таймаутом 10 с;
методы `sendMessage`, `setWebhook`, `getUpdates`. Ошибки отправки: 403 → отвязка; 429 и прочие → лог, пропуск
(как неудачный push).

## Персональные данные

`/privacy`: пункт о Telegram — храним Telegram ID и username для уведомлений, текст уведомлений передаётся Telegram
(Telegram FZ-LLC, ОАЭ — трансграничная передача), отключить — в настройках или `/stop`. Отдельной галочки нет:
подключение — действие самого пользователя.

## Тесты

Unit:
- `telegramMessage`: экранирование, кнопка с абсолютным url, `/dashboard` без url, без кнопки при непубличном адресе;
- `linkTokenStatus`: ok / expired / used / missing.

e2e (фейковый Bot API `e2e/telegram-server.ts` по образцу `push-server.ts`: записывает вызовы, `getMe`/`setWebhook`/
`sendMessage` → ok, отдельный chat id может отвечать 403):
- «Подключить» → POST webhook `/start <token>` → настройки «Подключён» → заявка в друзья → `sendMessage` в этот чат
  с заголовком уведомления;
- таймер отдыха в Telegram не уходит; `notifyTelegram` выключен → не уходит;
- повтор того же токена — отказ; чужой chat id переходит на новый аккаунт;
- `/stop` и 403 отвязывают;
- webhook без секрета / с неверным — 401.

## Вне подпроекта

Вход и регистрация через Telegram, Mini App, `startapp` с кодом тренера, команды бота кроме `/start`/`/stop`,
повтор отправки при 429.
