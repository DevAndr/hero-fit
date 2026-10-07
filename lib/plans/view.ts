import { addDays, weekdayOf } from "./expand";
import { minutesOf, monthGrid, timeOf, type PlanStatus } from "./match";

export type CalendarViewKind = "week" | "month";
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...options });
const dayMonth = fmt({ day: "numeric", month: "long" });
const monthName = fmt({ month: "long" });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mondayOf = (date: string) => addDays(date, -weekdayOf(date));

/** Даты, которые показывает вид (включительно). */
export function viewRange(view: CalendarViewKind, date: string): { from: string; to: string } {
  if (view === "week") return { from: mondayOf(date), to: addDays(mondayOf(date), 6) };
  const grid = monthGrid(date.slice(0, 7));
  return { from: grid[0], to: grid.at(-1)! };
}

/** ‹ › — на неделю или на месяц (день месяца — не больше последнего). */
export function shiftDate(view: CalendarViewKind, date: string, step: number): string {
  if (view === "week") return addDays(date, 7 * step);
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + step, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export function viewTitle(view: CalendarViewKind, date: string): string {
  const year = (d: string) => d.slice(0, 4);
  if (view === "month") return `${capitalize(monthName.format(utc(date)))} ${year(date)}`;
  const from = mondayOf(date);
  const to = addDays(from, 6);
  if (year(from) !== year(to)) return `${dayMonth.format(utc(from))} ${year(from)} – ${dayMonth.format(utc(to))} ${year(to)}`;
  if (from.slice(5, 7) !== to.slice(5, 7)) return `${dayMonth.format(utc(from))} – ${dayMonth.format(utc(to))} ${year(to)}`;
  return `${Number(from.slice(8))}–${dayMonth.format(utc(to))} ${year(to)}`;
}

/** «четверг, 10 января» */
export const dayLabel = (date: string) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(utc(date));

export const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: "запланировано",
  today: "сегодня",
  done: "выполнено",
  missed: "пропущено",
};

export const endTime = (time: string, durationMin: number) => timeOf((minutesOf(time) + durationMin) % (24 * 60));

/** Подпись события для скринридера и тестов: «Push, четверг, 10 января, 18:00–19:00, запланировано». */
export function eventLabel(e: { title: string; date: string; time: string; durationMin: number }, status: PlanStatus) {
  return `${e.title}, ${dayLabel(e.date)}, ${e.time}–${endTime(e.time, e.durationMin)}, ${STATUS_LABEL[status]}`;
}

/** Стабильный цвет шаблона: chart-1…5 (как разные календари в Google); без шаблона — primary. */
const COLORS = [
  "border-chart-1 bg-chart-1/15",
  "border-chart-2 bg-chart-2/15",
  "border-chart-3 bg-chart-3/15",
  "border-chart-4 bg-chart-4/15",
  "border-chart-5 bg-chart-5/15",
];
const DOTS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
function colorIndex(templateId: string | null) {
  if (!templateId) return -1;
  let h = 0;
  for (const c of templateId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % COLORS.length;
}
export const eventColor = (templateId: string | null) => COLORS[colorIndex(templateId)] ?? "border-primary bg-primary/15";
export const eventDot = (templateId: string | null) => DOTS[colorIndex(templateId)] ?? "bg-primary";
