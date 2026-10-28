import type { StretchZone } from "@/generated/prisma/enums";
import { primaryZone, STRETCH_ZONES } from "@/lib/stretching/zones";

/** Секунды удержания → минуты для показа: вниз, как XP (`stretchSessionXp`). */
export const stretchMinutes = (sec: number) => Math.floor(sec / 60);

/** Минуты по основной зоне (первая в списке), по убыванию; при равенстве — порядок `STRETCH_ZONES`. */
export function topZones(rows: { zones: StretchZone[]; sec: number }[], n = 3): { zone: StretchZone; minutes: number }[] {
  const sec = new Map<StretchZone, number>();
  for (const r of rows) {
    const zone = primaryZone(r.zones);
    if (!zone || r.sec <= 0) continue;
    sec.set(zone, (sec.get(zone) ?? 0) + r.sec);
  }
  return STRETCH_ZONES.filter((z) => sec.has(z))
    .map((zone) => ({ zone, minutes: sec.get(zone)! / 60 }))
    .sort((a, b) => b.minutes - a.minutes) // сортировка устойчивая — равные остаются в порядке зон
    .slice(0, n);
}
