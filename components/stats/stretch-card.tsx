import type { StretchStats } from "@/lib/stats/queries";
import { stretchZoneLabel } from "@/lib/stretching/zones";

const minutes = (n: number) => `${n.toLocaleString("ru-RU")} мин`;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

/** Растяжка: минуты и сессии за неделю / 30 дней и зоны, которые тянешь чаще всего. */
export function StretchCard({ data }: { data: StretchStats }) {
  return (
    <section aria-label="Растяжка" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Растяжка</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Минут за неделю" value={minutes(data.week.minutes)} />
        <Tile label="Сессий за неделю" value={String(data.week.sessions)} />
        <Tile label="Минут за 30 дней" value={minutes(data.days30.minutes)} />
        <Tile label="Сессий за 30 дней" value={String(data.days30.sessions)} />
      </div>
      {data.topZones.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Чаще всего тянешь (30 дней)</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.topZones.map((z) => (
              <li key={z.zone} className="rounded-full bg-muted px-3 py-1 text-sm">
                {stretchZoneLabel(z.zone)} · <span className="font-semibold">{minutes(z.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
