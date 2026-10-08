import { addDays } from "@/lib/plans/expand";

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

/** «5–11 октября» или «28 сентября – 4 октября» для недели с понедельником week. */
export function weekRangeLabel(week: string): string {
  const end = addDays(week, 6);
  if (week.slice(0, 7) === end.slice(0, 7)) return `${utc(week).getUTCDate()}–${dayMonth.format(utc(end))}`;
  return `${dayMonth.format(utc(week))} – ${dayMonth.format(utc(end))}`;
}

/** Изменение к прошлой неделе в процентах; от нуля процент не считается. */
export function delta(cur: number, prev: number): { pct: number | null; sign: "up" | "down" | "same" } {
  const sign = cur > prev ? "up" : cur < prev ? "down" : "same";
  if (prev === 0) return { pct: cur === 0 ? 0 : null, sign };
  return { pct: Math.round((Math.abs(cur - prev) / prev) * 100), sign };
}
