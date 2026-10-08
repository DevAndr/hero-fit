/** Мини-инфографика фич для лендинга — декоративные «экраны» из приложения (aria-hidden, смысл — в подписи карточки). */
import { Award, Check, Flame, Medal, Snowflake, TrendingUp, Trophy, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function LevelHud({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-xl border bg-card/90 p-4 shadow-lg backdrop-blur", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="rounded-md bg-xp/15 px-1.5 py-0.5 font-bold text-xp">LVL 7</span>
        <span className="text-muted-foreground">72 / 100 XP</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="hf-fill h-full w-[72%] rounded-full bg-xp" />
      </div>
      <p className="mt-2 text-xs font-semibold text-xp">+85 XP за тренировку</p>
    </div>
  );
}

export function StreakWeeks({ className }: { className?: string }) {
  const weeks = [3, 3, 4, 3, 2];
  return (
    <div aria-hidden className={cn("flex items-end gap-2", className)}>
      {weeks.map((n, i) => {
        const current = i === weeks.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="flex flex-col-reverse gap-1">
              {Array.from({ length: 3 }, (_, d) => (
                <span key={d} className={cn("size-3 rounded-sm", d < n ? (current ? "bg-streak/60" : "bg-streak") : "bg-muted")} />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">{current ? "сейчас" : `н${i + 1}`}</span>
          </div>
        );
      })}
      <Flame className="hf-flicker mb-4 size-7 text-streak" />
    </div>
  );
}

export function BadgeRow({ className }: { className?: string }) {
  const badges = [
    { icon: Trophy, tone: "bg-xp/15 text-xp" },
    { icon: Medal, tone: "bg-primary/15 text-primary" },
    { icon: Award, tone: "bg-chart-4/15 text-chart-4" },
    { icon: Flame, tone: "bg-streak/15 text-streak" },
  ];
  return (
    <div aria-hidden className={cn("flex gap-2", className)}>
      {badges.map(({ icon: Icon, tone }, i) => (
        <span key={i} className={cn("flex size-11 items-center justify-center rounded-full ring-1 ring-border", tone)}>
          <Icon className="size-5" />
        </span>
      ))}
    </div>
  );
}

/** Рост силы: линия e1RM и подсказка «пора увеличить вес». */
export function ProgressChart({ className }: { className?: string }) {
  const points = [70, 72.5, 72.5, 75, 77.5, 77.5, 80, 82.5];
  const w = 220;
  const h = 80;
  const min = 65;
  const max = 85;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - ((p - min) / (max - min)) * h] as const);
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      <svg viewBox={`-6 -6 ${w + 12} ${h + 12}`} className="h-24 w-full overflow-visible">
        <polyline
          points={xy.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          className="hf-draw stroke-primary"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ ["--hf-len" as string]: 300 }}
        />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 5 : 3} className={i === xy.length - 1 ? "fill-xp" : "fill-primary"} />
        ))}
      </svg>
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
        <TrendingUp className="size-3.5" /> Пора увеличить вес: +2,5 кг
      </span>
    </div>
  );
}

export function RestTimerRing({ className }: { className?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div aria-hidden className={cn("flex items-center gap-4", className)}>
      <div className="relative size-24">
        <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
          <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth={7} />
          <circle cx="40" cy="40" r={r} className="hf-draw fill-none stroke-primary" strokeWidth={7} strokeLinecap="round" strokeDasharray={`${c * 0.62} ${c}`} style={{ ["--hf-len" as string]: c }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold tabular-nums">1:12</span>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="rounded-md border px-2 py-1 text-center font-semibold">+15 с</span>
        <span className="rounded-md border px-2 py-1 text-center font-semibold">−15 с</span>
      </div>
    </div>
  );
}

export function MiniCalendar({ className }: { className?: string }) {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const plan: Record<number, { label: string; done?: boolean; tone: string }> = {
    0: { label: "Push", done: true, tone: "bg-chart-1/20 border-chart-1" },
    2: { label: "Pull", done: true, tone: "bg-chart-2/20 border-chart-2" },
    4: { label: "Legs", tone: "bg-chart-3/20 border-chart-3" },
  };
  return (
    <div aria-hidden className={cn("grid grid-cols-7 gap-1 text-center text-[10px]", className)}>
      {days.map((d, i) => (
        <div key={d} className="space-y-1">
          <p className="text-muted-foreground">{d}</p>
          <div className="h-14 rounded-md bg-muted/50 p-0.5">
            {plan[i] ? (
              <div className={cn("flex h-8 flex-col items-center justify-center rounded border-l-2 font-semibold", plan[i].tone)}>
                {plan[i].label}
                {plan[i].done ? <Check className="size-3 text-primary" /> : null}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiniLeague({ className }: { className?: string }) {
  const rows = [
    { name: "Вы", xp: 420, me: true },
    { name: "Iron_Masha", xp: 390 },
    { name: "Борис", xp: 230 },
  ];
  return (
    <ol aria-hidden className={cn("grid gap-1 text-sm", className)}>
      {rows.map((r, i) => (
        <li key={r.name} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", r.me && "bg-primary/10 font-semibold")}>
          <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
          <span className="flex-1">{r.name}</span>
          <span className="text-xp tabular-nums">{r.xp} XP</span>
        </li>
      ))}
    </ol>
  );
}

export function MiniRecap({ className }: { className?: string }) {
  const tiles = [
    { label: "Тренировки", value: "4", delta: "+1" },
    { label: "Объём", value: "15,8 т", delta: "+21%" },
  ];
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      <p className="text-sm font-semibold">1-е место в лиге · лучший подход: Жим 90×5</p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-background/60 p-2">
            <p className="text-[11px] text-muted-foreground">{t.label}</p>
            <p className="font-display text-lg font-bold">{t.value}</p>
            <p className="text-[11px] font-semibold text-primary">▲ {t.delta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MuscleBars({ className }: { className?: string }) {
  const rows = [
    { label: "Грудь", v: 16 },
    { label: "Ноги", v: 15 },
    { label: "Спина", v: 14 },
    { label: "Плечи", v: 10 },
  ];
  return (
    <div aria-hidden className={cn("grid gap-1.5 text-xs", className)}>
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-12 text-muted-foreground">{r.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            <div className="hf-fill h-full rounded-sm bg-chart-1" style={{ width: `${(r.v / 16) * 100}%`, animationDelay: `${0.4 + i * 0.1}s` }} />
          </div>
          <span className="w-5 text-right tabular-nums">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

export function OfflineBadge({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-center gap-3", className)}>
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <WifiOff className="size-6 text-muted-foreground" />
      </span>
      <div className="text-xs">
        <p className="font-semibold">Подвал без связи? Не страшно</p>
        <p className="text-muted-foreground">Подходы сохраняются на телефоне и уйдут на сервер, когда появится сеть</p>
      </div>
    </div>
  );
}

export function FreezeChip({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-1 rounded-full bg-chart-2/15 px-2.5 py-1 text-xs font-semibold text-chart-2", className)}>
      <Snowflake className="size-3.5" /> Заморозка спасла неделю
    </span>
  );
}
