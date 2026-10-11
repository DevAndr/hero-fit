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

/**
 * Подписи в «Назначить нескольким»: одинаковые имена (у клиентов без ника) различаются датой начала работы
 * (`linkedDay` — день в поясе тренера), совпала и она — номером. Логин не показываем никому.
 */
export function clientPickLabels(rows: { id: string; name: string; linkedDay: string }[]): { id: string; name: string }[] {
  const count = (labels: string[]) => labels.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
  const names = count(rows.map((r) => r.name));
  const dated = rows.map((r) => (names.get(r.name)! > 1 ? `${r.name} · с ${fmt(r.linkedDay)}` : r.name));
  const totals = count(dated);
  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const label = dated[i];
    if (totals.get(label)! === 1) return { id: r.id, name: label };
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return { id: r.id, name: `${label} (${n})` };
  });
}
