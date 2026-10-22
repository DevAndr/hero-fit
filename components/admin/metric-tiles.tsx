import { cn } from "@/lib/utils";
import { deltaPercent } from "@/lib/admin/metrics";
import type { Overview } from "@/lib/admin/metrics-queries";

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Сравнение с прошлым таким же периодом; рост — акцентом, падение — приглушённо (без красного). */
function Delta({ now, prev, period }: { now: number; prev: number; period: string }) {
  const d = deltaPercent(now, prev);
  if (d === null) return <span className="text-muted-foreground">— к прошлым {period}</span>;
  return (
    <span className={cn(d > 0 ? "text-primary" : "text-muted-foreground")}>
      {d > 0 ? "+" : d < 0 ? "−" : ""}
      {Math.abs(d)} % к прошлым {period}
    </span>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      {children ? <div className="mt-2 space-y-0.5 text-xs">{children}</div> : null}
    </div>
  );
}

function Line({ label, value, children }: { label: string; value: number | string; children?: React.ReactNode }) {
  return (
    <p className="flex flex-wrap gap-x-1.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold tabular-nums">{typeof value === "number" ? fmt(value) : value}</span>
      {children}
    </p>
  );
}

export function MetricTiles({ overview: o }: { overview: Overview }) {
  return (
    <section aria-label="Сводка" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Tile label="Пользователей" value={fmt(o.users)}>
        <Line label="Тренеры" value={o.coaches} />
        <Line label="Обычные" value={o.users - o.coaches} />
      </Tile>
      <Tile label="Новые" value={fmt(o.newToday)}>
        <p className="text-muted-foreground">сегодня</p>
        <Line label="7 дн" value={o.new7}>
          <Delta now={o.new7} prev={o.new7Prev} period="7 дн" />
        </Line>
        <Line label="30 дн" value={o.new30}>
          <Delta now={o.new30} prev={o.new30Prev} period="30 дн" />
        </Line>
      </Tile>
      <Tile label="Активные" value={fmt(o.dau)}>
        <p className="text-muted-foreground">сегодня (DAU)</p>
        <Line label="WAU" value={o.wau}>
          <Delta now={o.wau} prev={o.wauPrev} period="7 дн" />
        </Line>
        <Line label="MAU" value={o.mau}>
          <Delta now={o.mau} prev={o.mauPrev} period="30 дн" />
        </Line>
      </Tile>
      <Tile label="Тренировок" value={fmt(o.workouts)}>
        <p className="text-muted-foreground">всего</p>
        <Line label="7 дн" value={o.workouts7}>
          <Delta now={o.workouts7} prev={o.workouts7Prev} period="7 дн" />
        </Line>
        <Line label="30 дн" value={o.workouts30}>
          <Delta now={o.workouts30} prev={o.workouts30Prev} period="30 дн" />
        </Line>
      </Tile>
      <Tile label="Часов в зале" value={o.hours30.toLocaleString("ru-RU")}>
        <p className="text-muted-foreground">за 30 дней</p>
        <Delta now={o.hours30} prev={o.hours30Prev} period="30 дн" />
      </Tile>
      <Tile label="Средняя тренировка" value={o.avgMinutes30 === null ? "—" : `${o.avgMinutes30} мин`}>
        <p className="text-muted-foreground">за 30 дней</p>
      </Tile>
    </section>
  );
}
