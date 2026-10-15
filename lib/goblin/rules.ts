/** Золотой гоблин (спека: docs/superpowers/specs/2026-10-15-golden-goblin-design.md) — чистые правила. */

/** Шанс на каждый отмеченный рабочий подход (≈ 14 % на тренировку из 15 подходов). */
export const GOBLIN_SET_CHANCE = 0.01;
export const GOBLIN_COOLDOWN_DAYS = 14;
export const GOBLIN_WINDOW_MS = 10 * 60_000;
/** Столько рабочих подходов за окно — пойман. */
export const GOBLIN_SETS = 3;
export const GOBLIN_REWARD_XP = 150;

/** Появится ли гоблин после этого подхода: один на тренировку, со второго рабочего подхода, раз в 14 дней. */
export function shouldSpawn(p: { now: Date; lastSpawnedAt: Date | null; hasEncounter: boolean; completedWorkingSets: number; random: number }) {
  if (p.hasEncounter || p.completedWorkingSets < 2) return false;
  if (p.lastSpawnedAt && p.now.getTime() - p.lastSpawnedAt.getTime() < GOBLIN_COOLDOWN_DAYS * 86_400_000) return false;
  return p.random < GOBLIN_SET_CHANCE;
}

const ms = (t: string | Date | number) => (typeof t === "number" ? t : new Date(t).getTime());

/** Прогресс поимки: рабочие подходы, отмеченные в окне 10 минут с появления. Общая для редактора и сервера. */
export function goblinProgress(
  spawnedAt: string | Date,
  sets: { completedAt: string | Date | null; isWarmup: boolean }[],
  now: Date | number | string,
) {
  const start = ms(spawnedAt);
  const end = start + GOBLIN_WINDOW_MS;
  const inWindow = sets.filter((s) => !s.isWarmup && s.completedAt && ms(s.completedAt) >= start && ms(s.completedAt) <= end).length;
  const done = Math.min(inWindow, GOBLIN_SETS);
  const caught = done >= GOBLIN_SETS;
  const t = ms(now);
  return { done, caught, escaped: !caught && t > end, leftMs: Math.max(0, end - t) };
}
