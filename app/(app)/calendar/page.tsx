import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import { requireUser } from "@/lib/auth/dal";
import { activeCoachOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { getCalendar } from "@/lib/plans/queries";
import { planDateSchema } from "@/lib/plans/schema";
import { viewRange, type CalendarViewKind } from "@/lib/plans/view";
import { listTemplates } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Календарь" };

/** «HH:MM» момента в поясе пользователя. */
const localTime = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireUser();
  const tz = safeTimeZone(user.timeZone);
  const params = await searchParams;
  const now = new Date();
  const today = dayKey(now, tz);
  const view: CalendarViewKind = params.view === "month" ? "month" : "week";
  const date = params.date && planDateSchema.safeParse(params.date).success ? params.date : today;
  const range = viewRange(view, date);

  const [calendar, templates, coach] = await Promise.all([
    getCalendar(user.id, range.from, range.to, tz, now),
    listTemplates(user.id),
    activeCoachOf(user.id),
  ]);
  // Назначения есть только от активного тренера — разрыв связи их удаляет
  const coachName = coach ? clientDisplayName(coach) : null;

  const events: CalendarEvent[] = [
    ...calendar.occurrences.map((o) => ({
      key: o.key,
      kind: "plan" as const,
      title: o.title,
      date: o.date,
      time: o.time,
      durationMin: o.durationMin,
      status: o.status,
      templateId: o.templateId,
      recurring: o.recurring,
      workoutId: o.workoutId ?? null,
      exercises: o.templateId ? (calendar.templates[o.templateId]?.exercises ?? null) : null,
      coachName: o.coachId ? coachName : null,
    })),
    // Тренировки вне плана — по фактическому времени
    ...calendar.extra.map((w) => ({
      key: `w:${w.id}`,
      kind: "workout" as const,
      title: w.name,
      date: dayKey(w.startedAt, tz),
      time: localTime(w.startedAt, tz),
      durationMin: Math.max(15, Math.round((w.finishedAt.getTime() - w.startedAt.getTime()) / 60_000)),
      status: "done" as const,
      templateId: null,
      recurring: false,
      workoutId: w.id,
      exercises: null,
      coachName: null,
    })),
  ];
  const [hh, mm] = localTime(now, tz).split(":").map(Number);

  return (
    <>
      <PageHeader title="Календарь" description="Планируйте тренировки — как в обычном календаре" />
      <CalendarView
        view={view}
        date={date}
        today={today}
        nowMin={hh * 60 + mm}
        events={events}
        activePlanKey={calendar.activePlanKey}
        templates={{
          mine: templates.mine.map((t) => ({ id: t.id, name: t.name })),
          programs: templates.programs.map((t) => ({ id: t.id, name: t.name })),
        }}
      />
    </>
  );
}
