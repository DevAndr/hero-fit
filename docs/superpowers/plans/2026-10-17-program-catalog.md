# Каталог программ тренеров — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тренер публикует программу в каталог; любой вошедший запускает её самостоятельно (назначение без тренера с автопрогрессией), автор видит только «занимаются N»; админ может снять программу.

**Architecture:** публикация — поля `CoachProgram`; запуск — `ProgramAssignment` с `coachId = null` и `catalogProgramId` через общий с тренером `createAssignment` (снимок правила, базы, серии плана) на копиях шаблонов. Всё под флагом `program_catalog` (`isEnabled`, `lib/flags/server.ts`).

**Tech Stack:** Next.js 16 (server components/actions), Prisma 7, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-program-catalog-design.md`

## Global Constraints

- Только русский; тексты — дословно из спеки.
- Флаг `program_catalog` (`lib/flags/registry.ts`, `expires: "2027-04-30"`, описание «Каталог программ тренеров: публикация и самостоятельный запуск»): без флага — `/programs*` и `/admin/programs` 404, переключателя публикации и пункта меню нет.
- Тренерские запросы (клиенты, итоги недели, сигналы, `programBadges`) не должны видеть назначения с `coachId = null` — не менять их фильтры по `coachId`.
- Миграция: только новые поля/индексы `CoachProgram` и `ProgramAssignment`; в SQL нет `DROP INDEX` для `CoachLink_active_client`, `CoachComment_workout_general`, `CoachSignal_open`.
- Новая связь → удаление аккаунта и «Мои данные» (`lib/account/*`, `e2e/account-data.spec.ts`).
- e2e с глобальным флагом — `mode: "serial"` и только desktop; два контекста — `--workers=8`; даты — `E2E_TZ`/`localAt`.
- Ссылка-кнопка — `<Link className={buttonVariants()}>`; цвета — семантические токены; числовые поля ввода (базы) — `selectOnFocus`.

## Review Focus

1. Пользователь с программой от тренера жмёт «Начать» (в т.ч. двумя вкладками) — запрет, ничего не создано; две вкладки «Начать» каталожную — одно активное назначение (строка пользователя `FOR UPDATE`, как `assignProgramAction`) — Task 3.
2. Автор меняет/удаляет шаблон дня после запуска — у занимающегося копия не меняется — Task 3 (e2e 3).
3. Свои упражнения автора в скопированных шаблонах: занимающийся видит их в тренировке; автор удалил аккаунт — шаблоны занимающегося работают (rehome) — Task 5 (`account-data`).
4. Программа снята (автором/админом) или автор потерял `isCoach` — страница программы 404 для других, «Начать» по прямому вызову действия — ошибка «Программа недоступна» — Task 3/4.
5. Каталожное назначение не попадает в список клиентов/итоги недели/сигналы автора — Task 3 (e2e 2).

---

### Task 1: Модель, флаг, чистые правила

**Files:**
- Modify: `prisma/schema.prisma` (поля и индексы из спеки, раздел «Модель данных»), migration `program_catalog` (`--create-only` → проверить SQL → `migrate dev`; правки схемы точечно, без `prisma format`)
- Modify: `lib/flags/registry.ts` (флаг)
- Create: `lib/catalog/rules.ts`, `lib/catalog/rules.test.ts`

**Interfaces — Produces (`lib/catalog/rules.ts`, без `server-only`):**
```ts
export const CATALOG_DESCRIPTION_MAX = 300;
export const CATALOG_PAGE = 20;
export function catalogRuleText(rule: { stepKind: "PERCENT" | "KG"; stepValue: number; deloadEvery: number | null }): string;
export function daysPerWeek(days: { weekday: number }[]): number; // уникальные дни недели
export type PublishBlock = "not-coach" | "no-nickname" | "no-days" | "no-description" | "hidden" | null;
export function canPublish(p: { days: number; description: string | null; hiddenAt: Date | null }, coach: { isCoach: boolean; nickname: string | null }): PublishBlock;
export const PUBLISH_BLOCK_TEXT: Record<Exclude<PublishBlock, null>, string>;
export function startBlock(active: { coachId: string | null; catalogProgramId: string | null } | null): null | "coach" | "replace";
```
Тексты: `catalogRuleText` — «+2,5 % в неделю» / «+2,5 кг в неделю» (число через `toLocaleString("ru-RU")`), с разгрузкой — `… · разгрузка каждую 4-ю неделю`. `PUBLISH_BLOCK_TEXT`: not-coach «Публиковать может только тренер», no-nickname «Укажите ник в настройках», no-days «Добавьте хотя бы один день», no-description «Добавьте описание для каталога», hidden «Программа снята администратором». `startBlock`: активное с `coachId` → `"coach"`; активное без `coachId` (каталожное или «тренер удалён») → `"replace"`; нет → `null`.

- [ ] **Step 1:** тесты `rules.test.ts`: `catalogRuleText` (`{PERCENT, 2.5, null}` → «+2,5 % в неделю»; `{KG, 5, 4}` → «+5 кг в неделю · разгрузка каждую 4-ю неделю»); `daysPerWeek([{1},{3},{3}])` → 2; `canPublish` — по одному кейсу на каждый блок и `null`; описание из пробелов = нет описания; `startBlock` — три варианта.
- [ ] **Step 2:** `npx vitest run lib/catalog/rules.test.ts` → FAIL.
- [ ] **Step 3:** схема, миграция, `npx prisma generate`, флаг, реализация.
- [ ] **Step 4:** тест → PASS; `npm run typecheck && npm run lint && npm test` → чисто (тест реестра флагов проходит).
- [ ] **Step 5:** коммит `feat(catalog): model, flag and pure rules`.

### Task 2: Публикация, каталог и страница программы

**Files:**
- Create: `lib/catalog/queries.ts`, `lib/catalog/actions.ts` (здесь — только `publishProgramAction`)
- Modify: `components/coach/program-editor.tsx` (переключатель «Опубликовать в каталоге», поле «Описание для каталога» с подсказкой «Для кого, цель, инвентарь» и счётчиком 300; при `hiddenAt` — «Снята администратором: <причина>», переключатель `disabled`), `app/(app)/coach/programs/page.tsx` (значок «В каталоге · занимаются N»; флаг)
- Create: `app/(app)/programs/page.tsx`, `app/(app)/programs/[id]/page.tsx`, `components/catalog/catalog-card.tsx`, `components/catalog/program-week.tsx`
- Modify: `components/app/nav.ts` (пункт «Программы» → `/programs`, при флаге — по образцу пунктов под флагами)
- Create: `e2e/program-catalog.spec.ts` (тесты 1 и 7), хелперы в `e2e/db.ts` при необходимости (`seedCoachProgram(login, …)`)

**Interfaces — Produces:**
```ts
// queries.ts ("server-only")
export type CatalogItem = { id: string; name: string; author: { nickname: string; publicPage: boolean }; weeks: number; perWeek: number; ruleText: string; participants: number };
export async function listCatalog(opts: { perWeek: number | null; page: number }): Promise<{ items: CatalogItem[]; hasMore: boolean }>; // perWeek 5 = «5+»
export async function getCatalogProgram(id: string, viewerId: string): Promise<(CatalogItem & { description: string; days: { weekday: number; title: string; exercises: { name: string; sets: number; reps: string }[] }[]; preview: ReturnType<typeof programPreview>; isAuthor: boolean }) | null>;
export async function participants(programIds: string[]): Promise<Map<string, number>>;
// actions.ts
export async function publishProgramAction(programId: string, input: { publish: boolean; description: string }): Promise<Result>;
```
Видимость (спека «Каталог»): `publishedAt` не null, `hiddenAt` null, автор `isCoach`; `getCatalogProgram` для автора возвращает и неопубликованную. Сортировка — participants desc, затем `publishedAt` desc. `publicPage` — есть ли публичная страница тренера (`/trainer/<ник>`; условие — как в `app/(marketing)/trainer/[nick]`). `publishProgramAction`: только автор; `canPublish` → текст ошибки; `publish=false` → `publishedAt = null` (описание сохраняется). Пустой каталог — «Пока нет опубликованных программ».

- [ ] **Step 1:** e2e 1 `a coach publishes a program and a user sees it in the catalog` (правило, «занимаются 0», ссылка автора, страница программы с днями и предпросмотром) и 7 `without the flag the catalog is hidden` (`/programs` 404, нет пункта меню и переключателя). Флаг включать/выключать как в существующих e2e с флагами (`mode: "serial"`, desktop).
- [ ] **Step 2:** `npm run build && npx playwright test e2e/program-catalog.spec.ts --workers=8` → FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** e2e → PASS; `npx playwright test e2e/coach-programs.spec.ts --workers=8` — редактор не сломан; `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 5:** коммит `feat(catalog): publish, catalog list and program page`.

### Task 3: Запуск, замена, завершение, напоминание

**Files:**
- Modify: `lib/coach/program-assign.ts` (вынести из `assignProgram` общий `createAssignment`; `assignProgram` его использует — поведение тренера не меняется)
- Modify: `lib/catalog/actions.ts` (`startCatalogProgramAction`, `getCatalogBasesAction`, `endOwnProgramAction`)
- Create: `lib/catalog/copy.ts` (`copyTemplates(tx, userId, programName, days)`)
- Create: `components/catalog/start-program-dialog.tsx` (2 шага по образцу `components/coach/assign-program-dialog.tsx`); Modify: `app/(app)/programs/[id]/page.tsx` (кнопка), `app/(app)/calendar/page.tsx` (+ компонент) — «Завершить программу» для каталожного назначения; подпись источника «программа «…» (неделя 3/8)» там, где сейчас «от тренера: … (неделя 3/8)» (`programForTemplate`/`programWeekLabels` — по `catalogProgramId`)
- Modify: `lib/coach/program-tick.ts` (напоминание пользователю для `coachId = null` и `catalogProgramId` не null)
- Modify: `e2e/program-catalog.spec.ts` (тесты 2–5), unit для `copy.ts`, если появится чистая часть

**Interfaces:**
```ts
// program-assign.ts
export async function createAssignment(
  tx: Tx,
  input: { userId: string; coachId: string | null; catalogProgramId: string | null; programId: string | null; name: string; rule: ProgramRule;
           days: { weekday: number; templateId: string; templateName: string; time: string; durationMin: number }[];
           startDate: string; bases: { templateId: string; exerciseId: string; weight: number }[]; templateOwnerId: string },
  today: string,
): Promise<string>; // закрывает прежнее активное (endAssignment writeTargets), снимок, базы (фильтр по шаблонам templateOwnerId, kind REPS), серии
// copy.ts
export async function copyTemplates(tx: Tx, userId: string, programName: string, templateIds: string[]): Promise<Map<string, { id: string; name: string }>>; // исходный id → копия
// actions.ts
export async function getCatalogBasesAction(programId: string): Promise<{ templateId: string; exerciseId: string; name: string; weight: number }[] | null>;
export async function startCatalogProgramAction(programId: string, input: { startDate: string; bases: { templateId: string; exerciseId: string; weight: number }[]; replace: boolean }): Promise<Result>;
export async function endOwnProgramAction(): Promise<Result>;
```
`startCatalogProgramAction`: флаг; программа видима (иначе «Программа недоступна»); строка пользователя `FOR UPDATE`; `startBlock(активное)`: `"coach"` → «Сейчас идёт программа от тренера»; `"replace"` и `!replace` → `{ ok: false, error: "replace" }` (клиент показывает подтверждение «Заменить программу «…»?»); копии шаблонов → базы переводятся на id копий → `createAssignment({ coachId: null, catalogProgramId, programId: null, templateOwnerId: userId, … })`; без уведомления, тост «Программа начата» и переход в календарь. `startDate` — понедельник этой или следующей недели в поясе пользователя (валидация как у тренера). `endOwnProgramAction`: только каталожное активное → `endAssignment(…, { writeTargets: true, keepToday: true })`. Тик: текст «Программа «<name>» заканчивается через неделю», тип `PLAN`, url `/programs`.

- [ ] **Step 1:** e2e:
  2. `a user starts a program next week with bases` — серии в календаре, у пользователя копии шаблонов, первая тренировка недели — вес по базе; «занимаются 1»; у автора пользователя нет в `/coach` и в итогах недели.
  3. `author edits and unpublishes — the running program is untouched` — правка шаблона автора не меняет копию; снятие с публикации — из каталога пропала, назначение активно.
  4. `coach program blocks the start; a catalog program is replaced after confirmation` (с `linkCoach` и назначением тренера в БД или через UI).
  5. `ending the own program removes future sessions and keeps today's`.
  + тик: `runTick` за неделю до конца → уведомление пользователю «Программа «…» заканчивается через неделю», у автора нет.
- [ ] **Step 2:** FAIL → реализовать.
- [ ] **Step 3:** `npm run build && npx playwright test e2e/program-catalog.spec.ts e2e/coach-programs.spec.ts --workers=8` → PASS (назначение тренера не сломано); `npm run typecheck && npm run lint && npm test` → чисто.
- [ ] **Step 4:** коммит `feat(catalog): start, replace and end a catalog program`.

### Task 4: Админ — снять и вернуть

**Files:**
- Modify: `lib/catalog/actions.ts` (`hideProgramAction(id, reason)`, `unhideProgramAction(id)` — только админ — `requireAdmin()` из `lib/auth/admin.ts`)
- Create: `app/(app)/admin/programs/page.tsx` (+ компонент), ссылка из `app/(app)/admin/page.tsx`
- Modify: `e2e/program-catalog.spec.ts` (тест 6)

Причина обязательна (1–200 символов, иначе «Укажите причину»). Снятие: `hiddenAt = now`, `hiddenReason`, уведомление автору `COACH` «Программа «…» снята из каталога: <причина>», url `/coach/programs`. «Вернуть» — `hiddenAt = null`, `hiddenReason = null`, без уведомления. Список: опубликованные (включая снятые), название, автор, «занимаются», дата публикации, статус.

- [ ] **Step 1:** e2e 6 `an admin hides a program with a reason` — уведомление автору, в каталоге нет, страница 404 для пользователя, в редакторе пометка и переключатель недоступен; «Вернуть» — снова в каталоге.
- [ ] **Step 2:** FAIL → реализовать → `npm run build && npx playwright test e2e/program-catalog.spec.ts --workers=8` PASS; `npm run typecheck && npm run lint && npm test` чисто.
- [ ] **Step 3:** коммит `feat(catalog): admin can hide a program`.

### Task 5: «Мои данные», удаление аккаунта, документация

**Files:**
- Modify: `lib/account/export-queries.ts`, `lib/account/export.ts` (+ `export.test.ts`): к назначениям из каталога — `catalogProgram: { name, author }` (без id); тренеру — `publishedPrograms: { name, description, publishedAt, hiddenAt, participants }[]`
- Modify: `e2e/account-data.spec.ts`: выгрузка обеих сторон; удаление автора — назначение занимающегося активно, `catalogProgramId` null, скопированный шаблон со своим упражнением автора открывается и тренировка по нему запускается
- Modify: `app/(marketing)/privacy/page.tsx` (фраза из спеки), `docs/features/coach.md` (раздел «Каталог программ»), `docs/features/training.md` (самостоятельная программа в календаре), `docs/features/platform.md` (флаг и разделы «Моих данных», если там перечни)

- [ ] **Step 1:** тесты → FAIL.
- [ ] **Step 2:** реализовать, документация.
- [ ] **Step 3:** `npm run build && npx playwright test e2e/account-data.spec.ts --workers=8` PASS; полный прогон `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e -- --workers=8` (чужие флейки — перезапуск файла отдельно, описать).
- [ ] **Step 4:** коммит `feat(catalog): data export, account deletion, docs`.
