import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/app-shell";
import { CoachCalendar } from "@/components/coach/coach-calendar";
import { buttonVariants } from "@/components/ui/button";
import { requireCoach } from "@/lib/coach/access";
import { calendarSummary } from "@/lib/coach/calendar";
import { getCoachCalendar, ownGroupId } from "@/lib/coach/calendar-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";
import { planDateSchema } from "@/lib/plans/schema";
import { viewRange, type CalendarViewKind } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Календарь клиентов" };

/** Назначения тренера всем активным клиентам по дням (спека 2026-10-25-coach-calendar); править — в плане клиента. */
export default async function CoachCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; group?: string }> }) {
  const coach = await requireCoach();
  const tz = safeTimeZone(coach.timeZone);
  const params = await searchParams;
  const now = new Date();
  const today = dayKey(now, tz);
  const view: CalendarViewKind = params.view === "month" ? "month" : "week";
  const date = params.date && planDateSchema.safeParse(params.date).success ? params.date : today;
  const range = viewRange(view, date);

  const [groupId, groups] = await Promise.all([
    ownGroupId(coach.id, params.group),
    db.coachGroup.findMany({ where: { coachId: coach.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const { clients, items } = await getCoachCalendar(coach.id, range.from, range.to, { groupId, now });
  const summary = calendarSummary(items);

  const hrefFor = (v: CalendarViewKind, d: string, g: string | null = groupId) => {
    const q = new URLSearchParams();
    if (v !== "week") q.set("view", v);
    if (d !== today) q.set("date", d);
    if (g) q.set("group", g);
    const s = q.toString();
    return s ? `/coach/calendar?${s}` : "/coach/calendar";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Календарь клиентов" description="Кому и когда вы назначили тренировки" />

      {groups.length ? (
        <nav aria-label="Группы" className="flex flex-wrap gap-2">
          {[{ id: null, name: "Все" }, ...groups].map((g) => (
            <Link
              key={g.id ?? "all"}
              href={hrefFor(view, date, g.id)}
              aria-current={g.id === groupId ? "true" : undefined}
              className={cn(buttonVariants({ variant: g.id === groupId ? "secondary" : "outline", size: "sm" }))}
            >
              {g.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {clients === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">Пока нет клиентов</p>
          <Link href="/coach" className={buttonVariants({ variant: "outline", size: "sm" })}>
            К клиентам
          </Link>
        </div>
      ) : items.length ? (
        <p className="text-sm text-muted-foreground">
          {summary.workouts} {plural(summary.workouts, "тренировка", "тренировки", "тренировок")} у {summary.clients}{" "}
          {plural(summary.clients, "клиента", "клиентов", "клиентов")}
          {summary.past ? ` · выполнено ${summary.done} из ${summary.past} прошедших` : ""}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">На эти дни ничего не назначено</p>
          <Link href="/coach" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Назначить тренировки
          </Link>
        </div>
      )}

      <CoachCalendar view={view} date={date} today={today} coachTz={tz} items={items} hrefFor={(v, d) => hrefFor(v, d)} />
    </div>
  );
}
