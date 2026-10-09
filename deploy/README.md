# Деплой Hero Fit

Сервер: Docker Compose — Postgres, миграции + сид, приложение (Next.js standalone), Caddy (HTTPS Let's Encrypt), ежедневный `pg_dump`.
Обновление: после зелёного CI на `main` workflow `Deploy` собирает образы в GHCR (`ghcr.io/<владелец>/hero-fit` и `…-migrate`),
копирует `docker-compose.yml` и `Caddyfile` на сервер и перезапускает стек. Ручной запуск — Actions → Deploy → Run workflow.

## Один раз: сервер

Ubuntu/Debian, команды от root (или через sudo).

1. **DNS.** A-запись домена (и `www`) → IP сервера. Порты 80 и 443 открыты (`ufw allow 80,443/tcp` если включён ufw).
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
4. **SSH-ключ для GitHub Actions** (на своей машине):
   ```sh
   ssh-keygen -t ed25519 -f hero-fit-deploy -N "" -C "github-actions"
   ```
   Публичную часть (`hero-fit-deploy.pub`) — на сервер в `/home/deploy/.ssh/authorized_keys`
   (папка `700`, файл `600`, владелец `deploy`). Приватную — в секрет `SSH_KEY` (см. ниже).
5. **`/opt/hero-fit/.env`** — по образцу [`.env.example`](.env.example): домен, пароль базы, JWT-секреты, VAPID, почта.
   `chmod 600 /opt/hero-fit/.env`.

## Один раз: GitHub

Settings → Secrets and variables → Actions:

| Тип | Имя | Значение |
|---|---|---|
| Secret | `SSH_HOST` | IP или домен сервера |
| Secret | `SSH_USER` | `deploy` |
| Secret | `SSH_KEY` | приватный ключ `hero-fit-deploy` целиком |
| Secret | `SSH_PORT` | только если SSH не на 22 |
| Variable | `APP_URL` | `https://домен` — вшивается в сборку (robots, sitemap, canonical) |
| Variable | `DEPLOY_PATH` | только если не `/opt/hero-fit` |

Пока переменной `APP_URL` нет, workflow `Deploy` пропускается.

После первого деплоя: Actions → Deploy → Run workflow (или любой push в `main`). Проверка — `https://домен/api/health` → `{"ok":true}`.

## На сервере

```sh
cd /opt/hero-fit
docker compose ps                      # состояние
docker compose logs -f app             # логи приложения
docker compose logs migrate            # последние миграции и сид
ls backups/                            # дампы базы (14 дней)
```

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

Без `IMAGE_TAG` compose берёт `latest` — последний собранный образ. Если пакеты в GHCR приватные, для ручного `pull`
нужен `docker login ghcr.io` (токен с `read:packages`); деплой из Actions логинится сам.

## После запуска

- Яндекс.Вебмастер и Google Search Console: добавить сайт, отправить `https://домен/sitemap.xml`.
- Почта: без `SMTP_HOST` письма восстановления пароля не уходят (только в лог `app`).
