import Link from "next/link";
import { ArrowRight, Check, Play, Snowflake } from "lucide-react";
import { RestoreStreakButton } from "@/components/dashboard/restore-streak-button";
import { buttonVariants } from "@/components/ui/button";
import type { StripDay } from "@/lib/dashboard/v2";
import type { RestoreOffer } from "@/lib/progress/weekly-streak";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const fullDay = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

function dayLabel(d: StripDay): string {
  const name = fullDay.format(new Date(`${d.day}T12:00:00Z`));
  const what = d.done ? "тренировка" : d.planned ? "по плану" : d.past ? "отдых" : d.today ? "сегодня" : "впереди";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${what}`;
}

/** Ярус «Сегодня»: приветствие, главная кнопка, полоса недели и чипы уровня, серии и заморозок. */
export function WeekHero(props: {
  name: string;
  headline: string;
  activeWorkout: boolean;
  strip: StripDay[];
  level: { level: number; percent: number };
  streak: number;
  freezes: number;
  offer: RestoreOffer | null;
  offerText: string | null;
  levelXp: number;
  lastWorkout: { id: string; name: string; finishedAt: Date } | null;
}) {
  const { offer } = props;
  return (
    <section
      aria-label="Сегодня"
      className="space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Привет, {props.name}!</h1>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="week-headline">
            {props.headline}
          </p>
        </div>
        <Link href="/training" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
          <Play />
          {props.activeWorkout ? "Продолжить тренировку" : "Начать тренировку"}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ul aria-label="Неделя" className="flex gap-1.5">
          {props.strip.map((d) => (
            <li
              key={d.day}
              aria-label={dayLabel(d)}
              className={cn(
                "flex h-12 w-10 flex-col items-center justify-center gap-0.5 rounded-lg text-xs",
                d.done ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground",
                d.today && "ring-2 ring-xp ring-offset-2 ring-offset-background",
              )}
            >
              <span aria-hidden>{WEEKDAYS[d.weekday]}</span>
              <span aria-hidden className="flex h-3.5 items-center">
                {d.done ? <Check className="size-3.5" /> : d.planned ? <span className="size-1.5 rounded-full bg-primary" /> : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/achievements" className="rounded-full bg-muted/60 px-3 py-1 font-medium hover:bg-muted">
            <span className="text-xp">⚡</span> Ур. {props.level.level} · {props.level.percent} %
          </Link>
          <span className="rounded-full bg-muted/60 px-3 py-1 font-medium" data-testid="streak-chip">
            {props.streak > 0 ? (
              <>
                <span className="text-streak">🔥</span> {props.streak} нед.
              </>
            ) : (
              "Серия не начата"
            )}
          </span>
          {props.freezes > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1 font-medium">
              <Snowflake className="size-3.5" aria-hidden />
              <span className="sr-only">Заморозки:</span> {props.freezes}
            </span>
          ) : null}
        </div>
      </div>

      {offer && props.offerText ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{props.offerText}</p>
          <RestoreStreakButton streak={offer.streak} cost={offer.cost} missing={Math.max(0, offer.cost - props.levelXp)} />
        </div>
      ) : null}

      {props.lastWorkout ? (
        <Link href={`/workouts/${props.lastWorkout.id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Последняя тренировка: {props.lastWorkout.name} · {shortDate.format(props.lastWorkout.finishedAt)}
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </section>
  );
}
