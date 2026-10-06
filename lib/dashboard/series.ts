export type DayPoint = { day: string; volume: number; workouts: number };

/** N календарных дней подряд, заканчивая `today` («YYYY-MM-DD»); дни без тренировок — нули. */
export function lastDays(rows: DayPoint[], today: string, count: number): DayPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const end = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (count - 1 - i));
    const day = d.toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, volume: 0, workouts: 0 };
  });
}
