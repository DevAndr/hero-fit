# Золотой гоблин — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** посреди тренировки изредка появляется Золотой гоблин; 3 рабочих подхода за 10 минут — пойман, сундук (150 XP + 40 монет) в итогах; бестиарий «Редкие», ачивки `goblin:1/5/10`; всё под флагом `golden_goblin`.

**Architecture:** чистые правила `lib/goblin/rules.ts` (появление, прогресс) общие для клиента и сервера → `GoblinEncounter` (одна на тренировку) → `rollGoblinAction` после отметки подхода, поимка в `finishWorkout`, сундук `openGoblinChestAction` → плашка в редакторе, блок в итогах, раздел бестиария.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-golden-goblin-design.md`

## Global Constraints

- Ветка `feat/golden-goblin` от `release/2026-11-ux`; в конце — `--no-ff` в релизную.
- Константы: шанс 0.01 на рабочий подход, пауза 14 дней, окно 10 минут, 3 подхода, награда 150 XP, `COIN_RATES.goblinChest = 40`.
- Всё видимое и вся логика — только при `golden_goblin` (сервер — `isEnabled`, клиент — `useFlag`); ачивки видны всем.
- Новая связь с `User` → удаление аккаунта (`Cascade`) и выгрузка «Мои данные» (`goblins`); SQL миграции не трогает частичные индексы.
- Новые анимации — без них при «уменьшить движение»; бесконечных анимаций нет.
- e2e с флагом — `addFlagUser` на пользователя, только desktop.
- Картинка — `assets/icons/game/bosses/gold_goblin.png` (уже лежит, добавить в git).

## Review Focus

1. **Двойное появление** (двойной вызов, вторая вкладка) — одна встреча на тренировку (уникальный `workoutId`, ошибка уникальности в `rollGoblin` → `null`). Тест: e2e — повторная вставка встречи для той же тренировки отвергается базой, строк одна (Task 4).
2. **Подходы вне окна и разминка** не засчитываются в поимку. Тест: `goblinProgress` (Task 1).
3. **Повторное открытие сундука** (двойной клик, две вкладки) — XP один раз. Тест: e2e второй вызов `openGoblinChestAction` → ошибка, XP не растёт (Task 4).
4. **Флаг выключен** — тренировка не ловит гоблина, плашки и блока нет. Тест: e2e «без флага» (Task 4).
5. **Отмена тренировки с гоблином** — встреча удаляется (`Cascade`), пауза 14 дней не сжигается зря. Тест: e2e отмена → строки нет (Task 4).

---

### Task 1: Правила и константы

**Files:** Create `lib/goblin/rules.ts`, `lib/goblin/rules.test.ts`; Modify `lib/shop/coins.ts` (`goblinChest: 40`), `lib/flags/registry.ts` (флаг из спеки).

**Interfaces — Produces:** `GOBLIN_SET_CHANCE`, `GOBLIN_COOLDOWN_DAYS`, `GOBLIN_WINDOW_MS`, `GOBLIN_SETS`, `GOBLIN_REWARD_XP`; `shouldSpawn({ now: Date; lastSpawnedAt: Date | null; hasEncounter: boolean; completedWorkingSets: number; random: number }): boolean`; `goblinProgress(spawnedAt: string | Date, sets: { completedAt: string | Date | null; isWarmup: boolean }[], now: Date | number): { done: number; caught: boolean; escaped: boolean; leftMs: number }`.

- [ ] Тесты: `shouldSpawn` — `hasEncounter` → false; 1 подход → false; `lastSpawnedAt` 13 дней назад → false, 14 → по шансу; `random 0.009` → true, `0.01` → false. `goblinProgress` — 3 рабочих в окне → `caught`, `done 3`; подход через 10 мин 1 с и разминка → не считаются; через 11 мин без поимки → `escaped`, `leftMs 0`; на 4-й минуте → `leftMs 360000`. Тест реестра флагов проходит.
- [ ] RED → реализация → GREEN (`npx vitest run lib/goblin lib/flags`), commit `feat(goblin): rules, constants, flag`.

### Task 2: Данные, появление, поимка, сундук, ачивки

**Files:** Modify `prisma/schema.prisma` (+ миграция `golden_goblin`, `npx prisma generate`), `lib/workouts/finish.ts`, `lib/workouts/actions.ts`, `lib/workouts/queries.ts` (`ActiveWorkout.goblin`), `lib/achievements/definitions.ts`, `lib/achievements/engine.ts`, `lib/account/export-queries.ts`, `lib/account/export.ts`; Create `lib/goblin/actions.ts`, `lib/goblin/queries.ts`; Test `lib/achievements/definitions.test.ts`.

**Interfaces — Consumes:** Task 1. **Produces:**
- `rollGoblinAction(workoutId: string, random?: number): Promise<{ spawnedAt: string } | null>` — `random` только для тестов не передаётся из клиента (в action всегда `Math.random()`; внутренняя `rollGoblin(userId, workoutId, now, random)` в `lib/goblin/queries.ts`);
- `finishWorkout(userId, workoutId, now?, opts?: { goblin?: boolean })`; `FinishMeta.goblin?: { id: string; caught: boolean; reward: number; opened: boolean }`;
- `openGoblinChestAction(id: string): Promise<{ ok: true; amount: number; coins: number } | { ok: false; error: string }>`;
- `getGoblinStats(userId): Promise<{ seen: number; caught: number; firstCaughtAt: Date | null }>`;
- `ActiveWorkout.goblin: { spawnedAt: string } | null`; состояние ачивок `goblinCatches: number`.

- [ ] Тест ачивок: `codesOf("goblin", { goblinCatches: 5 })` → `["goblin:1", "goblin:5"]`, название первой — «Охотник за золотом».
- [ ] RED → схема/миграция (проверить SQL), `rollGoblin` (своя `IN_PROGRESS` тренировка, флаг, `completedWorkingSets` из подходов в БД, последняя встреча, `shouldSpawn`, `create`, ошибка уникальности → `null`), поимка в `finishWorkout` по `goblinProgress` на `now` с условным `updateMany`, сундук по образцу `openBossChestAction` (`XpReason.GOBLIN_REWARD`, `CoinReason.GOBLIN_CHEST`, ключ `chest:goblin:<id>`), ачивки, выгрузка `goblins: { spawnedAt, caughtAt }[]` → GREEN (`npm test`, `npm run typecheck`).
- [ ] commit `feat(goblin): encounter model, spawn roll, catch on finish, chest, achievements`.

### Task 3: Интерфейс

**Files:** Create `components/goblin/goblin-banner.tsx`, `components/goblin/goblin-summary.tsx`, `components/goblin/goblin-card.tsx` (бестиарий); Modify `components/training/workout-editor.tsx` (состояние `goblin`, вызов `rollGoblinAction` после отметки рабочего подхода при `useFlag("golden_goblin")` и `!goblin`, плашка), `components/workouts/workout-summary-view.tsx` (блок после босса), `app/(app)/achievements/page.tsx` + `components/boss/bestiary.tsx` (раздел «Редкие» при флаге), `app/(app)/workouts/[id]/page.tsx` при необходимости (чтение `meta.goblin` / открытость сундука).

- [ ] Плашка: `role="status"`, `aria-label="Золотой гоблин"`, тексты из спеки, таймер `formatClock(leftMs/1000)` раз в секунду, «Подходы: N/3»; пойман / ушёл; «Закрыть» у ушедшего; анимация появления `motion-safe:` + `haptic("success")`.
- [ ] Итоги: «🪙 Золотой гоблин пойман!» + кнопка «Открыть сундук гоблина» (`ChestDialog`, `openGoblinChestAction`), открыт — «Сундук открыт · +150 XP»; не пойман — «Золотой гоблин ушёл».
- [ ] Бестиарий: заголовок «Редкие», карточка «Золотой гоблин»: «Встречен: N · Пойман: M», первая поимка; `seen = 0` → «???».
- [ ] `npm run typecheck && npm run lint`; commit `feat(goblin): banner, summary block, rare bestiary`.

### Task 4: e2e, тексты, «Что нового»

**Files:** Create `e2e/goblin.spec.ts`; Modify `e2e/db.ts` (`spawnGoblin(login, minutesAgo)` — вставка встречи для активной тренировки; `goblinRows(login)`), `lib/changelog/releases.ts` (пункт 0.8.0 с `flag: "golden_goblin"`), `docs/features/game.md` (пункт «Золотой гоблин»).

- [ ] Сценарии из спеки (поимка → сундук → XP +150 и ачивка → бестиарий «Пойман: 1»; ушёл 11 минут назад; без флага; повторное открытие сундука — ошибка, XP не растёт; отмена тренировки — строки нет).
- [ ] `npm run build && npx playwright test e2e/goblin.spec.ts --project=desktop` — PASS; commit `test(goblin): e2e; changelog and docs`.

### Task 5: Финал

- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --workers=8` — зелёное; ревью ветки; `--no-ff` в `release/2026-11-ux`.
