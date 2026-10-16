import Link from "next/link";
import { CalendarDays, Play } from "lucide-react";
import { SkipPlanButton } from "@/components/calendar/skip-plan-button";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Occurrence } from "@/lib/plans/expand";
import { dayLabel } from "@/lib/plans/view";
import { createWorkoutAction } from "@/lib/workouts/actions";

type Plan = Pick<Occurrence, "key" | "title" | "time" | "date" | "coachId"> & { program?: string | null };

function StartButton({ plan, activePlanKey }: { plan: Plan; activePlanKey: string | null }) {
  if (activePlanKey === plan.key) {
    return (
      <Link href="/training" className={buttonVariants({ size: "sm" })}>
        <Play />
        Продолжить
      </Link>
    );
  }
  return (
    <form action={createWorkoutAction}>
      <input type="hidden" name="source" value={`plan:${plan.key}`} />
      <Button type="submit" size="sm">
        <Play />
        Начать
      </Button>
    </form>
  );
}

/** «Сегодня по плану: Ноги · 18:00 [Начать]», иначе — пропущенное вчера или ближайшее следующее. */
export function TodayPlan({
  today,
  next,
  missedYesterday,
  activePlanKey,
  coachName = null,
}: {
  today: Plan[];
  next: Plan | null;
  missedYesterday: Plan | null;
  activePlanKey: string | null;
  /** Ник активного тренера — пометка у назначенного им. */
  coachName?: string | null;
}) {
  const [first] = today;
  const shown = [first, missedYesterday, next].find((p) => p);
  const fromCoach = coachName && shown?.coachId ? `от тренера · ${coachName}${shown.program ? ` · ${shown.program}` : ""}` : null;
  let text: string;
  let action: React.ReactNode;
  if (first) {
    text = `Сегодня по плану: ${today.map((p) => `${p.title} · ${p.time}`).join(", ")}`;
    action = (
      <div className="flex items-center gap-1">
        {activePlanKey === first.key ? null : <SkipPlanButton planKey={first.key} title={first.title} />}
        <StartButton plan={first} activePlanKey={activePlanKey} />
      </div>
    );
  } else if (missedYesterday) {
    text = `Вчера были ${missedYesterday.title} — сделать сегодня?`;
    action = <StartButton plan={missedYesterday} activePlanKey={activePlanKey} />;
  } else if (next) {
    text = `Следующая: ${next.title}, ${dayLabel(next.date)}, ${next.time}`;
    action = (
      <Link href={`/calendar?date=${next.date}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
        В календарь
      </Link>
    );
  } else {
    text = "Запланируйте тренировки — календарь напомнит о них";
    action = (
      <Link href="/calendar" className={buttonVariants({ size: "sm", variant: "outline" })}>
        Открыть календарь
      </Link>
    );
  }
  return (
    <section aria-label="План на сегодня" className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <CalendarDays className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 font-medium">
        {text}
        {fromCoach ? <span className="block text-xs font-normal text-muted-foreground">{fromCoach}</span> : null}
      </p>
      {action}
    </section>
  );
}
