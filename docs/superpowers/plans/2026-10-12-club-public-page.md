# Публичная страница клуба — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ одобренного клуба публикует страницу зала `/gym/<город>/<зал>` с общими цифрами без ников, страницей города, SEO и кнопкой «Вступить»; модератор может снять её с публикации; при 100 % флага на лендинге появляется раздел «Клубы залов».

**Architecture:** Поля `about`/`slug`/`citySlug`/`publishedAt`/`updatedAt` в `Club`; чистые правила — `lib/club/public.ts`, запросы — `lib/club/public-queries.ts`, страницы — `app/(marketing)/gym/`, SEO — `lib/seo.ts`. Видимость — флаг `clubs` на 100 % (`isEnabled("clubs", null)`), иначе предпросмотр админу клуба и админу приложения.

**Tech Stack:** Next.js 16 (app router, `proxy.ts`), Prisma 7, zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-club-public-page-design.md`

## Global Constraints

- Ветка `feat/club-public-page` (от `release/2026-11-assistant`), в конце — merge `--no-ff` в релизную ветку.
- Перед кодом Next — сверяться с `node_modules/next/dist/docs/` (Next 16).
- Цвета — только семантические токены; ссылка-кнопка — `<Link className={buttonVariants()}>`.
- Ники, `contact`, личные цифры на публичных страницах не выводятся никогда.
- `CLUB_ABOUT_MIN = 50`, `CLUB_ABOUT_MAX = 1000`, `MIN_MEMBERS_FOR_STATS = 3`, slug до 60 символов, кандидаты `-2…-20`, причина модератора до 200.
- Тексты: «Клуб ещё на проверке», «Клуб скрыт модератором», «Заявка отклонена», «Напишите о зале хотя бы 50 символов», «Чтобы убрать текст, снимите страницу с публикации», «Не удалось подобрать адрес, напишите нам», «Страница пока не видна в поиске», «Страница появится в поиске, когда клубы откроются для всех», «Страница клуба «…» снята с публикации: <причина>».
- Цели Метрики: `club_page_published`, `club_page_join`.
- e2e с глобальным флагом — `mode: "serial"`, только проект desktop, флаг сбрасывается в `afterAll`.
- Проверки: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build && npx playwright test <spec>`.

## Review Focus

- Название клуба целиком из символов вне кириллицы/латиницы (эмодзи, «№1») → slug `club`, второй такой в городе → `club-2`; задача 1, тест `slugCandidates`.
- Город, записанный по-разному («Санкт-Петербург», «санкт петербург») → один `citySlug`, одна страница города; задача 1, тест `slugify`.
- Флаг `clubs` выключен kill switch'ем (`enabled = false`) после публикации → гостю 404 и нет в `sitemap.xml`; задача 3, e2e сценарий 2 (выключить в конце).
- Участник с `hideWeights`/без `shareActivity` → его тренировки всё равно входят в агрегаты (ников нет), но при < 3 участниках цифр нет; задача 3, unit `visibleClubStats`.
- Флаг `clubs` не на 100 % → лендинг байт-в-байт прежний по содержанию: ни раздела, ни пункта меню, ни вопросов в FAQ и его JSON-LD; задача 5, e2e сценарий 7.
- Модератор переименовал опубликованный клуб → адрес страницы прежний; задача 4, e2e сценарий 6 (проверить, что `slug` не изменился после `updateClubAction`).

---

### Task 1: Схема и чистые правила

**Files:**
- Modify: `prisma/schema.prisma` (model `Club`)
- Create: `prisma/migrations/<ts>_club_public_page/migration.sql` (через `npx prisma migrate dev --name club_public_page`; `updatedAt` — `DEFAULT CURRENT_TIMESTAMP` для существующих строк; не удалять частичные индексы, которые Prisma не видит)
- Create: `lib/club/public.ts`, `lib/club/public.test.ts`
- Modify: `e2e/db.ts` (хелперы)

**Interfaces — Produces:**
- `Club.about String @default("")`, `slug String?`, `citySlug String?`, `publishedAt DateTime?`, `updatedAt DateTime @updatedAt`; `@@unique([citySlug, slug])`, `@@index([publishedAt, citySlug])`.
- `CLUB_ABOUT_MIN`, `CLUB_ABOUT_MAX`, `MIN_MEMBERS_FOR_STATS`, `UNPUBLISH_REASON_MAX = 200`.
- `slugify(text: string, fallback?: "club" | "city"): string`
- `slugCandidates(name: string, address: string): string[]`
- `canPublish(c: { status: ClubStatus; about: string }): string | null`
- `aboutSchema: z.ZodString` (trim, max 1000)
- `type ClubPublicStats = { members: number; week: number; month: number; monthSec: number }`
- `visibleClubStats(s: ClubPublicStats): { code: "members" | "week" | "month" | "hours"; value: string; label: string }[]`
- `clubPageAccess(a: { status: ClubStatus; publishedAt: Date | null; slug: string | null; flagFull: boolean; canManage: boolean }): "open" | "preview" | "none"` (`canManage` — админ клуба или приложения)
- `clubPath(citySlug: string, slug: string): string`, `cityPath(citySlug: string): string`
- e2e: `publishClub(clubId: string, o?: { about?: string; slug?: string; citySlug?: string }): Promise<{ path: string }>`, `clubSlug(clubId: string): Promise<{ slug: string | null; citySlug: string | null; publishedAt: Date | null }>`

- [ ] **Step 1: Тесты `lib/club/public.test.ts`**

```ts
expect(slugify("Железный Зал")).toBe("zheleznyy-zal");
expect(slugify("Ёлки-Палки  Gym!")).toBe("elki-palki-gym");
expect(slugify("Подъезд Объём Щука Хаус Цех")).toBe("podezd-obem-shchuka-khaus-tsekh");
expect(slugify("Санкт-Петербург")).toBe(slugify("санкт  петербург"));
expect(slugify("🔥№1")).toBe("1");
expect(slugify("🔥")).toBe("club");
expect(slugify("🔥", "city")).toBe("city");
expect(slugify("а".repeat(80)).length).toBe(60);
expect(slugify("а".repeat(59) + " б")).not.toMatch(/-$/);

const c = slugCandidates("Iron Gym", "ул. Пушкина, д. 5");
expect(c.slice(0, 3)).toEqual(["iron-gym", "iron-gym-pushkina", "iron-gym-2"]);
expect(c.at(-1)).toBe("iron-gym-20");
expect(slugCandidates("Iron Gym", "Пушкина 5")[1]).toBe("iron-gym-pushkina-5");
expect(new Set(slugCandidates("🔥", "")).size).toBe(slugCandidates("🔥", "").length); // без дублей при пустой улице

expect(canPublish({ status: "PENDING", about: "x".repeat(60) })).toBe("Клуб ещё на проверке");
expect(canPublish({ status: "HIDDEN", about: "x".repeat(60) })).toBe("Клуб скрыт модератором");
expect(canPublish({ status: "REJECTED", about: "x".repeat(60) })).toBe("Заявка отклонена");
expect(canPublish({ status: "APPROVED", about: "  " + "x".repeat(49) + "  " })).toBe("Напишите о зале хотя бы 50 символов");
expect(canPublish({ status: "APPROVED", about: "x".repeat(50) })).toBeNull();

expect(visibleClubStats({ members: 2, week: 5, month: 9, monthSec: 36000 }).map((s) => s.code)).toEqual(["members"]);
expect(visibleClubStats({ members: 3, week: 5, month: 9, monthSec: 5400 }).map((s) => [s.code, s.value]))
  .toEqual([["members", "3"], ["week", "5"], ["month", "9"], ["hours", "2"]]); // 1,5 ч → 2

const base = { status: "APPROVED" as const, publishedAt: new Date(), slug: "a", flagFull: true, canManage: false };
expect(clubPageAccess(base)).toBe("open");
expect(clubPageAccess({ ...base, flagFull: false })).toBe("none");
expect(clubPageAccess({ ...base, flagFull: false, canManage: true })).toBe("preview");
expect(clubPageAccess({ ...base, publishedAt: null, canManage: true })).toBe("preview");
expect(clubPageAccess({ ...base, slug: null, publishedAt: null, canManage: true })).toBe("none");
expect(clubPageAccess({ ...base, status: "HIDDEN", canManage: true })).toBe("none");
expect(clubPath("kazan", "iron-gym")).toBe("/gym/kazan/iron-gym");
expect(cityPath("kazan")).toBe("/gym/kazan");
```

Подписи (`label`) у `visibleClubStats`: «участников» / «тренировок за неделю» / «тренировок за 30 дней» / «часов в зале за 30 дней» — с `plural` из `lib/format`.

- [ ] **Step 2:** `npx vitest run lib/club/public.test.ts` — FAIL (модуля нет).
- [ ] **Step 3:** Схема + миграция (`npx prisma migrate dev --name club_public_page`), затем `lib/club/public.ts`. Улица в `slugCandidates` — первая часть адреса до запятой без префиксов `ул.`, `улица`, `пр.`, `пр-т`, `проспект`, `д.` (регистр не важен); пустая улица — кандидат пропускается.
- [ ] **Step 4:** тест PASS; `npm run typecheck`.
- [ ] **Step 5:** хелперы `publishClub`/`clubSlug` в `e2e/db.ts` (SQL: `about` по умолчанию — 60 символов текста, slug по умолчанию из названия транслитом не нужен — передавать явно или `e2e-<6 случайных>`, `citySlug` по умолчанию `testograd`).
- [ ] **Step 6: Commit** `feat(club-page): schema and pure rules`

### Task 2: SEO-хелперы и sitemap

**Files:**
- Modify: `lib/seo.ts`, `lib/seo.test.ts`, `app/sitemap.ts`, `app/(marketing)/trainer/[nick]/page.tsx` (переименование)

**Interfaces — Consumes:** `clubPath`, `cityPath` (Task 1). **Produces:**
- `shortDescription(text: string, max = 160): string` (бывшая `coachDescription`, поведение то же)
- `clubJsonLd(c: { name: string; url: string; city: string; address: string; description: string }): object` — `@type: "ExerciseGym"`, `address: { "@type": "PostalAddress", addressLocality, streetAddress, addressCountry: "RU" }`, `description` — только если не пусто
- `cityJsonLd(c: { city: string; urls: string[] }): object` — `@type: "ItemList"`, `itemListElement: [{ "@type": "ListItem", position: i + 1, url }]`
- `sitemapEntries(origin, builtAt, coaches, clubs: { path: string; updatedAt: Date }[] = [], cities: { path: string; updatedAt: Date }[] = [])` — клубы `priority 0.6`, города `0.5`, `changeFrequency: "weekly"`

- [ ] **Step 1: Тесты** в `lib/seo.test.ts`: `shortDescription` (короткий как есть, длинный режется по слову с «…», переводы строк → пробел); `jsonLd(clubJsonLd({ name: "</script>Зал", … }))` не содержит `</script>`; `clubJsonLd(...).address` равен `{ "@type": "PostalAddress", addressLocality: "Казань", streetAddress: "ул. Пушкина, 5", addressCountry: "RU" }`; у пустого описания нет ключа `description`; `cityJsonLd` — позиции 1…n; `sitemapEntries(..., [{ path: "/gym/kazan/iron-gym", updatedAt }], [{ path: "/gym/kazan", updatedAt }])` содержит оба абсолютных url с их `lastModified`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** реализовать; переименовать вызов у тренера.
- [ ] **Step 4:** `app/sitemap.ts`: при `await isEnabled("clubs", null)` — клубы `status: "APPROVED", publishedAt: { not: null }, slug: { not: null }` (`select slug, citySlug, updatedAt`); города — группировка по `citySlug` с максимальным `updatedAt` (в JS). Без флага — пустые массивы.
- [ ] **Step 5:** `npm test -- lib/seo.test.ts` PASS, `npm run typecheck`.
- [ ] **Step 6: Commit** `feat(club-page): seo helpers and sitemap`

### Task 3: Запросы и публичные страницы

**Files:**
- Create: `lib/club/public-queries.ts`
- Create: `app/(marketing)/gym/[city]/[slug]/page.tsx`, `app/(marketing)/gym/[city]/[slug]/join/route.ts`, `app/(marketing)/gym/[city]/page.tsx`
- Create: `components/club/public-club-tasks.tsx`
- Modify: `proxy.ts` (`PUBLIC_PREFIXES` + `"/gym/"`)
- Create: `e2e/club-public-page.spec.ts` (сценарии 2, 3, 5)

**Interfaces — Consumes:** Task 1, Task 2, `getClubTasks(clubId, viewerId, false, "UTC")`, `isEnabled`, `getCurrentUser`, `queueGoal`. **Produces:**
- `type PublicClub = { id: string; name: string; city: string; address: string; about: string; code: string; status: ClubStatus; adminId: string; slug: string; citySlug: string; publishedAt: Date | null; updatedAt: Date }`
- `getPublicClub(citySlug: string, slug: string): Promise<PublicClub | null>` (обёрнута в `cache`)
- `resolveClubPage(citySlug, slug, viewer: CurrentUser | null): Promise<{ club: PublicClub; access: "open" | "preview" } | null>` — `clubPageAccess` с `flagFull = await isEnabled("clubs", null)`, `canManage = viewer?.id === club.adminId || viewer?.isAdmin`; `"none"` → null
- `getClubPublicStats(clubId: string, now?: Date): Promise<ClubPublicStats>` — один SQL: участники; `COMPLETED` тренировки участников с `finishedAt >= joinedAt` и `>= now - 7d` / `>= now - 30d`; `SUM(durationSec)` за 30 дней
- `getCityClubs(citySlug: string): Promise<{ city: string; clubs: { name: string; address: string; path: string; members: number; week: number | null }[] } | null>` — только при `isEnabled("clubs", null)`, открытые клубы; `week` — null при < 3 участниках; сортировка участники ↓, название ↑; город — `city` первого; пусто → null

- [ ] **Step 1: e2e** `e2e/club-public-page.spec.ts` — `test.describe.configure({ mode: "serial" })`, `beforeAll` skip не-desktop, `afterAll` `resetFlag("clubs")`. Сценарии:
  - (2) `setFlag("clubs", { enabled: true, percent: 100 })`; клуб `createClub` (город «Казань», название уникальное), `publishClub`, 2 участника с `seedXpWorkout` → гость: `h1` с названием, адрес, «О зале», задание `createClubTask(CLUB)` с `0 / 10`; нет текста «тренировок за неделю»; третий участник → `page.reload()` → есть; `script[type="application/ld+json"]` содержит `"ExerciseGym"`; `/gym/<citySlug>` — карточка клуба; `request.get("/sitemap.xml")` содержит путь клуба; ни одного ника участника на странице. Затем `setFlag("clubs", { enabled: false, percent: 100 })` → гостю 404, sitemap без клуба; вернуть 100 %.
  - (3) гость → «Вступить» → `/register?next=…` → `registerUser`-форма с `next` → экран согласия → «Вступить» → `clubOf`/членство в БД.
  - (5) `setClubStatus(club, "HIDDEN")` → гостю 404; админ клуба (вошёл) → 404.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/club-public-page.spec.ts` — FAIL (404 на `/gym/...`).
- [ ] **Step 3:** `lib/club/public-queries.ts`.
- [ ] **Step 4:** страница клуба — по образцу `app/(marketing)/trainer/[nick]/page.tsx` (`connection()`, `generateMetadata` ничего не раскрывает при `null`, `robots: { index: false, follow: false }` при `preview`; плашка «Страница пока не видна в поиске»; действие: участник этого клуба (`db.clubMember` по `userId`) — «Вы в этом клубе» + «Открыть клуб», админ клуба — «Редактировать» → `/clubs/<id>/manage#public`, иначе «Вступить» `prefetch={false}`; «О зале» — `whitespace-pre-line`; цифры — `visibleClubStats`; `PublicClubTasks` — только `active`; 3 шага из спеки; JSON-LD `clubJsonLd`). Страница города — `cityJsonLd`, `title` «Тренажёрные залы — <Город> · Hero Fit». `join/route.ts` — как `trainer/[nick]/join`, только `access === "open"`, цель `club_page_join`, `/clubs/join/<code>`.
- [ ] **Step 5:** `proxy.ts` — `/gym/` в `PUBLIC_PREFIXES` (обновить комментарий).
- [ ] **Step 6:** build + e2e PASS; typecheck, lint.
- [ ] **Step 7: Commit** `feat(club-page): public club and city pages`

### Task 4: Редактор и публикация

**Files:**
- Modify: `lib/club/actions.ts`
- Create: `components/club/manage-public-page.tsx`
- Modify: `app/(app)/clubs/[id]/manage/page.tsx`, `lib/club/queries.ts` (`getClubManage` отдаёт `about`, `slug`, `citySlug`, `publishedAt`)
- Modify: `e2e/club-public-page.spec.ts` (сценарии 1, 6)

**Interfaces — Consumes:** Task 1 (`canPublish`, `aboutSchema`, `slugify`, `slugCandidates`, `clubPath`). **Produces:**
- `saveClubAboutAction(clubId: string, about: string): Promise<Result>`
- `publishClubPageAction(clubId: string): Promise<Result & { path?: string }>`
- `unpublishClubPageAction(clubId: string): Promise<Result>`

- [ ] **Step 1: e2e:**
  - (1) флаг списком (`setFlag("clubs", { enabled: true, percent: 0, logins: [admin] })`): админ на `/clubs/<id>/manage` пишет «О зале» 30 символов → «Сохранить» → кнопка «Опубликовать» disabled, видна «Напишите о зале хотя бы 50 символов»; дописывает → «Опубликовать» → видна ссылка и «Страница появится в поиске, когда клубы откроются для всех»; открывает ссылку — плашка «Страница пока не видна в поиске», `meta[name="robots"]` содержит `noindex`; гость → 404.
  - (6) второй клуб с тем же названием и городом → публикация → адрес содержит улицу; модератор переименовывает первый (`updateClubAction` через UI `/admin/clubs` или SQL-хелпер) → `clubSlug` прежний.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** действия — доступ как у `updateClubAction`; `publishClubPageAction`: перебор `slugCandidates` с `citySlug = slugify(city, "city")`, каждая попытка — `db.club.update` в `try`, `P2002` → следующий; `queueGoal("club_page_published")`; `revalidatePath` manage и страницы. Пустое/короткое `about` у опубликованной — «Чтобы убрать текст, снимите страницу с публикации».
- [ ] **Step 4:** `ManagePublicPage` (`id="public"`; textarea со счётчиком `N / 1000`; причина `canPublish` под неактивной кнопкой; «Скопировать» адрес; строка про поиск — проп `flagFull` со страницы manage). Показывать на manage при любом статусе (причина объяснит).
- [ ] **Step 5:** build + e2e PASS; typecheck, lint.
- [ ] **Step 6: Commit** `feat(club-page): editor and publishing`

### Task 5: Клубы на лендинге

**Files:**
- Create: `components/marketing/club-infographics.tsx`
- Modify: `app/(marketing)/page.tsx` (раздел `#clubs`, `FREE_PLAN`, FAQ JSON-LD), `components/marketing/faq.tsx` (`clubs?: true` у вопросов, `Faq({ clubs })`), `components/marketing/site-header.tsx`, `components/marketing/site-footer.tsx` (проп `clubs: boolean`), `app/(marketing)/layout.tsx`
- Modify: `lib/club/public-queries.ts`
- Modify: `e2e/club-public-page.spec.ts` (сценарий 7), при необходимости — существующие проверки лендинга

**Interfaces — Consumes:** `cityPath` (Task 1), открытые клубы (Task 3). **Produces:**
- `getPopularCities(limit: number): Promise<{ city: string; path: string }[]>` — только при `isEnabled("clubs", null)`, открытые клубы, по числу клубов ↓, затем участников ↓
- `faqFor(clubs: boolean): { q: string; a: string }[]` в `components/marketing/faq.tsx` — общий для `<Faq>` и JSON-LD

- [ ] **Step 1: e2e (7)** — в том же serial-файле: `resetFlag("clubs")` → `/`: нет `#clubs`, нет ссылки «Клубы» в шапке, нет вопроса «Как добавить свой зал?»; `setFlag(100 %)` + опубликованный клуб в «Казани» → есть раздел, пункт «Клубы», вопрос (и в `application/ld+json`), ссылка на `/gym/<citySlug>` в «Популярных городах»; «Найти свой зал» гостем → URL `/register?next=%2Fclubs`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** реализовать по спеке (раздел «Лендинг»): тексты пунктов, кнопок и вопросов — дословно оттуда; инфографика — по образцу `RaidInfographic` (без бесконечных анимаций).
- [ ] **Step 4:** build + e2e PASS (`e2e/club-public-page.spec.ts` и проверки лендинга, если есть — `grep -l "#guilds\|Гильдии" e2e`); typecheck, lint.
- [ ] **Step 5: Commit** `feat(club-page): clubs on the landing`

### Task 6: Модерация, «Что нового», документация

**Files:**
- Modify: `lib/club/actions.ts` (или где `reviewClubAction`), `components/club/review-card.tsx`, `lib/club/queries.ts` (`getClubsForReview` — `about`, `slug`, `citySlug`, `publishedAt`)
- Modify: `lib/changelog/releases.ts`, `CLAUDE.md`
- Modify: `e2e/club-public-page.spec.ts` (сценарий 4)

**Interfaces — Produces:** `unpublishClubByModeratorAction(clubId: string, reason: string): Promise<Result>` — `requireAdmin`, причина 1…200, условный `updateMany({ where: { id, publishedAt: { not: null } }, data: { publishedAt: null } })`, при `count = 1` — `notify` админу клуба `SOCIAL`: заголовок «Страница клуба «<название>» снята с публикации: <причина>», url `/clubs/<id>/manage#public`.

- [ ] **Step 1: e2e (4):** `makeAdmin(moderator)`; в `/admin/clubs?tab=approved&q=<название>` у карточки видно «О зале» и ссылку; «Снять с публикации» → причина → подтвердить → гостю 404; у админа клуба уведомление с причиной (`notificationBodies`/заголовки); админ клуба снова публикует → тот же путь (`clubSlug`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** действие + `ReviewCard`: «О зале» `line-clamp-3`, ссылка на страницу при `publishedAt`, кнопка с диалогом причины.
- [ ] **Step 4:** `releases.ts`: в пункте клубов после «…прямо на главной» — «, и страница зала, которую можно найти в поиске». `CLAUDE.md` — абзац «Публичная страница клуба» в разделе клубов (поля, `/gym/…`, видимость `clubPageAccess`, редактор `#public`, модерация, лендинг `#clubs` под флагом, `faqFor`, хелперы `publishClub`/`clubSlug`, спек serial/desktop); в абзаце «Лендинг и SEO» — раздел `#clubs`.
- [ ] **Step 5:** полный прогон: `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test e2e/club-public-page.spec.ts e2e/clubs*.spec.ts e2e/club-*.spec.ts e2e/coach-page.spec.ts --workers=8` — PASS.
- [ ] **Step 6: Commit** `feat(club-page): moderation, changelog and notes`; merge `--no-ff` в `release/2026-11-assistant`, удалить ветку.
