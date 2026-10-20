# Источники регистраций и UX-мелочи

## Цель

Понять, окупаются ли публичные страницы (программы, калькуляторы, тренеры, залы) и поиск: откуда приходят
зарегистрировавшиеся и насколько они активны. Сейчас при регистрации источник не сохраняется — есть только цели
Метрики. Заодно — три согласованные UX-мелочи и нестабильный e2e WHOOP.

Успех: у новых пользователей сохранены страница первого входа и тип источника; в `/admin` — таблица «Источники»
с регистрациями, долей сделавших первую тренировку и долей активных на 2-й неделе.

## Решения

- **Первая точка входа:** cookie `hf_src` ставится при первом заходе на публичную страницу и не перезаписывается
  (30 дней). Адреса не храним — только группы.
- **Без фича-флага.** Сбор незаметен пользователю, отчёт — только админу.
- **152-ФЗ:** поля попадают в «Мои данные» (профиль), в `/privacy` — строка о них. Это не данные о здоровье.

## Сбор

`lib/analytics/source.ts` (чистые функции, без `server-only`):

- `type Landing = "home" | "program" | "tool" | "trainer" | "club" | "other"`;
  `type Referrer = "search" | "social" | "direct" | "site"`; в БД ещё значение `"telegram"` для обоих полей.
- `landingOf(pathname)`: `/` → home; `/training-programs`, `/training-programs/…` → program; `/tools/…` → tool;
  `/trainer/…` → trainer; `/gym/…` → club; иначе other.
- `referrerOf(referer: string | null, ownHost: string)`: нет / не URL / свой хост → direct; хост (без `www.`, по
  суффиксу домена) из списка поиска → search: `yandex.ru`, `ya.ru`, `yandex.com`, `google.<любая зона>`, `bing.com`,
  `duckduckgo.com`, `go.mail.ru`, `search.brave.com`; из списка соцсетей → social: `vk.com`, `vk.ru`, `t.me`,
  `telegram.org`, `youtube.com`, `dzen.ru`, `ok.ru`, `instagram.com`, `facebook.com`, `x.com`, `twitter.com`,
  `reddit.com`, `pikabu.ru`; иначе site.
- `encodeSource({ landing, referrer })` → `"<landing>.<referrer>"`; `decodeSource(raw)` → объект или `null`, если
  значение не из допустимых (подделанная cookie игнорируется).

`proxy.ts`: если запрос — `GET` документа (нет заголовка `rsc`, не `/api/`), пользователь не вошёл, путь публичный
(`PUBLIC_PAGES`/`PUBLIC_PREFIXES`) и cookie `hf_src` нет — ответ ставит `hf_src = encodeSource(...)`: `httpOnly`,
`sameSite: "lax"`, `secure` в production, `path: "/"`, `maxAge` 30 дней. Редиректы на `/login` для закрытых путей
cookie не ставят.

## Запись при регистрации

`User.signupLanding String?`, `User.signupReferrer String?` (`null` — до учёта).

- Форма (`registerAction`): из `decodeSource(cookies().get("hf_src"))`; нет cookie — `other`/`direct`. После
  создания пользователя cookie удаляется.
- Telegram (`registerFromTelegram`): `telegram`/`telegram`.
- «Мои данные»: оба поля — в `PROFILE_FIELDS` (`lib/account/export.ts`); `/privacy` — строка в разделе о данных
  профиля: «Откуда вы пришли при регистрации: тип первой страницы и тип источника (поиск, соцсеть, прямой заход),
  без адресов».

## Отчёт «Источники» в `/admin`

`getSignupSources(tz, range)` (`lib/admin/metrics-queries.ts`) за период 30/90 (дни регистрации — в поясе админа):
строки `{ landing, referrer, signups, firstWorkout, activeWeek2: number | null }`:

- `firstWorkout` — пользователей с хотя бы одной `COMPLETED` тренировкой (за всё время);
- `activeWeek2` — среди зарегистрированных не позже чем 14 дней назад: доля с днём активности (журнал `UserVisit` ∪
  завершённая тренировка — как `activitySql`) в днях 7–13 после регистрации; если таких пользователей нет — `null`.

Чистая `sourceRows(rows)` (`lib/admin/metrics.ts`): итог по `landing` (сумма, доли пересчитаны от сумм) с вложенными
парами `landing × referrer`, сортировка по регистрациям; `null` → строка «До учёта»; проценты — целые.

Компонент `components/admin/signup-sources.tsx`: таблица (подпись «Источники регистраций за N дней»): страница входа,
регистраций, «Первая тренировка, %», «Активны на 2-й неделе, %» (`—` при `null`); под строкой страницы — строки
источников с отступом. Подписи: Главная, Программы, Калькуляторы, Тренер, Зал, Другие страницы, Telegram, До учёта;
Поиск, Соцсети, Прямой заход, Другой сайт. Размещение — после графиков, перед когортами.

## UX-мелочи

1. Единицы объёма: `formatTonnage(kg)` в `lib/format.ts` — `< 1000` → «850 кг», иначе «15,9 т» (1 знак, ru-RU).
   Ось графика объёма на дашборде (`components/dashboard/volume-chart.tsx`, сейчас `notation: "compact"` → «тыс.»)
   и лента (`components/social/activity-feed.tsx`, `tonnes`) — через неё. На оси — без «кг» у малых значений:
   отдельная `formatTonnageAxis` или параметр; решение — в задаче.
2. Липкие фильтры: `ExerciseFilterControls` в окне выбора упражнения (`exercise-picker.tsx`) и замены
   (`exercise-swap-dialog.tsx`) — прилипает к верху прокручиваемой области (`sticky top-0`, фон `bg-popover`/`bg-background`);
   поиск и группы на `/exercises` — прилипают под шапкой на мобильном.
3. Ошибка гидратации: найти воспроизведение (мобильная ширина 390px, основные страницы кабинета, консоль браузера),
   устранить причину; если не воспроизводится — отчёт с перечнем проверенных страниц.

## Нестабильный e2e

`e2e/whoop.spec.ts` «история снов при подключении»: проверка `recoveryPct` второго сна — через `expect.poll`
(восстановления грузятся после снов).

## Тесты

- Unit: `landingOf`, `referrerOf` (www, поддомены `m.vk.com`, `google.com.tr`, свой хост, мусор), `encode`/`decodeSource`
  (подделка → null), `sourceRows` (итоги, `null` → «До учёта», `activeWeek2: null`), `formatTonnage`.
- e2e (`e2e/signup-sources.spec.ts`): гость открывает `/training-programs/5x5` с `Referer: https://yandex.ru/search`
  → регистрация → `signupLanding = program`, `signupReferrer = search`; гость на `/` без Referer → `home/direct`;
  вошедший на `/` — cookie `hf_src` не появляется; повторный заход с другим Referer не меняет cookie; таблица
  «Источники» в `/admin` (desktop, serial — как `admin-metrics`); «Мои данные» содержит оба поля.
- e2e UX: ось графика объёма без «тыс.»; фильтр в окне выбора упражнения остаётся видимым после прокрутки списка
  (mobile).

## Вне объёма

UTM-метки, атрибуция по последнему касанию, источник для входа через существующий аккаунт, отчёт по `program_start`
кликам (есть в Метрике).
