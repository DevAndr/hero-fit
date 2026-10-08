"use client";

/**
 * Мини-инфографика фич для лендинга — декоративные «экраны» из приложения (aria-hidden, смысл — в подписи карточки).
 * Анимации стартуют, когда блок попадает в экран: Motion (бары, линии, появление) и NumberFlow (бегущие цифры).
 */
import { useEffect, useState } from "react";
import { m } from "motion/react";
import { Award, Check, Flame, Medal, Snowflake, TrendingUp, Trophy, WifiOff } from "lucide-react";
import { CountUp, useSeen } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const SPRING = { type: "spring", stiffness: 140, damping: 18 } as const;

export function LevelHud({ className, delay = 0.3 }: { className?: string; delay?: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("rounded-xl border bg-card/90 p-4 shadow-lg backdrop-blur", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="rounded-md bg-xp/15 px-1.5 py-0.5 font-bold text-xp">LVL 7</span>
        <span className="text-muted-foreground tabular-nums">
          <CountUp value={72} delay={delay} /> / 100 XP
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
        <m.div
          className="h-full origin-left rounded-full bg-xp"
          initial={{ scaleX: 0 }}
          animate={seen ? { scaleX: 0.72 } : undefined}
          transition={{ duration: 1.4, delay, ease: EASE }}
        />
      </div>
      <p className="mt-2 text-xs font-semibold text-xp">
        <CountUp value={85} prefix="+" suffix=" XP за тренировку" delay={delay + 0.2} />
      </p>
    </div>
  );
}

export function StreakWeeks({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const weeks = [3, 3, 3, 3, 2];
  return (
    <div ref={ref} aria-hidden className={cn("flex items-end gap-2", className)}>
      {weeks.map((n, i) => {
        const current = i === weeks.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="flex flex-col-reverse gap-1">
              {Array.from({ length: 3 }, (_, d) => (
                <m.span
                  key={d}
                  className={cn("size-3 rounded-sm", d < n ? (current ? "bg-streak/60" : "bg-streak") : "bg-muted")}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={seen ? { scale: 1, opacity: 1 } : undefined}
                  transition={{ ...SPRING, delay: 0.15 + i * 0.12 + d * 0.05 }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">{current ? "сейчас" : `н${i + 1}`}</span>
          </div>
        );
      })}
      <m.span
        className="mb-4"
        initial={{ scale: 0, rotate: -20 }}
        animate={seen ? { scale: [0, 1.25, 1], rotate: [-20, 8, 0] } : undefined}
        transition={{ duration: 0.7, delay: 0.85 }}
      >
        <Flame className="hf-flicker size-7 text-streak" />
      </m.span>
    </div>
  );
}

export function BadgeRow({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const badges = [
    { icon: Trophy, tone: "bg-xp/15 text-xp" },
    { icon: Medal, tone: "bg-primary/15 text-primary" },
    { icon: Award, tone: "bg-chart-4/15 text-chart-4" },
    { icon: Flame, tone: "bg-streak/15 text-streak" },
  ];
  return (
    <div ref={ref} aria-hidden className={cn("flex gap-2", className)}>
      {badges.map(({ icon: Icon, tone }, i) => (
        <m.span
          key={i}
          className={cn("flex size-11 items-center justify-center rounded-full ring-1 ring-border", tone)}
          initial={{ scale: 0, rotate: -90 }}
          animate={seen ? { scale: 1, rotate: 0 } : undefined}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 + i * 0.12 }}
          whileHover={{ scale: 1.12, rotate: 8 }}
        >
          <Icon className="size-5" />
        </m.span>
      ))}
    </div>
  );
}

/** Рост силы: линия e1RM рисуется слева направо, точки выскакивают по очереди, в конце — подсказка. */
export function ProgressChart({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const points = [70, 72.5, 72.5, 75, 77.5, 77.5, 80, 82.5];
  const w = 220;
  const h = 80;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - ((p - 65) / 20) * h] as const);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const area = `${path} L${w},${h + 6} L0,${h + 6} Z`;
  return (
    <div ref={ref} aria-hidden className={cn("space-y-2", className)}>
      <svg viewBox={`-6 -6 ${w + 12} ${h + 12}`} className="h-24 w-full overflow-visible">
        <defs>
          <linearGradient id="hf-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <m.path d={area} fill="url(#hf-area)" initial={{ opacity: 0 }} animate={seen ? { opacity: 1 } : undefined} transition={{ duration: 0.8, delay: 1.1 }} />
        <m.path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={seen ? { pathLength: 1 } : undefined}
          transition={{ duration: 1.6, delay: 0.2, ease: "easeInOut" }}
        />
        {xy.map(([x, y], i) => (
          <m.circle
            key={i}
            cx={x}
            cy={y}
            r={i === xy.length - 1 ? 5 : 3}
            className={i === xy.length - 1 ? "fill-xp" : "fill-primary"}
            initial={{ scale: 0 }}
            animate={seen ? { scale: i === xy.length - 1 ? [0, 1.8, 1] : 1 } : undefined}
            transition={{ duration: 0.4, delay: 0.2 + (i / (xy.length - 1)) * 1.6 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        ))}
      </svg>
      <m.span
        className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
        initial={{ opacity: 0, y: 8 }}
        animate={seen ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.5, delay: 1.9 }}
      >
        <TrendingUp className="size-3.5" /> Пора увеличить вес: +2,5 кг
      </m.span>
    </div>
  );
}

const REST_SEC = 90;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Таймер отдыха тикает по-настоящему: 1:30 → 0:00, кольцо убывает, затем круг заново. */
export function RestTimerRing({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [left, setLeft] = useState(72);
  useEffect(() => {
    if (!seen) return;
    const id = setInterval(() => setLeft((s) => (s <= 0 ? REST_SEC : s - 1)), 1000);
    return () => clearInterval(id);
  }, [seen]);
  const r = 34;
  return (
    <div ref={ref} aria-hidden className={cn("flex items-center gap-4", className)}>
      <div className="relative size-24">
        <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
          <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth={7} />
          <m.circle
            cx="40"
            cy="40"
            r={r}
            className="fill-none stroke-primary"
            strokeWidth={7}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: seen ? left / REST_SEC : 0 }}
            transition={{ duration: left === REST_SEC ? 0.6 : 1, ease: "linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold tabular-nums">{clock(left)}</span>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <m.span whileHover={{ scale: 1.08 }} className="rounded-md border px-2 py-1 text-center font-semibold">
          +15 с
        </m.span>
        <m.span whileHover={{ scale: 1.08 }} className="rounded-md border px-2 py-1 text-center font-semibold">
          −15 с
        </m.span>
      </div>
    </div>
  );
}

export function MiniCalendar({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const plan: Record<number, { label: string; done?: boolean; tone: string }> = {
    0: { label: "Push", done: true, tone: "bg-chart-1/20 border-chart-1" },
    2: { label: "Pull", done: true, tone: "bg-chart-2/20 border-chart-2" },
    4: { label: "Legs", tone: "bg-chart-3/20 border-chart-3" },
  };
  return (
    <div ref={ref} aria-hidden className={cn("grid grid-cols-7 gap-1 text-center text-[10px]", className)}>
      {days.map((d, i) => (
        <div key={d} className="space-y-1">
          <p className="text-muted-foreground">{d}</p>
          <div className="h-14 rounded-md bg-muted/50 p-0.5">
            {plan[i] ? (
              <m.div
                className={cn("flex h-8 flex-col items-center justify-center rounded border-l-2 font-semibold", plan[i].tone)}
                initial={{ opacity: 0, y: -14 }}
                animate={seen ? { opacity: 1, y: 0 } : undefined}
                transition={{ ...SPRING, delay: 0.2 + i * 0.12 }}
              >
                {plan[i].label}
                {plan[i].done ? (
                  <m.span initial={{ scale: 0 }} animate={seen ? { scale: 1 } : undefined} transition={{ ...SPRING, delay: 0.6 + i * 0.12 }}>
                    <Check className="size-3 text-primary" />
                  </m.span>
                ) : null}
              </m.div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiniLeague({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLOListElement>();
  const rows = [
    { name: "Вы", xp: 420, me: true },
    { name: "Iron_Masha", xp: 390 },
    { name: "Борис", xp: 230 },
  ];
  return (
    <ol ref={ref} aria-hidden className={cn("grid gap-1 text-sm", className)}>
      {rows.map((r, i) => (
        <m.li
          key={r.name}
          className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", r.me && "bg-primary/10 font-semibold")}
          initial={{ opacity: 0, x: -16 }}
          animate={seen ? { opacity: 1, x: 0 } : undefined}
          transition={{ duration: 0.5, delay: 0.15 + i * 0.12, ease: EASE }}
        >
          <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
          <span className="flex-1">{r.name}</span>
          <CountUp value={r.xp} suffix=" XP" delay={0.2 + i * 0.12} className="text-xp tabular-nums" />
        </m.li>
      ))}
    </ol>
  );
}

export function MiniRecap({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      <p className="text-sm font-semibold">1-е место в лиге · лучший подход: Жим 90×5</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-background/60 p-2">
          <p className="text-[11px] text-muted-foreground">Тренировки</p>
          <CountUp value={4} className="block font-display text-lg font-bold" />
          <p className="text-[11px] font-semibold text-primary">▲ +1</p>
        </div>
        <div className="rounded-lg border bg-background/60 p-2">
          <p className="text-[11px] text-muted-foreground">Объём</p>
          <CountUp value={15.8} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix=" т" className="block font-display text-lg font-bold" />
          <p className="text-[11px] font-semibold text-primary">
            ▲ <CountUp value={21} prefix="+" suffix="%" delay={0.3} />
          </p>
        </div>
      </div>
    </div>
  );
}

export function MuscleBars({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const rows = [
    { label: "Грудь", v: 16 },
    { label: "Ноги", v: 15 },
    { label: "Спина", v: 14 },
    { label: "Плечи", v: 10 },
  ];
  return (
    <div ref={ref} aria-hidden className={cn("grid gap-1.5 text-xs", className)}>
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-12 text-muted-foreground">{r.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            <m.div
              className="h-full origin-left rounded-sm bg-chart-1"
              initial={{ scaleX: 0 }}
              animate={seen ? { scaleX: r.v / 16 } : undefined}
              transition={{ type: "spring", stiffness: 70, damping: 14, delay: 0.15 + i * 0.12 }}
            />
          </div>
          <CountUp value={r.v} delay={0.15 + i * 0.12} className="w-5 text-right tabular-nums" />
        </div>
      ))}
    </div>
  );
}

export function OfflineBadge({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("flex items-center gap-3", className)}>
      <m.span
        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted"
        animate={seen ? { opacity: [1, 0.45, 1] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <WifiOff className="size-6 text-muted-foreground" />
      </m.span>
      <div className="text-xs">
        <p className="font-semibold">Подвал без связи? Не страшно</p>
        <p className="text-muted-foreground">Подходы сохраняются на телефоне и уйдут на сервер, когда появится сеть</p>
      </div>
    </div>
  );
}

export function FreezeChip({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  return (
    <m.span
      ref={ref}
      aria-hidden
      className={cn("inline-flex items-center gap-1 rounded-full bg-chart-2/15 px-2.5 py-1 text-xs font-semibold text-chart-2", className)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={seen ? { opacity: 1, scale: 1 } : undefined}
      transition={{ ...SPRING, delay: 1.1 }}
    >
      <Snowflake className="size-3.5" /> Заморозка спасла неделю
    </m.span>
  );
}
