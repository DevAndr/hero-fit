import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import { OwnProgram } from "@/components/catalog/own-program";
import { requireUser } from "@/lib/auth/dal";
import { catalogAllowed } from "@/lib/catalog/access";
import { activePrograms } from "@/lib/catalog/queries";
import { programWeekIndex } from "@/lib/coach/program";
import { activeCoachOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { programWeekLabels } from "@/lib/coach/program-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { getCalendar } from "@/lib/plans/queries";
import { planDateSchema } from "@/lib/plans/schema";
import { viewRange, type CalendarViewKind } from "@/lib/plans/view";
import { listTemplates } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Календарь" };

const startLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

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

  const [calendar, templates, coach, own] = await Promise.all([
    getCalendar(user.id, range.from, range.to, tz, now),
    listTemplates(user.id),
    activeCoachOf(user.id),
    // Своя программа из каталога — «Завершить программу» (только с флагом каталога)
    catalogAllowed(user.id).then((on) => (on ? activePrograms(db, user.id, today) : [])).then((rows) => rows.find((a) => !a.coachId && a.catalogProgramId)),
  ]);
  // Назначения есть только от активного тренера — разрыв связи их удаляет
  const coachName = coach ? clientDisplayName(coach) : null;
  const programOf = await programWeekLabels(calendar.occurrences.map((o) => o.seriesId));

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
      program: programOf(o.seriesId, o.date),
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
      program: null,
    })),
  ];
  const [hh, mm] = localTime(now, tz).split(":").map(Number);
  const ownWeek = own ? programWeekIndex(own.startDate, today) : null;

  return (
    <>
      <PageHeader title="Календарь" description="Планируйте тренировки — как в обычном календаре" />
      {own ? <OwnProgram name={own.name} status={ownWeek !== null && ownWeek >= 1 ? `неделя ${ownWeek} из ${own.weeks}` : `старт ${startLabel.format(new Date(`${own.startDate}T12:00:00Z`))}`} /> : null}
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
