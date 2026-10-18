/** Группы списка в /admin/alerts: выключенные и закончившиеся — в прошедших. */
export function groupAlerts<T extends { enabled: boolean; startsAt: Date; endsAt: Date | null }>(
  rows: T[],
  now: Date,
): { live: T[]; planned: T[]; past: T[] } {
  const t = now.getTime();
  const live: T[] = [];
  const planned: T[] = [];
  const past: T[] = [];
  for (const r of rows) {
    if (!r.enabled || (r.endsAt && r.endsAt.getTime() <= t)) past.push(r);
    else if (r.startsAt.getTime() > t) planned.push(r);
    else live.push(r);
  }
  const asc = (a: T, b: T) => a.startsAt.getTime() - b.startsAt.getTime();
  return { live: live.sort(asc), planned: planned.sort(asc), past: past.sort((a, b) => asc(b, a)) };
}
