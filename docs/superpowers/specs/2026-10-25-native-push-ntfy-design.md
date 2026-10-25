# Android-приложение и push через свой ntfy

Дата: 2026-10-25 · Ветка: `release/2027-05-native` · Флаг: `native_app`

## Зачем

Push сейчас только веб (VAPID, `web-push`, `public/sw.js`). Нужно нативное Android-приложение в RuStore, Google Play и
APK с сайта, у которого push не зависят от Google:

- независимость от Google — риск блокировки или отключения FCM в РФ;
- телефоны без Google-сервисов (Huawei, кастомные прошивки) — там FCM не работает;
- 152-ФЗ и приватность — текст уведомлений не должен уходить иностранной компании.

Поэтому FCM не используется вообще, даже запасным каналом. Push идут через свой сервер [ntfy](https://ntfy.sh)
по протоколу UnifiedPush.

## Решения

- **ntfy, а не Gotify.** У Gotify модель «пользователи, клиенты, приложения»: на каждого пользователя Hero Fit пришлось
  бы заводить учётку через админский API. UnifiedPush у Gotify — через плагин, и он не умеет зашифрованный Web Push.
  ntfy адресует топиками (случайный секретный топик на устройство), UnifiedPush встроен, принимает зашифрованный Web Push
  (RFC 8030 + RFC 8291, aes128gcm, VAPID), а текста сервер ntfy не видит.
- **Отправка не меняется.** Эндпоинт UnifiedPush на ntfy — обычная Web Push-подписка `{ endpoint, p256dh, auth }`.
  Она ложится в `PushSubscription`, `sendPushToUser` (`lib/notifications/push.ts`) шлёт на неё тем же `web-push`.
  Очередь `ScheduledPush`, TTL и `urgency` прежние.
- **Гибрид доставки.** Если на телефоне есть дистрибьютор UnifiedPush (приложение ntfy), работаем через него: одно
  соединение на все приложения, батарея почти не тратится. Если нет, работаем через своё соединение Hero Fit с нашим
  ntfy в foreground service (не в сборке `play`, см. ниже).
- **Только наш ntfy.** У нативных подписок (`UNIFIEDPUSH`, `EMBEDDED`) хост эндпоинта должен совпадать с хостом
  `NTFY_URL`. Эндпоинт на чужом сервере (например, `ntfy.sh` — сервер по умолчанию в приложении ntfy) отклоняется,
  приложение просит пользователя переключить сервер в ntfy.
- **Три сборки (Gradle flavors) из одного кода, `applicationId` один.**

  | Сборка | Доставка |
  |---|---|
  | `play` | Только UnifiedPush. Нет дистрибьютора или он на чужом сервере — экран «Поставь ntfy». Своего соединения и разрешения `FOREGROUND_SERVICE_SPECIAL_USE` нет: Google Play проверяет `specialUse` вручную и может отклонить |
  | `rustore`, `apk` | UnifiedPush, иначе своё соединение |

- **Только Android.** На iOS фоновых push без APNs нет, а это внешний сервис Apple. iOS отложен, там остаётся PWA.
- **Обёртка грузит прод-сайт по URL** (`server.url`): приложение на Server Components и Server Actions, встроенная
  статика невозможна. Нативное в обёртке — только push, иконка, сплэш, App Links.

## Архитектура

```
Сервер Hero Fit ──Web Push (VAPID, aes128gcm)──► ntfy (push.<домен>)
   sendPushToUser — без изменений                    │
                                                     ├─► приложение ntfy (UnifiedPush) ─► Hero Fit
                                                     └─► своё соединение Hero Fit (rustore/apk)
```

### Сервер ntfy

- Контейнер `binwiederhier/ntfy` в `deploy/docker-compose.yml`, за Caddy на поддомене `push.<домен>`
  (`deploy/Caddyfile`). Образ берём через зеркало, как остальные (см. раннер CI и Docker Hub).
- `server.yml`: `base-url: https://push.<домен>`, `auth-file`, `auth-default-access: deny-all`, доступ на чтение и
  запись для всех — только топики `up*` (адреса UnifiedPush; имена — длинные случайные), `cache-duration: 12h`,
  `visitor-subscriber-rate-limiting: true` (публикации в `up*` считаются против подписчика, а не сервера Hero Fit),
  `upstream-base-url` не задаём (это ретрансляция для iOS через ntfy.sh).
- Инструкция — `deploy/README.md`.

### Android-приложение

- **Проект** `android/` на `@capacitor/android`, `capacitor.config.ts` с `server.url = APP_URL`. Ссылки на чужие домены
  открываются в браузере. App Links на наш домен открываются в приложении: `/.well-known/assetlinks.json` — публичная
  страница (`PUBLIC_PAGES` в `proxy.ts`), отпечаток ключа подписи — из env.
- **Сборки и подпись.** Flavors `play`, `rustore`, `apk`; подпись одним ключом, ключ и пароли — вне репозитория
  (`android/keystore.properties` в `.gitignore`). Сборка — вручную по `android/README.md`, CI не трогаем.
- **Локальный плагин `HeroPush`** (Kotlin, в `android/app/src/main/java/.../push/`), API для веба:
  - `status()` → `{ mode: "unifiedpush" | "embedded" | "none", reason?: "no-distributor" | "foreign-server" | "permission" }`;
  - `register()` → `{ kind: "UNIFIEDPUSH" | "EMBEDDED", endpoint, p256dh, auth }` или ошибка с `reason`;
  - `unregister()` — снимает регистрацию и забывает топик и ключи;
  - событие `subscriptionChanged` — новый эндпоинт (дистрибьютор сменил его, удалён, ключи пересозданы).
- **Выбор режима:** дистрибьютор UnifiedPush есть и эндпоинт на нашем хосте — `unifiedpush`. Иначе в `rustore`/`apk` —
  `embedded`, в `play` — `none` с причиной. Режим пересматривается при каждом запуске и по `subscriptionChanged`:
  появился правильный дистрибьютор — своё соединение выключается.
- **UnifiedPush** — библиотека `org.unifiedpush.android:connector` (версия 3.x: сама генерирует ключи Web Push и
  расшифровывает сообщения).
- **Своё соединение (`rustore`/`apk`):** приложение заводит случайный топик `up<12 символов [A-Za-z0-9]>` (ntfy
  считает топиком UnifiedPush только `up` + 12 символов, иначе публикация без подписчика-ограничителя — 507) на нашем ntfy и ключи
  P-256 + auth (хранятся в `EncryptedSharedPreferences`), эндпоинт — `https://push.<домен>/<топик>?up=1`.
  Foreground service типа `specialUse` с тихим постоянным уведомлением «Hero Fit на связи» держит JSON-поток
  `GET /<топик>/json`; переподключение с экспоненциальной паузой (1 с … 5 мин), страховка `WorkManager` раз в 15 минут,
  запуск после перезагрузки (`BOOT_COMPLETED`). Тело сообщения приходит в base64 (`encoding: "base64"`) и
  расшифровывается так же, как в UnifiedPush (RFC 8291). Пользователю предлагается отключить оптимизацию батареи
  (иначе Doze рвёт соединение) и поставить ntfy, чтобы экономить батарею.
- **Показ уведомления:** полезная нагрузка та же, что у `public/sw.js` (`type`, `title`, `body`, `url`, `tag`); `tag`
  заменяет прежнее уведомление с тем же тегом. Нажатие открывает `url` в WebView.
- **Каналы уведомлений Android** по `NotificationType`: «Таймер отдыха» (`REST`, высокая важность, вибрация), «Серия и
  напоминания» (`STREAK`, `PLAN`, `RECAP`, `COMEBACK`, `GOAL`), «Ачивки и игра» (`ACHIEVEMENT`, `BOSS`, `RAID`),
  «Друзья и гильдии» (`SOCIAL`), «Тренер» (`COACH`), «Системные» (`SYSTEM`, `FEEDBACK`). Неизвестный тип — в «Системные».
- **Разрешение `POST_NOTIFICATIONS`** (Android 13+) запрашивается по кнопке «Включить уведомления» в `/settings`, как в
  вебе.

### Веб-слой

- `components/notifications/push-provider.tsx`: при `Capacitor.isNativePlatform()` service worker push не
  регистрируется (в WebView Push API нет), вместо него — `HeroPush.register()` и та же `subscribePushAction` с `kind`.
  `subscriptionChanged` пересохраняет подписку.
- `/settings`: в приложении — статус доставки по `HeroPush.status()` и подсказки: «поставь ntfy», «переключи сервер в
  ntfy на `push.<домен>`» (кнопка «Скопировать адрес»), «отключи оптимизацию батареи». В `play` без ntfy — честно
  «уведомления не придут, пока не поставишь ntfy». Строка версии дополняется нативной версией приложения.
- Баннер установки PWA внутри приложения не показывается.
- Выход из аккаунта в приложении: `unsubscribePushAction(endpoint)` и `HeroPush.unregister()` — иначе на телефон
  приходили бы push прежнего пользователя.

### Сервер Hero Fit

- Миграция: enum `PushKind { WEB UNIFIEDPUSH EMBEDDED }`, поля `PushSubscription.kind PushKind @default(WEB)` и
  `appVersion String?`. Старые строки — `WEB`.
- env (`lib/env.ts`): `NTFY_URL` (необязательный, `https://…`). Без него нативные подписки отклоняются, в приложении —
  «уведомления недоступны».
- `subscribePushAction` принимает `kind` и `appVersion`. Проверка хоста — чистая функция
  `allowedPushHost(kind, endpoint, ntfyUrl)` (`lib/notifications/push-hosts.ts`): только `https`; `WEB` — любое имя
  хоста, кроме `localhost` и IP-адресов (список браузерных push-сервисов не ведём: у Яндекс Браузера и других свои
  сервисы, список молча отрезал бы им push); `UNIFIEDPUSH`/`EMBEDDED` — только имя хоста `NTFY_URL` (порт не
  сравнивается — в e2e фейковый ntfy слушает случайный порт). Нативный `kind` при выключенном флаге
  `native_app` отклоняется. Upsert по `endpoint`, как сейчас.
- Веб-подписки, сохранённые до появления проверки, не трогаем: проверяются только новые.
- `sendPushToUser` не меняется: 404/410 от ntfy (топик удалён) удаляют подписку, как у веба.
- Сбои ntfy: 5 подряд неудачных отправок на хост `NTFY_URL` (5xx, таймаут) — алерт админу через `sendAdminTelegram`
  (`lib/errors/notify.ts`) не чаще раза в час; счётчик в памяти процесса.
- Админка, метрики: число подписок по `kind`.

## Ошибки и края

| Ситуация | Поведение |
|---|---|
| ntfy недоступен | Web Push → 5xx, лог; при серии сбоев — алерт админу. Сообщения REST с TTL 120 с теряются, остальные ntfy доставит, если вернётся в пределах TTL |
| Пользователь удалил приложение ntfy | Дистрибьютор шлёт `onUnregistered` → `unsubscribePushAction`; в `rustore`/`apk` — переход на своё соединение и новая подписка |
| Дистрибьютор на чужом сервере | Сервер отклоняет подписку; подсказка в `/settings`; `rustore`/`apk` — своё соединение до переключения |
| Не расшифровалось (сменились ключи) | Сообщение отбрасывается, перерегистрация |
| Нет разрешения `POST_NOTIFICATIONS` | `status().reason = "permission"`, подписка не сохраняется |
| Выход из аккаунта | Подписка удаляется на сервере, регистрация снимается на телефоне |

## Данные и 152-ФЗ

- В БД — эндпоинт, ключи, `kind`, `appVersion`, как и раньше без содержимого уведомлений.
- На ntfy — только зашифрованные сообщения с хранением ≤ 12 ч, без учёток; сервер в РФ, на нашем хостинге.
- «Мои данные» (`lib/account/*`): новый раздел `pushDevices` — `kind`, `appVersion`, `createdAt` (без эндпоинта и
  ключей; раньше подписки не выгружались вовсе). Удаление аккаунта — каскад уже есть.
- `/privacy`: строка о том, что push в приложении идут через наш сервер ntfy и зашифрованы. FAQ на лендинге — про
  приложение, только когда появится реальная ссылка на магазин.

## Флаг `native_app`

Выключен — `subscribePushAction` отклоняет нативные `kind`, баннера «Скачать приложение» нет. Пункт «Что нового» — с
`flag: "native_app"`.

## Тесты

- unit: `allowedPushHost` (каждый `kind`, `http`, `localhost` и IP, поддомен `NTFY_URL`, порт, пустой `NTFY_URL`),
  схема подписки с `kind`.
- e2e (`e2e/native-push.spec.ts`, serial, только desktop — глобальный флаг): фейковый push-сервис
  `e2e/push-server.ts` играет роль ntfy (`NTFY_URL` на него); нативная подписка сохраняется и получает push; подписка с
  чужим хостом отклоняется; при выключенном флаге отклоняется; отписка удаляет строку.
- Android: JUnit на расшифровку (тест-векторы RFC 8291) и выбор режима; ручной чек-лист в `android/README.md` на
  реальном телефоне: три сборки × (с ntfy на нашем сервере / с ntfy на ntfy.sh / без ntfy), заблокированный экран и
  Doze, таймер отдыха, нажатие на уведомление, выход из аккаунта.

## Этапы

Каждый этап — свой план и своя фича-ветка от `release/2027-05-native`.

1. **Сервер:** `PushKind`, `appVersion`, `NTFY_URL`, `allowedPushHost`, флаг `native_app`, ntfy в `deploy/`, алерт о
   сбоях, метрики, «Мои данные». e2e — только отправка на нативную подписку (через БД): вызвать action с нативным
   `kind` без Capacitor нечем.
2. **Обёртка и UnifiedPush:** проект `android/`, flavors, `HeroPush` в режимах `unifiedpush`/`none`, каналы,
   `push-provider`, `/settings`, App Links, `/privacy` (раньше нельзя: утверждения о приложении должны быть правдой),
   e2e `native-push.spec.ts` с подменой `window.Capacitor` через `addInitScript`. После этапа сборка `play` готова.
3. **Своё соединение** для `rustore`/`apk`: топик, ключи, foreground service, переподключение, батарея.

## Вне объёма

iOS; FCM в любом виде; публикация в магазины (карточки, скриншоты, модерация); сборка APK в CI; офлайн-режим
приложения сверх того, что уже умеет сайт.
