# Питание, подпроект 4: игровой слой — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Серия дневника, ачивки питания и карточка «Питание сегодня» на дашборде (флаг `nutrition`).

**Architecture:** Чистые правила серии и «дней в норме» в `lib/nutrition/streak.ts`; SQL зачётных дней — `streak-queries.ts`; ачивки — новая лестница в `lib/achievements/definitions.ts` по образцу `coachLadders`, статистика — `getAchievementStats`; пересчёт ачивок из действий питания; карточка дашборда — серверный компонент.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-nutrition-game-design.md`

## Global Constraints

- Пороги: 2 приёма, 800 ккал; норма ±10 %; окно 400 дней.
- Коды и XP ачивок — дословно из таблицы спеки; категория `NUTRITION`.
- Без флага `nutrition`: ачивки питания не выдаются, не показываются целями, карточки нет.
- Миграция enum — проверить SQL; `npx prisma generate`.

## Review Focus

1. Часовой пояс: зачётный день — по `FoodEntry.date` (уже местная дата), «сегодня» — `dayKey(now, user.timeZone)`; тест `diaryStreak` со сменой месяца.
2. Пересчёт ачивок не ломает действие, если упал (ошибка оценки — лог, действие успешно) — проверить в коде.
3. Удаление записи может «отменить» зачёт дня — выданные ачивки не отзываются (так в проекте везде).
4. Пользователь без нормы — `normDays` 0, ачивки «в норме» не выдаются; unit.
5. Дашборд не делает лишних запросов без флага — проверить в коде.

---

### Task 1: Правила серии

**Files:** Create `lib/nutrition/streak.ts`, Test `lib/nutrition/streak.test.ts`

**Produces:** `DIARY_DAY_MIN_MEALS = 2`, `DIARY_DAY_MIN_KCAL = 800`, `NORM_TOLERANCE = 0.1`; `type DiaryDay = { date: string; kcal: number }`; `diaryStreak(days: DiaryDay[], today: string): { current: number; longest: number }`; `normDays(days: DiaryDay[], normKcal: number | null): number`.

- [ ] Тесты: пусто → `{0,0}`; дни 29.10, 30.10 при today 31.10 → current 2 (сегодня пусто), longest 2; 28.10–31.10 → 4; разрыв 25–26 и 30–31 → current 2, longest 2…; через месяц 30.09–01.10–02.10 → 3; последний 29.10 при today 31.10 → current 0; `normDays` при норме 2000: 1800 и 2200 считаются, 1799/2201 — нет; норма null → 0.
- [ ] RED → реализация → GREEN → commit `feat(nutrition): diary streak and days in norm`.

### Task 2: Ачивки и статистика

**Files:** Modify `prisma/schema.prisma` (`NUTRITION` в `AchievementCategory`), migration `nutrition_achievements`; Create `lib/nutrition/streak-queries.ts` (`diaryDays(client, userId): Promise<DiaryDay[]>`, `getDiaryStreak(userId, tz, now)`); Modify `lib/achievements/definitions.ts` (тип `nutrition` в `AchievementStats`, `EMPTY`, `nutritionLadders` в `ladders`), `lib/achievements/engine.ts` (`nutrition` в `getAchievementStats`: флаг через `isEnabled`, `diaryDays`, норма — `dailyNorm` от профиля и веса), `lib/achievements/queries.ts` (`NUTRITION` в `hide` без флага); Test `lib/achievements/definitions.test.ts`.

- [ ] Тест: `earnedAchievements({ ...EMPTY, nutrition: { enabled: true, longestDiaryStreak: 7, normDays: 7 } })` содержит `diary:3`, `diary:7`, `normdays:7` с XP 15/30/20 и не содержит `diary:30`; с `enabled: false` и теми же числами — ни одного `diary:`/`normdays:`.
- [ ] RED → реализация → GREEN; `npm run typecheck` → commit `feat(nutrition): nutrition achievements`.

### Task 3: Пересчёт ачивок из действий

**Files:** Modify `lib/nutrition/food-actions.ts`, `lib/nutrition/actions.ts` — после успешной записи `await evaluateAchievementsNow(user.id).catch((e) => console.error("[nutrition] achievements", e))`.

- [ ] typecheck, lint → commit `feat(nutrition): evaluate achievements after diary changes`.

### Task 4: Карточка и строка серии

**Files:** Create `components/nutrition/nutrition-today-card.tsx`; Modify `components/nutrition/calorie-ring.tsx` (проп `size?: "md" | "sm"`, sm — 88 px, толщина 9, число `text-lg`), `app/(app)/dashboard/page.tsx` (при флаге — `getNutritionView` + `getDiaryDay(today)` + `getDiaryStreak`, карточка в `today`), `components/nutrition/day-summary.tsx` + `app/(app)/nutrition/page.tsx` (проп `streak`, строка «Серия дневника: N дн.»).

- [ ] typecheck, lint, скриншот карточки → commit `feat(nutrition): today card on the dashboard, diary streak line`.

### Task 5: e2e и документация

**Files:** Create `e2e/nutrition-game.spec.ts`; Modify `docs/features/nutrition.md`, `docs/features/game.md`.

- [ ] e2e: 6 дней (вчера…6 дней назад) по 2 записи в разных приёмах ×500 ккал из БД; сегодня через интерфейс завтрак 500 и обед 500 → `achievementCodes` содержит `diary:3`, `diary:7`; на `/nutrition` «Серия дневника: 7 дн.»; дашборд — `region` «Питание сегодня» с кольцом и «Серия дневника: 7 дн.», ссылка «Открыть дневник»; без флага на дашборде региона нет.
- [ ] `npm run build && npx playwright test e2e/nutrition-game.spec.ts e2e/nutrition*.spec.ts e2e/achievements.spec.ts e2e/dashboard*.spec.ts --workers=8`; `npm test` → commit `test(nutrition): game layer e2e; docs`.
