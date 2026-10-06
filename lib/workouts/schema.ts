import { z } from "zod";
import { MAX_REST_SEC } from "@/lib/exercises/schema";

export const MAX_EXERCISES = 30;
export const MAX_SETS = 50;

export const setDraftSchema = z.object({
  weight: z.number().min(0).max(1000).catch(0),
  reps: z.number().int().min(0).max(1000).catch(0),
  isWarmup: z.boolean().default(false),
  completedAt: z.iso.datetime().nullable(),
});

export const exerciseDraftSchema = z.object({
  exerciseId: z.string().min(1),
  restSec: z.number().int().min(0).max(MAX_REST_SEC),
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

/** Итоги по выполненным рабочим подходам (разминка и неотмеченные не считаются). */
export function workoutTotals(exercises: { sets: { weight: number; reps: number; isWarmup?: boolean; completedAt: unknown }[] }[]) {
  let sets = 0;
  let reps = 0;
  let volume = 0;
  let exerciseCount = 0;
  for (const exercise of exercises) {
    const done = exercise.sets.filter((s) => s.completedAt && !s.isWarmup && s.reps > 0);
    if (done.length) exerciseCount++;
    for (const s of done) {
      sets++;
      reps += s.reps;
      volume += s.weight * s.reps;
    }
  }
  return { sets, reps, volume: Math.round(volume * 10) / 10, exercises: exerciseCount };
}
