import { ringArcs } from "@/lib/nutrition/diary";

const SIZE = 140;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

const n = (v: number) => v.toLocaleString("ru-RU");

/** Кольцо калорий: заполнение — съеденное от нормы; сверх нормы — второй круг цветом destructive. Внутри — «осталось». */
export function CalorieRing({ eaten, norm }: { eaten: number; norm: number }) {
  const { main, over } = ringArcs(eaten, norm);
  const overBy = eaten - norm;
  const label = `Съедено ${n(eaten)} из ${n(norm)} ккал, ${overBy > 0 ? `${n(overBy)} сверх нормы` : `осталось ${n(-overBy)}`}`;
  const arc = (share: number) => ({ strokeDasharray: C, strokeDashoffset: C * (1 - share) });
  return (
    <div role="img" aria-label={label} className="relative size-[140px] shrink-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" aria-hidden>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-muted" />
        {main > 0 ? (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            style={arc(main)}
          />
        ) : null}
        {over > 0 ? (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className="stroke-destructive transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            style={arc(over)}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={overBy > 0 ? "text-2xl font-extrabold tabular-nums text-destructive" : "text-2xl font-extrabold tabular-nums"}>
          {overBy > 0 ? `+${n(overBy)}` : n(-overBy)}
        </span>
        <span className="text-xs text-muted-foreground">{overBy > 0 ? "сверх нормы" : "осталось"}</span>
      </div>
    </div>
  );
}
