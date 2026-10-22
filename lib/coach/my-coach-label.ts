import { plural } from "@/lib/format";

const DAY_MS = 86_400_000;
const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);

/** «Вместе 3 дня / 2 недели / 5 месяцев» — сколько клиент занимается с тренером (дни — местные, YYYY-MM-DD). */
export function togetherLabel(linkedDay: string, today: string): string {
  const days = Math.max(0, Math.round((noon(today) - noon(linkedDay)) / DAY_MS));
  if (days === 0) return "начали сегодня";
  if (days < 14) return `вместе ${days} ${plural(days, "день", "дня", "дней")}`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `вместе ${weeks} ${plural(weeks, "неделю", "недели", "недель")}`;
  }
  const months = Math.floor(days / 30);
  return `вместе ${months} ${plural(months, "месяц", "месяца", "месяцев")}`;
}
