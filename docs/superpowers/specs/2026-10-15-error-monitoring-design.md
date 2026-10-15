# Мониторинг ошибок

Релиз `release/2026-11-ux`. Своё решение внутри приложения: без внешнего сервиса (152-ФЗ — отчёты содержат
идентификатор пользователя и адреса страниц) и без новой инфраструктуры на сервере (4 ГБ RAM, без swap).

## Цель

Узнавать об ошибках на проде раньше пользователей: что упало, как часто, у скольких людей, с какой версии. Новая
ошибка — сразу сообщение в Telegram. Пользователь вместо голой заглушки Next видит понятный экран с кнопкой
«Обновить».

Вне рамок: падение самой базы (записать ошибку некуда — только `console.error`; от этого — внешний пинг
`/api/health`, см. «Деплой»), source maps, трассировка производительности.

## Решения

### Сбор

**Сервер.** `export const onRequestError` в `instrumentation.ts` (Next.js 16: страницы, server actions, route
handlers, `proxy`). Передаёт в `reportServerError` (`lib/errors/report.ts`, server-only):
- сообщение и стек из `error` (если не `Error` — `String(error)`), `digest`;
- путь — `request.path` без query-строки, `context.routeType`;
- пользователь — `verifyAccessToken` по cookie `hf_at` из `request.headers.cookie` (без запроса в БД; нет или
  просрочен — `null`);
- User-Agent из заголовков.

Ошибки `NEXT_REDIRECT`, `NEXT_NOT_FOUND`, `NEXT_HTTP_ERROR_FALLBACK` (по `digest`) не пишутся.

**Браузер.** Клиентский `ErrorReporter` (`components/errors/error-reporter.tsx`) в корневом layout слушает
`window` `error` и `unhandledrejection`. Границы ошибок:
- `app/(app)/error.tsx` — внутри `AppShell`: «Что-то пошло не так», «Обновить» (`reset()`), ссылка в кабинет;
- `app/global-error.tsx` — корневая (свой `<html>`), тот же текст.

Обе отправляют ошибку, если у неё **нет** `digest` (с `digest` — серверная, уже записана в `onRequestError`).

Отправка — `navigator.sendBeacon("/api/errors", json)`, без него — `fetch` с `keepalive`. Тело: `message`, `stack`,
`path` (`location.pathname`), `version` (`APP_VERSION`). Не больше 10 отчётов за жизнь страницы и без повторов одного
и того же сообщения (защита от циклов рендера).

**Шум** — чистая `isNoise({ source, message, stack })` (`lib/errors/noise.ts`), не пишется:
- `Failed to fetch`, `NetworkError when attempting to fetch resource`, `Load failed`, `The network connection was
  lost` — офлайн штатный (у тренировки своя очередь);
- `ResizeObserver loop` (оба варианта текста);
- стек только из `chrome-extension://`, `moz-extension://`, `safari-extension://`;
- `Script error.` без стека (чужой скрипт без CORS);
- `AbortError`.

### Приём `/api/errors`

Route handler `app/api/errors/route.ts` (`POST`, публичный: `proxy.ts` пропускает `/api/*` без проверки входа):
- тело ≤ 8 КБ (больше — 413), JSON по Zod-схеме (`message` ≤ 1000, `stack` ≤ 6000, `path` ≤ 300, `version` ≤ 30),
  иначе 400;
- `Origin` (или `Referer`) — того же хоста, что `APP_URL`, иначе 403;
- лимит — чистый счётчик в памяти процесса (`lib/errors/limit.ts`): 30 отчётов в минуту на ключ (`userId`, иначе
  IP из `x-forwarded-for`/`x-real-ip`), сверх — 429 без записи;
- пользователь — `verifyAccessToken` по cookie;
- ответ 204.

### Хранение

Миграция `error_monitoring`:

```prisma
enum ErrorSource { SERVER CLIENT }

model ErrorGroup {
  id          String      @id @default(cuid())
  fingerprint String      @unique
  source      ErrorSource
  message     String
  stack       String?
  /// последний путь, где случилась
  path        String?
  count       Int         @default(0)
  /// разных пользователей среди сохранённых событий — считается при записи
  users       Int         @default(0)
  firstSeen   DateTime    @default(now())
  lastSeen    DateTime    @default(now())
  /// версия приложения последнего события
  version     String?
  resolvedAt  DateTime?
  /// когда в последний раз оповестили в Telegram — не чаще раза в час на группу
  alertedAt   DateTime?
  events      ErrorEvent[]
  @@index([resolvedAt, lastSeen])
}

model ErrorEvent {
  id        String     @id @default(cuid())
  groupId   String
  group     ErrorGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  at        DateTime   @default(now())
  path      String?
  userAgent String?
  version   String?
  userId    String?
  user      User?      @relation(fields: [userId], references: [id], onDelete: SetNull)
  @@index([groupId, at])
  @@index([at])
}
```

**Отпечаток** — чистая `fingerprint({ source, message, stack })` (`lib/errors/fingerprint.ts`): SHA-1 (hex) от
`source`, нормализованного сообщения и первой строки стека из нашего кода. Нормализация: cuid/uuid/hex от 8 символов →
`<id>`, числа → `<n>`, строки в кавычках длиннее 20 символов → `<s>`; строка стека — без номеров строк и колонок,
без хеша чанка (`/_next/static/chunks/<hash>.js` → `chunks/<chunk>`). «Нашего кода» — первая строка, где нет
`node_modules` и `node:internal`; нет такой — первая строка стека.

**Запись** — `recordError(input)` (`lib/errors/record.ts`) одной транзакцией: upsert группы по отпечатку (`count + 1`,
`lastSeen`, `path`, `version`; у решённой — `resolvedAt = null`, это «повтор»), вставка события, затем удаление
событий группы сверх последних 50, пересчёт `users` — `count(distinct userId)` по событиям группы. Ошибка записи
(в т. ч. БД недоступна) не выбрасывается: `console.error` с исходной ошибкой.

**Срок хранения** — 30 дней: в тике воркера уведомлений (`runNotificationTick`) раз в сутки
`deleteMany ErrorEvent at < now − 30 дн` и групп без событий с `lastSeen < now − 30 дн`.

### Оповещения

После записи: группа **новая** (создана этой записью) или **повтор решённой** — и `alertedAt` пуст или старше часа,
и за последний час оповещений всего меньше 20 (счётчик в памяти процесса) → `alertedAt = now` и сообщение в Telegram
каждому админу (`ADMIN_LOGINS`) с привязанным ботом (`telegramChatId`, переключатель `notifyTelegram` не
учитывается — это служебное). Текст: «🔴 Новая ошибка» или «🔁 Ошибка вернулась», источник, сообщение (до 300
символов), путь, версия, ссылка на `/admin/errors/<id>`. Отправка — `callBot("sendMessage")` без ожидания ответа в
запросе пользователя (`void … .catch(console.error)`). Решение «слать ли» — чистая `shouldAlert` (`lib/errors/alert.ts`).

### Админка

`/admin/errors` (`requireAdmin`, ссылка рядом с «Флагами» на `/admin`):
- вкладки «Открытые» (`resolvedAt = null`) и «Решённые», сортировка по `lastSeen`, до 100 строк;
- строка: сообщение (обрезано), значок источника (Сервер/Браузер), счётчик, пользователи, «последний раз N назад»,
  версия, путь.

`/admin/errors/[id]`: сообщение, стек (`<pre>`, перенос строк), первое/последнее появление, последние 50 событий
(время в поясе админа, путь, версия, браузер из User-Agent кратко, ник пользователя ссылкой на профиль, если есть).
Кнопка «Решено» (`resolveErrorAction`) / «Открыть снова».

### Персональные данные

Храним только `userId`, путь без query, User-Agent, версию. Тело запроса, cookie, прочие заголовки и логин — нет.
Удаление аккаунта — `onDelete: SetNull` (события остаются обезличенными). Выгрузка «Мои данные» журнал не включает
(технический журнал, не данные пользователя); `/privacy` — абзац: «технический журнал ошибок (идентификатор
аккаунта, адрес страницы, браузер) хранится 30 дней для исправления сбоев».

### Деплой

`deploy/README.md` — раздел «Мониторинг»: страница `/admin/errors`, оповещения приходят админам с привязанным
Telegram; доступность — внешний пинг `https://<домен>/api/health` (UptimeRobot или Яндекс Мониторинг) раз в 5 минут.

## Тестирование

Unit: `fingerprint` (одинаковые ошибки с разными id/числами/чанками — один отпечаток; разные места — разные),
`isNoise`, лимитер (окно, ключи), `shouldAlert` (новая, повтор, час, общий лимит), схема тела `/api/errors`.

e2e (`e2e/errors.spec.ts`, desktop):
- браузер: `page.evaluate` бросает ошибку в `setTimeout` → админ видит группу в `/admin/errors`, счётчик 1; второй
  раз — счётчик 2, группа одна; «Решено» → во вкладке «Решённые»; повтор → снова «Открытые»;
- сервер: тестовый маршрут `app/api/e2e/boom/route.ts` бросает исключение, работает только при
  `E2E_ERROR_ROUTE=1` (переменная в `webServer.env` Playwright; иначе 404) → группа «Сервер» в админке, фейковый
  Telegram-сервер получил сообщение админу;
- шум: `Failed to fetch` не появляется;
- не админ — `/admin/errors` 404; `/api/errors` с чужим `Origin` — 403;
- граница ошибок: тот же тестовый маршрут-страница `app/(app)/e2e-boom/page.tsx` (при `E2E_ERROR_ROUTE=1`, иначе
  `notFound()`) → экран «Что-то пошло не так» с кнопкой «Обновить».

Удаление аккаунта (`e2e/account-data.spec.ts`): событие с `userId` удалённого пользователя остаётся с `userId = null`.
