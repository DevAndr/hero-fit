import { z } from "zod";

export const planDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d, "Нет такой даты");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");
const durationMin = z.number().int().min(15).max(240).multipleOf(15);
const title = z.string().trim().min(1, "Введите название").max(80);
const templateId = z.string().min(1).nullable();

export const PLAN_DURATIONS = [30, 45, 60, 75, 90, 120] as const;

export const planInputSchema = z.object({
  templateId,
  title,
  date: planDateSchema,
  time,
  durationMin,
  /** Пусто — разовая тренировка; иначе — серия на каждый день недели (0 = пн … 6 = вс). */
  repeatWeekdays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Дни повторяются"),
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const planPatchSchema = z
  .object({ templateId, title, date: planDateSchema, time, durationMin })
  .partial();

export const planScopeSchema = z.enum(["one", "following"]);
