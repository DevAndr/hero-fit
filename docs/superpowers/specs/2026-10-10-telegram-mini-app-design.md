# Telegram Mini App: вход и регистрация из Telegram

Подпроект 2 из 3 интеграции с Telegram (1 — бот: привязка и уведомления, готов; 3 — оформление под Telegram:
системные кнопки, цвета темы, вибрация).

## Цель

Клиент тренера (и любой человек) открывает Hero Fit прямо в Telegram и попадает в приложение в одно касание:
без логина, email и пароля. Тренер приглашает ссылкой `t.me/<бот>?startapp=join_<код>` — человек сразу видит
экран согласия на тренера.

## Решения

- Mini App — тот же сайт, точка входа `/tg` (не отдельное приложение).
- Новый человек при регистрации из Telegram даёт только согласие на обработку данных; email и пароль — по желанию
  позже в настройках («Вход на сайте»).
- Работает в мобильном Telegram, Telegram Desktop и web.telegram.org (там — фрейм и partitioned-cookies).

## Данные

- `User.email String? @unique`, `User.passwordHash String?` (были обязательными; Postgres допускает несколько NULL
  в уникальном индексе).
- `Session.embedded Boolean @default(false)` — сессия создана в Mini App, её cookies ставятся для фрейма.
- Аккаунт из Telegram: `login = "tg" + telegramId` (уникален, никому не показывается), `name` — `first_name`
  (+ `last_name`) из Telegram, ника нет, `telegramChatId = telegramId` (в личном чате с ботом chat id = user id),
  `telegramUsername`, `telegramLinkedAt`, `privacyAcceptedAt`, `notifyTelegram = true`.

## Вход: `/tg`

Публичная страница (`PUBLIC_PAGES` в `proxy.ts`), группа `(auth)`. Указывается в BotFather как Main Mini App
(`https://<домен>/tg`). Подключает `https://telegram.org/js/telegram-web-app.js`.

1. Нет `Telegram.WebApp.initData` (открыли в обычном браузере) → переход на `/login`.
2. `POST /api/telegram/auth` с `{ initData, action: "auto" }` → сервер `verifyInitData`:
   - аккаунт с `telegramChatId = user.id` есть → сессия (`embedded`), ответ `{ status: "ok", to }`;
   - нет → `{ status: "new", firstName }` — экран «Новый человек».
3. «Новый человек»: «Привет, {имя}! Hero Fit — тренировки с уровнями, ачивками и боссами», обязательная галочка
   «Согласен с политикой обработки персональных данных» (ссылка на `/privacy`), кнопка «Начать» →
   `{ initData, action: "register", consent: true }` → аккаунт + сессия → `Telegram.WebApp.requestWriteAccess()`
   (разрешение боту писать — для уведомлений) → переход. Ссылка «У меня уже есть аккаунт».
4. «У меня уже есть аккаунт»: логин или email + пароль, кнопка «Войти и привязать Telegram» →
   `{ initData, action: "link", login, password }` → проверка как в `loginAction` → привязка (этот Telegram у другого
   аккаунта — привязка переходит, как в боте) → сессия → переход. Неверно — «Неверный логин или пароль».
5. Переход `to` — чистая `startTarget(startParam)`: `join_<код>` с кодом по `normalizeFriendCode` (8 символов
   алфавита кодов) → `/coach/join/<код>`, иначе `/dashboard`.

Отказы: неверная подпись / устаревшие данные / интеграция выключена → 401, экран «Не получилось войти. Откройте
Hero Fit из Telegram заново». Повторная регистрация того же Telegram (гонка двух вкладок) → вход в уже созданный
аккаунт.

### Подпись initData — `lib/telegram/init-data.ts` (чистые функции)

`verifyInitData(initData: string, botToken: string, now: Date)`:
- пары `key=value` из `initData` (URL-кодировка), без `hash`, сортировка по ключу, склейка `\n`;
- `secret = HMAC_SHA256(key="WebAppData", data=botToken)`, `hash = hex(HMAC_SHA256(key=secret, data=строка))`;
- сравнение `timingSafeEqual`;
- `auth_date` (секунды): не старше 24 ч и не позже `now + 5 мин`;
- результат: `{ ok: true; user: { id: number; firstName: string; lastName?: string; username?: string };
  startParam: string | null } | { ok: false; reason: "hash" | "expired" | "malformed" }`.

`startTarget(startParam: string | null): string`.

## Сессия во фрейме

- Мобильный Telegram и Telegram Desktop открывают Mini App как страницу верхнего уровня — cookies `Lax` работают.
- web.telegram.org встраивает фреймом:
  - `X-Frame-Options: DENY` (все страницы, `next.config.ts`) заменяется на
    `Content-Security-Policy: frame-ancestors 'self' https://web.telegram.org`;
  - у `embedded`-сессии cookies `hf_at`/`hf_rt` — `SameSite=None; Secure; Partitioned` (CHIPS): работают во фрейме,
    изолированы от обычного сайта. Выбор атрибутов — чистая `authCookieOptions(embedded)` (`lib/auth/cookies.ts`);
    ротация refresh в `proxy.ts` берёт `embedded` из сессии и сохраняет атрибуты.
- CSRF: server actions Next сверяют `Origin` с хостом (во фрейме `Origin` — наш домен); `/api/telegram/auth`
  авторизуется подписью `initData`, не cookies.

## Аккаунты без пароля

- `loginAction`: пользователь без `passwordHash` → «Неверный логин или пароль».
- `forgotPasswordAction`: без email письма нет, ответ тот же нейтральный.
- Показ email (шапка `/settings`, меню пользователя) — только если он есть.
- `/settings`, блок «Вход на сайте» (только без `passwordHash`): email + пароль (проверки — как в `registerSchema`:
  сложность пароля, уникальность email) → «Теперь можно входить на сайте по email и паролю».
  `setSiteLoginAction`.

## Тренер

`telegramJoinUrl(code) = https://t.me/<TELEGRAM_BOT_USERNAME>?startapp=join_<код>` (при включённой интеграции):
- кабинет тренера — рядом с обычной ссылкой-приглашением, «Ссылка для Telegram» с копированием;
- публичная страница тренера — вторая кнопка «Заниматься в Telegram».

## Аналитика, приватность, настройка

- Метрика: `signup` при регистрации из Telegram (как обычная), `telegram_open` — успешный вход в Mini App.
- `/privacy`: пункт о Telegram дополняется — при входе через Telegram получаем имя и username из профиля Telegram.
- `deploy/README.md`: BotFather → Bot Settings → Configure Mini App → URL `https://<домен>/tg`
  (ссылка `t.me/<бот>?startapp=…` работает только с Main Mini App).

## Тесты

Unit:
- `verifyInitData`: валидная подпись (данные подписываются в тесте тестовым токеном), подменённое поле → `hash`,
  `auth_date` старше 24 ч → `expired`, из будущего (> 5 мин) → `expired`, без `hash` / без `user` → `malformed`;
- `startTarget`: `join_ABCDEFGH` → `/coach/join/ABCDEFGH`, нижний регистр нормализуется, `join_../x`, `join_`,
  `other`, `null` → `/dashboard`;
- `authCookieOptions(true)` → `sameSite: "none"`, `secure: true`, `partitioned: true`; `(false)` — как сейчас.

e2e (скрипт `telegram-web-app.js` подменяется заглушкой `window.Telegram.WebApp` с `initData`, подписанным
e2e-токеном бота; `requestWriteAccess` — сразу «разрешено»):
- новый человек: согласие → «Начать» → дашборд; в БД аккаунт без email и пароля, `telegramChatId` = id;
- повторное открытие `/tg` → сразу дашборд;
- аккаунт, подключённый через бота (`linkTelegram`), входит без экрана регистрации;
- «У меня уже есть аккаунт» → вход и привязка; неверный пароль — ошибка;
- `start_param = join_<код>` → экран согласия тренера;
- подменённый `initData` → экран ошибки;
- «Вход на сайте»: задал email и пароль → выход → вход на `/login`;
- без галочки согласия «Начать» не отправляется.

## Вне подпроекта

Оформление под Telegram (BackButton, MainButton, цвета темы, вибрация), объединение двух аккаунтов, вход на сайте
кнопкой «Войти через Telegram» (Login Widget), оплата Stars.
