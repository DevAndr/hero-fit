/** Назначение тренировки клиенту: ввод и текст уведомления (чистые функции). */
import { z } from "zod";
import { planDateSchema, planInputSchema } from "@/lib/plans/schema";
import { plural } from "@/lib/format";
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

/** Назначение нескольким: не больше клиентов за раз. */
export const ASSIGN_MANY_MAX = 50;

/** Кому назначать: только активные клиенты тренера, без повторов, в порядке запроса; остальные — пропущены. */
export function pickClients(requested: string[], active: string[]): { ids: string[]; skipped: number } {
  const unique = [...new Set(requested)];
  const ok = new Set(active);
  const ids = unique.filter((id) => ok.has(id));
  return { ids, skipped: unique.length - ids.length };
}

/** «Назначено 3 клиентам» или «Назначено 3 клиентам · 1 пропущен». */
export function assignManyText(assigned: number, skipped: number): string {
  const text = `Назначено ${assigned} ${plural(assigned, "клиенту", "клиентам", "клиентам")}`;
  return skipped ? `${text} · ${skipped} ${plural(skipped, "пропущен", "пропущено", "пропущено")}` : text;
}
