# Прод-образы (deploy/docker-compose.yml):
#   runner  — Next.js standalone-сервер (`node server.js`);
#   migrate — разовый запуск: `prisma migrate deploy` + идемпотентный сид (встроенные упражнения и программы).
# APP_URL нужен на этапе сборки: robots.txt, sitemap и canonical публичных страниц собираются статически.

FROM node:24-slim AS deps
WORKDIR /app
# prisma.config.ts требует DATABASE_URL уже на `prisma generate` (postinstall); при сборке база не нужна.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXT_TELEMETRY_DISABLED=1
# openssl — Prisma CLI (migrate) определяет по нему платформу.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Без сборки Next: слой зависимостей общий между деплоями, меняются только исходники.
FROM deps AS migrate
ENV NODE_ENV=production
COPY . .
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

FROM deps AS build
ARG APP_URL
# Номер счётчика Яндекс.Метрики (необязательно): вшивается в клиентский код при сборке
ARG NEXT_PUBLIC_YM_ID
# Короткий sha коммита (необязательно): рядом с версией в /settings (next.config.ts)
ARG GIT_SHA
COPY . .
RUN test -n "$APP_URL" || (echo "APP_URL build arg is required" && exit 1)
# Секреты-заглушки только на время сборки (lib/env.ts валидирует окружение при импорте), в образ не попадают;
# настоящие — в .env на сервере.
RUN JWT_ACCESS_SECRET=build-only-access-secret-0123456789abcdef \
    JWT_REFRESH_SECRET=build-only-refresh-secret-0123456789abcdef \
    NOTIFICATIONS_WORKER=off \
    BUILD_STANDALONE=1 \
    npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
