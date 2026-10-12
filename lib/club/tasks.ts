import { z } from "zod";
import type { ClubTaskMode, ClubTaskType } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { localMidnight } from "@/lib/progress/weekly-streak";

/** Задания клуба (спека 2026-10-12-club-tasks-design): чистые правила. */

export const CLUB_TASK_XP = 75;
export const CLUB_TASKS_ACTIVE_MAX = 3;
export const CLUB_TASK_CHESTS_PER_WEEK = 2;
export const CLUB_TASK_GRACE_MS = 24 * 3_600_000;
/** Вклад одной тренировки в «часы»: забытая на выходные тренировка не закрывает общее задание. */
export const CLUB_TASK_MAX_WORKOUT_MIN = 240;
const CHEST_KEEP_MS = 28 * 24 * 3_600_000;
export const START_AHEAD_DAYS = 14;

export const TASK_TYPES = ["WORKOUTS", "VOLUME", "REPS", "HOURS"] as const satisfies readonly ClubTaskType[];
export const TASK_MODES = ["CLUB", "EACH"] as const satisfies readonly ClubTaskMode[];

export const taskSchema = z
  .object({
    type: z.enum(TASK_TYPES),
    mode: z.enum(TASK_MODES),
    exerciseId: z.string().min(1).optional(),
    target: z.number().int().positive("Цель — целое число больше нуля").max(100_000_000),
    startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().int().min(7, "Срок — от 7 до 31 дня").max(31, "Срок — от 7 до 31 дня"),
  })
  .refine((t) => (t.type === "REPS") === Boolean(t.exerciseId), { message: "Для повторов выберите упражнение", path: ["exerciseId"] });

export type TaskInput = z.infer<typeof taskSchema>;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** Старт — сегодня…+14 дней (дни в поясе админа). */
export function startDayAllowed(startDay: string, today: string): boolean {
  const diff = dayNumber(startDay) - dayNumber(today);
  return diff >= 0 && diff <= START_AHEAD_DAYS;
}

/** Минимум цели на неделю срока: EACH — на человека, CLUB — на участника. */
const PER_WEEK: Record<ClubTaskMode, Record<ClubTaskType, number>> = {
  EACH: { WORKOUTS: 2, VOLUME: 5000, REPS: 200, HOURS: 2 },
  CLUB: { WORKOUTS: 2, VOLUME: 2000, REPS: 100, HOURS: 2 },
};

/** Минимум цели в базовых единицах (часы — в минутах): недели дробно, вверх; кг — до 100, часы — до целого часа. */
export function minTarget(type: ClubTaskType, mode: ClubTaskMode, days: number, members: number): number {
  const raw = PER_WEEK[mode][type] * (days / 7) * (mode === "CLUB" ? Math.max(1, members) : 1);
  // Погрешность плавающей точки: 2 × 7/7 не должно стать 3
  const up = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step;
  if (type === "VOLUME") return up(raw, 100);
  if (type === "HOURS") return up(raw, 1) * 60;
  return up(raw, 1);
}

export function taskBlock({ type, active, target, min }: { type: ClubTaskType; active: number; target: number; min: number }): string | null {
  if (active >= CLUB_TASKS_ACTIVE_MAX) return `В клубе уже ${CLUB_TASKS_ACTIVE_MAX} активных задания`;
  if (target < min) return `Минимум для такого задания: ${unitText(type, min)}`;
  return null;
}

export type WorkoutForTask = {
  totalVolume: number;
  durationSec: number;
  exercises: { exerciseId: string; sets: { reps: number | null; isWarmup: boolean; completedAt: Date | null }[] }[];
};

/** Вклад тренировки в задание; 0 — не пишется. */
export function workoutAmount(type: ClubTaskType, workout: WorkoutForTask, exerciseId: string | null): number {
  switch (type) {
    case "WORKOUTS":
      return 1;
    case "VOLUME":
      return Math.round(workout.totalVolume);
    case "HOURS":
      return Math.min(CLUB_TASK_MAX_WORKOUT_MIN, Math.round(workout.durationSec / 60));
    case "REPS":
      return workout.exercises
        .filter((e) => e.exerciseId === exerciseId)
        .flatMap((e) => e.sets)
        .filter((s) => !s.isWarmup && s.completedAt)
        .reduce((sum, s) => sum + (s.reps ?? 0), 0);
  }
}

/** Тренировка засчитывается: в окне, не раньше вступления, задание не отменено, офлайн-финиш — до 24 ч после окна. */
export function hitCounts(a: { finishedAt: Date; joinedAt: Date; startsAt: Date; endsAt: Date; now: Date; cancelledAt: Date | null }): boolean {
  if (a.cancelledAt) return false;
  if (a.finishedAt < a.startsAt || a.finishedAt >= a.endsAt) return false;
  if (a.finishedAt < a.joinedAt) return false;
  return a.now.getTime() < a.endsAt.getTime() + CLUB_TASK_GRACE_MS;
}

/** Порог сундука в CLUB: вклад ≥ 1 % цели или хотя бы одна тренировка с ненулевым вкладом. */
export function eligible({ amount, workouts, target }: { amount: number; workouts: number; target: number }): boolean {
  return workouts >= 1 || amount >= Math.ceil(target / 100);
}

const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }).replace(/ /g, " ");

export function unitText(type: ClubTaskType, n: number): string {
  switch (type) {
    case "WORKOUTS":
      return `${num(n)} ${plural(n, "тренировка", "тренировки", "тренировок")}`;
    case "VOLUME":
      return `${num(n)} кг`;
    case "REPS":
      return `${num(n)} ${plural(n, "повтор", "повтора", "повторов")}`;
    case "HOURS":
      return `${num(n / 60)} ч`;
  }
}

type TitleTask = { type: ClubTaskType; mode: ClubTaskMode; target: number; days: number };

/** «Клубом: 10 000 повторов в «Присед» за 30 дней», «Каждому: 12 тренировок за 28 дней». */
export function taskTitle(t: TitleTask, exerciseName: string | null): string {
  const what = t.type === "REPS" && exerciseName ? `${unitText(t.type, t.target)} в «${exerciseName}»` : unitText(t.type, t.target);
  const where = t.type === "HOURS" ? " в зале" : "";
  return `${t.mode === "CLUB" ? "Клубом" : "Каждому"}: ${what}${where} за ${t.days} ${plural(t.days, "день", "дня", "дней")}`;
}

/** Для ленты: при скрытых весах у объёма — без килограммов. */
export function taskFeedTitle(t: TitleTask, exerciseName: string | null, hideWeights: boolean): string {
  return hideWeights && t.type === "VOLUME" ? "задание клуба по объёму" : taskTitle(t, exerciseName);
}

/** Длительность задания в днях по окну. */
export function taskDays(t: { startsAt: Date; endsAt: Date }): number {
  return Math.round((t.endsAt.getTime() - t.startsAt.getTime()) / 86_400_000);
}

export function chestBlock({ openedThisWeek }: { openedThisWeek: number }): string | null {
  return openedThisWeek >= CLUB_TASK_CHESTS_PER_WEEK ? "Откроется с понедельника" : null;
}

/** Сундук хранится 4 недели после конца задания. */
export function chestExpired({ endsAt, now }: { endsAt: Date; now: Date }): boolean {
  return now.getTime() > endsAt.getTime() + CHEST_KEEP_MS;
}

/** Окно задания: полночь дня старта … полночь через `days` суток, в поясе админа. */
export function taskWindow(startDay: string, days: number, timeZone: string): { startsAt: Date; endsAt: Date } {
  const end = new Date(Date.parse(`${startDay}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return { startsAt: localMidnight(startDay, timeZone), endsAt: localMidnight(end, timeZone) };
}

/**
 * Задание для карточки на дашборде: начавшиеся раньше не начавшихся, невыполненные (мной — у «каждому») раньше
 * выполненных, дальше — что раньше кончается.
 */
export function pickCardTask<T extends { started: boolean; completed: boolean; endsAt: string }>(active: T[]): T | null {
  const rank = (t: T) => (t.started ? 0 : 2) + (t.completed ? 1 : 0);
  return [...active].sort((a, b) => rank(a) - rank(b) || a.endsAt.localeCompare(b.endsAt))[0] ?? null;
}
