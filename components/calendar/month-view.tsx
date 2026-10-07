"use client";

import Link from "next/link";
import type { CalendarActions, CalendarEvent } from "@/components/calendar/calendar-view";
import { EventBlock } from "@/components/calendar/week-grid";
import { monthGrid } from "@/lib/plans/match";
import { dayLabel, eventDot, WEEKDAYS_SHORT } from "@/lib/plans/view";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_CHIPS = 2;
const dayMonth = (date: string) => dayLabel(date).split(", ")[1];

/** Месяц: на ПК — плашки «18:00 Push», на телефоне — точки и список выбранного дня под сеткой. */
export function MonthView({
  date,
  events,
  today,
  selected,
  onSelect,
  actions,
}: {
  date: string;
  events: CalendarEvent[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  actions: CalendarActions;
}) {
  const days = monthGrid(date.slice(0, 7));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const byDay = (d: string) => events.filter((e) => e.date === d);
  const selectedEvents = byDay(selected);

  return (
    <div className="space-y-3">
      <div role="grid" aria-label="Месяц" className="overflow-hidden rounded-xl border bg-card">
        <div role="row" className="grid grid-cols-7 border-b">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} role="columnheader" className="py-1.5 text-center text-xs text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((d) => {
              const list = byDay(d);
              const outside = d.slice(0, 7) !== date.slice(0, 7);
              return (
                <div
                  key={d}
                  role="gridcell"
                  aria-label={`${dayMonth(d)}, ${list.length} ${plural(list.length, "тренировка", "тренировки", "тренировок")}`}
                  aria-selected={d === selected}
                  onClick={() => onSelect(d)}
                  className={cn(
                    "min-h-14 border-l p-1 first:border-l-0 lg:min-h-24 lg:cursor-default",
                    outside && "bg-muted/40 text-muted-foreground",
                    d === selected && "max-lg:bg-primary/10",
                  )}
                >
                  <Link
                    href={`/calendar?view=week&date=${d}`}
                    tabIndex={-1}
                    className={cn(
                      "pointer-events-none flex size-6 items-center justify-center rounded-full text-xs font-semibold lg:pointer-events-auto lg:hover:bg-muted",
                      d === today && "bg-primary text-primary-foreground lg:hover:bg-primary",
                    )}
                  >
                    {Number(d.slice(8))}
                  </Link>
                  {/* ПК — плашки */}
                  <div className="mt-0.5 hidden space-y-0.5 lg:block">
                    {list.slice(0, MAX_CHIPS).map((e) => (
                      <EventBlock key={e.key} event={e} onOpen={actions.openEvent} className="block w-full truncate py-0">
                        {e.time} {e.title}
                      </EventBlock>
                    ))}
                    {list.length > MAX_CHIPS ? (
                      <Link href={`/calendar?view=week&date=${d}`} className="block px-1 text-xs text-muted-foreground hover:text-foreground">
                        + ещё {list.length - MAX_CHIPS}
                      </Link>
                    ) : null}
                  </div>
                  {/* Телефон — точки */}
                  <div className="mt-1 flex flex-wrap gap-0.5 lg:hidden" aria-hidden>
                    {list.slice(0, 4).map((e) => (
                      <span key={e.key} className={cn("size-1.5 rounded-full", e.kind === "workout" ? "bg-muted-foreground" : eventDot(e.templateId))} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <section aria-label={`Тренировки: ${dayLabel(selected)}`} className="space-y-2 lg:hidden">
        <h3 className="text-sm font-semibold capitalize">{dayLabel(selected)}</h3>
        {selectedEvents.length ? (
          selectedEvents.map((e) => <EventBlock key={e.key} event={e} onOpen={actions.openEvent} className="block w-full py-1.5" />)
        ) : (
          <p className="text-sm text-muted-foreground">Ничего не запланировано</p>
        )}
      </section>
    </div>
  );
}
