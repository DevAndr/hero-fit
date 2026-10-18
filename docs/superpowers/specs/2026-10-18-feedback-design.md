# Обратная связь

Релиз `release/2026-12-alerts`, ветка фичи `feat/feedback`.

## Цель

Вошедший пользователь оставляет админу замечание или пожелание; админ разбирает входящие со статусами и заметкой
для себя; при «сделано» или «отклонено» пользователь получает уведомление. Ответы текстом, переписка, скриншоты и
вложения, гости — вне рамок. Фича-флага нет.

## Решения

### Данные

Миграция `feedback`:

```prisma
enum FeedbackKind { BUG IDEA OTHER }
enum FeedbackStatus { NEW IN_PROGRESS DONE REJECTED }

model Feedback {
  id        String         @id @default(cuid())
  userId    String
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind      FeedbackKind
  body      String
  status    FeedbackStatus @default(NEW)
  adminNote String?        // только админу
  page      String?        // путь, откуда открыли форму (без query)
  version   String?        // APP_VERSION на момент отправки
  userAgent String?        // обрезан до 300 символов
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  @@index([status, createdAt])
  @@index([userId, createdAt])
}
```

`NotificationType` += `FEEDBACK`.

Обращения — данные пользователя: при удалении аккаунта уходят каскадом; в «Мои данные» — раздел `feedback`
(`EXPORT_SECTIONS`): `kind`, `body`, `status`, `page`, `createdAt` — без `adminNote`, `userAgent`, id. В CSV не входят.
Политика конфиденциальности (`/privacy`): категория «обращения в обратную связь».

### Правила (чистые, `lib/feedback/rules.ts`)

- `FEEDBACK_DAILY_MAX = 5` — обращений за последние 24 ч на пользователя.
- `feedbackSchema` (Zod, `lib/feedback/schema.ts`): `kind` — enum; `body` — `trim`, 10–2000 символов («Опишите
  подробнее — от 10 символов», «Не больше 2000 символов»); `page` — необязательный, только путь `/…` (не `//`), до 200,
  query и hash отрезаются (`cleanPage`); иное — `undefined`, без ошибки.
- `adminPatchSchema`: `status?` — enum, `adminNote?` — до 1000, пустая строка → `null`.
- `shouldNotify(prev, next)`: `true`, если `next` ∈ {`DONE`, `REJECTED`} и `prev !== next`.
- `preview(body, 40)`: первая строка, обрезка по слову до 40 символов с «…».
- `notificationText(status, body)`: заголовок «Обратная связь», текст «Ваше обращение «<preview>» — сделано» /
  «— отклонено», `url: "/feedback"`.
- Подписи: `KIND_LABEL` (Ошибка / Идея / Другое), `STATUS_LABEL` (Новое / В работе / Сделано / Отклонено).

### Пользователь — `/feedback`

`app/(app)/feedback/page.tsx`, `requireUser`. Заголовок «Обратная связь», описание «Нашли ошибку или есть идея?
Напишите — мы читаем всё».

- Форма (`components/feedback/feedback-form.tsx`): `RadioGroup` типа (по умолчанию «Идея»), `Textarea` со счётчиком
  `n/2000`, «Отправить». `page` — из `?from=` (searchParams). Успех — toast «Спасибо! Обращение отправлено», поле
  очищается, список обновляется (`revalidatePath("/feedback")`). Ошибка — под формой (`role="alert"`).
- `submitFeedbackAction(input)` (`lib/feedback/actions.ts`): `requireUser`, `feedbackSchema`, счёт за 24 ч ≥ лимита →
  «Слишком много обращений — попробуйте завтра»; `version` — `process.env.APP_VERSION`, `userAgent` — заголовок
  запроса (`headers()`), обрезка 300. После записи — Telegram админам (не ждём ответа, ошибки — в лог).
- «Мои обращения» — список новых сверху (до 50): тип, дата, `Badge` статуса, текст (`line-clamp-3`, раскрытие не
  нужно). Пусто — «Пока нет обращений».
- Входы: пункт «Обратная связь» (иконка `MessageSquare`) в меню профиля со ссылкой `/feedback?from=<текущий путь>`;
  ссылка «Обратная связь» в `/settings`.

### Админ — `/admin/feedback`

`requireAdmin`; пункт «Обратная связь» в админском блоке меню со счётчиком `NEW` (как у клубов: считает layout
только админу — `newFeedbackCount()`).

- Фильтр `?status=open|new|in_progress|done|rejected|all` (по умолчанию `open` = NEW + IN_PROGRESS), вкладки-ссылки.
- Карточка (`article`, имя — «Обращение от <ник>»): ник автора, тип, дата в поясе админа, текст
  (`whitespace-pre-line`), страница, версия, устройство (`userAgent` мелким), `Select`/радио статуса, `Textarea`
  заметки и «Сохранить».
- `updateFeedbackAction(id, patch)`: `requireAdmin`, `adminPatchSchema`; в транзакции: прочитать прежний статус, обновить
  условно `updateMany({ where: { id, status: prev } })` (два админа одновременно не пришлют два уведомления: у
  второго `count = 0` → «Обращение уже изменили — обновите страницу»); если `shouldNotify` — `notify(tx, userId,
  notificationText(...), { push: true })`. Нет обращения — «Обращение не найдено». `revalidatePath("/", "layout")`.
- Порядок — новые сверху; до 100 на страницу (больше — «Показаны последние 100»).

### Telegram админам

Из `lib/errors/notify.ts` выделить `sendAdminTelegram(text: string)` (поиск админов с ботом по `ADMIN_LOGINS`,
`callBot`), `notifyAdmins` для ошибок вызывает её. Обращение: текст `feedbackAlertText(kind, url)` —
«📝 Новое обращение: идея\n<APP_URL>/admin/feedback» — без текста обращения и автора (152-ФЗ). Лимит —
`FEEDBACK_ALERTS_HOURLY = 20` в памяти процесса, лишнее отбрасывается.

## Тесты

- Unit: `feedbackSchema` (9 символов — ошибка, 10 — ок, 2001 — ошибка, пробелы обрезаются, `page`: `/stats?x=1` →
  `/stats`, `//evil` и `https://…` → `undefined`), `adminPatchSchema` (пустая заметка → `null`), `shouldNotify`
  (NEW→DONE да, DONE→DONE нет, DONE→REJECTED да, IN_PROGRESS→NEW нет), `preview` (обрезка по слову, многострочный
  текст), `notificationText`, `feedbackAlertText`, экспорт (`feedback` без `adminNote`/`userAgent`).
- E2e `e2e/feedback.spec.ts` (desktop + mobile; админские сценарии — только desktop, `makeAdmin`, serial внутри
  describe): пользователь из меню профиля открывает форму (страница в `?from=`), короткий текст — ошибка, отправка →
  в «Мои обращения» со статусом «Новое»; лимит — 5 через SQL-хелпер `seedFeedback`, шестое → ошибка; админ видит
  обращение со страницей, ставит «Сделано» и заметку → у пользователя в колокольчике «Ваше обращение … — сделано», на
  `/feedback` — «Сделано», заметки нет; не админ → 404 на `/admin/feedback`.
- `e2e/account-data.spec.ts`: выгрузка JSON содержит `feedback` без `adminNote`; удаление аккаунта с обращением.

## Документация

Раздел «Обратная связь» в `docs/features/platform.md`; пункт «Что нового» релиза — «Обратная связь: напишите нам об
ошибке или идее».
