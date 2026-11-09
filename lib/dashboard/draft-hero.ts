import { plural } from "@/lib/format";
import { occurrenceStart } from "@/lib/plans/reminders";

export type DraftHero = {
  name: string;
  exercises: number;
  hasCompleted: boolean;
  slot: { date: string; time: string } | null;
};

/** Слот для героя: только ещё не наступившее вхождение, иначе прошедшее время выглядело бы как будущее. */
export function upcomingSlot(o: { date: string; time: string } | null, tz: string, now: Date): DraftHero["slot"] {
  return o && occurrenceStart(o, tz).getTime() > now.getTime() ? { date: o.date, time: o.time } : null;
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const at = (day: string) => new Date(`${day}T12:00:00Z`);

/** Тексты героя дашборда для черновика (PLANNED): день — «сегодня» / «завтра» / «14 ноября»; today — «YYYY-MM-DD» в поясе игрока. */
export function draftHeroCopy(d: DraftHero, today: string): { headline: string; detail: string | null; cta: string } {
  if (d.exercises === 0) {
    return {
      headline: d.hasCompleted ? "Твоя тренировка ждёт упражнений" : "Собери первую тренировку",
      detail: null,
      cta: "Собрать тренировку",
    };
  }
  const parts = [`«${d.name}»`, `${d.exercises} ${plural(d.exercises, "упражнение", "упражнения", "упражнений")}`];
  if (d.slot) {
    const tomorrow = new Date(at(today).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day = d.slot.date === today ? "сегодня" : d.slot.date === tomorrow ? "завтра" : dateFormat.format(at(d.slot.date));
    parts.push(`${day} в ${d.slot.time}`);
  }
  return { headline: "Твоя тренировка готова", detail: parts.join(" · "), cta: "Начать тренировку" };
}
