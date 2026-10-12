# Фича-флаги

Релиз `release/2026-10-raids` (вливается до раскатки аналитики силы — первое применение).

## Цель

Безопасная раскатка новых фич: фича выходит выключенной, админ включает её себе, затем процент пользователей, затем
всем; что-то не так — выключает за секунды (kill switch), без отката и передеплоя. Бета-доступ по записи и права
Премиума — вне рамок (права подписки — отдельная система, не флаги).

## Решения

### Реестр и хранение

- Флаги объявляются в коде — `lib/flags/registry.ts`: `FLAGS = { <key>: { description: string; expires: string } }`
  (`expires` — `YYYY-MM-DD`, до какого числа флаг должен уйти из кода), тип `FlagKey = keyof typeof FLAGS`. Опечатка в
  ключе — ошибка типов. Unit-тест падает, если `expires` прошёл (напоминание удалить флаг и проверки).
- Таблица `FeatureFlag { key String @id; enabled Boolean @default(false); percent Int @default(0); userIds String[]
  @default([]); updatedAt DateTime @updatedAt; updatedBy String? }` (миграция `feature_flags`). Нет строки — флаг
  выключен.

### Вычисление

Чистая `flagOn(key, state | null, userId | null)` (`lib/flags/eval.ts`):
- нет строки или `enabled = false` → выключен для всех, включая список (kill switch);
- `userId` в `userIds` → включён;
- иначе `bucket(key, userId) < percent`, `bucket` — FNV-1a 32 бита от `${key}:${userId}` по модулю 100 (стабильно: у
  человека не мигает, при росте процента включённые остаются включёнными, у разных флагов — разные группы);
- без пользователя (гость) → включён только при `percent = 100`.

Сервер (`lib/flags/server.ts`, server-only):
- `getFlagStates()` — все строки одним запросом, кэш в памяти процесса на `FLAGS_CACHE_MS` (по умолчанию 10 000;
  e2e — 0), `invalidateFlags()` сбрасывает.
- `isEnabled(key, userId | null): Promise<boolean>`, `enabledFlags(userId | null): Promise<FlagKey[]>`.
- Серверный код (страницы, actions, тик уведомлений) проверяет флаг сам; клиентский `useFlag` — только для показа.

Клиент: layout `(app)` передаёт `enabledFlags(user.id)` в `FlagsProvider` (`components/flags/flags-provider.tsx`),
`useFlag(key): boolean`.

### Админ

- `ADMIN_LOGINS` — необязательная переменная (`lib/env.ts`), логины через запятую, без учёта регистра. `isAdmin(user)`
  и `requireAdmin()` (`lib/auth/admin.ts`): не вошёл — как `requireUser`; не админ — `notFound()`.
- Пункт «Флаги» в меню профиля — только админам (`CurrentUser` получает `isAdmin`).

### Страница `/admin/flags`

`app/(app)/admin/flags/page.tsx` (noindex — уже у группы `(app)`). Карточка на каждый флаг реестра:
- ключ, описание, срок; прошёл — «Пора удалить из кода»;
- переключатель «Включён» (kill switch), процент — кнопки 0 / 1 / 5 / 10 / 25 / 50 / 100 и поле, список пользователей —
  ввод логина или ника → id (не найден — «Пользователь не найден»), показ ником (или логином), удаление по кнопке;
- «Изменил: <логин> · <дата и время>»; оценка «сейчас у ≈ N» — `round(активные за 28 дней × percent / 100)` + длина
  списка (при `enabled = false` — 0).
- Строки БД с ключами не из реестра — блок «Устаревшие» с «Удалить строку».

Сохранение — `saveFlagAction(key, patch: { enabled?: boolean; percent?: number; addUser?: string; removeUserId?: string })`
и `deleteStaleFlagAction(key)` (`lib/flags/actions.ts`): `requireAdmin`, Zod (`key` из реестра, `percent` целое 0…100,
список до 100), upsert с `updatedBy` = логин, `invalidateFlags()`, `console.info("[flags] <логин>: <key> …")`,
`revalidatePath("/", "layout")`. Таблицы истории нет.

### Первое применение — `strength_analytics`

Флаг `strength_analytics` («Аналитика силы: «Ты стал сильнее» в итогах и push, «Месяц к месяцу», прогноз целей»,
`expires` — 2026-12-31). Выключен — как до фичи:
- итоги недели: `loadRecapInput` даёт `strengthWeeks: []`, если флаг выключен у владельца итогов (нет блока в снимке и
  в push); `RecapView`/`RecapCard` не показывают `data.strength` при выключенном флаге смотрящего (kill switch для уже
  собранных снимков);
- `/stats` и вкладка «Статистика» клиента: `getMonthCompare` не вызывается, `StatsViewData.month: MonthCompare | null`
  (флаг — того, чья статистика);
- прогноз: `getGoalForecasts` возвращает пустой `Map`, если флаг выключен у владельца целей (`paceStatus` как раньше).
- Лендинг не меняется (тексты уже о реальных функциях после раскатки на 100 %).

### Правила (CLAUDE.md)

Рискованную новую фичу — сразу под флагом; после 100 % и 2–4 недель — удалить флаг, проверки и строку в БД; права
Премиума — не флаги.

## Вне рамок

Бета по записи пользователя, A/B-тесты и аналитика по вариантам, история изменений, внешние сервисы, несколько процессов
(кэш — на процесс; с одним `app` достаточно).

## Тесты

- Unit: `flagOn` (нет строки, kill switch при списке, список, процент 0/100, стабильность bucket, разные флаги — разные
  bucket, гость), реестр (ключи валидны, `expires` не прошёл), схема `saveFlagAction` (Zod), `isAdminLogin(login, env)`.
- e2e (`e2e/feature-flags.spec.ts`, `FLAGS_CACHE_MS=0`, `ADMIN_LOGINS` — тестовый логин, хелперы `setFlag`/`resetFlags`):
  не-админ → 404 на `/admin/flags`; админ добавляет себя в список `strength_analytics` при выключенном флаге → блока
  «Месяц к месяцу» нет; включает → есть; выключает → снова нет. Существующие e2e аналитики включают флаг на 100 % в
  `beforeEach` (`setFlag`).
