import { z } from "zod";
import { ExerciseKind, MuscleGroup, StretchZone } from "@/generated/prisma/enums";

export const MAX_REST_SEC = 600;

export const exerciseSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2, "Название — минимум 2 символа").max(80, "Название — максимум 80 символов"),
  description: z
    .string()
    .trim()
    .max(500, "Описание — максимум 500 символов")
    .transform((v) => v || null),
  muscleGroups: z
    .array(z.enum(MuscleGroup, "Неизвестная группа мышц"))
    .transform((groups) => [...new Set(groups)]),
  /** Только у STRETCH; первая зона — основная. */
  stretchZones: z
    .array(z.enum(StretchZone, "Неизвестная зона"))
    .default([])
    .transform((zones) => [...new Set(zones)]),
  /** Только у STRETCH: одностороннее (каждая сторона). */
  perSide: z.boolean().default(false),
  isBodyweight: z.boolean(),
  /** Повторы / на время / кардио (выбор — при флаге workout_formats). */
  kind: z.enum(ExerciseKind, "Неизвестный вид упражнения").default("REPS"),
  defaultRestSec: z.coerce
    .number("Укажите время отдыха")
    .int("Целое число секунд")
    .min(0, "Не меньше 0")
    .max(MAX_REST_SEC, `Не больше ${MAX_REST_SEC} секунд`),
}).superRefine((v, ctx) => {
  if (v.kind === "STRETCH") {
    if (v.stretchZones.length === 0) ctx.addIssue({ code: "custom", path: ["stretchZones"], message: "Выбери хотя бы одну зону" });
    if (v.muscleGroups.length > 0) ctx.addIssue({ code: "custom", path: ["muscleGroups"], message: "У растяжки нет групп мышц — выбери зоны" });
    return;
  }
  if (v.muscleGroups.length === 0) ctx.addIssue({ code: "custom", path: ["muscleGroups"], message: "Выберите хотя бы одну группу мышц" });
  if (v.stretchZones.length > 0) ctx.addIssue({ code: "custom", path: ["stretchZones"], message: "Зоны растяжки — только у растяжки" });
}).transform((v) => (v.kind === "STRETCH" ? v : { ...v, perSide: false }));

export type ExerciseInput = z.output<typeof exerciseSchema>;

export function parseExerciseForm(formData: FormData) {
  const result = exerciseSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    // Порядок важен: первая выбранная группа — основная.
    muscleGroups: formData.getAll("muscleGroups"),
    stretchZones: formData.getAll("stretchZones"),
    perSide: formData.get("perSide") === "on",
    isBodyweight: formData.get("isBodyweight") === "on",
    kind: formData.get("kind") || undefined,
    defaultRestSec: formData.get("defaultRestSec") ?? "",
  });

  return result.success
    ? { success: true as const, data: result.data, errors: undefined }
    : { success: false as const, data: undefined, errors: z.flattenError(result.error).fieldErrors };
}
