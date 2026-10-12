"use client";

/**
 * Клуб зала для лендинга: рейтинг недели и общее задание с сундуком. Декоративно (aria-hidden, смысл — в тексте
 * раздела и sr-only), анимации конечные и стартуют при попадании в экран, как в raid-infographics.tsx.
 */
import Image from "next/image";
import { m } from "motion/react";
import { Building2, Trophy } from "lucide-react";
import chest from "@/assets/icons/game/chest_closed.png";
import { CountUp, useSeen } from "@/components/marketing/motion";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const RATING = [
  { name: "Атлет 1", xp: 1240 },
  { name: "Атлет 2", xp: 980 },
  { name: "Вы", xp: 860, me: true },
  { name: "Атлет 4", xp: 610 },
];
const TASK = { done: 214, target: 300 };

export function ClubInfographic() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div className="rounded-2xl border bg-card/90 p-5 backdrop-blur">
      <p className="sr-only">
        Пример: рейтинг зала за неделю — вы на 3-м месте. Задание «Клубом: {TASK.target} тренировок за 28 дней» выполнено на {TASK.done}, за
        выполнение — сундук с опытом.
      </p>
      <div ref={ref} aria-hidden>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="size-4 text-primary" /> Железный зал · рейтинг недели
        </p>
        <ol className="mt-3 space-y-2">
          {RATING.map((r, i) => (
            <m.li
              key={r.name}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${r.me ? "bg-primary/15 font-semibold" : "bg-muted/50"}`}
              initial={{ opacity: 0, x: -12 }}
              animate={seen ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease: EASE }}
            >
              <span className="flex items-center gap-2">
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                {i === 0 ? <Trophy className="size-4 text-xp" /> : null}
                {r.name}
              </span>
              <span className="tabular-nums text-xp">{r.xp} XP</span>
            </m.li>
          ))}
        </ol>
        <div className="mt-5 flex items-center gap-4 rounded-xl border p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Клубом: {TASK.target} тренировок за 28 дней</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <m.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={seen ? { width: `${(TASK.done / TASK.target) * 100}%` } : undefined}
                transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
              />
            </div>
            <p className="mt-1 text-sm tabular-nums">
              <CountUp value={TASK.done} delay={0.5} className="font-semibold" /> / {TASK.target}
            </p>
          </div>
          <Image src={chest} alt="" sizes="56px" className="h-auto w-14 shrink-0" />
        </div>
      </div>
    </div>
  );
}
