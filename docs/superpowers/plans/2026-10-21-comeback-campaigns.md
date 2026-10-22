# Рассылки по условиям — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** админ заводит кампании «вернись в зал» по готовым условиям; тик уведомлений рассылает их раз за серию с общим лимитом; в админке видно, сколько отправлено и сколько вернулись.

**Architecture:** таблицы `Campaign`/`CampaignSend`, условия — SQL-функции в `lib/campaigns/conditions.ts`, чистые правила — `lib/campaigns/rules.ts`, шаг тика `processCampaigns` в `runNotificationTick`. Доставка — существующие `notify` → `ScheduledPush` → `processDuePushes` (push + Telegram) с флагами каналов. Всё под фича-флагом `campaigns`, проверяемым у каждого получателя.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 + PostgreSQL, Zod, shadcn/ui (Base UI), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-comeback-campaigns-design.md`

## Global Constraints

- Ветка `feat/comeback-campaigns` от `release/2026-12-campaigns`; по готовности — `--no-ff` в релизную ветку.
- Все отчёты и тексты — по-русски; UI-тексты — человеческим языком.
- Дни и часы — местные по `User.timeZone` (`safeTimeZone`, `dayKey` из `lib/daily-login.ts`).
- Длины: `name` ≤ 80, `title` ≤ 60, `body` ≤ 300; `days` 1…90 (у `STREAK_LOST` — null); `hour` 8…21; окно отправки — местный час `≥ hour` и `< 22`.
- Общий лимит на игрока: 0 отправок за последние 24 ч и < 3 за 7 суток. `CAMPAIGN_BATCH = 200` за проход; шаг — не чаще раза в 10 минут (с `?now=` — всегда).
- «Вернулся» — засчитанный заход в течение 48 ч после `sentAt`.
- Ссылка кампании — только `/путь`, проверка `safeHref` (`lib/alerts/rules.ts`).
- Флаг `campaigns` в `lib/flags/registry.ts`, `expires: "2027-04-30"`; получатели фильтруются `flagOn("campaigns", state, userId)`.
- Новая связь с `User` → удаление аккаунта и «Мои данные» (`lib/account/*`, `e2e/account-data.spec.ts`).
- Миграцию проверять: частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open` не удалять.
- e2e с глобальным состоянием (кампании общие) — `mode: "serial"`, только desktop. Кампании в e2e — с `hour: 20`/`21`, тик — с тестовыми часами в 21:xx местного (`localAt`), чтобы фоновый воркер e2e-сервера (реальное время 12:xx) их не отправил.
- Цвета — только семантические токены; ссылка-кнопка — `<Link className={buttonVariants()}>`; числовые поля — `selectOnFocus` не нужен (это не данные тренировки).

## Review Focus

- Игрок подходит под кампанию, но у него только Telegram, а в кампании выключен Telegram — не отправлять и не писать `CampaignSend` (иначе «отправлено» врёт). Тест — Task 3.
- Кампанию поставили на паузу/в архив, пока тик идёт — запись уже отобранных не страшна, но следующий тик не шлёт. Тест — Task 3 (пауза → тик → нет отправки).
- Админ поменял N у активной кампании — запрещено (только `DRAFT`/`PAUSED`); action должен отказать, а не тихо сохранить. Тест — Task 4.
- Игрок вернулся (заход), но `returnedAt` ставится и для отправок старше 48 ч — нельзя. Тест — Task 3.
- `lastLoginDay = null` (игрок до журнала заходов или только что зарегистрирован) — `INACTIVE` не должен падать и не должен слать тем, кто зарегистрирован < 24 ч. Тест — Task 3.

---

### Task 1: Модель данных, флаг и каналы доставки

**Files:**
- Modify: `prisma/schema.prisma` (enums `CampaignCondition`, `CampaignStatus`; модели `Campaign`, `CampaignSend` — как в спеке; `User.notifyComeback Boolean @default(true)` рядом с `notifyGoal` и связь `campaignSends CampaignSend[]`; `NotificationType.COMEBACK // рассылки «вернись»`; `ScheduledPush.push Boolean @default(true)`, `ScheduledPush.telegram Boolean @default(true)`)
- Create: `prisma/migrations/<timestamp>_campaigns/migration.sql` (через `npx prisma migrate dev --create-only --name campaigns`, проверить SQL на частичные индексы)
- Modify: `lib/flags/registry.ts` — `campaigns: { description: "Рассылки «вернись в зал» по условиям из админки", expires: "2027-04-30" }`
- Modify: `lib/notifications/push.ts` — `TAGS.COMEBACK = "hero-fit-comeback"`
- Modify: `lib/notifications/service.ts` — `notify`/`notifyMany` принимают `{ push: boolean; channels?: { push: boolean; telegram: boolean } }` и пишут `channels` в `ScheduledPush`; `processDuePushes` возвращает `push, telegram` и шлёт `sendPushToUser` только при `push`, `sendTelegramToUser` — только при `telegram`
- Modify: `lib/telegram/format.ts` (если там словарь по `NotificationType` — добавить `COMEBACK`)
- Test: `lib/flags/schema.test.ts`/реестр (существующие), `e2e/notifications.spec.ts` (существующие — не должны упасть)

**Interfaces:**
- Produces: модели `Campaign`, `CampaignSend`; `NotificationType.COMEBACK`; `notify(client, userId, message, { push, channels? })`.

- [ ] **Step 1:** правка схемы, `npx prisma migrate dev --create-only --name campaigns`, просмотреть SQL (нет `DROP INDEX` частичных индексов), `npx prisma migrate deploy && npx prisma generate`.
- [ ] **Step 2:** флаг, тег push, `channels` в `notify`/`notifyMany`/`processDuePushes`.
- [ ] **Step 3:** `npm run typecheck && npm test` — PASS (все `Record<NotificationType, …>` дополнены — иначе typecheck укажет где).
- [ ] **Step 4:** `npm run build && npx playwright test notifications telegram --project=desktop` — PASS (доставка прежних уведомлений не изменилась).
- [ ] **Step 5:** commit `feat(campaigns): data model, flag and delivery channels`.

### Task 2: Чистые правила и схема формы

**Files:**
- Create: `lib/campaigns/rules.ts`, `lib/campaigns/rules.test.ts`
- Create: `lib/campaigns/schema.ts`, `lib/campaigns/schema.test.ts`

**Interfaces:**
- Produces:
  - `type CampaignLite = { id: string; condition: CampaignCondition; days: number | null; createdAt: Date }`
  - `pickCampaigns(byUser: Map<string, CampaignLite[]>): Map<string, CampaignLite>` — одна кампания на игрока: `STREAK_LOST` выше всех, затем больший `days`, при равенстве — более ранний `createdAt`.
  - `withinCap(sends: Date[], now: Date): boolean` — нет отправок за 24 ч и их < 3 за 7 суток.
  - `conditionLabel(condition, days): string` — «Не заходил 3 дня», «Не тренировался 7 дней», «Зарегистрировался и не тренировался 2 дня», «Серия сгорела» (склонение `дня/дней` — `plural` из `lib/format.ts`, если есть; иначе локальная функция).
  - `canEditCondition(status: CampaignStatus): boolean` — `DRAFT`/`PAUSED`.
  - `RETURN_WINDOW_MS = 48 * 3_600_000`, `CAMPAIGN_BATCH = 200`, `CAMPAIGN_INTERVAL_MS = 10 * 60_000`, `CAMPAIGN_LAST_HOUR = 22`.
  - `campaignSchema` (Zod) → `{ name, condition, days: number | null, title, body, url, push, telegram, hour }`.

- [ ] **Step 1: тесты**
  - `pickCampaigns`: `[INACTIVE 3, INACTIVE 7]` → 7; `[INACTIVE 14, STREAK_LOST]` → STREAK_LOST; `[NO_WORKOUT 5 (createdAt 1 окт), INACTIVE 5 (2 окт)]` → NO_WORKOUT.
  - `withinCap`: `[]` → true; отправка 23 ч назад → false; 25 ч назад → true; три за 6 дней (последняя 2 дня назад) → false; три, одна из которых 8 дней назад → true.
  - `conditionLabel("INACTIVE", 3)` = «Не заходил 3 дня»; `("INACTIVE", 5)` = «Не заходил 5 дней»; `("INACTIVE", 1)` = «Не заходил 1 день»; `("STREAK_LOST", null)` = «Серия сгорела».
  - `campaignSchema`: `days` пусто при `INACTIVE` → ошибка у `days`; при `STREAK_LOST` → `days = null`; `push=false, telegram=false` → ошибка; `hour = 7` и `22` → ошибка; `url = "https://x.ru"` и `"/	/evil.com"` → ошибка, `"/dashboard"` → ок; `title` 61 символ → ошибка.
- [ ] **Step 2:** `npx vitest run lib/campaigns` — FAIL (модули не существуют).
- [ ] **Step 3:** реализация.
- [ ] **Step 4:** `npx vitest run lib/campaigns` — PASS.
- [ ] **Step 5:** commit `feat(campaigns): selection rules and form schema`.

### Task 3: Условия, шаг тика и «вернулся»

**Files:**
- Create: `lib/campaigns/conditions.ts` — `campaignCandidates(c: Campaign, now: Date, opts?: { ignoreHour?: boolean; ignoreSent?: boolean }): Promise<Candidate[]>`, `type Candidate = { userId: string; episode: string }`; `campaignAudience(c, now) = (await campaignCandidates(c, now, { ignoreHour: true, ignoreSent: true })).length` (с фильтром флага).
- Create: `lib/campaigns/tick.ts` — `processCampaigns(now: Date, { force }: { force: boolean }): Promise<number>`
- Modify: `lib/notifications/service.ts` — шаг в `runNotificationTick` (в `try`, как остальные; `force = now передан явно`, т.е. тестовые часы), после — `processDuePushes()` если было.
- Modify: `lib/achievements/daily-visit.ts` — при `count === 1`: `campaignSend.updateMany({ where: { userId, returnedAt: null, sentAt: { gte: now - RETURN_WINDOW_MS } }, data: { returnedAt: now } })`.
- Modify: `e2e/db.ts` — `createCampaign(c: Partial<…> & { condition; status?: "ACTIVE" }): Promise<string>`, `archiveAllCampaigns()`, `campaignSends(login): Promise<{ campaignId; episode; returnedAt: Date | null }[]>`, `setLastLoginDay(login, day)` (и `lastLoginDay` у `backdateUser`, если удобнее), `linkTelegram(login)` если нет готового.
- Test: `e2e/campaigns.spec.ts` (serial, desktop)

**Interfaces:**
- Consumes: Task 1 (модели, `notify` с `channels`), Task 2 (`pickCampaigns`, `withinCap`, константы).
- Produces: `campaignCandidates`, `campaignAudience`, `processCampaigns`.

SQL кандидатов — один запрос на кампанию по таблице из спеки («Условия»), фильтры из шага 3 спеки («Отправка») в том же `WHERE`: `notifyComeback`, местный час (`extract(hour FROM now AT TIME ZONE "timeZone")`), `createdAt ≤ now − 24 ч` (кроме `NEVER_TRAINED`), канал (`EXISTS PushSubscription` при `push` / `telegramChatId IS NOT NULL AND notifyTelegram` при `telegram`), `NOT EXISTS CampaignSend` с тем же эпизодом. `episode` считается в SQL (`to_char(…, 'YYYY-MM-DD')`), кроме `STREAK_LOST`: SQL отбирает `currentStreak ≥ 2 AND lastStreakWeek IS NOT NULL`, JS — `restoreOffer(user, now, tz)`, `episode = addWeeks(lastStreakWeek, availableFreezes(user, now) + 2)` (экспортировать при необходимости из `weekly-streak.ts`), уже отправленные отсекаются в JS. Порядок в `processCampaigns`: состояние флага (`getFlagStates`; нет/выключен — `return 0`) → активные кампании → кандидаты всех кампаний → фильтр `flagOn` → `pickCampaigns` → отправки за 7 суток одним запросом → `withinCap` → первые `CAMPAIGN_BATCH` → транзакция на каждого (`createMany skipDuplicates`, `count = 0` — пропуск, `notify(..., { push: true, channels })`).

- [ ] **Step 1: e2e-тесты** (`beforeEach`: `archiveAllCampaigns()`; игроки — `registerUser` + `addFlagUser("campaigns", login)` + push-подписка как в `e2e/notifications.spec.ts` или `linkTelegram`; тик — `runTick(request, localAt(day, "21:05"))`; проверка — уведомление в ленте `/notifications` с заголовком кампании и `campaignSends`)
  - `INACTIVE 3, hour 20`: последний заход 3 дня назад → 1 отправка с `episode` = тот день; повторный тик → всё ещё 1; `setLastLoginDay` на сегодня, затем ещё через 3 дня → тик → 2 отправки, разные `episode`.
  - Тик в 19:05 местного при `hour 20` → 0 отправок.
  - `NO_WORKOUT 5`: заходил вчера, тренировка 6 дней назад → получает; тренировка 2 дня назад → нет; тренировок нет → нет.
  - `NEVER_TRAINED 2`: регистрация 3 дня назад без тренировок → получает; с тренировкой → нет.
  - `STREAK_LOST`: история как в `e2e` выкупа серии (найти существующий сценарий `restore` в `e2e/`) → получает со ссылкой кампании; без доступного выкупа → нет.
  - Лимит: `INACTIVE 3` и `INACTIVE 7`, игрок не заходил 8 дней → одна отправка от «7»; тик через 2 ч → ничего; тик через 25 ч → «3».
  - `notifyComeback = false` → нет; игрок без подписки и без Telegram → нет и нет `CampaignSend`; только Telegram при `telegram: false` в кампании → нет.
  - Без флага у игрока → нет; кампания `PAUSED` → нет.
  - «Вернулся»: после отправки игрок открывает `/dashboard` (засчитанный день — следующий местный день через `setLastLoginDay` на вчера) → `returnedAt` не null; отправка старше 48 ч (сдвинуть `sentAt` в БД) → после захода `returnedAt` null.
  - `lastLoginDay = null`, регистрация 2 дня назад, `INACTIVE 1` → без ошибки тика; решение — `lastLoginDay` null трактуется как день регистрации (episode = день регистрации); зарегистрирован < 24 ч → нет.
- [ ] **Step 2:** `npm run build && npx playwright test campaigns --project=desktop` — FAIL.
- [ ] **Step 3:** реализация `conditions.ts`, `tick.ts`, шаг тика, `returnedAt`, хелперы e2e.
- [ ] **Step 4:** `npm run typecheck && npm run build && npx playwright test campaigns notifications --project=desktop` — PASS.
- [ ] **Step 5:** commit `feat(campaigns): conditions, tick step and returns`.

### Task 4: Админка кампаний

**Files:**
- Create: `lib/campaigns/queries.ts` — `listCampaigns(): Promise<(Campaign & { sent30: number; returned30: number })[]>` (без `ARCHIVED` сверху — архив в конце списка), `getCampaign(id)`.
- Create: `lib/campaigns/admin-actions.ts` — `saveCampaignAction(prev, formData)` (создать `DRAFT` / обновить; смена `condition`/`days` при `ACTIVE` → ошибка «Условие меняется только у черновика или на паузе»), `setCampaignStatusAction(id, status)` (переходы: `DRAFT→ACTIVE`, `ACTIVE↔PAUSED`, `PAUSED/ACTIVE→ARCHIVED`), `deleteCampaignAction(id)` (только `DRAFT`), `testSendAction(id)` (`notify` админу, тип `COMEBACK`, каналы кампании, без `CampaignSend`), `audienceAction(id)` → число. Каждая — `requireAdmin()` + `isEnabled("campaigns", me.id)` (нет — `notFound()`), `revalidatePath("/admin/campaigns")`.
- Create: `app/(app)/admin/campaigns/page.tsx`, `app/(app)/admin/campaigns/new/page.tsx`, `app/(app)/admin/campaigns/[id]/page.tsx`
- Create: `components/admin/campaign-form.tsx` (форма + предпросмотр карточки уведомления), `components/admin/campaign-list.tsx`, `components/admin/campaign-controls.tsx` («Кто попадёт сейчас», «Отправить себе», «Запустить» с диалогом «Запустить рассылку? Сейчас подходят N человек», «Пауза», «В архив», «Удалить»)
- Modify: `components/app/user-menu.tsx` — пункт «Рассылки» (`/admin/campaigns`) в админском блоке, только при флаге (флаг пробросить из layout так же, как `newFeedbackCount`)
- Test: `e2e/campaigns-admin.spec.ts` (serial, desktop), `ADMIN_LOGINS` — `e2e_flag_admin` (`makeAdmin`)

**Interfaces:**
- Consumes: Task 2 (`campaignSchema`, `conditionLabel`, `canEditCondition`), Task 3 (`campaignAudience`), Task 1 (`notify`).

- [ ] **Step 1: e2e-тесты**
  - Админ с флагом: «Создать» → форма «Не заходил», 3, заголовок, текст, `/dashboard`, час 20 → в списке строка «Не заходил 3 дня», бейдж «Черновик».
  - «Кто попадёт сейчас» → показывает число (подготовить одного подходящего игрока с флагом → `≥ 1`).
  - «Отправить себе» → у админа в ленте уведомление с заголовком кампании; `campaignSends` пусто.
  - «Запустить» → диалог с числом → подтвердить → бейдж «Идёт»; попытка сменить N у идущей → текст ошибки «Условие меняется только у черновика или на паузе»; «Пауза» → «На паузе», N меняется.
  - После тика с отправкой одному игроку и его захода — в строке «Отправлено 1», «Вернулись 1 · 100 %».
  - «В архив» → строка в конце с бейджем «Архив», кнопки «Удалить» нет; у черновика «Удалить» убирает строку.
  - Не-админ → 404 на `/admin/campaigns`; админ без флага → 404 и нет пункта «Рассылки» в меню.
- [ ] **Step 2:** `npm run build && npx playwright test campaigns-admin --project=desktop` — FAIL.
- [ ] **Step 3:** реализация.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run build && npx playwright test campaigns-admin --project=desktop` — PASS.
- [ ] **Step 5:** commit `feat(campaigns): admin pages`.

### Task 5: Игрок, «Мои данные», документация

**Files:**
- Modify: `lib/notifications/actions.ts` (`notifyComeback: z.boolean()`), `lib/notifications/queries.ts` (`notifyComeback: true`), `components/notifications/notification-settings.tsx` — пункт `{ key: "notifyComeback", label: "Напоминания вернуться", description: "Если давно не заходили или не тренировались" }`, виден только при флаге (проп из страницы `/settings`).
- Modify: `lib/account/export.ts` (+ данные в запросе выгрузки, где собирается `feedback`) — раздел `campaignSends: { campaign: string; sentAt: Date; returnedAt: Date | null }[]` в списке разделов; `notifyComeback` попадает в настройки автоматически (`/^notify[A-Z]/`). `lib/account/export.test.ts` — раздел в выгрузке без id.
- Modify: `lib/account/delete.ts` — проверить, что каскад покрывает (явного удаления не нужно); превью удаления — если там перечисляются разделы, добавить.
- Modify: `app/(marketing)/privacy/page.tsx` — фраза из спеки («Если вы давно не заходили, можем напомнить о тренировках push-уведомлением или в Telegram; выключить — в настройках»).
- Modify: `docs/features/platform.md` — пункт «Рассылки по условиям» (спека, модели, условия, лимиты, флаг, e2e-хелперы); раздел «Уведомления» — тип `COMEBACK` и каналы `ScheduledPush`.
- Test: `e2e/account-data.spec.ts` (раздел `campaignSends` в JSON; после удаления аккаунта строк `CampaignSend` нет), `e2e/campaigns.spec.ts` (переключатель в `/settings`: выключить → тик → нет отправки; без флага переключателя нет).

**Interfaces:**
- Consumes: Task 1 (`User.notifyComeback`, `CampaignSend`), Task 3 (`e2e/db.ts` хелперы).

- [ ] **Step 1:** unit-тест выгрузки и e2e выше.
- [ ] **Step 2:** `npx vitest run lib/account` и `npx playwright test account-data campaigns --project=desktop` — FAIL.
- [ ] **Step 3:** реализация.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test account-data campaigns campaigns-admin notifications --workers=8` — PASS.
- [ ] **Step 5:** commit `feat(campaigns): settings toggle, my data, docs`; слить `feat/comeback-campaigns` в `release/2026-12-campaigns` с `--no-ff`, удалить ветку фичи.
