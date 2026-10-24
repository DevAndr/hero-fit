import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import type { RecordType } from "@/generated/prisma/enums";
import type { Delta, WeekCompareView } from "@/lib/dashboard/v2";
import type { RecentRecord } from "@/lib/dashboard/v2-queries";
import { formatDuration, formatTonnage } from "@/lib/format";
import { trendHeadline, trendLine, type StrengthTrend } from "@/lib/stats/strength";
import { cn } from "@/lib/utils";

/** Карточка виджета дашборда v2: ровная, как остальные карточки кабинета. */
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

export function StrengthCard({ strength }: { strength: StrengthTrend }) {
  return (
    <Widget title="Тренд силы">
      <p className="text-xs text-muted-foreground">4 недели к 4 предыдущим</p>
      <p className="mt-2 text-sm font-semibold">{trendHeadline(strength)}</p>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {strength.top.map((t) => (
          <li key={t.exerciseId}>{trendLine(t)}</li>
        ))}
      </ul>
    </Widget>
  );
}

const RECORD_LABEL: Record<RecordType, string> = { ONE_RM: "1RM", MAX_WEIGHT: "макс. вес", MAX_REPS: "повторы", MAX_DURATION: "время", MAX_DISTANCE: "дистанция", BEST_PACE: "темп" };
const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function recordValue(type: RecordType, v: number): string {
  if (type === "MAX_REPS") return `${num(v)} повт.`;
  if (type === "MAX_DURATION") return formatDuration(v);
  if (type === "MAX_DISTANCE") return `${num(v / 1000)} км`;
  return `${num(v)} кг`;
}

function recordGain(type: RecordType, v: number, prev: number): string {
  if (type === "MAX_DURATION") return `+${formatDuration(v - prev)}`;
  if (type === "MAX_DISTANCE") return `+${num((v - prev) / 1000)} км`;
  return `+${num(v - prev)}`;
}

export function RecentRecords({ records, className }: { records: RecentRecord[]; className?: string }) {
  return (
    <Widget title="Свежие рекорды" className={className}>
      {records.length ? (
        <ul className="mt-2 space-y-2 text-sm">
          {records.map((r) => (
            <li key={`${r.exerciseId}:${r.type}:${r.achievedAt.toISOString()}`}>
              <Link href={`/stats/exercises/${r.exerciseId}`} className="flex items-start gap-2 hover:text-primary">
                <Trophy className="mt-0.5 size-4 shrink-0 text-xp" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium break-words">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {RECORD_LABEL[r.type]} {recordValue(r.type, r.value)}
                    {r.prev !== null && r.value > r.prev ? <span className="ml-1 font-semibold text-primary">{recordGain(r.type, r.value, r.prev)}</span> : " · первый результат"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Рекорды появятся после тренировок</p>
      )}
    </Widget>
  );
}
