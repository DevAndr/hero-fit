/**
 * Streak «в ударе». «День тренировки» — окно 24 часа от последней засчитанной тренировки:
 *  - Δ < 24ч  — тот же тренировочный день, streak не меняется;
 *  - 24–48ч   — следующий день, streak +1, новое окно начинается с этой тренировки;
 *  - ≥ 48ч    — пропущено floor(Δ/24) − 1 окон: тратим заморозки, если хватает, иначе streak = 1.
 * Заморозка выдаётся раз в неделю (максимум MAX_FREEZES).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
export const MAX_FREEZES = 2;

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastStreakAt: Date | null;
  streakFreezes: number;
  freezeGrantedAt: Date | null;
};

export type StreakUpdate = StreakState & {
  extended: boolean;
  reset: boolean;
  usedFreezes: number;
};

export function applyWorkoutToStreak(state: StreakState, now: Date): StreakUpdate {
  let { streakFreezes, freezeGrantedAt } = state;
  if (!freezeGrantedAt || now.getTime() - freezeGrantedAt.getTime() >= WEEK_MS) {
    streakFreezes = Math.min(MAX_FREEZES, streakFreezes + 1);
    freezeGrantedAt = now;
  }

  const result = (patch: Partial<StreakUpdate>): StreakUpdate => {
    const next = { ...state, streakFreezes, freezeGrantedAt, extended: false, reset: false, usedFreezes: 0, ...patch };
    next.longestStreak = Math.max(next.longestStreak, next.currentStreak);
    return next;
  };

  if (!state.lastStreakAt) {
    return result({ currentStreak: 1, lastStreakAt: now, extended: true });
  }

  const delta = now.getTime() - state.lastStreakAt.getTime();
  if (delta < DAY_MS) return result({});

  const missedWindows = Math.floor(delta / DAY_MS) - 1;
  if (missedWindows === 0) {
    return result({ currentStreak: state.currentStreak + 1, lastStreakAt: now, extended: true });
  }
  if (missedWindows <= streakFreezes) {
    return result({
      currentStreak: state.currentStreak + 1,
      lastStreakAt: now,
      streakFreezes: streakFreezes - missedWindows,
      usedFreezes: missedWindows,
      extended: true,
    });
  }
  return result({ currentStreak: 1, lastStreakAt: now, extended: true, reset: true });
}

/** Крайний срок следующей тренировки, чтобы не потерять streak (без учёта заморозок). */
export function streakDeadline(lastStreakAt: Date | null): Date | null {
  return lastStreakAt ? new Date(lastStreakAt.getTime() + 2 * DAY_MS) : null;
}
