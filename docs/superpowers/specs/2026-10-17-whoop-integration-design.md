# Интеграция с WHOOP: пульс и strain в сводке тренировки

Первый шаг интеграции с браслетом WHOOP (идея из бэклога: вариант 1). Под фича-флагом `whoop`, сначала — только
владельцу проекта (у него есть WHOOP 5.0). Дальнейшие шаги (recovery рядом с картой мышц, игровые механики,
вес тела) — отдельными спеками.

## Цель

Человек тренируется с WHOOP на руке, а в Hero Fit видит только подходы и веса. После подключения в сводке его
тренировки (`/workouts/<id>`) появляется карточка «WHOOP»: средний и максимальный пульс, strain, ккал и время в
пульсовых зонах — из активности WHOOP, совпавшей по времени с тренировкой. Ничего вводить не нужно.

Успех: владелец подключает свой WHOOP, видит данные на прошлых тренировках (30 дней) и на новых — без ручных действий
(в худшем случае — кнопка «Обновить»).

## Ограничения WHOOP API (v2, сверено 2026-10-17)

- OAuth2: `https://api.prod.whoop.com/oauth/oauth2/auth`, токены — `…/oauth/oauth2/token`; scope `read:workout read:profile
  offline` (`offline` — чтобы получить refresh-токен). `state` — минимум 8 символов.
- Access-токен живёт `expires_in` (≈ 3600 с). Refresh **ротируется**: использованный refresh-токен и прежний access
  сразу недействительны; из двух одновременных refresh второй падает.
- Только чтение. Записать тренировку в WHOOP нельзя. Потока пульса нет — только сводка по активности WHOOP.
- `GET /v2/activity/workout?start&end&limit≤25&nextToken` (по убыванию `start`), `GET /v2/activity/workout/{uuid}`.
  Поля: `id`, `start`, `end`, `sport_name`, `score_state` (`SCORED` / `PENDING_SCORE` / `UNSCORABLE`), `score`:
  `strain`, `average_heart_rate`, `max_heart_rate`, `kilojoule`, `zone_durations.zone_zero_milli…zone_five_milli`.
- `DELETE /v2/user/access` — отзыв доступа, заодно прекращает вебхуки по пользователю.
- Вебхуки v2: `{ user_id, id, type, trace_id }`, типы `workout|sleep|recovery.updated|deleted` (создание приходит
  как `updated`). Подпись: `X-WHOOP-Signature` = base64(HMAC-SHA256(`X-WHOOP-Signature-Timestamp` + сырое тело,
  client secret)). Ответ 2XX за ~1 с, иначе 5 повторов в течение часа.
- До одобрения приложения WHOOP — не больше 10 подключённых пользователей. Числовые лимиты запросов не опубликованы
  — обрабатываем 429.
- Владелец записывает тренировки автоопределением WHOOP: активность появляется с задержкой (после расчёта),
  границы неточные, тренировка может разбиться на несколько активностей.

## Решения

- **Видимость:** данные WHOOP видит только владелец тренировки. Не попадают в ленту, сторис, тренеру, в рейтинги,
  XP и ачивки.
- **152-ФЗ:** пульс и strain считаем данными о состоянии здоровья (спецкатегория, ст. 10). Хранятся на сервере в РФ
  по **отдельному согласию** при подключении (не галочка регистрации); отключение = отзыв согласия → данные
  удаляются. Это осознанное исключение из правила «данные о здоровье — только в `localStorage`» (правило в CLAUDE.md
  дополняется). Храним минимум полей, сырой JSON не храним; данные WHOOP не пишутся в логи и мониторинг ошибок.
- **Получение данных:** вебхуки + догрузка при открытии свежей сводки + кнопка «Обновить». Регулярного опроса нет.
- **История:** при подключении — активности за 30 дней.
- **Связь с тренировкой не хранится:** совпадение считается при показе по пересечению времени — опоздавшая или
  пересчитанная WHOOP активность подхватывается сама.

## Данные

```prisma
model WhoopConnection {
  userId        String    @id
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  whoopUserId   String    @unique   // user_id WHOOP (int64 строкой) — поиск по вебхуку
  accessToken   String               // AES-256-GCM, lib/whoop/crypto.ts
  refreshToken  String               // AES-256-GCM
  expiresAt     DateTime
  consentAt     DateTime             // время согласия на обработку данных о здоровье
  needsReauth   Boolean   @default(false) // refresh отклонён — нужно переподключить
  lastSyncAt    DateTime?            // ограничение «Обновить» — раз в 60 с
  createdAt     DateTime  @default(now())
}

model WhoopWorkout {
  id         String   @id            // UUID активности WHOOP
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  start      DateTime
  end        DateTime
  sportName  String
  scoreState String                  // SCORED | PENDING_SCORE | UNSCORABLE
  strain     Float?
  avgHr      Int?
  maxHr      Int?
  kilojoule  Float?
  zonesMs    Int[]                   // 6 значений: зоны 0…5, мс
  updatedAt  DateTime @updatedAt

  @@index([userId, start])
}
```

Новые связи с `User` → удаление аккаунта (каскад) и «Мои данные» (раздел `whoop`, см. ниже).

## Подключение

1. Страница `/devices` «Браслеты и часы» (`app/(app)/devices/page.tsx`, карточка `components/devices/whoop-card.tsx`), доступна при флаге `whoop` и заданном
   `WHOOP_CLIENT_ID`. Состояния: не подключён / подключён (с даты, «Отключить») / нужно переподключить. Без флага `/devices` — 404. Пункта в меню нет: в `/settings` — строка-ссылка «Браслеты и часы» со статусом («WHOOP подключён» / «Не подключены»), из сводки — ссылка при «Переподключите WHOOP». Push-устройства и Telegram остаются в `/settings`.
2. «Подключить WHOOP» → диалог согласия. Текст: какие данные (тренировки WHOOP: время, вид спорта, средний и
   максимальный пульс, strain, ккал, время в пульсовых зонах), зачем (показ в сводке тренировки), кто видит (только
   вы), срок (пока WHOOP подключён), как отозвать (кнопка «Отключить WHOOP» — данные удаляются), ссылка на `/privacy`.
   Галочка «Согласен на обработку данных о здоровье» обязательна → «Продолжить».
3. `GET /api/whoop/connect?consent=1` (только с входом): случайный `state` (32 hex) → httpOnly cookie `hf_whoop_state`
   (10 мин, `SameSite=Lax`, путь `/api/whoop`) → редирект на авторизацию WHOOP с `redirect_uri =
   ${APP_URL}/api/whoop/callback`.
4. `GET /api/whoop/callback`: `state` совпал с cookie (иначе → `/devices?whoop=error`); `error=access_denied` →
   `/devices?whoop=denied`; обмен `code` на токены → `GET /v2/user/profile/basic` за `user_id` → upsert
   `WhoopConnection` (`consentAt = now`, `needsReauth = false`). Тот же `whoopUserId` у другого нашего пользователя →
   `/devices?whoop=taken`, токен отзывается. Затем `after()` — загрузка истории за 30 дней, редирект
   `/devices?whoop=connected`.
5. Флаг выключен или нет `WHOOP_CLIENT_ID` → маршруты отвечают 404.

### Токены

- Шифрование `lib/whoop/crypto.ts`: AES-256-GCM, ключ — `WHOOP_TOKEN_KEY` (32 байта base64), формат
  `iv.tag.data` в base64url.
- `getAccessToken(userId)` (`lib/whoop/tokens.ts`): если до `expiresAt` больше 60 с — расшифровать и вернуть. Иначе в
  транзакции `pg_advisory_xact_lock(hashtext('whoop:' || userId))`, перечитать строку (мог обновить параллельный
  запрос), при необходимости refresh и запись новых токенов. Refresh ответил 400/401 → `needsReauth = true`,
  ошибка `WhoopReauthError`.

### Отключение

`disconnectWhoopAction`: `DELETE /v2/user/access` (ошибку WHOOP игнорируем — данные у нас удаляются в любом случае),
затем в транзакции удаление всех `WhoopWorkout` пользователя и `WhoopConnection`.

## Синхронизация

Клиент API — `lib/whoop/client.ts` (база `WHOOP_API_URL`, `fetch` с таймаутом 10 с; 401 → обновить токен и повторить
один раз; 429/5xx → `WhoopUnavailableError`). Перевод ответа в строку БД — чистая `toWhoopWorkout`
(`lib/whoop/map.ts`): `zone_durations` → массив из 6 чисел, отсутствующий `score` → `null`-поля.

- **Вебхук** `POST /api/whoop/webhook` (публичный — в `PUBLIC_PAGES`/исключение `proxy.ts`): проверка подписи
  `verifyWhoopSignature` (`lib/whoop/signature.ts`, `timingSafeEqual`; метка старше 5 мин или из будущего > 1 мин →
  401). Ответ 204 сразу, обработка — в `after()`:
  - `workout.updated` → подключение по `whoopUserId` (нет — пропуск) → `GET /v2/activity/workout/{id}` → upsert;
  - `workout.deleted` → `deleteMany` по `id` и `userId`;
  - остальные типы — пропуск.
  Ошибки обработки — в мониторинг ошибок без тела запроса.
- **История** `syncRange(userId, from, to)` (`lib/whoop/sync.ts`): страницы по 25 до `next_token = null`, upsert каждой;
  при подключении — `[now − 30 дн, now]`.
- **Догрузка** `refreshWhoopAction(workoutId)`: только своя `COMPLETED` тренировка; `lastSyncAt` моложе 60 с →
  `{ status: "throttled" }`; иначе `syncRange(startedAt − 30 мин, finishedAt + 30 мин)`, `lastSyncAt = now`, возврат
  данных карточки. Ошибки → `{ status: "unavailable" | "reauth" }`.

## Сопоставление

Чистая `matchWhoop(workout: { startedAt, finishedAt }, candidates)` → `WhoopSummary | null` (`lib/whoop/match.ts`).

- Кандидат подходит, если пересечение с `[startedAt, finishedAt]` ≥ 5 мин **или** ≥ 30 % длины самой активности.
- Несколько подходящих объединяются: средний пульс — взвешенный по длительности активностей с пульсом, макс. пульс —
  максимум, кДж и зоны — сумма, strain — максимум (шкала нелинейная), `fragments` — число активностей.
- Учитываются только `SCORED`; если подходящие есть, но все `PENDING_SCORE` → `{ pending: true }`; `UNSCORABLE` —
  как отсутствие.
- Кандидаты выбираются запросом `WhoopWorkout` пользователя с `start < finishedAt` и `end > startedAt`.

## Карточка в сводке

`components/workouts/whoop-card.tsx` в `WorkoutSummaryView` (слот, как у оценки). Показывается, только если смотрит
владелец, флаг `whoop` включён и `WhoopConnection` есть.

- **Есть данные:** плитки «Средний пульс» (уд/мин), «Макс. пульс», «Strain» (1 знак), «Ккал» (`кДж / 4,184`,
  округление); ниже — полоса времени в зонах 0–5 (доля и минуты, цвета — семантические токены), скрытая таблица для
  скринридеров. При `fragments > 1` — подпись «по N активностям WHOOP».
- **Обработка:** «WHOOP ещё обрабатывает тренировку» + «Обновить».
- **Нет совпадения:** тренировка закончилась < 48 ч назад — «Пока нет данных WHOOP» + «Обновить» (и одна автоматическая
  догрузка при открытии); позже — «WHOOP не записал активность в это время. Автоопределение срабатывает не всегда —
  можно запускать активность в WHOOP вручную».
- **Нужно переподключить:** «Переподключите WHOOP» со ссылкой на `/devices`.
- «Обновить» при ограничении — «Обновить можно через минуту»; при недоступности — «WHOOP не отвечает, попробуйте позже».

## «Мои данные», удаление, тексты

- Выгрузка JSON: раздел `whoop` — `connectedAt`, `consentAt`, список тренировок WHOOP (все поля `WhoopWorkout`, без
  токенов). В CSV не входит.
- Удаление аккаунта — каскад обеих моделей; токен в WHOOP отзывается попыткой `DELETE /v2/user/access` до удаления.
- `/privacy`: пункт о данных WHOOP (состав, цель, согласие, срок, отзыв, хранение в РФ).
- «Что нового»: пункт с `flag: "whoop"`.
- CLAUDE.md, сквозные правила: данные WHOOP — исключение из «здоровье только в `localStorage`», по отдельному согласию.

## Окружение

`lib/env.ts`: `WHOOP_CLIENT_ID?`, `WHOOP_CLIENT_SECRET?`, `WHOOP_TOKEN_KEY?` (обязателен при `WHOOP_CLIENT_ID`,
32 байта base64), `WHOOP_API_URL` (по умолчанию `https://api.prod.whoop.com`; OAuth-адреса строятся от него —
`/oauth/oauth2/...`). В `.env.example` — пустые строки с комментарием.

Перед выкаткой (владелец): в Developer Dashboard WHOOP — redirect `https://<домен>/api/whoop/callback`, webhook
`https://<домен>/api/whoop/webhook` (версия v2), ссылка на `/privacy`; секреты в `.env` сервера; обновить уведомление
в Роскомнадзор (спецкатегория «здоровье»). Для локальной проверки — redirect `http://localhost:3000/api/whoop/callback`
(вебхуки локально не придут — работает «Обновить»).

## Тесты

Unit (Vitest):
- `matchWhoop`: пороги 5 мин / 30 %, касание на стыке не считается, склейка двух фрагментов (взвешенный пульс,
  максимум strain, сумма зон), только `PENDING`, `UNSCORABLE`;
- `verifyWhoopSignature`: верная, неверная, устаревшая и будущая метка;
- `crypto`: шифрование туда-обратно, подмена шифротекста → ошибка;
- `toWhoopWorkout`: без `score`, полные зоны.

e2e (`e2e/whoop.spec.ts`, флаг глобальный → `mode: "serial"`, только desktop) с фейковым сервером
`e2e/whoop-server.ts` (OAuth-авторизация сразу редиректит обратно с `code`, токены, список и одна активность, отзыв;
`WHOOP_API_URL` указывает на него):
1. согласие → подключение → старая тренировка (seed в пределах 30 дней) показывает пульс и strain;
2. вебхук с верной подписью добавляет активность → карточка новой тренировки заполнена; неверная подпись → 401;
3. `PENDING_SCORE` → «Обновить» после смены ответа сервера → данные;
4. отключение → карточки нет, `WhoopWorkout` пусто, сервер получил отзыв;
5. «Мои данные» содержат раздел `whoop`; удаление аккаунта удаляет строки.

## Вне рамок

Recovery, сон, циклы, вес тела, игровые механики, показ тренеру/друзьям, запись в WHOOP, агрегаторы (Terra/Junction),
регулярный опрос API.
