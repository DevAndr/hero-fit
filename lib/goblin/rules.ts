/** Золотой гоблин (спека: docs/superpowers/specs/2026-10-15-golden-goblin-design.md) — чистые правила. */

/** Шанс на каждый отмеченный рабочий подход (≈ 14 % на тренировку из 15 подходов). */
export const GOBLIN_SET_CHANCE = 0.01;
export const GOBLIN_COOLDOWN_DAYS = 14;
export const GOBLIN_WINDOW_MS = 10 * 60_000;
/** Столько рабочих подходов за окно — пойман. */
export const GOBLIN_SETS = 3;
export const GOBLIN_REWARD_XP = 150;

/**
 * Бросков за это сохранение: по одному на каждый новый выполненный рабочий подход сверх уже разыгранных
 * (`rolledSets` — максимум, до которого уже бросали; повторная отметка того же подхода броска не даёт), первый — нет.
 */
export function rollsFor({ rolledSets, completed }: { rolledSets: number; completed: number }) {
  return Math.max(0, completed - Math.max(rolledSets, 1));
}

/** Появится ли гоблин: одна встреча на тренировку, раз в 14 дней, шанс 1 % за каждый бросок. */
export function shouldSpawn(p: { now: Date; lastSpawnedAt: Date | null; hasEncounter: boolean; rolls: number; random: number; chance?: number }) {
  if (p.hasEncounter || p.rolls <= 0) return false;
  if (p.lastSpawnedAt && p.now.getTime() - p.lastSpawnedAt.getTime() < GOBLIN_COOLDOWN_DAYS * 86_400_000) return false;
  // Порог округлён: 1 − 0.99¹ в плавающей точке чуть больше 0.01
  const threshold = Math.round((1 - (1 - (p.chance ?? GOBLIN_SET_CHANCE)) ** p.rolls) * 1e9) / 1e9;
  return p.random < threshold;
}

const ms = (t: string | Date | number) => (typeof t === "number" ? t : new Date(t).getTime());

/** Прогресс поимки: рабочие подходы с повторами, отмеченные в окне 10 минут с появления. Общая для редактора и сервера. */
export function goblinProgress(
  spawnedAt: string | Date,
  sets: { completedAt: string | Date | null; isWarmup: boolean; reps: number | string }[],
  now: Date | number | string,
) {
  const start = ms(spawnedAt);
  const end = start + GOBLIN_WINDOW_MS;
  const inWindow = sets.filter(
    (s) => !s.isWarmup && Number(s.reps) > 0 && s.completedAt && ms(s.completedAt) >= start && ms(s.completedAt) <= end,
  ).length;
  const done = Math.min(inWindow, GOBLIN_SETS);
  const caught = done >= GOBLIN_SETS;
  const t = ms(now);
  return { done, caught, escaped: !caught && t > end, leftMs: Math.max(0, end - t) };
}
