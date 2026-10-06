import { z } from "zod";
import { MAX_REST_SEC } from "@/lib/exercises/schema";
import { MAX_EXERCISES } from "@/lib/workouts/schema";

export const templateExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  targetSets: z.number().int().min(1, "Минимум 1 подход").max(20, "Максимум 20 подходов"),
  targetReps: z.number().int().min(0).max(100).nullable(),
  targetWeight: z.number().min(0).max(1000).nullable(),
  restSec: z.number().int().min(0).max(MAX_REST_SEC),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(80, "Максимум 80 символов"),
  description: z
    .string()
    .trim()
    .max(300, "Максимум 300 символов")
    .transform((v) => v || null),
  exercises: z
    .array(templateExerciseSchema)
    .min(1, "Добавьте хотя бы одно упражнение")
    .max(MAX_EXERCISES, `Максимум ${MAX_EXERCISES} упражнений`),
});

export type TemplateInput = z.input<typeof templateSchema>;
