# Системные оповещения

Релиз `release/2026-12-alerts`, ветка фичи `feat/system-alerts`.

## Цель

Админ оповещает всех пользователей кабинета: техработы, анонсы релизов, акции, изменения правил. Два вида —
бегущая строка над шапкой и диалог-попап; в админке задаётся окно показа (начало и необязательный конец), возможность
закрыть и запоминание закрытия. Гости, публичные страницы, таргетинг по аудитории, картинки, Markdown — вне рамок.

## Решения

### Данные

Миграция `system_alerts`:

```prisma
enum SystemAlertKind { BANNER POPUP }
enum SystemAlertTone { INFO WARNING CRITICAL }
enum SystemAlertDismiss { NEVER SESSION FOREVER }

model SystemAlert {
  id          String             @id @default(cuid())
  kind        SystemAlertKind
  tone        SystemAlertTone    @default(INFO)
  title       String?            // обязателен у POPUP, у BANNER не используется
  body        String
  ctaLabel    String?
  ctaHref     String?
  dismiss     SystemAlertDismiss @default(FOREVER)
  startsAt    DateTime
  endsAt      DateTime?          // null — пока не выключат
  enabled     Boolean            @default(true)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  createdBy   String?            // логин админа, для истории
  dismissals  SystemAlertDismissal[]
  @@index([enabled, startsAt])
}

model SystemAlertDismissal {
  alertId   String
  userId    String
  createdAt DateTime    @default(now())
  alert     SystemAlert @relation(fields: [alertId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([alertId, userId])
}
```

`SystemAlertDismissal` — служебная запись, как `UserVisit`: в «Мои данные» не входит, при удалении аккаунта уходит
каскадом (проверка в `e2e/account-data.spec.ts`).

### Правила (чистые, `lib/alerts/rules.ts`)

- `isLive(alert, now)`: `enabled && startsAt <= now && (endsAt == null || now < endsAt)`.
- `alertOrder`: `CRITICAL` → `WARNING` → `INFO`, внутри — по `startsAt` убыванию (новее выше).
- `visibleBanners(alerts, now, hidden)`: живые `BANNER`, не скрытые, в порядке `alertOrder`, не больше 3.
- `nextPopup(alerts, now, hidden)`: первый живой `POPUP` в порядке `alertOrder`, не скрытый, или `null`.
- `nextChange(alerts, now)`: ближайший будущий момент `startsAt`/`endsAt` (для клиентского таймера) или `null`.
- `safeHref(href)`: внутренний путь `/…` (не `//…`) или `https://…`; иначе невалидно.
- Схема формы (`lib/alerts/schema.ts`, Zod): `body` 1–500 символов, `title` до 80 и обязателен для `POPUP`, `ctaLabel`
  до 30 и `ctaHref` — оба или ни одного, `ctaHref` через `safeHref`, `endsAt > startsAt`, `POPUP` + `NEVER` —
  ошибка («попап нельзя сделать незакрываемым»).

### Загрузка (`lib/alerts/queries.ts`)

`getUserAlerts(userId, now)` — одним запросом: `enabled`, `startsAt <= now + 24 ч`, `endsAt` пусто или `> now`, без
закрытых этим пользователем навсегда (`dismissals: { none: { userId } }`). Вызывается в layout `(app)` параллельно с
лентой уведомлений, в `quietly` (сбой не роняет кабинет — пустой список). В клиент уходят только поля для показа,
даты — ISO-строками.

### Показ (`components/alerts/*`)

`SystemAlerts` (клиент) в `AppShell` над шапкой. Держит `now` и ставит `setTimeout` на `nextChange` — оповещение
появляется и уходит по времени без перезагрузки. Созданное после загрузки страницы появится при следующей полной
загрузке (осознанно: без опроса сервера).

- **Строка** (`AlertBanner`): полоса на всю ширину, цвет и иконка Lucide по тону (`Info`, `TriangleAlert`,
  `OctagonAlert`), только семантические токены: `INFO` — `primary`, `CRITICAL` — `destructive`, `WARNING` — новый
  токен `warning`/`warning-foreground` в `app/globals.css` для обеих тем (янтарный, контраст текста ≥ 4.5:1). Короткий текст стоит. Длинный (проверка `scrollWidth > clientWidth` через
  `ResizeObserver`) медленно прокручивается CSS-анимацией, которая ставится только пока текст не влезает; пауза при
  наведении и фокусе. При `prefers-reduced-motion: reduce` — без анимации: многоточие, нажатие раскрывает текст
  целиком в несколько строк. Кнопка-ссылка справа; крестик — если `dismiss != NEVER`. Стопка до 3 строк.
- **Попап** (`AlertPopup`): `Dialog` из `components/ui/dialog.tsx`, заголовок, текст с сохранёнными переносами
  (`whitespace-pre-line`), кнопка-ссылка и «Понятно». По одному: следующий — после закрытия предыдущего. Внешняя
  ссылка — `target="_blank" rel="noopener noreferrer"`.
- Текст выводится как обычный текст (React экранирует), без HTML.
- **Закрытие:** `SESSION` — id в `sessionStorage` (`hf_alerts_hidden`, в try/catch; без доступа — скрыто до
  перезагрузки), `FOREVER` — оптимистично скрыть и вызвать `dismissAlertAction(id)` (`requireUser`, `upsert`
  записи; несуществующий id — тихо игнорировать). Нажатие на кнопку-ссылку закрывает так же, как крестик.
- Работает и в Telegram Mini App (та же оболочка).

### Админка `/admin/alerts`

`requireAdmin`, пункт «Оповещения» в админском блоке меню профиля (`components/app/user-menu.tsx`).

- Список в трёх группах: «Идут сейчас», «Запланированы», «Прошедшие и выключенные»; у каждого — вид, тон, окно
  показа в поясе админа, режим закрытия, число закрывших навсегда (`_count.dismissals`).
- Создание и правка — форма (`saveAlertAction`, схема из `lib/alerts/schema.ts`): вид, тон, заголовок, текст, кнопка,
  режим закрытия (для попапа «нельзя» недоступно), начало (по умолчанию «сейчас»), конец (необязателен). Поля
  `datetime-local` — в поясе админа (`User.timeZone`), на сервер — с поясом, хранение в UTC. Живое превью строки
  или попапа (те же компоненты, без действий).
- Действия: включить/выключить (`toggleAlertAction`), удалить (`deleteAlertAction`, с подтверждением; записи о
  закрытии уходят каскадом). Правка текста не сбрасывает закрытия — для «показать заново» админ создаёт новое
  оповещение.

Фича-флага нет: без созданных админом оповещений пользователи ничего не видят, каждое выключается сразу.

## Тесты

- Unit: `isLive` (границы окна, выключено, без конца), `alertOrder`, `visibleBanners` (лимит 3, скрытые),
  `nextPopup`, `nextChange`, `safeHref` (`javascript:`, `//evil`, `http://` — нет; `/whats-new`, `https://` — да),
  схема (попап без заголовка, попап + `NEVER`, конец раньше начала, кнопка без ссылки).
- E2e `e2e/system-alerts.spec.ts` (serial, только desktop — оповещения глобальные; админ через `makeAdmin`):
  админ создаёт строку → пользователь видит, закрывает «навсегда» → после перезагрузки нет, у админа «закрыли: 1»;
  `SESSION` — после закрытия в новом контексте видна снова; `NEVER` — без крестика; попап и очередь из двух;
  запланированное на будущее не видно; выключенное пропадает; длинный текст при `reducedMotion` раскрывается по
  нажатию. Хелпер `clearAlerts` в `e2e/db.ts` — чистка между сценариями.
- `e2e/account-data.spec.ts`: удаление аккаунта с записью о закрытии.

## Документация

Раздел «Системные оповещения» в `docs/features/platform.md`; пункт в «Что нового» релиза не нужен (инструмент
админа), но само оповещение можно использовать для анонса релиза.
