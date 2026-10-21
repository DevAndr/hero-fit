# Рассылки по условиям («вернись в зал»)

## Цель

Возвращать игроков, которые перестали заходить или тренироваться. Админ сам заводит кампании в `/admin/campaigns`:
условие из списка, N дней, текст, каналы, час отправки — без релиза под каждую. Опора — существующий тик уведомлений,
очередь `ScheduledPush`, `sendTelegramToUser`, журнал заходов (`User.lastLoginDay`, `UserVisit`), фича-флаги.

Успех: кампания уходит подходящим игрокам один раз за серию и не чаще общего лимита; в админке видно, сколько отправлено
и сколько вернулись в течение 48 часов.

## Решения

- **Условия — в коде, кампании — в БД.** Каждое условие — проверенный SQL в `lib/campaigns/conditions.ts`; новое условие
  добавляется кодом. Свободного конструктора нет.
- **Раз за серию.** Кампания пишет игроку один раз, пока он не вернётся; вернулся и снова пропал — напишет ещё.
  Дожим — отдельными кампаниями (3, 7, 14 дней).
- **Каналы — push и Telegram.** Email не входит (рекламная рассылка требует отдельного согласия — 38-ФЗ).
- **Под фича-флагом `campaigns`** (в реестре `lib/flags/registry.ts`). Флаг проверяется у каждого получателя
  (`flagOn` по состояниям из `getFlagStates`): раскатку можно начать со списка `userIds` (себя) и процента. Страница
  админки и переключатель в `/settings` — по флагу смотрящего (`isEnabled`). Флаг выключен совсем — шаг тика сразу выходит.
- **152-ФЗ.** Полученные рассылки — в «Мои данные»; в `/privacy` — строка о напоминаниях и как их выключить.

## Данные

```prisma
enum CampaignCondition {
  INACTIVE       // не заходил N дней
  NO_WORKOUT     // заходит, но не тренировался N дней
  NEVER_TRAINED  // N дней с регистрации, завершённых тренировок нет
  STREAK_LOST    // серия сгорела, выкуп ещё доступен
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED
}

model Campaign {
  id        String            @id @default(cuid())
  name      String            // для админки, ≤ 80
  condition CampaignCondition
  days      Int?              // N: 1…90; у STREAK_LOST — null
  title     String            // ≤ 60
  body      String            // ≤ 300
  url       String            // только «/путь» (safeHref из lib/alerts/rules.ts)
  push      Boolean           @default(true)
  telegram  Boolean           @default(true)
  hour      Int               @default(18) // местный час игрока, 8…21
  status    CampaignStatus    @default(DRAFT)
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  sends     CampaignSend[]
}

model CampaignSend {
  id         String    @id @default(cuid())
  campaignId String
  userId     String
  episode    String    // ключ серии, см. «Условия»
  sentAt     DateTime  @default(now())
  returnedAt DateTime? // первый заход в течение 48 ч после sentAt
  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([campaignId, userId, episode])
  @@index([userId, sentAt])
}
```

`User.notifyComeback Boolean @default(true)` — переключатель «Напоминания вернуться» в `/settings` (рядом с остальными
`notify*`). `NotificationType.COMEBACK` — тип для ленты и тега push.

`ScheduledPush.telegram Boolean @default(true)` — кампания без Telegram кладёт запись с `false`, и `processDuePushes`
не шлёт её в Telegram. Если в кампании выключен push, запись в очереди всё равно создаётся (так же доставляется
Telegram), но с `push = false` — `ScheduledPush.push Boolean @default(true)`; у остальных уведомлений оба `true`.

## Условия

Все дни — местные по `User.timeZone`; `today` — местный сегодняшний день игрока.

| Условие | Отбор | Ключ серии `episode` |
| --- | --- | --- |
| `INACTIVE N` | `coalesce(lastLoginDay, местный день регистрации) ≤ today − N` | этот день (YYYY-MM-DD) |
| `NO_WORKOUT N` | `lastLoginDay > today − N` и последняя `COMPLETED` тренировка (местный день `finishedAt`) `≤ today − N`; тренировок нет — не попадает (это `NEVER_TRAINED`) | день последней тренировки |
| `NEVER_TRAINED N` | местный день регистрации `≤ today − N`, `COMPLETED` тренировок нет | `never` |
| `STREAK_LOST` | грубо в SQL: `currentStreak ≥ 2`, `lastStreakWeek` не null; точно — `restoreOffer(user, now, tz) !== null` | неделя сгорания (`lastStreakWeek + заморозки + 2`) |

Функции: `campaignCandidates(campaign, now): Promise<Candidate[]>` (SQL + для `STREAK_LOST` проверка в JS),
`Candidate = { userId, timeZone, episode }`. Чистая часть — `lib/campaigns/rules.ts`.

## Отправка

`processCampaigns(now)` — шаг `runNotificationTick` (в `try`, как остальные), не чаще раза в 10 минут
(`lastCampaignsRun` в памяти процесса, как `lastErrorsPrune`; с тестовыми часами `?now=` — всегда).

1. Флаг `campaigns` выключен (`enabled = false`) — выход; дальше кандидаты отсекаются по `flagOn` для каждого.
2. Активные кампании; по каждой — кандидаты.
3. Фильтр (SQL в том же запросе кандидатов): `notifyComeback`; местный час `≥ campaign.hour` и `< 22`;
   зарегистрирован ≥ 24 ч назад (кроме `NEVER_TRAINED`); есть канал кампании — подписка `PushSubscription` при `push`
   или `telegramChatId` с `notifyTelegram` при `telegram`; нет `CampaignSend` с тем же `(campaignId, userId, episode)`.
4. Пересечение кампаний: `pickCampaigns` (чистая) — игроку за проход одна кампания: с большим `days`
   (`STREAK_LOST` — выше всех: у выкупа срок), при равенстве — более старая.
5. Общий лимит `withinCap` (чистая): у игрока нет `CampaignSend` за последние 24 ч и их < 3 за 7 суток.
6. Не больше `CAMPAIGN_BATCH = 200` отправок за проход; остальное — следующими проходами.
7. Каждая отправка — транзакция: `campaignSend.createMany({ skipDuplicates })`; `count = 0` — пропуск (параллельный
   воркер); иначе `notify(tx, userId, { type: COMEBACK, title, body, url }, { push: true, channels: { push, telegram } })`
   — `notify` получает необязательные `channels` и пишет их в `ScheduledPush.push`/`telegram`.
8. Было что отправить — `processDuePushes()`.

**Вернулся:** `recordDailyVisit` при засчитанном дне ставит `returnedAt = now` у `CampaignSend` игрока с
`returnedAt = null` и `sentAt ≥ now − 48 ч` (один `updateMany`, только при флаге).

## Админка

`/admin/campaigns` (`requireAdmin` + флаг, пункт «Рассылки» в админском блоке меню профиля):

- Список: название, условие человеческим языком («Не заходил 3 дня»), статус бейджем, за 30 дней — отправлено,
  вернулись, % (`campaignStats`).
- `/admin/campaigns/new`, `/admin/campaigns/[id]`: форма (`campaignSchema` в `lib/campaigns/schema.ts`: длины выше,
  `days` обязателен для всех, кроме `STREAK_LOST`, хотя бы один канал, `hour` 8…21, ссылка — `safeHref` и начинается с
  `/`), предпросмотр карточки уведомления.
- «Кто попадёт сейчас» — `campaignAudience(campaign)`: число кандидатов без часа отправки, лимитов и уже отправленных.
- «Отправить себе» — `notify` админу (тип `COMEBACK`, каналы кампании), без записи в `CampaignSend`.
- Статусы: создаётся `DRAFT`; «Запустить» — диалог с числом получателей → `ACTIVE`; «Пауза» ↔ `ACTIVE`; удалить — только
  `DRAFT`, остальные — «В архив» (`ARCHIVED`, статистика остаётся). Правка активной кампании разрешена (текст, час,
  каналы); условие и N — только у `DRAFT`/`PAUSED`.
- Actions — `lib/campaigns/admin-actions.ts`, каждая с `requireAdmin` и проверкой флага.

## Игрок

- `/settings` → «Уведомления»: переключатель «Напоминания вернуться» (`notifyComeback`), виден при флаге.
- Сообщение — в ленте колокольчика (тип `COMEBACK`) и push/Telegram по каналам кампании.

## «Мои данные» и удаление

- Выгрузка JSON: раздел `campaignSends` — `{ campaign: name, sentAt, returnedAt }` (без id); поле `notifyComeback` —
  в настройках профиля, как остальные `notify*`.
- Удаление аккаунта — каскад `CampaignSend` от `User`.
- `/privacy`: «Если вы давно не заходили, можем напомнить о тренировках push-уведомлением или в Telegram; выключить —
  в настройках».

## Тесты

- Unit: `pickCampaigns`, `withinCap`, ключи серий и подпись условий (`conditionLabel`), `campaignSchema`.
- e2e (`e2e/campaigns.spec.ts`, `mode: "serial"`, только desktop — глобальный флаг; история — `e2e/db.ts`, тик —
  `GET /api/cron/notifications?now=`):
  - `INACTIVE 3`: игрок с последним заходом 3 дня назад получает уведомление в ленте; повторный тик — без повтора;
    после нового захода и нового пропуска — снова.
  - `NO_WORKOUT`, `NEVER_TRAINED`, `STREAK_LOST` — по одному сценарию попадания и непопадания.
  - Час отправки: до часа кампании — не отправлено.
  - Лимит: две подходящие кампании — одно сообщение (с большим N), второе — не раньше чем через сутки.
  - `notifyComeback = false` и игрок без каналов — не получают.
  - «Вернулся»: заход после отправки — `returnedAt` и цифры в списке админки.
  - Админка: черновик → «Кто попадёт» → запуск → пауза → архив; не-админ — 404; без флага — 404.
  - «Мои данные» — раздел `campaignSends`; удаление аккаунта — строки удалены (`e2e/account-data.spec.ts`).

## Вне рамок

Email, сегменты по меткам и источникам, A/B-тексты, подстановки (`{имя}`), расписание по дням недели.
