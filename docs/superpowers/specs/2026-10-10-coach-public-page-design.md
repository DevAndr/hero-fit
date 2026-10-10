# Публичная страница тренера — дизайн

Дата: 2026-10-10. Режим тренера (`2026-10-09-coach-clients-design.md` и далее). Пока идёт бета, функция бесплатна.

## Цель

Тренер приводит клиентов сам. Ему нужна страница, которой можно поделиться и которую находят поисковики: кто он, чем занимается, честные цифры из приложения и кнопка «Заниматься», ведущая в уже существующий поток согласия `/coach/join/<код>`.

Критерии успеха:
- тренер за пару минут заполняет и публикует страницу `/trainer/<ник>`;
- гость нажимает «Заниматься», регистрируется и сразу попадает на экран согласия; после «Разрешить» он — клиент тренера;
- цифры на странице не раскрывают данные конкретного клиента;
- опубликованная страница индексируется (sitemap, JSON-LD), снятая — 404.

Вне этапа: фото, отзывы и оценки, контакты и соцсети, каталог тренеров с поиском, своё оформление, адрес со «слагом» вместо ника.

## Данные

```prisma
enum CoachFormat { ONLINE OFFLINE BOTH }

/// Публичная страница тренера (режим тренера). Видна всем, пока опубликована и режим тренера включён.
model CoachProfile {
  userId      String      @id
  displayName String?
  city        String?
  format      CoachFormat @default(BOTH)
  specialties String[]    @default([])
  about       String      @default("")
  /// коды цифр, которые тренер скрыл: clients, workouts, records, plan, since
  hiddenStats String[]    @default([])
  publishedAt DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`lib/coach/profile.ts` (чистые, без `server-only`):
- `SPECIALTIES` — `strength` «Сила», `mass` «Набор массы», `fat_loss` «Похудение», `beginners` «Для начинающих», `rehab` «Восстановление после травм», `functional` «Функциональный тренинг»; хранятся коды;
- `FORMAT_LABELS` — `ONLINE` «онлайн», `OFFLINE` «в зале», `BOTH` «онлайн и в зале»;
- `STAT_CODES = ["clients", "workouts", "records", "plan", "since"]`;
- `coachProfileSchema` — `displayName` ≤ 50 (пусто → null), `city` ≤ 50 (пусто → null), `format`, `specialties` — только коды из `SPECIALTIES`, ≤ 4, без повторов, `about` ≤ 1000 (trim), `hiddenStats` — только из `STAT_CODES`;
- `MIN_ABOUT_TO_PUBLISH = 50`, `MIN_CLIENTS_FOR_STATS = 3`, `MIN_PLAN_ENTRIES = 5`;
- `canPublish(profile, nickname): string | null` — причина отказа («Сначала задайте ник», «Расскажите о себе — минимум 50 символов») или `null`;
- `visibleStats(stats, hidden): { code, value, label }[]` — порядок `STAT_CODES`; скрытые — нет; `workouts`/`records`/`plan` — только при `clients ≥ 3`; `plan` — ещё и при `planTotal ≥ 5`; `since` — если есть дата; подписи — «12 клиентов», «148 тренировок клиентов за 30 дней», «37 рекордов клиентов за 30 дней», «86 % плана выполнено», «в Hero Fit с октября 2026» (склонения — `plural`).

## Цифры

`getCoachPublicStats(coachId, now)` (`lib/coach/profile-queries.ts`, server-only):
- `clients` — активные связи (`CoachLink.endedAt = null`);
- `workouts` — завершённые тренировки клиентов активных связей с `finishedAt` за последние 30 дней;
- `records` — сумма `records.length` из `XpEvent.meta` событий `WORKOUT_COMPLETED` тех же тренировок (как число PR в ачивках);
- `plan` — выполненные / прошедшие назначения тренера за 4 недели по всем активным клиентам (`getClientPlan` по каждому; `past`: `done` против остальных статусов кроме `skipped`), `planTotal` — их число;
- `since` — `createdAt` самой ранней связи тренера (любой, в т.ч. закрытой); нет — `null`.

Бывшие клиенты в `workouts`/`records`/`plan`/`clients` не входят.

## Страница

`app/(marketing)/trainer/[nick]/page.tsx`, динамическая (`connection()`), шапка и подвал лендинга. `proxy.ts`: `PUBLIC_PREFIXES` + `/trainer/`.

`getPublicCoach(nick)` — пользователь по `nicknameKey(nick)` с `isCoach = true` и `CoachProfile`. Показ:
- профиля нет, или `publishedAt = null`, или режим тренера выключен — 404; исключение: смотрит сам тренер — предпросмотр с плашкой «Страница не опубликована — её видите только вы»;
- шапка: аватар с инициалами (`displayName` или ник) на фирменном градиенте, имя, «Тренер · <город> · <формат>», метки специализаций;
- цифры — карточки `visibleStats` (нет ни одной — блока нет); у анимированных чисел точное значение в `sr-only`, как на лендинге, или без анимации;
- «О себе» — текст абзацами по пустой строке, без HTML и ссылок (`whitespace-pre-line`);
- «Как это работает» — 3 шага: «Нажмите «Заниматься»», «Разрешите тренеру видеть ваши тренировки», «Тренер назначает тренировки — вы качаетесь в приложении с уровнями и боссами»;
- кнопка «Заниматься» вверху и внизу (`<Link className={buttonVariants()}>`), ведёт на `/trainer/<ник>/join`.

Кнопка по смотрящему (`getCurrentUser`):
- сам тренер — «Это ваша страница» и «Редактировать» (`/coach/page`);
- клиент этого тренера (активная связь) — «Вы занимаетесь с этим тренером» вместо кнопки;
- остальные — «Заниматься».

`/trainer/[nick]/join` — route handler: `queueGoal("trainer_page_join")`, затем редирект: вошедший — `/coach/join/<coachCode>`, гость — `/register?next=/coach/join/<coachCode>`; страница не опубликована — 404. `coachCode` создаётся при публикации (`ensureCoachCode`).

Регистрация принимает `next`: страница `/register` читает `searchParams.next`, форма — скрытое поле, `registerAction` после создания — `redirect(safeRedirectPath(next))` (тренер с галочкой — по-прежнему `/coach`); ссылка «Уже есть аккаунт? Войти» несёт тот же `next`.

## SEO

`lib/seo.ts`:
- `generateMetadata`: title «<Имя> — тренер<, город> · Hero Fit», description — первые 160 символов «О себе» (по слову, без переносов строк), `alternates.canonical` — `/trainer/<ник как задан>`; неопубликованная — `robots: noindex`;
- JSON-LD — `coachJsonLd(profile, url)`: `Person`, `name`, `jobTitle: "Тренер"`, `address: { "@type": "PostalAddress", addressLocality }` (если город), `knowsAbout` — подписи специализаций, `url`; через `jsonLd` (экранирует `<`);
- `app/sitemap.ts` — плюс опубликованные страницы тренеров с включённым режимом (`lastModified` — `updatedAt` профиля, `priority: 0.6`, `changeFrequency: "weekly"`).

## Редактор

`/coach/page` (`app/(app)/coach/page/page.tsx`), ссылка «Страница» в кабинете `/coach` рядом с приглашением; компонент `components/coach/profile-editor.tsx`:
- поля: «Имя на странице», «Город», «Формат» (выбор), «Специализации» (до 4 переключателей), «О себе» со счётчиком «N / 1000»;
- «Показывать на странице» — переключатель на каждую цифру; рядом текущее значение и, если не видна по порогу, «появится при 3+ клиентах»;
- «Сохранить» — `saveCoachProfileAction(input)` (`lib/coach/profile-actions.ts`, `requireCoach`, `coachProfileSchema`, upsert);
- «Опубликовать» / «Снять с публикации» — `publishCoachProfileAction(on)`: при `on` — `canPublish` (отказ — причиной), `ensureCoachCode`, `publishedAt = now` (если уже — не меняется), цель `coach_page_published` при первой публикации; при `off` — `publishedAt = null`; `revalidatePath` страницы и `/sitemap.xml`;
- опубликовано — «Ваша страница: <APP_URL>/trainer/<ник>», «Скопировать», «Открыть»; подсказка «Смена ника в настройках изменит адрес страницы»;
- `/settings`, поле ника: при опубликованной странице — та же подсказка.

Цели Метрики — `trainer_page_join`, `coach_page_published` в `GOALS`.

## Приватность

`/privacy`: пункт о публичной странице тренера — данные, которые тренер указывает сам, и обобщённые цифры по его клиентам без имён видны всем, в том числе поисковым системам, пока страница опубликована; снять с публикации можно в любой момент. Порог `MIN_CLIENTS_FOR_STATS` не даёт цифрам описывать одного-двух клиентов.

## Демо

Сид: у `demo.coach` опубликованный профиль — «Тренер Демо», Москва, `BOTH`, `strength` и `beginners`, «О себе» ≥ 50 символов. Клиентов двое — цифр по клиентам на странице нет (проверка порога).

## Тесты

Unit (`lib/coach/profile.test.ts`): `coachProfileSchema` (длины, ≤ 4 специализаций, неизвестный код, повтор, неизвестная цифра); `canPublish`; `visibleStats` — порог 3, скрытые, `plan` при 5+ назначениях, `since` без даты, склонения. `safeRedirectPath` — уже покрыт, если нет — тест на внешний адрес.

e2e (`e2e/coach-page.spec.ts`, хелперы — `coachProfile(login, {...})` в `e2e/db.ts`):
1. тренер заполняет в `/coach/page` и публикует; гость открывает `/trainer/<ник>` — имя, город, метки, «О себе»; «Заниматься» → регистрация → экран согласия → «Разрешить» → клиент в `activeCoachLinks`;
2. неопубликованная — гостю 404, тренеру предпросмотр с плашкой;
3. 2 клиента — нет «тренировок клиентов», 3 клиента — есть; скрытая «клиентов» не показывается;
4. вошедший клиент тренера — «Вы занимаетесь с этим тренером»;
5. `sitemap.xml` содержит опубликованную страницу, после снятия — нет;
6. публикация с «О себе» < 50 символов — отказ «Расскажите о себе — минимум 50 символов».

## Документация

CLAUDE.md — строка про публичную страницу тренера: `CoachProfile`, `/trainer/<ник>` (группа marketing, `PUBLIC_PREFIXES`), `visibleStats` и порог 3, `/trainer/<ник>/join` → регистрация с `next` → согласие, sitemap и JSON-LD, редактор `/coach/page`, цели.
