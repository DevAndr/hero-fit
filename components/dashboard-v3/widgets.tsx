import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { Delta, WeekCompareView } from "@/lib/dashboard/v3";
import { formatDuration, formatTonnage } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Карточка виджета дашборда v3: ровная, как остальные карточки кабинета. */
export function Widget({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={cn("flex flex-col rounded-xl border bg-card p-4", className)}>
      <h3 className="font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** Изменение к прошлой неделе: рост — акцентом, снижение — приглушённо (не ошибка); знак дублирует цвет. */
function Change({ delta }: { delta: Delta | null }) {
  if (!delta) return null;
  const Icon = delta.dir === "up" ? ArrowUp : delta.dir === "down" ? ArrowDown : Minus;
  const text = delta.dir === "same" ? "как неделю назад" : `${delta.pct > 0 ? "+" : "−"}${Math.abs(delta.pct)} %`;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-semibold", delta.dir === "up" ? "text-primary" : "text-muted-foreground")}>
      <Icon className="size-3" aria-hidden />
      {text}
    </span>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: Delta | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-black tabular-nums">{value}</dd>
      {delta !== undefined ? <dd><Change delta={delta} /></dd> : null}
    </div>
  );
}

export function WeekNumbers({ week, className }: { week: WeekCompareView; className?: string }) {
  return (
    <Widget title="Неделя в цифрах" className={className}>
      <p className="text-xs text-muted-foreground">С понедельника · к тому же отрезку прошлой недели</p>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Объём" value={formatTonnage(week.cur.volume)} delta={week.volume} />
        <Stat label="В зале" value={week.cur.seconds ? formatDuration(week.cur.seconds) : "0 мин"} delta={week.seconds} />
        <Stat label="Подходы" value={String(week.cur.sets)} delta={week.sets} />
        <Stat label="Рекорды" value={String(week.cur.records)} />
      </dl>
    </Widget>
  );
}
