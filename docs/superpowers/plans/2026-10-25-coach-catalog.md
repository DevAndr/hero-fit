# Каталог тренеров и контакты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каталог `/trainers` с фильтрами и контакты тренера (Telegram, WhatsApp, VK, телефон, email), видимые вошедшим, с переключателем «Показывать меня в каталоге».

**Architecture:** Новые колонки в `CoachProfile` и счётчик `CoachContactClick`; чистые правила в `lib/coach/contacts.ts` и `lib/coach/catalog.ts`; запросы — `lib/coach/catalog-queries.ts`; страница `app/(marketing)/trainers/page.tsx`; общий компонент контактов для каталога и `/trainer/<ник>`. Всё под флагом `coach_catalog`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, Zod, Base UI/shadcn, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-coach-catalog-design.md`

## Global Constraints

- Флаг `coach_catalog` (описание «Каталог тренеров и контакты тренера», `expires: "2027-08-31"`). Смотрящий: `isEnabled("coach_catalog", viewer?.id ?? null)` — вошедшим можно включать по списку, гостям и в `sitemap.xml`, шапке и подвале лендинга — только глобально (`isEnabled(..., null)`).
- Контакты гостю не попадают ни в HTML, ни в JSON-LD — решение на сервере, не CSS.
- Ссылки контактов строятся только из нормализованных значений: `https://t.me/<nick>`, `https://wa.me/<цифры>`, `https://vk.com/<name>`, `tel:+…`, `mailto:…`; `target="_blank" rel="noopener noreferrer nofollow"` (кроме `tel:`/`mailto:` — без `target`).
- Константы: `CATALOG_PAGE_SIZE = 20`, `ACTIVE_DAYS = 14`, `ABOUT_PREVIEW = 140`.
- Кто открывал контакты — не хранится, только `count` по `(coachId, day)`.
- Тексты: «Показывать меня в каталоге тренеров», «Показывать контакты вошедшим пользователям Hero Fit», «Войдите, чтобы увидеть контакты», «В каталоге тренеров», «Не в каталоге: …», «Контакты открывали N раз за 30 дней» (`plural` из `lib/format`), «Тренеры Hero Fit», «По этим условиям тренеров пока нет», «Сбросить фильтры», «Найти тренера».
- Миграция — проверить SQL: не удалять частичные индексы `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- Числовые поля ввода тренировки не затрагиваются; формы — обычные `Input`.

## Review Focus

- Телефон, введённый как `8 (999) 123-45-67`, `+7 999 123 45 67`, `89991234567` → везде `+79991234567`; `+44 20 7946 0958` → `+442079460958`; меньше 10 цифр — ошибка «Проверьте номер». Тест — Task 1.
- Тренер вставил `https://t.me/nick?start=x` или `vk.com/nick/` с хвостом → ник без хвоста; ник с запрещёнными символами (`<script>`) — ошибка, а не ссылка. Тест — Task 1.
- Город «Москва», « москва », «МОСКВА» у разных тренеров — один пункт в фильтре и один фильтр. Тест — Task 2 (`cityOptions`) и Task 5 (e2e).
- Тренер снял согласие на контакты — контакты пропадают и со страницы `/trainer/<ник>`, и из каталога (тренер уходит из каталога), а сами значения остаются в форме. Тест — Task 3 (e2e).
- Клик по контактам тренера, которого уже нет в каталоге / без согласия (подделанный вызов action) — счётчик не растёт. Тест — Task 4 (e2e через прямой вызов не нужен: unit `canCountClick`).

---

### Task 1: Схема, флаг и нормализация контактов

**Files:**
- Modify: `prisma/schema.prisma` (модель `CoachProfile`, новая `CoachContactClick`, связь в `User`)
- Create: `prisma/migrations/<ts>_coach_catalog/migration.sql` (через `npx prisma migrate dev --name coach_catalog --create-only`, проверить SQL)
- Modify: `lib/flags/registry.ts`
- Create: `lib/coach/contacts.ts`, `lib/coach/contacts.test.ts`

**Interfaces:**
- Produces:
  - Колонки `CoachProfile`: `telegram`, `whatsapp`, `vk`, `phone`, `email` (`String?`), `contactsConsentAt DateTime?`, `catalogListed Boolean @default(false)`; модель `CoachContactClick { coachId, day @db.Date, count Int @default(0), @@id([coachId, day]) }`, `User.coachContactClicks`, `onDelete: Cascade`.
  - `type ContactKind = "telegram" | "whatsapp" | "vk" | "phone" | "email"`, `CONTACT_KINDS: readonly ContactKind[]`, `CONTACT_LABELS: Record<ContactKind, string>` (`Telegram`, `WhatsApp`, `VK`, `Телефон`, `Email`).
  - `contactsSchema` — `z.object` с пятью полями (вход — строка, выход — нормализованная строка или `null`).
  - `type Contacts = Record<ContactKind, string | null>`.
  - `contactLinks(c: Contacts): { kind: ContactKind; label: string; text: string; href: string }[]` (порядок `CONTACT_KINDS`; `text` — что показать: `@nick`, `+7 999 123-45-67` и т.п.).
  - `hasContacts(c: Contacts): boolean`.

- [ ] **Step 1: Тесты `contacts.test.ts`**

```ts
const parse = (v: Partial<Record<ContactKind, string>>) => contactsSchema.safeParse({ telegram: "", whatsapp: "", vk: "", phone: "", email: "", ...v });
it("telegram: @nick, t.me, ссылка с хвостом → nick", () => {
  for (const v of ["@hero_coach", "hero_coach", "t.me/hero_coach", "https://t.me/hero_coach?start=x"]) expect(parse({ telegram: v }).data?.telegram).toBe("hero_coach");
  expect(parse({ telegram: "abc" }).success).toBe(false);          // < 5
  expect(parse({ telegram: "<script>" }).success).toBe(false);
});
it("телефон и whatsapp → +цифры", () => {
  for (const v of ["8 (999) 123-45-67", "+7 999 123 45 67", "89991234567"]) expect(parse({ phone: v }).data?.phone).toBe("+79991234567");
  expect(parse({ whatsapp: "+44 20 7946 0958" }).data?.whatsapp).toBe("+442079460958");
  expect(parse({ phone: "12345" }).error?.issues[0].message).toBe("Проверьте номер");
});
it("vk: ссылка, слэш на конце, id123", () => {
  expect(parse({ vk: "https://vk.com/hero.coach/" }).data?.vk).toBe("hero.coach");
  expect(parse({ vk: "id123" }).data?.vk).toBe("id123");
  expect(parse({ vk: "vk.com/a b" }).success).toBe(false);
});
it("email и пустые → null", () => {
  expect(parse({ email: " Coach@Mail.ru " }).data?.email).toBe("coach@mail.ru");
  expect(parse({}).data).toEqual({ telegram: null, whatsapp: null, vk: null, phone: null, email: null });
  expect(parse({ email: "nope" }).success).toBe(false);
});
it("contactLinks строит только наши ссылки", () => {
  const links = contactLinks({ telegram: "hero_coach", whatsapp: "+79991234567", vk: "id123", phone: "+79991234567", email: "c@m.ru" });
  expect(links.map((l) => l.href)).toEqual(["https://t.me/hero_coach", "https://wa.me/79991234567", "https://vk.com/id123", "tel:+79991234567", "mailto:c@m.ru"]);
  expect(contactLinks({ telegram: null, whatsapp: null, vk: null, phone: null, email: null })).toEqual([]);
});
```

- [ ] **Step 2:** `npx vitest run lib/coach/contacts.test.ts` — FAIL (модуля нет).
- [ ] **Step 3:** Схема Prisma + миграция (`--create-only`, просмотреть SQL, затем `npm run db:migrate`), флаг в `registry.ts`, `lib/coach/contacts.ts`. Правила: Telegram `^[A-Za-z0-9_]{5,32}$`; номер — оставить цифры, `8` + 10 цифр → `7…`, 10–15 цифр, иначе «Проверьте номер»; VK `^[A-Za-z0-9_.]{2,32}$` после снятия `https?://`, `(m.)?vk.com/`, хвоста `/…?#`; email — `trim().toLowerCase()` + `z.email().max(254)`. Сообщения ошибок: «Проверьте ник в Telegram», «Проверьте номер», «Проверьте адрес VK», «Проверьте email».
- [ ] **Step 4:** `npx vitest run lib/coach/contacts.test.ts` — PASS; `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(coach): contact fields, catalog flag and contact normalization`.

### Task 2: Правила каталога (чистые)

**Files:**
- Create: `lib/coach/catalog.ts`, `lib/coach/catalog.test.ts`

**Interfaces:**
- Consumes: `Contacts`, `hasContacts` (Task 1); `SPECIALTIES`, `FORMATS` (`lib/coach/profile.ts`).
- Produces:
  - `type CatalogProfile = Contacts & { publishedAt: Date | null; contactsConsentAt: Date | null; catalogListed: boolean; city: string | null; format: "ONLINE" | "OFFLINE" | "BOTH" }`.
  - `inCatalog(p: CatalogProfile, isCoach: boolean): boolean`.
  - `catalogMissing(p: CatalogProfile, isCoach: boolean): string[]` — по порядку: «включите показ в каталоге», «опубликуйте страницу», «укажите хотя бы один контакт», «отметьте согласие на показ контактов», «укажите город» (последнее — только если формат не `ONLINE`). `isCoach = false` → `["включите режим тренера"]`.
  - `contactsVisible(p: CatalogProfile): boolean` — согласие и `hasContacts`.
  - `catalogFilterSchema` → `{ city: string | null; format: "ONLINE" | "OFFLINE" | null; specialty: string | null; page: number }` (неизвестное → `null`/`1`).
  - `cityKey(city: string): string` (`trim().toLowerCase()`, `ё`→`е`), `cityOptions(cities: string[]): { key: string; label: string }[]` (первое написание, по алфавиту `localeCompare("ru")`).
  - `matchesFormat(format, wanted): boolean`.
  - `sortCatalog<T extends { userId: string; active: boolean }>(items: T[], day: string): T[]` — активные выше, внутри — по `hash(userId + day)` (FNV-1a 32 бит).
  - `CATALOG_PAGE_SIZE`, `ACTIVE_DAYS`, `ABOUT_PREVIEW`, `aboutPreview(text: string): string` (обрезка по границе слова + «…»).

- [ ] **Step 1: Тесты** — `inCatalog` true для полного профиля; false при каждом из: `catalogListed=false`, `publishedAt=null`, `isCoach=false`, без контактов, без согласия, без города при `OFFLINE`/`BOTH`; true без города при `ONLINE`. `catalogMissing` возвращает ровно нужные строки (`expect(catalogMissing({...full, catalogListed: false, contactsConsentAt: null}, true)).toEqual(["включите показ в каталоге", "отметьте согласие на показ контактов"])`). `matchesFormat("BOTH","ONLINE")` и `("BOTH","OFFLINE")` true, `("ONLINE","OFFLINE")` false, `wanted=null` — всегда true. `cityOptions([" Москва", "москва", "МОСКВА", "Казань"])` → `[{key:"казань",label:"Казань"},{key:"москва",label:"Москва"}]`. `sortCatalog`: активные всегда выше; два вызова с одним `day` дают одинаковый порядок; на 20 элементах порядок для `"2026-10-25"` и `"2026-10-26"` различается. `catalogFilterSchema.parse({ format: "x", specialty: "nope", page: "-3" })` → `{ city: null, format: null, specialty: null, page: 1 }`. `aboutPreview` — ≤ 141 символ, не рвёт слово.
- [ ] **Step 2:** `npx vitest run lib/coach/catalog.test.ts` — FAIL.
- [ ] **Step 3:** Реализация в `lib/coach/catalog.ts`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(coach): catalog rules`.

### Task 3: Редактор `/coach/page` — контакты, согласие, переключатель, статус

**Files:**
- Modify: `lib/coach/profile.ts` (`coachProfileSchema` расширить `contactsSchema.shape`, `contactsConsent: z.boolean()`, `catalogListed: z.boolean()`)
- Modify: `lib/coach/profile-actions.ts` (`saveCoachProfileAction`: `contactsConsent` → `contactsConsentAt` — сохранить прежнюю дату, если уже стояла, `null` при снятии; `revalidatePath("/trainers")`)
- Modify: `components/coach/profile-editor.tsx` (секция `aria-label="Контакты"`: пять `Input` с подписями `CONTACT_LABELS`, плейсхолдеры `@nick`, `+7 999 123-45-67`, `vk.com/…`, `+7 …`, `name@mail.ru`; `Checkbox` «Показывать контакты вошедшим пользователям Hero Fit»; при `catalog` — секция `aria-label="Каталог тренеров"` со `Switch` «Показывать меня в каталоге тренеров», статусом и счётчиком)
- Modify: `app/(app)/coach/page/page.tsx` (начальные значения; `catalog = await isEnabled("coach_catalog", coach.id)`; `missing = catalogMissing(...)` после сохранения — передаётся с сервера, обновляется через `revalidatePath`; `clicks30` — сумма `CoachContactClick` за 30 дней)
- Modify: `lib/coach/profile.test.ts`
- Create: `e2e/coach-catalog.spec.ts` (desktop, флаг на пользователя через `addFlagUser` — параллельно)
- Modify: `e2e/db.ts` — `coachProfile(...)` принимает `contacts?: Partial<Contacts>`, `consent?: boolean`, `listed?: boolean`, `format?: "ONLINE"|"OFFLINE"|"BOTH"`; новый `contactClicks(login): Promise<number>`.

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `ProfileForm` с полями `telegram…email: string`, `contactsConsent: boolean`, `catalogListed: boolean`; `ProfileEditor` props `+ catalog: { missing: string[]; clicks30: number } | null`.

- [ ] **Step 1: Unit** — `coachProfileSchema` принимает контакты и нормализует (`telegram: "@hero_coach"` → `"hero_coach"`), ошибка номера всплывает первой (`issues[0].message === "Проверьте номер"`).
- [ ] **Step 2: e2e (`coach-catalog.spec.ts`)**:
  - «editor: contacts saved normalized; catalog switch is off by default with a hint» — тренер (`enableCoach` + `coachProfile({ about, publish: true, city: "Казань" })` + `addFlagUser`) вводит `8 (999) 123-45-67` и `@hero_coach_<n>`, отмечает согласие, «Сохранить» → после перезагрузки поле телефона `+79991234567`; в секции «Каталог тренеров» `Switch` выключен, текст «Не в каталоге: включите показ в каталоге».
  - «editor: switch on → «В каталоге тренеров»; consent off → not in catalog, values kept».
  - «editor: without the flag there is no catalog section» (контакты видны всегда).
- [ ] **Step 3:** Run — FAIL.
- [ ] **Step 4:** Реализация.
- [ ] **Step 5:** `npx vitest run lib/coach && npm run build && npx playwright test e2e/coach-catalog.spec.ts --project=desktop` — PASS.
- [ ] **Step 6:** Commit `feat(coach): contacts and catalog switch in the page editor`.

### Task 4: Контакты на странице тренера и счётчик открытий

**Files:**
- Create: `components/coach/coach-contacts.tsx` (`CoachContacts`, серверный, + клиентская `ContactButton`)
- Create: `lib/coach/catalog-actions.ts` (`contactClickAction`)
- Modify: `lib/coach/catalog.ts` (+ `canCountClick`), `lib/coach/catalog.test.ts`
- Modify: `app/(marketing)/trainer/[nick]/page.tsx` (секция `aria-labelledby="contacts"`, заголовок «Контакты», после `action`; только при флаге смотрящего и `contactsVisible`)
- Modify: `lib/analytics/goals.ts` (+ `trainer_contact_click`, `trainers_catalog_view`)
- Modify: `e2e/coach-catalog.spec.ts`

**Interfaces:**
- Consumes: `contactLinks`, `contactsVisible`, `isBot` (`lib/analytics/bots.ts`), `queueGoal`.
- Produces:
  - `<CoachContacts coachId: string; contacts: Contacts; viewer: { id: string } | null; nextPath: string />` — гостю ссылка «Войдите, чтобы увидеть контакты» → `/login?next=<nextPath>` (контактов в разметке нет); владельцу — ссылки без счёта.
  - `canCountClick(p: CatalogProfile, isCoach: boolean, viewerId: string, coachId: string): boolean` — `viewerId !== coachId` и `contactsVisible(p)` и `p.publishedAt` и `isCoach`.
  - `contactClickAction(coachId: string): Promise<void>` — `requireUser`, флаг смотрящего, `isBot((await headers()).get("user-agent"))` → выход, `canCountClick`, `INSERT … ON CONFLICT ("coachId", day) DO UPDATE SET count = count + 1` (день — `CURRENT_DATE`, как у `ApkDownload`), `queueGoal("trainer_contact_click")`. Ошибки глотаются (`quietly`), клик не блокирует переход.

- [ ] **Step 1: Unit** `canCountClick`: false для своего тренера, без согласия, без публикации, при `isCoach=false`; true иначе.
- [ ] **Step 2: e2e:**
  - «trainer page: signed-in user sees contact links; click is counted» — ссылка «Telegram» с `href="https://t.me/hero_coach_<n>"`; клик (перехватить `context.route("https://t.me/**", r => r.fulfill({ body: "" }))`) → `expect.poll(() => contactClicks(coach)).toBe(1)`; тренер в `/coach/page` видит «Контакты открывали 1 раз за 30 дней».
  - «trainer page: the coach's own clicks are not counted».
  - «trainer page: no consent — no contacts block».
- [ ] **Step 3–5:** FAIL → реализация → PASS (unit + `--project=desktop`).
- [ ] **Step 6:** Commit `feat(coach): contacts on the trainer page with an open counter`.

### Task 5: Страница каталога `/trainers`

**Files:**
- Create: `lib/coach/catalog-queries.ts` (`getCatalog`, `getCatalogCities`, `catalogCount`)
- Create: `app/(marketing)/trainers/page.tsx`, `components/coach/catalog-filters.tsx` (GET-форма; `Select`ы Base UI с hidden-input или нативные `select` — как в соседних публичных фильтрах `/programs`, свериться с `app/(app)/programs/page.tsx`), `components/coach/catalog-card.tsx`
- Modify: `proxy.ts` (`PUBLIC_PAGES` + `/trainers`), `app/sitemap.ts` и `lib/seo.ts` (`PUBLIC_SITEMAP`-строка `/trainers` только при глобальном флаге — передать `extra` в `sitemapEntries` или добавить в `sitemap.ts`), `lib/seo.test.ts`
- Create: `e2e/coach-catalog-global.spec.ts` (`mode: "serial"`, глобальный флаг через `setFlag("coach_catalog", { enabled: true, percent: 100 })` в `beforeAll`, `resetFlag` в `afterAll`)
- Modify: `playwright.config.ts` — `GLOBAL_TRAINERS = /coach-catalog-global\.spec\.ts/`, игнор в `desktop`/`mobile`, проект `trainers-global` с `dependencies: ["android-global"]`
- Modify: `e2e/coach-catalog.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`catalogFilterSchema`, `sortCatalog`, `matchesFormat`, `cityKey`, `cityOptions`, `aboutPreview`, константы), Task 4 (`CoachContacts`).
- Produces:
  - `getCatalog(filter: CatalogFilter, now: Date): Promise<{ items: CatalogItem[]; total: number }>` — `CatalogItem = { userId, nickname, name, city, format, specialties, about, contacts: Contacts }`. SQL-условия `inCatalog` в Prisma `where` (`catalogListed: true, publishedAt: { not: null }, contactsConsentAt: { not: null }, user: { isCoach: true, nickname: { not: null } }, OR: [{ telegram: { not: null } }, …]`, плюс `OR: [{ city: { not: null } }, { format: "ONLINE" }]`), город и формат — после выборки (`cityKey`, `matchesFormat`), специализация — `specialties: { has }`; `active` — есть `UserVisit` за `ACTIVE_DAYS` и (`CoachLink` с `endedAt: null` или `CoachProgram` с `publishedAt` и без `hiddenAt`); затем `sortCatalog(items, now.toISOString().slice(0, 10))` и срез страницы.
  - `getCatalogCities(): Promise<{ key: string; label: string }[]>`.
  - `catalogCount(): Promise<number>` — для админки (Task 6).
- Страница: `export const dynamic = "force-dynamic"`; `notFound()` без флага смотрящего; `metadata` — title «Тренеры Hero Fit — найдите тренера», canonical `/trainers`; страницы с фильтрами — `robots: { index: false, follow: true }` (индексируется только чистый `/trainers`); `queueGoal("trainers_catalog_view")`. Пагинация «Назад» / «Дальше» сохраняет фильтры.

- [ ] **Step 1: e2e (desktop, флаг на пользователя):**
  - «catalog: listed coach with contacts is shown; unlisted, no-consent, no-contacts are not» — четыре тренера с уникальными ником и городом `Город<n>`, фильтр `?city=город<n>` (регистр другой) → видна одна карточка с «Подробнее» → `/trainer/<ник>`.
  - «catalog: format filter — BOTH matches online and offline; specialty filter».
  - «catalog: empty state with reset».
  - «catalog: 404 without the flag».
- [ ] **Step 2: e2e global (`coach-catalog-global.spec.ts`):**
  - «guest: catalog is public, contacts hidden» — гость открывает `/trainers?city=…` и `/trainer/<ник>`: виден «Войдите, чтобы увидеть контакты»; `expect(await page.content()).not.toContain("79991234567")` на обеих страницах; ссылка ведёт на `/login?next=%2Ftrainers…`.
  - «sitemap lists /trainers».
- [ ] **Step 3–5:** FAIL → реализация → `npm run build && npx playwright test e2e/coach-catalog --project=desktop --project=trainers-global` PASS; unit `lib/seo.test.ts`.
- [ ] **Step 6:** Commit `feat(coach): trainers catalog page`.

### Task 6: Точки входа и админка

**Files:**
- Modify: `components/app/nav.ts` (`TRAINERS_NAV_ITEM = { href: "/trainers", label: "Найти тренера", icon: UserSearch, mobile: false }`), `components/app/nav-links.tsx` (после «Друзей», при `useFlag("coach_catalog")` и не `isCoach`), `components/app/user-menu.tsx` (пункт для телефона, те же условия)
- Modify: `app/(app)/settings/page.tsx` + `components/coach/coach-settings.tsx` (`FindCoachCard`: секция `aria-label="Найти тренера"`, «У вас пока нет тренера», ссылка «Найти тренера в каталоге» — когда тренера нет, флаг включён и пользователь не тренер)
- Modify: `components/marketing/site-header.tsx`, `site-footer.tsx`, `app/(marketing)/layout.tsx` (флаг `trainers?: true`, глобальный `isEnabled("coach_catalog", null)`; пункт «Тренеры» → `/trainers`), `components/marketing/faq.tsx` (`trainers?: boolean`, вопрос «Как найти тренера?», ответ: «Откройте каталог тренеров: выберите город, формат и специализацию. Контакты тренера видны после входа — договаривайтесь с ним напрямую, а тренировки ведите в Hero Fit.»; `faqFor(clubs, android, trainers)` — обновить вызовы)
- Modify: `lib/admin/metrics-queries.ts` (`coachCatalog`, `contactClicks7`, `contactClicks30`), `components/admin/feature-usage.tsx` (строка «Каталог тренеров»: `в каталоге N, открытий контактов X / Y (7 дн. / 30 дн.)`)
- Modify: `e2e/coach-catalog.spec.ts`, `e2e/coach-catalog-global.spec.ts`, `e2e/admin-metrics.spec.ts`

**Interfaces:**
- Consumes: `catalogCount` (Task 5).

- [ ] **Step 1: e2e:** пункт меню «Найти тренера» виден с флагом и ведёт на `/trainers`, без флага — нет; в `/settings` без тренера — ссылка «Найти тренера в каталоге»; global — в шапке лендинга ссылка «Тренеры» и FAQ «Как найти тренера?»; админка — строка «Каталог тренеров».
- [ ] **Step 2–4:** FAIL → реализация → PASS (desktop + mobile для меню).
- [ ] **Step 5:** Commit `feat(coach): catalog entry points and admin metrics`.

### Task 7: «Мои данные», удаление, privacy, документация, «Что нового»

**Files:**
- Modify: `lib/account/export.ts`, `lib/account/export-queries.ts` (раздел `coachPage`: `{ displayName, city, format, specialties, about, publishedAt, catalogListed, contacts: Contacts, contactsConsentAt, contactOpens: { day, count }[] } | null`), тест экспорта рядом, если есть
- Modify: `app/(marketing)/privacy/page.tsx` (текст из спеки)
- Modify: `docs/features/coach.md` (раздел «Каталог тренеров»), `docs/features/platform.md` (строка метрик)
- Modify: `lib/changelog/releases.ts` — пункт к будущему релизу добавляется на шаге релиза, не здесь
- Modify: `e2e/account-data.spec.ts` или `e2e/coach-catalog.spec.ts` (флаг на пользователя — безопасно в `coach-catalog.spec.ts`)

- [ ] **Step 1: e2e:** «Мои данные» тренера содержат `coachPage.contacts.phone === "+79991234567"` и `contactOpens`; удаление аккаунта тренера → `/trainers?city=…` без его карточки, строк `CoachContactClick` нет.
- [ ] **Step 2–4:** FAIL → реализация → PASS.
- [ ] **Step 5:** Полный прогон: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8`.
- [ ] **Step 6:** Commit `feat(coach): catalog data export, privacy and docs`; влить в `release/2027-08-trainers` с `--no-ff`, удалить ветку.
