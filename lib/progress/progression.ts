/**
 * Подсказка «Пора увеличить вес».
 *  - Есть запас повторов (RIR): в последней тренировке был подход до отказа (RIR 0) — рано;
 *    во всех рабочих подходах запас 2+ — пора уже сейчас, после одной тренировки.
 *  - Иначе (RIR не указан или 1): N тренировок подряд рабочий вес одинаковый, а повторы не падают.
 */
export const HINT_SESSIONS = 3;
/** Запас, при котором вес явно лёгкий. */
export const EASY_RIR = 2;

type Session = { sets: { weight: number; reps: number; rir?: number | null }[] };

export type ProgressionHint =
  | { kind: "weight"; current: number; suggested: number; easy?: boolean }
  | { kind: "reps"; current: number; suggested: number; easy?: boolean };

const topWeight = (s: Session) => Math.max(...s.sets.map((x) => x.weight));
/** Минимальные повторы среди подходов с рабочим весом — «удержал ли» вес во всех подходах. */
const minRepsAt = (s: Session, weight: number) => Math.min(...s.sets.filter((x) => x.weight === weight).map((x) => x.reps));

function suggest(weight: number, reps: number, easy: boolean): ProgressionHint {
  const flag = easy ? { easy: true } : {};
  if (weight <= 0) return { kind: "reps", current: reps, suggested: reps + 2, ...flag };
  const step = weight < 20 ? 1 : 2.5;
  return { kind: "weight", current: weight, suggested: weight + step, ...flag };
}

/** Сессии в хронологическом порядке (старые → новые), только рабочие выполненные подходы. */
export function progressionHint(sessions: Session[]): ProgressionHint | null {
  const nonEmpty = sessions.filter((s) => s.sets.length > 0);
  const last = nonEmpty.at(-1);
  if (!last) return null;

  // Запас повторов в последней тренировке (по подходам с рабочим весом)
  const lastTop = topWeight(last);
  const topSets = last.sets.filter((x) => x.weight === lastTop);
  const rirs = topSets.map((x) => x.rir).filter((r): r is number => r !== null && r !== undefined);
  if (rirs.includes(0)) return null; // до отказа — вес ещё не освоен
  if (rirs.length === topSets.length && Math.min(...rirs) >= EASY_RIR) {
    return suggest(lastTop, minRepsAt(last, lastTop), true);
  }

  const recent = nonEmpty.slice(-HINT_SESSIONS);
  if (recent.length < HINT_SESSIONS) return null;
  const top = recent.map(topWeight);
  if (top.some((w) => w !== top[0])) return null;
  const minReps = recent.map((s) => minRepsAt(s, top[0]));
  if (minReps.some((r, i) => i > 0 && r < minReps[i - 1])) return null;
  return suggest(top[0], minReps.at(-1)!, false);
}

/** Вес на 1–12 повторений по 1RM (обратная формула Эпли), округление до 0.5 кг. */
export function repTable(oneRm: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const reps = i + 1;
    const raw = reps === 1 ? oneRm : oneRm / (1 + reps / 30);
    return { reps, weight: Math.round(raw * 2) / 2, percent: Math.round((raw / oneRm) * 100) };
  });
}
