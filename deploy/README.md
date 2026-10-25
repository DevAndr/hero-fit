# Деплой Hero Fit

Сервер: Docker Compose — Postgres, миграции + сид, приложение (Next.js standalone), Caddy (HTTPS Let's Encrypt), ежедневный `pg_dump`.
Обновление: после зелёного `checks` на `main` задача `deploy` (`.gitlab-ci.yml`) на своём раннере GitLab собирает образы
`hero-fit` и `hero-fit-migrate`, копирует `docker-compose.yml` и `Caddyfile` на сервер и пушит образы в реестр на сервере
(`registry`, слушает только `127.0.0.1:5000`) через SSH-туннель — уходят только изменённые слои; затем сервер скачивает их
и перезапускает стек. Внешний реестр и токены не нужны, но раннер (ПК с GitLab) должен быть включён.
Ручной запуск — Build → Pipelines → Run pipeline (ветка `main`).

Раннеру нужен Docker executor с `privileged = true` (сборка — `docker:28-dind`).

## Один раз: сервер

Ubuntu/Debian, команды от root (или через sudo).

1. **DNS.** A-запись домена (и `www`) → IP сервера. Порты 80 и 443 открыты (`ufw allow 80,443/tcp` если включён ufw).
   Домена пока нет — `<IP через дефисы>.sslip.io` (например, `203-0-113-7.sslip.io`): он сам указывает на этот IP, и
   Caddy получит на него сертификат. Поисковики такой адрес не индексируют — для запуска нужен свой домен.
2. **Docker:**
   ```sh
   curl -fsSL https://get.docker.com | sh
   ```
3. **Пользователь для деплоя** с доступом к Docker и папкой проекта:
   ```sh
   adduser --disabled-password --gecos "" deploy
   usermod -aG docker deploy
   mkdir -p /opt/hero-fit/backups && chown -R deploy:deploy /opt/hero-fit
   ```
4. **SSH-ключ для деплоя** (на своей машине):
   ```sh
   ssh-keygen -t ed25519 -f hero-fit-deploy -N "" -C "gitlab-deploy"
   ```
   Публичную часть (`hero-fit-deploy.pub`) — на сервер в `/home/deploy/.ssh/authorized_keys`
   (папка `700`, файл `600`, владелец `deploy`). Приватную — в переменную `SSH_KEY` (см. ниже).
   В `/etc/ssh/sshd_config` не должно быть `AllowTcpForwarding no` (туннель к реестру); проверка — `sshd -T | grep -i allowtcp`.
5. **`/opt/hero-fit/.env`** — по образцу [`.env.example`](.env.example): домен, пароль базы, JWT-секреты, VAPID, почта.
   `chmod 600 /opt/hero-fit/.env`.

## Один раз: GitLab

Settings → CI/CD → Variables (Visibility — Masked, где можно; Protect — да: `main` защищена):

| Тип | Имя | Значение |
|---|---|---|
| Variable | `PROD_APP_URL` | `https://домен` — вшивается в сборку (robots, sitemap, canonical); тот же, что `APP_URL` в `.env` сервера |
| Variable | `SSH_HOST` | IP сервера |
| Variable | `SSH_USER` | `deploy` |
| **File** | `SSH_KEY` | приватный ключ `hero-fit-deploy` целиком (с переводом строки в конце) |
| Variable | `SSH_PORT` | только если SSH не на 22 |
| Variable | `YM_ID` | номер счётчика Яндекс.Метрики (необязательно) |
| Variable | `DEPLOY_PATH` | только если не `/opt/hero-fit` |

Пока переменной `PROD_APP_URL` нет, задача `deploy` в пайплайн не попадает.

Первый деплой: Build → Pipelines → Run pipeline на `main` (или слияние MR в `main`). Первый пуш долгий — образ `migrate` ~1,7 ГБ,
дальше — только изменённые слои. Проверка — `https://домен/api/health` → `{"ok":true}`.

## Telegram-бот (необязательно)

1. В [@BotFather](https://t.me/BotFather): `/newbot` → токен и имя бота (без `@`).
2. В `/opt/hero-fit/.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`),
   затем Run pipeline на `main` (перечитает `.env`). Голый `docker compose up -d app` на сервере возьмёт `:latest` из
   реестра — последний собранный образ, обычно он же. Точно текущий — с тегом запущенного образа:
   `IMAGE_TAG=$(docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q app)" | sed 's/.*://') docker compose up -d app`.
   Проверка: `curl -X POST https://<домен>/api/telegram/webhook` → `401` (бот включён; `404` — `.env` не подхвачен или старый образ).
3. Один раз зарегистрировать webhook (в образе нет `tsx`, поэтому `curl`; или `npm run telegram:webhook` локально с теми же env):
   ```sh
   cd /opt/hero-fit && set -a && . ./.env && set +a
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H 'content-type: application/json' \
     -d "{\"url\":\"https://$DOMAIN/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"
   ```
   Ответ — `{"ok":true,...}`. Проверка: `/settings` → «Telegram» → «Подключить» → «Start» в боте.

### Telegram Mini App (вход из Telegram)

После бота: [@BotFather](https://t.me/BotFather) → `/mybots` → бот → Bot Settings → Configure Mini App → Enable Mini App →
URL `https://<домен>/tg`. Без этого ссылки тренера `t.me/<бот>?startapp=join_<код>` не откроют приложение.
Проверка: в Telegram — кнопка «Открыть» у бота → экран «Привет, …!» или сразу дашборд (если Telegram уже подключён).

## WHOOP (необязательно)

Браслет WHOOP: пульс и нагрузка в сводке тренировки, сон и восстановление на главной (флаг `whoop`, данные о здоровье — по отдельному согласию).

1. В кабинете [developer.whoop.com](https://developer.whoop.com): приложение со scopes `read:workout`, `read:profile`, `read:recovery`, `read:sleep`, `offline`
   (сон и восстановление; `read:cycles` не нужен). Вебхуки `sleep.*` и `recovery.*` уже настроены вместе с `workout.*`;
   Redirect URL — `https://<домен>/api/whoop/callback`, Webhook URL — `https://<домен>/api/whoop/webhook` (модель v2);
   ссылка на политику конфиденциальности — `https://<домен>/privacy`. До одобрения приложения WHOOP подключить
   можно не больше 10 пользователей — включать флаг по списку.
2. В `/opt/hero-fit/.env`: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` и `WHOOP_TOKEN_KEY`
   (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), затем Run pipeline на `main`
   (как для Telegram-бота). **`WHOOP_TOKEN_KEY` не менять** — им зашифрованы токены, с другим ключом все подключения
   придётся переподключать.
   Проверка: `curl -X POST https://<домен>/api/whoop/webhook` → `401` (WHOOP включён; `404` — `.env` не подхвачен или старый образ).
3. До включения — обновить уведомление в Роскомнадзор об обработке ПДн: добавляется специальная категория «состояние здоровья»
   (пульс из WHOOP).
4. `/admin/flags` → `whoop` → добавить логины в список (не процент, пока действует лимит 10 пользователей). Проверка:
   `/settings` → «Браслеты и часы» → «Подключить WHOOP».
5. Уже подключённым до сна и восстановления пользователям нужно нажать «Разрешить» (на дашборде или в «Браслеты и часы»):
   новое согласие и повторный вход выдают `read:recovery` и `read:sleep`.

## ntfy — push в Android-приложении (необязательно)

Push приложения идут через свой ntfy (UnifiedPush, спека `docs/superpowers/specs/2026-10-25-native-push-ntfy-design.md`),
сервис `ntfy` в `docker-compose.yml`, снаружи — `push.<домен>` через Caddy. Тело push зашифровано ключами устройства.

1. DNS: запись `push.<домен>` на сервер — **до** деплоя с этим Caddyfile, иначе Caddy будет безуспешно запрашивать
   сертификат (основной сайт при этом работает).
2. После первого деплоя с ntfy — один раз открыть топики UnifiedPush (остальные закрыты `deny-all`):
   `docker compose exec ntfy ntfy access everyone 'up*' read-write`. Права хранятся в томе `ntfy_data`.
3. Проверка: `curl -d test "https://push.<домен>/up$(openssl rand -hex 6)?up=1"` → `507` (`?up=1` — так шлёт сервер Hero Fit; без него ntfy ответит `200`) («нет подписчика» — ntfy жив и
   топики открыты; `403` — шаг 2 не выполнен). Топик UnifiedPush — ровно `up` + 12 символов.
4. В `/opt/hero-fit/.env`: `NTFY_URL=https://push.<домен>`, затем Run pipeline на `main`. Без `NTFY_URL` сервер
   не принимает подписки приложения. Флаг `native_app` в `/admin/flags` — когда выйдет приложение.

APK Android-приложения для скачивания с сайта — `/opt/hero-fit/downloads/hero-fit.apk` (Caddy, `/apk/*`; кнопка ведёт на
`/download/hero-fit.apk` — приложение считает нажатие и переадресует; том
`./downloads`); как собрать и выложить — `android/README.md`, «APK на сайте».

Пять неудачных отправок на ntfy подряд — алерт админам в Telegram (не чаще раза в час).

## На сервере

```sh
cd /opt/hero-fit
docker compose ps                      # состояние
docker compose logs -f app             # логи приложения
docker compose logs migrate            # последние миграции и сид
ls backups/                            # дампы базы (14 дней)
```

Подключиться к базе с ПК (TablePlus, DBeaver и т. п.) — через SSH: SSH `deploy@<сервер>` с ключом, база `127.0.0.1:5432`,
пользователь/база `herofit`, пароль — `POSTGRES_PASSWORD` из `/opt/hero-fit/.env`. Снаружи порт 5432 закрыт.

Откат на прошлую версию — тег образа = sha коммита:

```sh
IMAGE_TAG=<sha> docker compose up -d app
```

Восстановление базы из дампа:

```sh
docker compose stop app
docker compose exec -T db pg_restore -U herofit -d herofit --clean --if-exists < backups/herofit-YYYYMMDD-HHMM.dump
docker compose start app
```

Без `IMAGE_TAG` compose берёт `latest` — последний собранный образ. Откатиться можно на версии последних 3 суток
(старые образы удаляются после деплоя); в реестре хранится только `latest`.

## Админ и фича-флаги

Страница `/admin/flags` доступна логинам из `ADMIN_LOGINS` (через запятую) в `.env` на сервере. **Сначала
зарегистрируйте аккаунт админа на сайте, потом впишите его логин в `ADMIN_LOGINS`** и перезапустите `app`: логин из
списка, которого ещё нет, может занять любой зарегистрировавшийся — и стать админом.

## Мониторинг

- Ошибки сервера и браузера — `/admin/errors` (админам из `ADMIN_LOGINS`): одинаковые сбои группируются, кнопка
  «Решено»; повтор решённой ошибки открывает её снова. Журнал хранится 30 дней.
- О новой или вернувшейся ошибке приходит сообщение в Telegram — админам, привязавшим бота в `/settings`.
- Если лежит база, записать ошибку некуда (только лог `app`). Доступность — внешний пинг
  `https://домен/api/health` раз в 5 минут (UptimeRobot или Яндекс Мониторинг) с оповещением на почту/Telegram.

## После запуска

- Яндекс.Вебмастер и Google Search Console: добавить сайт, отправить `https://домен/sitemap.xml`.
- Почта: без `SMTP_HOST` письма восстановления пароля не уходят (только в лог `app`). Почта Timeweb для домена
  (DNS у Timeweb — MX `mx1/mx2.timeweb.ru` и SPF `include:_spf.timeweb.ru` ставятся сами, DKIM — автоматически после
  создания ящика и первого письма; DMARC добавить вручную: TXT `_dmarc` → `v=DMARC1; p=none`). Создать ящик
  (например, `no-reply@домен`). В `.env`: `SMTP_HOST=smtp.timeweb.ru`, `SMTP_PORT=465`, `SMTP_USER=no-reply@домен`,
  `SMTP_PASSWORD=<пароль ящика>`, `MAIL_FROM="Hero Fit <no-reply@домен>"` — отправитель обязан совпадать с ящиком
  (Timeweb запрещает подмену). Затем `docker compose up -d app` и проверка через «Забыли пароль».
  Облачные серверы по умолчанию закрывают исходящие SMTP-порты (25/465/587/2525) — открыть через поддержку провайдера
  сервера; проверка: `timeout 6 bash -c '</dev/tcp/smtp.timeweb.ru/465' && echo open`.
- Яндекс.Метрика: создать счётчик на metrika.yandex.ru, номер — в переменную GitLab `YM_ID` (вшивается при
  сборке; следующий деплой включит счётчик и уведомление о cookies). Цели (тип «JavaScript-событие») — `signup`,
  `workout_start`, `workout_finish`, `first_workout`, `program_start` («Начать программу» на `/training-programs`). Вебвизор не записывает текст
  кабинета (`ym-hide-content`).
