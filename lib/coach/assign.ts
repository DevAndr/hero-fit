/** Назначение тренировки клиенту: ввод и текст уведомления (чистые функции). */
import { z } from "zod";
import { planDateSchema, planInputSchema } from "@/lib/plans/schema";
import { WEEKDAYS_SHORT } from "@/lib/plans/view";

export const assignInputSchema = planInputSchema
  .omit({ title: true })
  .extend({ templateId: z.string().min(1, "Выберите шаблон"), endDate: planDateSchema.nullable() })
  .refine((v) => v.endDate === null || v.endDate >= v.date, { message: "«До» раньше начала", path: ["endDate"] });
export type AssignInput = z.input<typeof assignInputSchema>;

const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (date: string) => shortDate.format(new Date(`${date}T12:00:00Z`));

/** «Ноги — база на 13 окт.» или «Ноги — база, пн/ср/пт с 13 окт.». */
export function assignmentText({ templateName, date, weekdays }: { templateName: string; date: string; weekdays: number[] }): string {
  if (!weekdays.length) return `${templateName} на ${fmt(date)}`;
  const days = [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAYS_SHORT[d].toLowerCase());
  return `${templateName}, ${days.join("/")} с ${fmt(date)}`;
}
