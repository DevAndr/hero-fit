/**
 * Streak «в ударе». «День тренировки» — окно 24 часа от последней засчитанной тренировки:
 *  - Δ < 24ч  — тот же тренировочный день, streak не меняется;
 *  - 24–48ч   — следующий день, streak +1, новое окно начинается с этой тренировки;
 *  - ≥ 48ч    — пропущено floor(Δ/24) − 1 окон: тратим заморозки, если хватает, иначе streak = 1.
 * Заморозка выдаётся раз в неделю (пока их меньше MAX_FREEZES) и как награда за ачивки (до MAX_REWARD_FREEZES).
 * Сгоревшую серию можно выкупить за XP в течение RESTORE_WINDOW_H часов — restoreOffer().
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
export const MAX_FREEZES = 2;
/** Заморозки из наград копятся дальше еженедельного лимита — но не бесконечно. */
export const MAX_REWARD_FREEZES = 5;

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
    // Еженедельная — только пока меньше лимита; накопленные за ачивки не урезаем
    if (streakFreezes < MAX_FREEZES) streakFreezes += 1;
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

export type StreakStatus =
  | { state: "none" }
  | { state: "counted"; streak: number; nextWindowAt: Date }
  | { state: "due"; streak: number; deadline: Date; hoursLeft: number }
  | { state: "frozen"; streak: number; freezesNeeded: number }
  | { state: "lost"; streak: number };

/** Состояние серии «на сейчас» — для дашборда и напоминаний «Не потеряй streak!». */
export function streakStatus(
  user: { currentStreak: number; lastStreakAt: Date | null; streakFreezes: number },
  now: Date,
): StreakStatus {
  if (!user.lastStreakAt || user.currentStreak === 0) return { state: "none" };
  const streak = user.currentStreak;
  const delta = now.getTime() - user.lastStreakAt.getTime();
  if (delta < DAY_MS) return { state: "counted", streak, nextWindowAt: new Date(user.lastStreakAt.getTime() + DAY_MS) };
  if (delta < 2 * DAY_MS) {
    const deadline = new Date(user.lastStreakAt.getTime() + 2 * DAY_MS);
    return { state: "due", streak, deadline, hoursLeft: Math.ceil((deadline.getTime() - now.getTime()) / 3_600_000) };
  }
  // Тренировка «сейчас» пропустила бы столько окон — как в applyWorkoutToStreak.
  const freezesNeeded = Math.floor(delta / DAY_MS) - 1;
  return freezesNeeded <= user.streakFreezes ? { state: "frozen", streak, freezesNeeded } : { state: "lost", streak };
}

// ───────────────────────────── Восстановление серии ─────────────────────────────

export const RESTORE_WINDOW_H = 48;
export const MIN_RESTORE_STREAK = 3;

/** Цена выкупа растёт с длиной серии: 3 дня — 80 XP, 7 — 120, 30 — 350, максимум 500. */
export function restoreCost(streak: number) {
  return Math.min(500, 50 + streak * 10);
}

export type RestoreOffer = { streak: number; cost: number; expiresAt: Date };

/**
 * Можно ли выкупить сгоревшую серию. Серия сгорает, когда пропущено больше окон, чем есть заморозок:
 * lastStreakAt + (заморозки + 2) суток. Выкуп — RESTORE_WINDOW_H часов после этого, один раз до следующей тренировки.
 */
export function restoreOffer(
  user: { currentStreak: number; lastStreakAt: Date | null; streakFreezes: number; streakRestoredAt: Date | null },
  now: Date,
): RestoreOffer | null {
  if (!user.lastStreakAt || user.currentStreak < MIN_RESTORE_STREAK) return null;
  if (streakStatus(user, now).state !== "lost") return null;
  // Уже выкупали и с тех пор не тренировались — второй раз нельзя
  if (user.streakRestoredAt && user.streakRestoredAt > user.lastStreakAt) return null;
  const lostAt = user.lastStreakAt.getTime() + (user.streakFreezes + 2) * DAY_MS;
  const expiresAt = new Date(lostAt + RESTORE_WINDOW_H * 3_600_000);
  if (now >= expiresAt) return null;
  return { streak: user.currentStreak, cost: restoreCost(user.currentStreak), expiresAt };
}

/** После выкупа серия «ждёт» тренировку: сутки, чтобы продлить её (как обычное окно 24–48 ч). */
export function restoredLastStreakAt(now: Date) {
  return new Date(now.getTime() - DAY_MS);
}
