# Push через ntfy — этап 1 (сервер) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сервер Hero Fit принимает нативные push-подписки (UnifiedPush через наш ntfy), шлёт на них тем же Web Push, следит за доступностью ntfy; ntfy развёрнут рядом с приложением.

**Architecture:** `PushSubscription` получает `kind` и `appVersion`. Проверка входа подписки — чистая функция в `lib/notifications/push-hosts.ts`, `subscribePushAction` становится тонкой обёрткой над ней. Отправка (`sendPushToUser`) не меняется, кроме учёта сбоев на хосте ntfy (чистый счётчик `lib/notifications/ntfy-health.ts` → `sendAdminTelegram`). ntfy — ещё один сервис в `deploy/docker-compose.yml` за Caddy.

**Tech Stack:** Next.js 16 (Server Actions), Prisma 7, Zod, `web-push`, Vitest, Playwright, Docker Compose, Caddy, ntfy.

**Spec:** `docs/superpowers/specs/2026-10-25-native-push-ntfy-design.md` (этап 1)

## Global Constraints

- Ветка фичи — `feat/native-push-server` от `release/2027-05-native`; в релизную — `git merge --no-ff`, ветку удалить.
- Все тексты, комментарии и сообщения коммитов в стиле проекта: комментарии и UI — по-русски, коммиты — по-английски, с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Флаг — `native_app`, `expires: "2027-06-30"`.
- `NTFY_URL` — необязательный, `z.url()` только `https://`; без него нативные подписки отклоняются.
- Нативные `kind`: `UNIFIEDPUSH`, `EMBEDDED`; веб — `WEB` (значение по умолчанию; старые строки — `WEB`).
- Алерт о сбоях ntfy — после 5 неудачных отправок подряд, не чаще раза в час.
- Отправка, очередь `ScheduledPush`, TTL и `urgency` не меняются.
- `/privacy`, «Что нового», лендинг на этом этапе не трогаем (приложения ещё нет).

## Review Focus

- Чужой пользователь шлёт `kind: "UNIFIEDPUSH"` при выключенном флаге — подписка не сохраняется (тест в Task 2).
- Эндпоинт `https://push.example.ru.evil.com/up…` или `https://evil.com/?h=push.example.ru` — отклоняется: сравнивается `hostname` целиком (тест в Task 2).
- Старый клиент шлёт подписку без `kind` — сохраняется как `WEB`, как раньше (тест в Task 2).
- `NTFY_URL` не задан, а сбои на чужих хостах — счётчик ntfy не трогается и алерт не уходит (тест в Task 3).
- 404/410 от ntfy — это не сбой: подписка удаляется, счётчик не растёт (тест в Task 3).

---

### Task 1: Модель — `PushKind`, `kind`, `appVersion`, флаг `native_app`

**Files:**
- Modify: `prisma/schema.prisma` (модель `PushSubscription`, строки ~676–688)
- Create: `prisma/migrations/<timestamp>_push_kind/migration.sql` (через `prisma migrate dev --name push_kind`)
- Modify: `lib/flags/registry.ts`

**Interfaces:**
- Produces: enum `PushKind { WEB UNIFIEDPUSH EMBEDDED }` (импорт — `@/generated/prisma/enums`), поля `PushSubscription.kind PushKind @default(WEB)`, `PushSubscription.appVersion String?`; флаг `"native_app"` в `FLAGS` с `description: "Нативное Android-приложение: push через свой ntfy"`.

- [ ] **Step 1:** Добавить enum и поля в схему, выполнить `npx prisma migrate dev --name push_kind`.
- [ ] **Step 2:** Проверить SQL миграции: только `CREATE TYPE "PushKind"` и два `ALTER TABLE "PushSubscription" ADD COLUMN`; никаких `DROP INDEX` частичных индексов (`CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`) — если есть, удалить эти строки.
- [ ] **Step 3:** Добавить `native_app` в `lib/flags/registry.ts`.
- [ ] **Step 4:** Run: `npm run typecheck && npx vitest run lib/flags` — Expected: PASS.
- [ ] **Step 5:** Commit: `feat(push): PushKind and appVersion on subscriptions, native_app flag`.

### Task 2: Проверка подписки и `subscribePushAction`

**Files:**
- Create: `lib/notifications/push-hosts.ts`
- Test: `lib/notifications/push-hosts.test.ts`
- Modify: `lib/env.ts` (добавить `NTFY_URL`), `.env.example`, `deploy/.env.example`
- Modify: `lib/notifications/actions.ts:13-31`

**Interfaces:**
- Consumes: `PushKind`, флаг `native_app` (Task 1); `isEnabled(key, userId)` из `lib/flags/server.ts`.
- Produces:
  - `allowedPushHost(kind: PushKind, endpoint: string, ntfyUrl: string | undefined): boolean`
  - `subscriptionSchema` (перенести сюда из `actions.ts`, экспорт): `{ endpoint: z.url().max(2048), keys: { p256dh, auth } (как сейчас), kind: z.enum(PushKind).default("WEB"), appVersion: z.string().max(32).optional() }`
  - `isNativeKind(kind: PushKind): boolean` — `kind !== "WEB"`
  - `ntfyHost(ntfyUrl: string | undefined): string | null` — `hostname` в нижнем регистре или `null`

- [ ] **Step 1: Write the failing tests** — `push-hosts.test.ts`:

```ts
const NTFY = "https://push.example.ru";
describe("allowedPushHost", () => {
  it("WEB: любой https-хост браузерного сервиса", () => {
    expect(allowedPushHost("WEB", "https://fcm.googleapis.com/fcm/send/abc", NTFY)).toBe(true);
    expect(allowedPushHost("WEB", "https://push.yandex.ru/x", undefined)).toBe(true);
  });
  it("WEB: не http, не localhost, не IP", () => {
    expect(allowedPushHost("WEB", "http://fcm.googleapis.com/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://localhost/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://127.0.0.1:8443/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://[::1]/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://10.0.0.5/x", NTFY)).toBe(false);
  });
  it("нативные: только имя хоста NTFY_URL, порт не важен", () => {
    for (const kind of ["UNIFIEDPUSH", "EMBEDDED"] as const) {
      expect(allowedPushHost(kind, "https://push.example.ru/upAbc?up=1", NTFY)).toBe(true);
      expect(allowedPushHost(kind, "https://PUSH.example.ru:8443/upAbc", NTFY)).toBe(true);
      expect(allowedPushHost(kind, "https://ntfy.sh/upAbc?up=1", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "https://push.example.ru.evil.com/up", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "https://evil.com/?h=push.example.ru", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "http://push.example.ru/up", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "https://push.example.ru/up", undefined)).toBe(false);
    }
  });
  it("нативные: e2e-ntfy на 127.0.0.1 со случайным портом", () => {
    expect(allowedPushHost("UNIFIEDPUSH", "https://127.0.0.1:51234/push/ab", "https://127.0.0.1")).toBe(true);
  });
  it("мусор вместо URL — false", () => {
    expect(allowedPushHost("WEB", "not a url", NTFY)).toBe(false);
  });
});
describe("subscriptionSchema", () => {
  const base = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } };
  it("без kind — WEB (старые клиенты)", () => {
    expect(subscriptionSchema.parse(base).kind).toBe("WEB");
  });
  it("kind и appVersion принимаются", () => {
    expect(subscriptionSchema.parse({ ...base, kind: "EMBEDDED", appVersion: "1.0.0" })).toMatchObject({ kind: "EMBEDDED", appVersion: "1.0.0" });
  });
  it("чужой kind и длинная версия — ошибка", () => {
    expect(subscriptionSchema.safeParse({ ...base, kind: "FCM" }).success).toBe(false);
    expect(subscriptionSchema.safeParse({ ...base, appVersion: "x".repeat(33) }).success).toBe(false);
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run lib/notifications/push-hosts.test.ts` — Expected: FAIL (модуля нет).
- [ ] **Step 3: Implement** `push-hosts.ts` (без `server-only`: чистые функции, импортируются тестом). IP — `net.isIP(hostname.replace(/^\[|\]$/g, ""))`; `localhost` — сам и `*.localhost`. Добавить `NTFY_URL: z.url().startsWith("https://").optional()` в `lib/env.ts`; в оба `.env.example` — `NTFY_URL=` с комментарием «ntfy для push в Android-приложении, например https://push.<домен>; пусто — нативные подписки не принимаются».
- [ ] **Step 4:** Переписать `subscribePushAction`: разбор через `subscriptionSchema`; затем `if (!allowedPushHost(kind, endpoint, env.NTFY_URL)) return { ok: false }`; для `isNativeKind(kind)` — `if (!(await isEnabled("native_app", user.id))) return { ok: false }`; в `create`/`update` upsert добавить `kind`, `appVersion: appVersion ?? null`. Сигнатура и `unsubscribePushAction` без изменений.
- [ ] **Step 5:** Run: `npx vitest run lib/notifications && npm run typecheck && npm run lint` — Expected: PASS.
- [ ] **Step 6:** Commit: `feat(push): accept native subscriptions only on our ntfy host`.

### Task 3: Сбои ntfy → алерт админу; отправка на нативную подписку

**Files:**
- Create: `lib/notifications/ntfy-health.ts`
- Test: `lib/notifications/ntfy-health.test.ts`
- Modify: `lib/notifications/push.ts` (`sendPushToUser`)
- Modify: `e2e/db.ts:~240` (`addSubscription` — необязательный параметр `kind`), `e2e/notifications.spec.ts` (новый тест)

**Interfaces:**
- Consumes: `ntfyHost` (Task 2), `sendAdminTelegram` из `lib/errors/notify.ts`, `PushKind` (Task 1).
- Produces:
  - `NTFY_FAIL_THRESHOLD = 5`, `NTFY_ALERT_EVERY_MS = 3_600_000`
  - `createNtfyHealth(): { record(ok: boolean, now: number): boolean }` — `true`, когда пора слать алерт: подряд `≥ NTFY_FAIL_THRESHOLD` сбоев и с прошлого алерта прошло `≥ NTFY_ALERT_EVERY_MS` (или алертов не было); успех обнуляет серию.
  - `export const ntfyHealth = createNtfyHealth()` — общий экземпляр процесса.

- [ ] **Step 1: Write the failing tests** — `ntfy-health.test.ts`:

```ts
it("алерт на 5-м сбое подряд, не раньше", () => {
  const h = createNtfyHealth();
  expect([1, 2, 3, 4].map((i) => h.record(false, i))).toEqual([false, false, false, false]);
  expect(h.record(false, 5)).toBe(true);
});
it("успех обнуляет серию", () => {
  const h = createNtfyHealth();
  for (let i = 0; i < 4; i++) h.record(false, i);
  h.record(true, 4);
  for (let i = 5; i < 9; i++) expect(h.record(false, i)).toBe(false);
});
it("повторный алерт — не раньше чем через час", () => {
  const h = createNtfyHealth();
  for (let i = 0; i < 5; i++) h.record(false, i);
  expect(h.record(false, 10)).toBe(false);
  expect(h.record(false, 4 + NTFY_ALERT_EVERY_MS)).toBe(true);
});
```

- [ ] **Step 2:** Run: `npx vitest run lib/notifications/ntfy-health.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `ntfy-health.ts`.
- [ ] **Step 4:** В `sendPushToUser`: `const ntfy = ntfyHost(env.NTFY_URL)`; для подписки, чей `new URL(endpoint).hostname` (нижний регистр) равен `ntfy`: успех → `ntfyHealth.record(true, Date.now())`; ошибка, кроме 404/410 → `if (ntfyHealth.record(false, Date.now())) void sendAdminTelegram("⚠️ ntfy не принимает push: 5 отправок подряд с ошибкой. Проверь контейнер ntfy и Caddy.")`. 404/410 — как сейчас, без записи в счётчик. Чужие хосты счётчик не трогают.
- [ ] **Step 5:** `addSubscription(login, push, kind = "WEB")` в `e2e/db.ts` пишет `kind` (`$6::"PushKind"`). Тест в `e2e/notifications.spec.ts`: `"native (UNIFIEDPUSH) subscription gets the same push"` — по образцу `dead subscriptions (410 Gone) are removed`: `startPushService()`, `addSubscription(login, push, "UNIFIEDPUSH")`, `setDueStreak` + `runTick(request, at, "reminders")`, `expect.poll(() => push.received.length).toBe(1)` и `push.received[0].payload` содержит `type: "STREAK"` и `tag: "hero-fit-streak"`.
- [ ] **Step 6:** Run: `npx vitest run lib/notifications && npm run typecheck && npm run lint && npm run build && npx playwright test e2e/notifications.spec.ts --project=desktop` — Expected: PASS.
- [ ] **Step 7:** Commit: `feat(push): alert admins when ntfy keeps failing; e2e native subscription delivery`.

### Task 4: Метрики и «Мои данные»

**Files:**
- Modify: `lib/admin/metrics-queries.ts:303-340` (`FeatureUsage`, `getFeatureUsage`), `components/admin/feature-usage.tsx:11`
- Modify: `lib/account/export.ts` (тип `ExportRaw`, список разделов ~строка 115, сборка ~строка 225), `lib/account/export-queries.ts` (`getExportData`)
- Test: `lib/account/export.test.ts`, `e2e/account-data.spec.ts`

**Interfaces:**
- Consumes: `PushSubscription.kind`, `appVersion` (Task 1).
- Produces: `FeatureUsage.pushNative: number`; раздел выгрузки `pushDevices: { kind: string; appVersion: string | null; createdAt: Date }[]`.

- [ ] **Step 1: Write the failing test** — в `export.test.ts`: выгрузка с `pushDevices: [{ id: "x", kind: "UNIFIEDPUSH", appVersion: "1.0.0", createdAt, endpoint: "https://…", p256dh: "k", auth: "a" }]` даёт в разделе `pushDevices` ровно `{ kind, appVersion, createdAt }` — без `id`, `endpoint`, `p256dh`, `auth`; раздел есть в списке разделов.
- [ ] **Step 2:** Run: `npx vitest run lib/account` — Expected: FAIL.
- [ ] **Step 3:** Реализовать раздел (запрос `db.pushSubscription.findMany({ where: { userId }, select: { kind: true, appVersion: true, createdAt: true }, orderBy: { createdAt: "asc" } })`), комментарий в типе: «Устройства с push: тип и версия приложения — без эндпоинта и ключей».
- [ ] **Step 4:** Метрики: `(SELECT COUNT(DISTINCT "userId") FROM "PushSubscription" WHERE kind <> 'WEB')::int AS "pushNative"`; строка UI — ``["Push", `${fmt(u.push)}, в приложении ${fmt(u.pushNative)}`]``.
- [ ] **Step 5:** В `e2e/account-data.spec.ts` — проверка, что в JSON выгрузки есть ключ `pushDevices` (массив).
- [ ] **Step 6:** Run: `npx vitest run lib/account lib/admin && npm run typecheck && npm run lint && npm run build && npx playwright test e2e/account-data.spec.ts e2e/admin-metrics.spec.ts --project=desktop` — Expected: PASS.
- [ ] **Step 7:** Commit: `feat(push): native push in admin metrics and the data export`.

### Task 5: ntfy в деплое и документация

**Files:**
- Modify: `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/README.md`
- Create: `deploy/ntfy/server.yml`
- Modify: `docs/features/platform.md` (абзац «Уведомления»)

- [ ] **Step 1:** Сервис `ntfy` в `deploy/docker-compose.yml`: `image: binwiederhier/ntfy:v2.11.0`, `command: serve`, `restart: unless-stopped`, тома `./ntfy/server.yml:/etc/ntfy/server.yml:ro` и `ntfy_data:/var/lib/ntfy` (добавить в `volumes:`), порт наружу не публикуется.
- [ ] **Step 2:** `deploy/ntfy/server.yml`:

```yaml
# ntfy для push в Android-приложении (спека 2026-10-25-native-push-ntfy). Тело push зашифровано ключами устройства.
base-url: "https://push.${DOMAIN}"   # заменить на реальный домен: ntfy не подставляет env в yml
listen-http: ":80"
behind-proxy: true
cache-file: "/var/lib/ntfy/cache.db"
cache-duration: "12h"
auth-file: "/var/lib/ntfy/auth.db"
auth-default-access: "deny-all"
visitor-subscriber-rate-limiting: true
```

- [ ] **Step 3:** `deploy/Caddyfile` — блок `push.{$DOMAIN} { reverse_proxy ntfy:80 }` (без `encode`: поток JSON не буферизовать).
- [ ] **Step 4:** `deploy/README.md` — раздел «ntfy (push в Android-приложении)»: DNS-запись `push.<домен>`, правка `base-url`, однократно `docker compose exec ntfy ntfy access everyone 'up*' read-write`, проверка `curl -d test https://push.<домен>/up$(openssl rand -hex 11)` → 200, `NTFY_URL=https://push.<домен>` в `.env`.
- [ ] **Step 5:** Проверка: `docker compose -f deploy/docker-compose.yml config -q` (с `DOMAIN=x POSTGRES_PASSWORD=x`) — Expected: без ошибок.
- [ ] **Step 6:** `docs/features/platform.md`: в абзац про уведомления — `PushSubscription.kind` (`WEB`/`UNIFIEDPUSH`/`EMBEDDED`) и `appVersion`, проверка хоста (`allowedPushHost`, `lib/notifications/push-hosts.ts`: веб — https без localhost/IP, нативные — только хост `NTFY_URL`), флаг `native_app`, алерт о сбоях ntfy (`ntfy-health.ts`), ntfy в `deploy/`, ссылка на спеку.
- [ ] **Step 7:** Commit: `feat(deploy): ntfy service behind Caddy for app push; docs`.

### Завершение

- [ ] Полный прогон: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` — Expected: всё зелёное.
- [ ] Ревью ветки, затем `git switch release/2027-05-native && git merge --no-ff feat/native-push-server && git branch -d feat/native-push-server`.
