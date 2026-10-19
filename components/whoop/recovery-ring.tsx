import type { RecoveryZone } from "@/lib/whoop/recovery";
import { cn } from "@/lib/utils";

const STROKE: Record<RecoveryZone, string> = {
  green: "stroke-recovery-green",
  yellow: "stroke-recovery-yellow",
  red: "stroke-recovery-red",
};

const WIDTH = 8;

/**
 * Кольцо процента восстановления цветом зоны; без процента (WHOOP считает) — пустое кольцо с «—».
 * `textClassName` — размер цифры у маленького кольца (строка на экране тренировки).
 */
export function RecoveryRing({
  pct,
  zone,
  size = 96,
  textClassName,
}: {
  pct: number | null;
  zone: RecoveryZone | null;
  size?: number;
  textClassName?: string;
}) {
  const r = 50 - WIDTH / 2;
  const len = 2 * Math.PI * r;
  const filled = pct === null ? 0 : Math.min(100, Math.max(0, pct)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth={WIDTH} className="stroke-muted" />
        {filled > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth={WIDTH}
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - filled)}
            style={{ "--ring-len": len } as React.CSSProperties}
            className={cn(zone ? STROKE[zone] : "stroke-muted-foreground", "motion-safe:animate-[ring-fill_0.8s_ease-out]")}
          />
        ) : null}
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center text-xl font-black tabular-nums", pct === null ? "text-muted-foreground" : "text-foreground", textClassName)}>
        {pct === null ? "—" : `${pct} %`}
      </span>
    </div>
  );
}
