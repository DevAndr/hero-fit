"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { EventCard } from "@/components/calendar/event-card";
import { MonthView } from "@/components/calendar/month-view";
import { PlanDialog, type PlanDialogState, type TemplateOption } from "@/components/calendar/plan-dialog";
import { DayStrip, WeekGrid } from "@/components/calendar/week-grid";
import { addDays } from "@/lib/plans/expand";
import type { PlanStatus } from "@/lib/plans/match";
import { mondayOf, shiftDate, viewTitle, type CalendarViewKind } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

/** Событие календаря: вхождение плана или тренировка вне плана (key = w:<id>). */
export type CalendarEvent = {
  key: string;
  kind: "plan" | "workout";
  title: string;
  date: string;
  time: string;
  durationMin: number;
  status: PlanStatus;
  templateId: string | null;
  recurring: boolean;
  workoutId: string | null;
  exercises: number | null;
};

export type CalendarActions = {
  openEvent: (event: CalendarEvent) => void;
  createAt: (date: string, time: string) => void;
};

const href = (view: CalendarViewKind, date: string) => `/calendar?view=${view}&date=${date}`;
const DEFAULT_TIME = "18:00";

export function CalendarView({
  view,
  date,
  today,
  nowMin,
  events,
  activePlanKey,
  templates,
}: {
  view: CalendarViewKind;
  date: string;
  today: string;
  nowMin: number;
  events: CalendarEvent[];
  activePlanKey: string | null;
  templates: { mine: TemplateOption[]; programs: TemplateOption[] };
}) {
  const [dialog, setDialog] = useState<PlanDialogState | null>(null);
  const [opened, setOpened] = useState<CalendarEvent | null>(null);
  // Телефон: выбранный день (неделя — день с часами, месяц — список под сеткой)
  const [selected, setSelected] = useState(date);
  const [lastDate, setLastDate] = useState(date);
  if (lastDate !== date) {
    setLastDate(date);
    setSelected(date);
  }

  const actions: CalendarActions = {
    openEvent: setOpened,
    createAt: (d, time) => setDialog({ mode: "create", date: d, time }),
  };
  const prevLabel = view === "week" ? "Предыдущая неделя" : "Предыдущий месяц";
  const nextLabel = view === "week" ? "Следующая неделя" : "Следующий месяц";
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(view, today)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Сегодня
        </Link>
        <div className="flex">
          <Link href={href(view, shiftDate(view, date, -1))} aria-label={prevLabel} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <ChevronLeft />
          </Link>
          <Link href={href(view, shiftDate(view, date, 1))} aria-label={nextLabel} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <ChevronRight />
          </Link>
        </div>
        <h2 className="text-lg font-bold" aria-live="polite">
          {viewTitle(view, date)}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <nav aria-label="Вид календаря" className="flex rounded-lg bg-muted p-0.5">
            {(["week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={href(v, view === v ? date : selected)}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground",
                  view === v && "bg-background text-foreground shadow-sm",
                )}
              >
                {v === "week" ? "Неделя" : "Месяц"}
              </Link>
            ))}
          </nav>
          <Button size="sm" onClick={() => actions.createAt(view === "week" ? selected : date, DEFAULT_TIME)}>
            <Plus />
            Запланировать
          </Button>
        </div>
      </div>

      {view === "week" ? (
        <>
          <div className="hidden lg:block">
            <WeekGrid days={weekDays} events={events} today={today} nowMin={nowMin} actions={actions} slots />
          </div>
          <div className="space-y-3 lg:hidden">
            <DayStrip days={weekDays} events={events} selected={selected} today={today} onSelect={setSelected} />
            <WeekGrid
              days={[selected]}
              events={events}
              today={today}
              nowMin={nowMin}
              actions={actions}
              onSwipe={(step) => {
                const next = addDays(selected, step);
                if (weekDays.includes(next)) setSelected(next);
              }}
            />
          </div>
        </>
      ) : (
        <MonthView date={date} events={events} today={today} selected={selected} onSelect={setSelected} actions={actions} />
      )}

      <EventCard
        event={opened}
        activePlanKey={activePlanKey}
        onClose={() => setOpened(null)}
        onEdit={(event) => {
          setOpened(null);
          setDialog({ mode: "edit", event });
        }}
      />
      <PlanDialog state={dialog} templates={templates} onClose={() => setDialog(null)} />
    </div>
  );
}
