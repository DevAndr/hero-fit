/**
 * Streak «в ударе» — недели подряд с тренировками. Неделя — с понедельника 00:00 до воскресенья 24:00
 * в поясе пользователя, её ключ — дата понедельника «YYYY-MM-DD».
 */
import { dayKey } from "../daily-login";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Ключ «YYYY-MM-DD» как полдень UTC — арифметика дат без влияния DST. */
const noon = (key: string) => Date.parse(`${key}T12:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key: string, n: number) => toKey(noon(key) + n * DAY_MS);

/** 0 = понедельник … 6 = воскресенье, для календарного дня «YYYY-MM-DD». */
const weekdayOf = (key: string) => (new Date(noon(key)).getUTCDay() + 6) % 7;

/** Понедельник недели, в которую попадает момент date в поясе tz. */
export function weekKey(date: Date, tz: string): string {
  const day = dayKey(date, tz);
  return addDays(day, -weekdayOf(day));
}

export function addWeeks(week: string, n: number): string {
  return addDays(week, n * 7);
}

/** Сколько недель от from до to (отрицательно, если to раньше). */
export function weeksBetween(from: string, to: string): number {
  return Math.round((noon(to) - noon(from)) / WEEK_MS);
}

/** Смещение пояса (мс) в момент ms: локальное время − UTC. */
function zoneOffset(ms: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return local - Math.floor(ms / 1000) * 1000;
}

/** Момент 00:00 дня «YYYY-MM-DD» в поясе tz. */
export function localMidnight(day: string, tz: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // Две итерации: смещение берём в уже приближённом моменте (на случай перехода DST в этот день).
  let ms = utcMidnight - zoneOffset(utcMidnight, tz);
  ms = utcMidnight - zoneOffset(ms, tz);
  return new Date(ms);
}

/** Сколько дней недели осталось, включая сегодня: пн → 7, вс → 1. */
export function daysLeftInWeek(now: Date, tz: string): number {
  return 7 - weekdayOf(dayKey(now, tz));
}

export function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Самая длинная серия подряд идущих недель и серия, живая сейчас (последняя — текущая или прошлая неделя). */
export function weeklyRuns(weeks: string[], currentWeek: string): { best: number; current: number } {
  const index = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / WEEK_MS);
  const sorted = [...new Set(weeks.map(index))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (const [i, w] of sorted.entries()) {
    run = i > 0 && w === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = sorted.at(-1);
  const now = index(currentWeek);
  return { best, current: last !== undefined && now - last <= 1 ? run : 0 };
}

// ───────────────────────────── Правила серии ─────────────────────────────

/** Тренировок в неделю, чтобы она засчиталась. */
export const STREAK_WEEK_TARGET = 3;
/** Пороги ачивок серии (в неделях), дальше — каждые STREAK_WEEK_STEP. */
export const STREAK_WEEK_THRESHOLDS = [2, 4, 8, 12, 26, 52];
export const STREAK_WEEK_STEP = 52;
/** Плановая заморозка — раз в столько недель, пока их меньше MAX_FREEZES. */
export const FREEZE_GRANT_WEEKS = 4;
export const MAX_FREEZES = 2;
/** Заморозки из наград ачивок копятся дальше планового лимита — но не больше. */
export const MAX_REWARD_FREEZES = 3;
export const MIN_RESTORE_STREAK = 2;
/** Выкуп — в первые столько дней недели, на которой серия сгорела (до четверга 00:00). */
export const RESTORE_WINDOW_DAYS = 3;
export const STREAK_REMINDER_HOUR = 12;

export type WeeklyStreakState = {
  currentStreak: number;
  longestStreak: number;
  lastStreakWeek: string | null;
  streakFreezes: number;
  freezeGrantedAt: Date | null;
};

export type WeekCredit = WeeklyStreakState & { frozenWeeks: string[]; extended: boolean; reset: boolean };

const freezeDue = (freezeGrantedAt: Date | null, now: Date) =>
  !freezeGrantedAt || now.getTime() - freezeGrantedAt.getTime() >= FREEZE_GRANT_WEEKS * WEEK_MS;
const withPlannedFreeze = (freezes: number) => (freezes < MAX_FREEZES ? freezes + 1 : freezes);

/** Плановая заморозка раз в FREEZE_GRANT_WEEKS недель (накопленные за ачивки не урезаем). */
export function grantFreeze(state: WeeklyStreakState, now: Date): WeeklyStreakState {
  if (!freezeDue(state.freezeGrantedAt, now)) return state;
  return { ...state, streakFreezes: withPlannedFreeze(state.streakFreezes), freezeGrantedAt: now };
}

/**
 * Заморозки «на сейчас» — вместе с плановой, которую выдаст следующая тренировка: иначе статус
 * прыгал бы «сгорела» → «спасёт заморозка» после первой же тренировки, а выкуп оказался бы лишним.
 */
function availableFreezes(user: { streakFreezes: number; freezeGrantedAt: Date | null }, now: Date) {
  return freezeDue(user.freezeGrantedAt, now) ? withPlannedFreeze(user.streakFreezes) : user.streakFreezes;
}

/**
 * Неделя набрала STREAK_WEEK_TARGET тренировок (заморозки — уже с плановой: вызывать после grantFreeze).
 * Покрытые недели не передаём: заморозки пишутся здесь же, а выкуп сдвигает lastStreakWeek. Пропущенные недели между последней засчитанной и этой
 * закрываем заморозками; не хватает — серия начинается заново. Неделя не позже последней засчитанной — без изменений.
 */
export function applyWeekCredit(state: WeeklyStreakState, week: string): WeekCredit {
  const unchanged = { ...state, frozenWeeks: [], extended: false, reset: false };
  const credit = (patch: Partial<WeekCredit>): WeekCredit => {
    const next = { ...unchanged, lastStreakWeek: week, extended: true, ...patch };
    return { ...next, longestStreak: Math.max(next.longestStreak, next.currentStreak) };
  };
  if (!state.lastStreakWeek) return credit({ currentStreak: 1 });
  const gap = weeksBetween(state.lastStreakWeek, week);
  if (gap <= 0) return unchanged;
  const missed = Array.from({ length: gap - 1 }, (_, i) => addWeeks(state.lastStreakWeek!, i + 1));
  if (missed.length <= state.streakFreezes) {
    return credit({
      currentStreak: state.currentStreak + 1,
      streakFreezes: state.streakFreezes - missed.length,
      frozenWeeks: missed,
    });
  }
  return credit({ currentStreak: 1, reset: true });
}

export type StreakUserFields = {
  currentStreak: number;
  lastStreakWeek: string | null;
  streakFreezes: number;
  weekWorkouts: number;
  weekWorkoutsKey: string | null;
  freezeGrantedAt: Date | null;
};

type WeekProgress = { streak: number; count: number; needed: number; daysLeft: number };

export type StreakStatus =
  | { state: "none" }
  | { state: "done"; streak: number }
  | ({ state: "pending" } & WeekProgress)
  | ({ state: "frozen"; freezesNeeded: number } & WeekProgress)
  | { state: "lost"; streak: number };

/** Состояние серии «на сейчас» — для шапки, дашборда, лиги и напоминаний. */
export function streakStatus(user: StreakUserFields, now: Date, tz: string): StreakStatus {
  if (!user.lastStreakWeek || user.currentStreak === 0) return { state: "none" };
  const streak = user.currentStreak;
  const current = weekKey(now, tz);
  const missed = weeksBetween(user.lastStreakWeek, current) - 1;
  if (missed < 0) return { state: "done", streak };
  const count = user.weekWorkoutsKey === current ? user.weekWorkouts : 0;
  const progress = { streak, count, needed: Math.max(0, STREAK_WEEK_TARGET - count), daysLeft: daysLeftInWeek(now, tz) };
  if (missed === 0) return { state: "pending", ...progress };
  if (missed <= availableFreezes(user, now)) return { state: "frozen", freezesNeeded: missed, ...progress };
  return { state: "lost", streak };
}

/** Число для шапки и лиги: сгоревшая серия — 0. */
export function streakValue(status: StreakStatus): number {
  return status.state === "none" || status.state === "lost" ? 0 : status.streak;
}

// ───────────────────────────── Выкуп серии ─────────────────────────────

/** 2 недели — 150 XP, 5 — 300, от 9 — 500. */
export function restoreCost(streak: number) {
  return Math.min(500, 50 + 50 * streak);
}

export type RestoreOffer = { streak: number; cost: number; expiresAt: Date };

/**
 * Выкуп сгоревшей серии: только в неделю сгорания (lastStreakWeek + заморозки + 2) до четверга 00:00
 * и один раз до следующей засчитанной недели.
 */
export function restoreOffer(
  user: StreakUserFields & { streakRestoredAt: Date | null },
  now: Date,
  tz: string,
): RestoreOffer | null {
  if (!user.lastStreakWeek || user.currentStreak < MIN_RESTORE_STREAK) return null;
  if (streakStatus(user, now, tz).state !== "lost") return null;
  const lostWeek = addWeeks(user.lastStreakWeek, availableFreezes(user, now) + 2);
  if (weekKey(now, tz) !== lostWeek) return null;
  if (user.streakRestoredAt && weekKey(user.streakRestoredAt, tz) > user.lastStreakWeek) return null;
  const expiresAt = localMidnight(addDays(lostWeek, RESTORE_WINDOW_DAYS), tz);
  if (now >= expiresAt) return null;
  return { streak: user.currentStreak, cost: restoreCost(user.currentStreak), expiresAt };
}

// ───────────────────────────── Пересчёт из истории ─────────────────────────────

export type StreakFromHistory = Pick<WeeklyStreakState, "currentStreak" | "longestStreak" | "lastStreakWeek"> & {
  weekWorkouts: number;
  weekWorkoutsKey: string;
};

/** Серия по истории (без заморозок): недели с STREAK_WEEK_TARGET+ тренировками подряд. */
export function streakFromHistory(rows: { week: string; workouts: number }[], currentWeek: string): StreakFromHistory {
  const credited = rows.filter((r) => r.workouts >= STREAK_WEEK_TARGET).map((r) => r.week).sort();
  const runs = weeklyRuns(credited, currentWeek);
  return {
    currentStreak: runs.current,
    longestStreak: runs.best,
    lastStreakWeek: credited.at(-1) ?? null,
    weekWorkouts: rows.find((r) => r.week === currentWeek)?.workouts ?? 0,
    weekWorkoutsKey: currentWeek,
  };
}
