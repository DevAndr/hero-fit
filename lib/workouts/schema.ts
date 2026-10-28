import { z } from "zod";
import { MAX_REST_SEC } from "@/lib/exercises/schema";
import { isDoneSet, isTimed, type ExerciseKindName } from "@/lib/workouts/kinds";

export const MAX_EXERCISES = 30;
export const MAX_SETS = 50;

export const setDraftSchema = z.object({
  weight: z.number().min(0).max(1000).catch(0),
  reps: z.number().int().min(0).max(1000).catch(0),
  isWarmup: z.boolean().default(false),
  /** Запас повторов: 0 — до отказа … 4 — «4+»; null — не указан. */
  rir: z.number().int().min(0).max(4).nullable().default(null).catch(null),
  /** Подход на время/кардио: время, с; дистанция, м (старые черновики — без полей). */
  durationSec: z.number().int().min(0).max(86_400).nullable().default(null).catch(null),
  distanceM: z.number().int().min(0).max(1_000_000).nullable().default(null).catch(null),
  completedAt: z.iso.datetime().nullable(),
});

export const exerciseDraftSchema = z.object({
  exerciseId: z.string().min(1),
  restSec: z.number().int().min(0).max(MAX_REST_SEC),
  /** Суперсет/круг: номер группы (lib/workouts/supersets.ts); null — вне группы. Старые черновики — без поля. */
  group: z.number().int().min(1).nullable().default(null).catch(null),
  sets: z.array(setDraftSchema).max(MAX_SETS),
});

/** Состояние тренировки, которое клиент целиком отправляет при автосохранении. */
export const workoutDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  exercises: z.array(exerciseDraftSchema).max(MAX_EXERCISES),
});

export type SetDraft = z.input<typeof setDraftSchema>;
export type ExerciseDraft = z.input<typeof exerciseDraftSchema>;
export type WorkoutDraft = z.input<typeof workoutDraftSchema>;
export type WorkoutDraftParsed = z.output<typeof workoutDraftSchema>;

/**
 * Итоги по выполненным рабочим подходам (разминка и неотмеченные не считаются).
 * Повторы и объём — только силовые; `workSec`/`distanceM` — подходы на время и кардио;
 * `stretchSec` — растяжка (одностороннюю считаем с обеих сторон), в `workSec` не входит.
 */
export function workoutTotals(
  exercises: {
    kind?: ExerciseKindName;
    perSide?: boolean;
    sets: { weight: number; reps: number; durationSec?: number | null; distanceM?: number | null; isWarmup?: boolean; completedAt: unknown }[];
  }[],
) {
  let sets = 0;
  let reps = 0;
  let volume = 0;
  let workSec = 0;
  let stretchSec = 0;
  let distanceM = 0;
  let exerciseCount = 0;
  for (const exercise of exercises) {
    const done = exercise.sets.filter((s) => !s.isWarmup && isDoneSet(exercise.kind, s));
    if (done.length) exerciseCount++;
    for (const s of done) {
      sets++;
      if (exercise.kind === "STRETCH") {
        stretchSec += (s.durationSec ?? 0) * (exercise.perSide ? 2 : 1);
      } else if (isTimed(exercise.kind)) {
        workSec += s.durationSec ?? 0;
        distanceM += s.distanceM ?? 0;
      } else {
        reps += s.reps;
        volume += s.weight * s.reps;
      }
    }
  }
  return { sets, reps, volume: Math.round(volume * 10) / 10, exercises: exerciseCount, workSec, distanceM, stretchSec };
}

/**
 * Время с устройства (старт/финиш тренировки без сети) — принимаем, но в разумных рамках:
 * не в будущем, не раньше `min`, не старше `maxAgeMs`. Некорректное — серверное «сейчас».
 */
export function clampClientTime(iso: string | null | undefined, now: Date, min: Date | null, maxAgeMs: number) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return now;
  const lower = Math.max(min?.getTime() ?? -Infinity, now.getTime() - maxAgeMs);
  return new Date(Math.min(now.getTime(), Math.max(lower, t)));
}
