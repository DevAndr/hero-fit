/**
 * Подсказка «Пора увеличить вес»: если N тренировок подряд рабочий вес одинаковый,
 * а повторы в подходах с этим весом не падают — пора добавить.
 */
export const HINT_SESSIONS = 3;

type Session = { sets: { weight: number; reps: number }[] };

export type ProgressionHint =
  | { kind: "weight"; current: number; suggested: number }
  | { kind: "reps"; current: number; suggested: number };

/** Сессии в хронологическом порядке (старые → новые), только рабочие выполненные подходы. */
export function progressionHint(sessions: Session[]): ProgressionHint | null {
  const recent = sessions.filter((s) => s.sets.length > 0).slice(-HINT_SESSIONS);
  if (recent.length < HINT_SESSIONS) return null;

  const top = recent.map((s) => Math.max(...s.sets.map((x) => x.weight)));
  if (top.some((w) => w !== top[0])) return null;
  const weight = top[0];

  // Минимальные повторы среди подходов с рабочим весом — «удержал ли» вес во всех подходах.
  const minReps = recent.map((s) => Math.min(...s.sets.filter((x) => x.weight === weight).map((x) => x.reps)));
  if (minReps.some((r, i) => i > 0 && r < minReps[i - 1])) return null;

  if (weight <= 0) {
    const reps = minReps.at(-1)!;
    return { kind: "reps", current: reps, suggested: reps + 2 };
  }
  const step = weight < 20 ? 1 : 2.5;
  return { kind: "weight", current: weight, suggested: weight + step };
}

/** Вес на 1–12 повторений по 1RM (обратная формула Эпли), округление до 0.5 кг. */
export function repTable(oneRm: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const reps = i + 1;
    const raw = reps === 1 ? oneRm : oneRm / (1 + reps / 30);
    return { reps, weight: Math.round(raw * 2) / 2, percent: Math.round((raw / oneRm) * 100) };
  });
}
