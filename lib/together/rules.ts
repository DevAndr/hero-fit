import type { TrainingSessionStatus, WorkoutStatus } from "@/generated/prisma/enums";

// Совместная тренировка (спека 2026-10-26-train-together): чистые правила без БД

export const INVITE_TTL_MIN = 15;
export const SESSION_MAX_H = 4;
export const MIN_OVERLAP_MIN = 20;
export const POLL_MS = 5000;
export const CHEER_GAP_MS = 10_000;
export const OFFLINE_AFTER_MS = 30_000;

const MIN = 60_000;

export type SessionStatus = TrainingSessionStatus;

/** Статус с ленивым истечением: приглашение — 15 минут, сессия — 4 часа после принятия (тика нет). */
export function sessionState(s: { status: SessionStatus; createdAt: Date; acceptedAt: Date | null }, now: Date): SessionStatus {
  if (s.status === "INVITED" && now.getTime() >= inviteExpiresAt(s.createdAt).getTime()) return "EXPIRED";
  if (s.status === "ACTIVE" && s.acceptedAt && now.getTime() - s.acceptedAt.getTime() >= SESSION_MAX_H * 60 * MIN) return "ENDED";
  return s.status;
}

export function inviteExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITE_TTL_MIN * MIN);
}

type Span = { startedAt: Date; finishedAt: Date };

export function overlapMinutes(a: Span, b: Span): number {
  const ms = Math.min(a.finishedAt.getTime(), b.finishedAt.getTime()) - Math.max(a.startedAt.getTime(), b.startedAt.getTime());
  return ms > 0 ? Math.floor(ms / MIN) : 0;
}

export type BonusInput = { status: WorkoutStatus | null; startedAt: Date | null; finishedAt: Date | null; totalSets: number };
export type NoBonus = "not_finished" | "short_overlap" | "no_sets" | "already_today" | "left";

/** Положен ли бонус получателю `a` (партнёр — `b`). */
export function bonusEligible(a: BonusInput, b: BonusInput, hadBonusToday: boolean): true | NoBonus {
  const done = (w: BonusInput): w is BonusInput & Span => w.status === "COMPLETED" && Boolean(w.startedAt && w.finishedAt);
  if (!done(a) || !done(b)) return "not_finished";
  if (a.totalSets <= 0 || b.totalSets <= 0) return "no_sets";
  if (overlapMinutes(a, b) < MIN_OVERLAP_MIN) return "short_overlap";
  if (hadBonusToday) return "already_today";
  return true;
}

export function bonusXp(xpEarned: number): number {
  return Math.max(5, Math.round(0.1 * xpEarned));
}

export type SnapshotExercise = { name: string; sets: { reps: number; weight: number | null; done: boolean }[]; record: boolean };
export type SnapshotCurrent = { exercise: string; doneSets: number; totalSets: number } | null;

type DraftExercise = { name: string; exerciseId: string; sets: { reps: number; weight: number; done: boolean }[] };

/** Срез тренировки партнёра для полосы; при скрытых весах вес не уходит вовсе (значок рекорда остаётся). */
export function partnerSnapshot(
  exercises: DraftExercise[],
  bests: Map<string, number>,
  hideWeights: boolean,
): { exercises: SnapshotExercise[]; current: SnapshotCurrent } {
  const out = exercises.map((e) => {
    const best = bests.get(e.exerciseId);
    return {
      name: e.name,
      sets: e.sets.map((x) => ({ reps: x.reps, weight: hideWeights ? null : x.weight, done: x.done })),
      record: best !== undefined && e.sets.some((x) => x.done && x.weight > best),
    };
  });
  return { exercises: out, current: currentExercise(exercises) };
}

/** Первое упражнение с невыполненными подходами после последнего выполненного подхода. */
export function currentExercise(exercises: DraftExercise[]): SnapshotCurrent {
  let lastDone = -1;
  exercises.forEach((e, i) => {
    if (e.sets.some((x) => x.done)) lastDone = i;
  });
  const from = Math.max(lastDone, 0);
  const e = exercises.slice(from).find((x) => x.sets.some((s) => !s.done));
  if (!e) return null;
  return { exercise: e.name, doneSets: e.sets.filter((s) => s.done).length, totalSets: e.sets.length };
}

export function canCheer(lastCheerAt: Date | null, now: Date): boolean {
  return !lastCheerAt || now.getTime() - lastCheerAt.getTime() >= CHEER_GAP_MS;
}

/** Строка про бонус в сводке тренировки «Вместе с …». */
export function bonusNote(i: {
  awarded: number | null;
  sessionStatus: SessionStatus;
  endReason: string | null;
  mine: BonusInput;
  theirs: BonusInput;
  partner: string;
}): string {
  if (i.awarded) return `+${i.awarded} XP за тренировку вместе`;
  if (i.sessionStatus === "ACTIVE") return `Бонус придёт, когда ${i.partner} закончит`;
  if (i.endReason === "left" || i.endReason === "cancelled") return "Кто-то вышел из сессии — бонуса нет";
  const why = bonusEligible(i.mine, i.theirs, false);
  if (why === "short_overlap") return `Пересеклись меньше ${MIN_OVERLAP_MIN} минут — бонуса нет`;
  if (why === "no_sets") return "В одной из тренировок нет подходов — бонуса нет";
  if (why === "not_finished") return `${i.partner} не закончил тренировку вместе с вами — бонуса нет`;
  return "Бонус за совместную тренировку сегодня уже был";
}

/**
 * Занимает ли сессия человека: закончивший свою тренировку свободен (сессия ждёт только партнёра) —
 * может звать и принимать новых, а экран тренировки не показывает ему старую полосу и баннер.
 */
export function holdsSession(
  s: { hostId: string; guestId: string; hostWorkout: WorkoutStatus | null; guestWorkout: WorkoutStatus | null },
  userId: string,
): boolean {
  const mine = s.hostId === userId ? s.hostWorkout : s.guestWorkout;
  return mine !== "COMPLETED";
}
