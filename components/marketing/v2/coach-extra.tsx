"use client";

/**
 * Новая инфографика режима тренера для лендинга v2: группы, календарь клиентов, ачивки тренера.
 * Как в coach-infographics.tsx: aria-hidden, старт при попадании в экран (useSeen), «уменьшить движение» — через MotionProvider.
 */
import { m } from "motion/react";
import { Check, Medal, MessageSquareText, Trophy, UserPlus } from "lucide-react";
import { useSeen } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const SPRING = { type: "spring", stiffness: 200, damping: 16 } as const;

const GROUPS = [
  { name: "Утро", people: ["А", "М"] },
  { name: "Онлайн", people: ["О", "Д", "К"] },
  { name: "Новички", people: ["С"] },
];

/** Группы клиентов: чипы групп, клиенты раскладываются по ним. */
export function GroupsMini({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("grid grid-cols-3 gap-1.5 text-xs", className)}>
      {GROUPS.map((g, gi) => (
        <div key={g.name} className="rounded-lg border bg-card p-2">
          <p className="truncate font-semibold">{g.name}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {g.people.map((p, pi) => (
              <m.span
                key={p}
                className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary"
                initial={{ opacity: 0, scale: 0.4, y: -8 }}
                animate={seen ? { opacity: 1, scale: 1, y: 0 } : undefined}
                transition={{ ...SPRING, delay: 0.2 + gi * 0.15 + pi * 0.1 }}
              >
                {p}
              </m.span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const DAYS = [
  { d: "Пн", items: [{ n: "Анна", done: true }, { n: "Дима", done: true }] },
  { d: "Ср", items: [{ n: "Ольга", done: true }, { n: "Максим", done: false }] },
  { d: "Пт", items: [{ n: "Анна", done: false }] },
];

/** Календарь клиентов: неделя с тренировками разных клиентов, отметки «выполнено» появляются по очереди. */
export function CoachCalendarMini({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  let k = 0;
  return (
    <div ref={ref} aria-hidden className={cn("grid grid-cols-3 gap-1.5 text-[11px]", className)}>
      {DAYS.map((day) => (
        <div key={day.d} className="space-y-1 rounded-lg border bg-card p-1.5">
          <p className="text-center text-[10px] font-semibold text-muted-foreground">{day.d}</p>
          {day.items.map((it) => {
            const i = k++;
            return (
              <m.div
                key={it.n}
                className={cn("flex items-center justify-between gap-1 rounded-md px-1.5 py-1", it.done ? "bg-primary/10" : "bg-muted")}
                initial={{ opacity: 0, x: -6 }}
                animate={seen ? { opacity: 1, x: 0 } : undefined}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.1, ease: EASE }}
              >
                <span className="truncate">{it.n}</span>
                {it.done ? (
                  <m.span initial={{ scale: 0 }} animate={seen ? { scale: 1 } : undefined} transition={{ ...SPRING, delay: 0.6 + i * 0.12 }}>
                    <Check className="size-3 text-primary" />
                  </m.span>
                ) : null}
              </m.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Настоящие названия ачивок тренера (lib/achievements/definitions.ts, категория COACH). */
const BADGES = [
  { icon: UserPlus, title: "Первый ученик" },
  { icon: MessageSquareText, title: "Первый разбор" },
  { icon: Trophy, title: "Рекорды учеников ×10" },
  { icon: Medal, title: "На виду" },
];

/** Ачивки тренера: значки открываются по очереди. */
export function CoachBadgesMini({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  return (
    <ul ref={ref} aria-hidden className={cn("grid grid-cols-2 gap-1.5 text-[11px]", className)}>
      {BADGES.map(({ icon: Icon, title }, i) => (
        <m.li
          key={title}
          className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5"
          initial={{ opacity: 0.35, filter: "grayscale(1)" }}
          animate={seen ? { opacity: 1, filter: "grayscale(0)" } : undefined}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.2, ease: EASE }}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-xp/15 text-xp">
            <Icon className="size-3.5" />
          </span>
          <span className="truncate font-semibold">{title}</span>
        </m.li>
      ))}
    </ul>
  );
}
