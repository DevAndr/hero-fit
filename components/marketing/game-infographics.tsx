"use client";

/**
 * Игровые фичи для лендинга — босс недели, карта мышц, бестиарий. Декоративные (aria-hidden, смысл — в подписях рядом),
 * анимации конечные и стартуют при попадании в экран, как в infographics.tsx.
 */
import Image from "next/image";
import { m } from "motion/react";
import { Gift, Star, Swords } from "lucide-react";
import { bossImage } from "@/components/boss/boss-sprite";
import { CountUp, useSeen } from "@/components/marketing/motion";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { BOSSES, bossName, type BossCode } from "@/lib/boss/bosses";
import { MIN_HP } from "@/lib/boss/damage";
import { BODY_BACK, BODY_FRONT, type BodyPart } from "@/lib/progress/body-map-data";
import { RECOVERY_STATE_LABELS, type RecoveryState } from "@/lib/progress/recovery";
import { BOSS_STAR_WINS, bossStars, bossTitles } from "@/lib/titles/catalog";
import { cn } from "@/lib/utils";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const SPRING = { type: "spring", stiffness: 140, damping: 18 } as const;

const BOSS_HP = MIN_HP;
const FIGHT_START = 0.3;
const FIGHT_S = 2.6;
const HITS = [
  { text: "−100", note: "подход", left: "14%", tone: "text-foreground" },
  { text: "−150", note: "до отказа", left: "52%", tone: "text-xp" },
  { text: "КРИТ −100", note: "рекорд", left: "26%", tone: "text-streak" },
];

/** Бой с боссом недели: удары всплывают над спрайтом, HP тает до нуля, босс повержен — сундук. */
export function BossFight({ code = "dragon", className }: { code?: BossCode; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const image = bossImage(code);
  return (
    <div ref={ref} aria-hidden className={cn("flex flex-col gap-4 sm:flex-row sm:items-center", className)}>
      <div className="relative mx-auto w-52 shrink-0 sm:mx-0 sm:w-60">
        <m.div
          initial={{ filter: "grayscale(0)", rotate: 0, y: 0 }}
          animate={seen ? { filter: "grayscale(1)", rotate: 8, y: 6 } : undefined}
          transition={{ duration: 0.6, delay: FIGHT_START + FIGHT_S + 0.1 }}
        >
          {image ? <Image src={image} alt="" sizes="240px" className="h-auto w-full drop-shadow-[0_10px_25px_rgb(0_0_0/0.35)]" /> : null}
        </m.div>
        {HITS.map((h, i) => (
          <m.span
            key={h.text}
            className={cn("absolute top-1/5 flex flex-col items-center font-display text-lg font-extrabold whitespace-nowrap drop-shadow-md", h.tone)}
            style={{ left: h.left }}
            initial={{ opacity: 0, y: 8, scale: 0.6 }}
            animate={seen ? { opacity: [0, 1, 1, 0], y: [8, -10, -22, -34], scale: [0.6, 1.15, 1, 1] } : undefined}
            transition={{ duration: 1.1, delay: FIGHT_START + 0.2 + i * 0.8, times: [0, 0.2, 0.7, 1] }}
          >
            {h.text}
            <span className="font-sans text-[10px] font-semibold text-muted-foreground">{h.note}</span>
          </m.span>
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-streak">
          <Swords className="size-3.5" /> Босс недели
        </p>
        <p className="font-display text-lg font-bold">{bossName(code)}</p>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <m.div
            className="h-full origin-left rounded-full bg-streak"
            initial={{ scaleX: 1 }}
            animate={seen ? { scaleX: [1, 0.72, 0.41, 0] } : undefined}
            transition={{ duration: FIGHT_S, delay: FIGHT_START, times: [0, 0.38, 0.7, 1], ease: EASE }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          HP <CountUp value={0} from={BOSS_HP} delay={FIGHT_START + 0.4} /> / {BOSS_HP.toLocaleString("ru-RU")}
        </p>
        <m.span
          className="inline-flex items-center gap-1.5 rounded-full bg-xp/15 px-2.5 py-1 text-xs font-semibold text-xp"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={seen ? { opacity: 1, scale: [0.8, 1.12, 1] } : undefined}
          transition={{ duration: 0.5, delay: FIGHT_START + FIGHT_S + 0.3 }}
        >
          <Gift className="size-3.5" /> Повержен! Сундук +{BOSS_HP / 20} XP
        </m.span>
      </div>
    </div>
  );
}

/** Демо: грудь и трицепс после вчерашнего жима, ноги давно не тренировались. */
const DEMO_RECOVERY: Record<MuscleGroup, RecoveryState> = {
  CHEST: "fatigued",
  TRICEPS: "fatigued",
  SHOULDERS: "recovering",
  TRAPS: "recovering",
  BICEPS: "ready",
  BACK: "ready",
  FOREARMS: "ready",
  ABS: "ready",
  LEGS: "neglected",
  CALVES: "neglected",
};
const FILL: Record<RecoveryState, string> = {
  fatigued: "fill-streak",
  recovering: "fill-xp",
  ready: "fill-primary",
  neglected: "fill-muted-foreground/30",
};
const DOT: Record<RecoveryState, string> = {
  fatigued: "bg-streak",
  recovering: "bg-xp",
  ready: "bg-primary",
  neglected: "bg-muted-foreground/40",
};
const STATES: RecoveryState[] = ["fatigued", "recovering", "ready", "neglected"];

function MiniFigure({ parts, seen, delay }: { parts: BodyPart[]; seen: boolean; delay: number }) {
  return (
    <svg viewBox="0 0 100 200" className="h-40 w-auto sm:h-44">
      {parts.map((part, i) =>
        part.points.map((points, j) =>
          part.group ? (
            <m.polygon
              key={`${i}:${j}`}
              points={points}
              className={FILL[DEMO_RECOVERY[part.group]]}
              initial={{ opacity: 0.15 }}
              animate={seen ? { opacity: 1 } : undefined}
              transition={{ duration: 0.5, delay: delay + i * 0.06 }}
            />
          ) : (
            <polygon key={`${i}:${j}`} points={points} className="fill-foreground/10" />
          ),
        ),
      )}
    </svg>
  );
}

/** Карта мышц: силуэт спереди и сзади «проявляется» цветами восстановления, рядом — легенда и подсказка. */
export function MuscleMapMini({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={cn("flex flex-col gap-4 sm:flex-row sm:items-center", className)}>
      <div className="flex justify-center gap-1">
        <MiniFigure parts={BODY_FRONT} seen={seen} delay={0.2} />
        <MiniFigure parts={BODY_BACK} seen={seen} delay={0.5} />
      </div>
      <div className="space-y-3">
        <ul className="grid gap-1.5 text-xs">
          {STATES.map((st, i) => (
            <m.li
              key={st}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={seen ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.4, delay: 0.9 + i * 0.1, ease: EASE }}
            >
              <span className={cn("size-2.5 rounded-full", DOT[st])} />
              {RECOVERY_STATE_LABELS[st]}
            </m.li>
          ))}
        </ul>
        <m.span
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
          initial={{ opacity: 0, y: 8 }}
          animate={seen ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, delay: 1.4 }}
        >
          Собрать по восстановлению: ноги, спина, бицепс
        </m.span>
      </div>
    </div>
  );
}

/** Демо-коллекция: побеждённые боссы и число побед; остальные — силуэты «???». */
const DEMO_WINS: Partial<Record<BossCode, number>> = { golem: 4, troll: 1, dragon: 10, knight: 2, lich: 1 };

/** Бестиарий: 12 боссов — побеждённые в цвете со звёздами, остальные силуэтами; ниже — открытые титулы. */
export function BestiaryStrip({ className }: { className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const titles = [bossTitles("dragon")[2].label, bossTitles("golem")[1].label, bossTitles("knight")[0].label];
  return (
    <div ref={ref} aria-hidden className={cn("space-y-6", className)}>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {BOSSES.map(({ code }, i) => {
          const wins = DEMO_WINS[code] ?? 0;
          const stars = bossStars(wins);
          const image = bossImage(code);
          return (
            <m.li
              key={code}
              className="group flex flex-col items-center gap-1.5 rounded-xl border bg-card/80 p-2 pb-2.5"
              initial={{ opacity: 0, y: 18 }}
              animate={seen ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.45, delay: 0.1 + i * 0.06, ease: EASE }}
              whileHover={wins ? { y: -4, rotate: -1.5 } : undefined}
            >
              {image ? (
                <Image
                  src={image}
                  alt=""
                  sizes="(min-width: 1024px) 160px, 30vw"
                  className={cn(
                    "h-auto w-full transition-transform duration-300 motion-reduce:transition-none",
                    wins ? "group-hover:scale-105" : "opacity-35 brightness-0 dark:opacity-60",
                  )}
                />
              ) : null}
              <span className="flex gap-0.5">
                {BOSS_STAR_WINS.map((w, s) => (
                  <Star key={w} className={cn("size-3", s < stars ? "fill-xp text-xp" : "text-muted-foreground/30")} />
                ))}
              </span>
              <span className={cn("text-center text-[11px] leading-tight", wins ? "font-semibold" : "text-muted-foreground")}>
                {wins ? bossName(code) : "???"}
              </span>
            </m.li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {titles.map((t, i) => (
          <m.span
            key={t}
            className="rounded-full border bg-card px-3 py-1 font-semibold"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={seen ? { opacity: 1, scale: 1 } : undefined}
            transition={{ ...SPRING, delay: 1 + i * 0.12 }}
          >
            «{t}»
          </m.span>
        ))}
        <m.span
          className="rounded-full border border-dashed px-3 py-1 text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={seen ? { opacity: 1 } : undefined}
          transition={{ duration: 0.4, delay: 1.4 }}
        >
          «Легенда бестиария» — за победу над каждым
        </m.span>
      </div>
    </div>
  );
}
