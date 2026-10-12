# Мои данные: выгрузка и удаление аккаунта — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь сам скачивает свои данные (JSON и CSV тренировок) и сразу безвозвратно удаляет аккаунт из `/settings`; гильдия и клуб передаются автоматически.

**Architecture:** Чистые правила (`lib/account/rules.ts`, `export.ts`, `csv.ts`), запросы выгрузки (`export-queries.ts`), транзакция удаления (`delete.ts`) и server action (`actions.ts`); route handler выгрузки `app/(app)/account/export/[format]/route.ts`; блоки «Мои данные» и «Удаление аккаунта» в `/settings`.

**Tech Stack:** Next.js 16, Prisma 7, zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-account-data-design.md`

## Global Constraints

- Ветка `feat/account-data` от `release/2026-11-polish`, в конце merge `--no-ff` в релизную; без фича-флага.
- Тексты дословно из спеки: «Удалённый игрок», «Неверный пароль», «Логин не совпадает», «Слишком много попыток — попробуйте через N мин», «Гильдия «X» перейдёт к Y», «Гильдия «X» будет удалена — в ней никого», «Клуб «X» перейдёт к Y», «Клуб «X» будет удалён — в нём никого», «Заявка на клуб «X» будет удалена», «Ты теперь глава гильдии «X»», «Ты теперь админ клуба «X»», «Аккаунт удалён. Спасибо, что тренировались с Hero Fit».
- CSV: BOM, `;`, `\r\n`, заголовок `Дата;Тренировка;Упражнение;Подход;Разминка;Вес, кг;Повторы;RIR`.
- В выгрузке никогда: `passwordHash`, сессии/токены, push-подписки, `telegramId`/`telegramChatId`, `LoginThrottle`, id и логины других.
- Цель Метрики `account_deleted` — в `GOALS` (`lib/analytics/goals.ts`).
- Проверки: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build && npx playwright test e2e/account-data.spec.ts --workers=8`.

## Review Focus

- Удаляющийся — единственный участник клуба, где он админ, но в клубе есть другие участники, а сам он не участник → наследник — самый давний участник (не «нет участников»); задача 1, тест `deletionPreview` с `heir`.
- Двое удаляют/выходят одновременно из одной гильдии (глава удаляется, наследник в этот момент выходит) → гильдия не остаётся с главой, которого нет в ней; задача 4, наследник выбирается под `FOR UPDATE` строки гильдии и среди текущих `GuildMember`.
- Учётка без ника → снимки друзей не трогаются (нечего искать), удаление не падает; задача 4, e2e 2 (новый пользователь без ника).
- Название своего упражнения `=HYPERLINK(...)` в CSV → ячейка с апострофом; задача 2, тест `toWorkoutsCsv`.
- Пароль неверный много раз → блокировка тем же счётчиком входа, аккаунт цел; задача 4, e2e 2 (одна неудача + проверка, что `recordLoginFailure` вызывается — через повтор 5 раз и сообщение «Слишком много попыток»).

---

### Task 1: Правила удаления

**Files:** Create `lib/account/rules.ts`, `lib/account/rules.test.ts`

**Interfaces — Produces:**
- `DELETED_PLAYER = "Удалённый игрок"`
- `type DeletionInput = { guild: { name: string; heir: string | null } | null; clubs: { name: string; status: ClubStatus; heir: string | null }[] }`
- `deletionPreview(input: DeletionInput): string[]`
- `scrubRecapLeague(data: RecapData, nickname: string): { data: RecapData; changed: boolean }` — сравнение через `nicknameKey`

- [ ] **Step 1: Тесты** — `deletionPreview({ guild: { name: "Сталь", heir: "Маша" }, clubs: [] })` → `["Гильдия «Сталь» перейдёт к Маша"]`; без наследника → `«…» будет удалена — в ней никого`; клубы `APPROVED`/`HIDDEN` с наследником → «Клуб «X» перейдёт к Y», без → «Клуб «X» будет удалён — в нём никого», `PENDING`/`REJECTED` → «Заявка на клуб «X» будет удалена»; пусто → `[]`. `scrubRecapLeague`: лига `rows` с `{ nickname: "Demo_Hero" }` и ник `"demo_hero"` → строка с `DELETED_PLAYER`, остальные строки те же, `changed: true`; лига-процентиль (`{ percentile, xp }`) и снимок без `league` — тот же объект, `changed: false`.
- [ ] **Step 2:** `npx vitest run lib/account/rules.test.ts` — FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(account): deletion rules`

### Task 2: Выгрузка — чистые построители

**Files:** Create `lib/account/csv.ts`, `lib/account/csv.test.ts`, `lib/account/export.ts`, `lib/account/export.test.ts`

**Interfaces — Produces:**
- `type CsvSet = { finishedAt: Date; workout: string; exercise: string; index: number; warmup: boolean; weight: number | null; reps: number | null; rir: number | null }`
- `toWorkoutsCsv(rows: CsvSet[], timeZone: string): string`
- `type ExportRaw` — плоские выборки из БД (тип выводится из `getExportData`, задача 3, через `Awaited<ReturnType<…>>`; в задаче 2 — объявить вручную минимальную форму, нужную `buildExport`: `user` (со всеми полями профиля + `passwordHash`, `telegramId`, `telegramChatId` — чтобы тест доказал, что они вырезаются), массивы разделов спеки)
- `buildExport(raw: ExportRaw, exportedAt: Date): ExportV1` — ключи верхнего уровня ровно из спеки, `version: 1`

- [ ] **Step 1: Тесты CSV** — первый символ `﻿`; первая строка — заголовок из Global Constraints; разделитель строк `\r\n`; подход `{ weight: 62.5, reps: 8, rir: null, warmup: false }` → `…;нет;62,5;8;`; название `Жим "узкий"; 2` → `"Жим ""узкий""; 2"`; название с `\n` → в кавычках; `=HYPERLINK("x")` → `'=HYPERLINK(""x"")` в кавычках; дата `2026-10-12T21:30:00Z` при `Europe/Moscow` → `2026-10-13 00:30`.
- [ ] **Step 2: Тесты export** — `JSON.stringify(buildExport(raw))` не содержит `passwordHash`, значения хэша, `telegramId`, `telegramChatId`, id друга, логина друга; `profile.telegramLinked === true` при `telegramChatId`; `friends[0]` — `{ nickname, status, since }` без других ключей; `Object.keys` верхнего уровня = список спеки.
- [ ] **Step 3:** FAIL → реализовать → PASS (`npx vitest run lib/account`).
- [ ] **Step 4: Commit** `feat(account): export builders`

### Task 3: Выгрузка — запросы, route handler, блок «Мои данные»

**Files:**
- Create: `lib/account/export-queries.ts`, `app/(app)/account/export/[format]/route.ts`, `components/account/my-data-card.tsx`, `e2e/account-data.spec.ts`
- Modify: `app/(app)/settings/page.tsx` (перед `RestartTourButton`: `<MyDataCard />`)

**Interfaces — Consumes:** Task 2. **Produces:** `getExportData(userId: string): Promise<ExportRaw>`; `getCsvSets(userId: string): Promise<CsvSet[]>` (завершённые тренировки, подходы с `completedAt`, порядок — `finishedAt`, упражнение, номер).

- [ ] **Step 1: e2e (1)** — `registerUser` → `quickWorkout(page, "Жим штанги лёжа", [{ weight: "62,5", reps: "8" }])` → `/settings` → блок `region` «Мои данные»: `page.waitForEvent("download")` по «Все данные (JSON)» → файл: `JSON.parse` содержит `workouts[0]` с упражнением «Жим штанги лёжа», текст без `passwordHash`; имя файла `hero-fit-<логин>-YYYY-MM-DD.json`. «Тренировки (CSV)» → начинается с `﻿` + заголовок, содержит `Жим штанги лёжа` и `62,5`. `request.get("/account/export/xml")` вошедшим → 404.
- [ ] **Step 2:** `npm run build && npx playwright test e2e/account-data.spec.ts` — FAIL.
- [ ] **Step 3:** запросы (один `Promise.all`; другие пользователи — `select: { nickname: true }`), route (`requireUser`, `dayKey` для даты в имени, заголовки из спеки), `MyDataCard` (`<section id="data" aria-label="Мои данные">`, две ссылки `<a href download>`, текст из спеки).
- [ ] **Step 4:** PASS; typecheck, lint.
- [ ] **Step 5: Commit** `feat(account): data export`

### Task 4: Удаление аккаунта

**Files:**
- Create: `lib/account/delete.ts`, `lib/account/actions.ts`, `components/account/delete-account-dialog.tsx`
- Modify: `app/(app)/settings/page.tsx` (последним: блок «Удаление аккаунта» `id="delete"` с диалогом; превью считает страница), `app/(marketing)/page.tsx` (плашка при `searchParams.deleted === "1"`), `lib/analytics/goals.ts` (`account_deleted`), `e2e/db.ts`, `e2e/account-data.spec.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
- `getDeletionInput(userId: string): Promise<DeletionInput>` (в `delete.ts`)
- `deleteAccount(tx: Prisma.TransactionClient, userId: string): Promise<void>` — шаги транзакции из спеки по порядку; наследник — `ORDER BY "joinedAt" ASC` среди текущих участников кроме удаляемого, после `FOR UPDATE` строки гильдии/клуба
- `deleteAccountAction(input: { password?: string; confirm?: string }): Promise<{ ok: false; error: string; field?: "password" | "confirm" } | never>` — при успехе `redirect("/?deleted=1")`
- e2e: `userExists(login: string): Promise<boolean>`, `recapLeagueNicks(login: string): Promise<string[]>`

- [ ] **Step 1: e2e** в `e2e/account-data.spec.ts`:
  - (2) неверный пароль → «Неверный пароль», `userExists` true; 5 неверных подряд → «Слишком много попыток»; новый пользователь (без ника) верным паролем → URL `/?deleted=1`, плашка «Аккаунт удалён. Спасибо, что тренировались с Hero Fit», `userExists` false, вход тем же логином на `/login` → «Неверный логин или пароль».
  - (3) глава гильдии (`setNickname` + гильдия через `e2e/guild-helpers.ts`) с участником: в диалоге «Гильдия «X» перейдёт к <ник>» → удаление → у участника `/guild` показывает «глава» у себя, уведомление «Ты теперь глава гильдии «X»» (`notificationBodies`/заголовки); глава один → гильдии нет (`guildOf`).
  - (4) админ клуба (`addFlagUser("clubs")`, `createClub`, участник `joinClub`) → админ клуба = участник (`clubAdminLogin`), уведомление «Ты теперь админ клуба «X»»; клуб `PENDING` того же админа удалён.
  - (5) друг: `seedRecapWeek` другу с лигой, где строка с ником удаляемого (через SQL-вставку снимка — по образцу `seedDemoRecaps`/хелперов итогов) → после удаления `recapLeagueNicks(друг)` содержит «Удалённый игрок» и не содержит ник.
  - (6) `createTelegramUser` + вход через `mockTelegram` (как в `e2e/telegram-mini-app*.spec.ts`) → в диалоге поле «Логин», неверный логин → «Логин не совпадает», верный → удалено.
- [ ] **Step 2:** build + e2e — FAIL.
- [ ] **Step 3:** `delete.ts`, `actions.ts` (порядок проверок: подтверждение → транзакция → cookies → цель → redirect; блокировка входа — `throttleKeys(user.login, x-real-ip)`, сообщение «Слишком много попыток — попробуйте через N мин» через `minutesLeft` из `throttle-rules`), диалог (`AlertDialog` Base UI, поле зависит от `hasPassword`), блок в `/settings`, плашка на лендинге, цель.
- [ ] **Step 4:** PASS (`--workers=8`: сценарии с двумя игроками); typecheck, lint, `npm test`.
- [ ] **Step 5: Commit** `feat(account): delete account`

### Task 5: Тексты, документация, прогон

**Files:** Modify `app/(marketing)/privacy/page.tsx`, `CLAUDE.md`, `lib/changelog/releases.ts`

- [ ] **Step 1:** `/privacy` — раздел о правах по спеке (скачать — «Настройки → Мои данные», удалить — «Настройки → Удаление аккаунта» сразу и безвозвратно, что переходит и остаётся у других, письмо — для остальных запросов, срок 30 дней — для запросов по письму).
- [ ] **Step 2:** `CLAUDE.md` — заменить «Удаления аккаунта в приложении нет — по письму на `LEGAL.contactEmail`» абзацем про фичу (файлы, правила, e2e). `releases.ts` — новая запись релиза `2026-11-polish` сверху (id `2026-11-polish`, дата — сегодня, заголовок «Порядок и ваши данные», пункт «Свои данные можно скачать, а аккаунт — удалить прямо в настройках» с `href: "/settings"`, раздел `improved`/`fixed` — 2–4 заметных исправления релиза человеческим языком); тест данных changelog — PASS.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test e2e/account-data.spec.ts e2e/guilds.spec.ts e2e/clubs.spec.ts e2e/settings*.spec.ts e2e/landing.spec.ts --workers=8` — PASS.
- [ ] **Step 4: Commit** `docs(account): privacy, notes and changelog`; merge `--no-ff` в `release/2026-11-polish`, удалить ветку.
