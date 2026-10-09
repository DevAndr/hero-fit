"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { CalendarActions, CalendarEvent } from "@/components/calendar/calendar-view";
import { DraggableEvent, useDayDrop, WeekDnd } from "@/components/calendar/week-dnd";
import { layoutDay, minutesOf, timeOf } from "@/lib/plans/match";
import { dayLabel, endTime, eventColor, eventDot, eventLabel, WEEKDAYS_SHORT } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

/** 30 минут = 24 px, сутки = 1152 px. */
export const SLOT_PX = 24;
const HOUR_PX = SLOT_PX * 2;
const SCROLL_TO_HOUR = 7;

export function EventBlock({
  event,
  onOpen,
  style,
  className,
  children,
  buttonRef,
  dragProps,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  children?: ReactNode;
  buttonRef?: (node: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
}) {
  return (
    <button
      ref={buttonRef}
      {...dragProps}
      type="button"
      aria-label={`${eventLabel(event, event.status)}${event.coachName ? `, от тренера · ${event.coachName}` : ""}`}
      onClick={() => onOpen(event)}
      style={style}
      className={cn(
        "overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        event.kind === "workout" ? "border-muted-foreground/50 bg-muted" : eventColor(event.templateId),
        event.status === "missed" && "opacity-50",
        className,
      )}
    >
      {children ?? (
        <>
          <span className="flex items-center gap-1 font-semibold">
            {event.status === "done" ? <Check className="size-3 shrink-0 text-primary" aria-hidden /> : null}
            <span className={cn("truncate", event.status === "missed" && "line-through")}>{event.title}</span>
          </span>
          <span className="block truncate text-muted-foreground">
            {event.time}–{endTime(event.time, event.durationMin)}
            {event.exercises ? ` · ${event.exercises} упр.` : ""}
          </span>
          {event.coachName ? <span className="block truncate text-muted-foreground">{`от тренера · ${event.coachName}`}</span> : null}
        </>
      )}
    </button>
  );
}

/** Неделя по часам (ПК) или один день (телефон): клик по пустому слоту — создание, по событию — карточка. */
export function WeekGrid({
  days,
  events,
  today,
  nowMin,
  actions,
  slots = false,
  onSwipe,
  onMove,
}: {
  days: string[];
  events: CalendarEvent[];
  today: string;
  nowMin: number;
  actions: CalendarActions;
  /** Невидимые кнопки слотов (ПК): клик по пустому месту — новая тренировка на это время. */
  slots?: boolean;
  onSwipe?: (step: number) => void;
  /** ПК: перенос перетаскиванием (мышь и клавиатура). */
  onMove?: (event: CalendarEvent, target: { date: string; time: string }) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const showsToday = days.includes(today);

  useEffect(() => {
    const hour = showsToday ? Math.max(0, Math.floor(nowMin / 60) - 1) : SCROLL_TO_HOUR;
    if (scroller.current) scroller.current.scrollTop = hour * HOUR_PX;
  }, [days, showsToday, nowMin]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {days.length > 1 ? (
        <div className="grid border-b pr-3" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d, i) => (
            <div key={d} className="border-l px-2 py-2 text-center">
              <div className="text-xs text-muted-foreground">{WEEKDAYS_SHORT[i]}</div>
              <div
                className={cn(
                  "mx-auto flex size-8 items-center justify-center rounded-full text-lg font-bold",
                  d === today && "bg-primary text-primary-foreground",
                )}
              >
                {Number(d.slice(8))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div
        ref={scroller}
        className="max-h-[65vh] overflow-y-auto"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null || !onSwipe) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) onSwipe(dx < 0 ? 1 : -1);
        }}
      >
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`, height: 24 * HOUR_PX }}
        >
          <div aria-hidden className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[0.7rem] text-muted-foreground" style={{ top: (h + 1) * HOUR_PX }}>
                {timeOf((h + 1) * 60)}
              </span>
            ))}
          </div>
          {onMove ? (
            <WeekDnd events={events} slotPx={SLOT_PX} onMove={onMove}>
              {days.map((d) => (
                <DropColumn key={d} date={d}>
                  <DayColumn date={d} events={events.filter((e) => e.date === d)} today={today} nowMin={nowMin} actions={actions} slots={slots} dnd />
                </DropColumn>
              ))}
            </WeekDnd>
          ) : (
            days.map((d) => (
              <DayColumn key={d} date={d} events={events.filter((e) => e.date === d)} today={today} nowMin={nowMin} actions={actions} slots={slots} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  events,
  today,
  nowMin,
  actions,
  slots,
  dnd = false,
}: {
  date: string;
  events: CalendarEvent[];
  today: string;
  nowMin: number;
  actions: CalendarActions;
  slots: boolean;
  dnd?: boolean;
}) {
  const layout = layoutDay(events.map((e) => ({ key: e.key, start: minutesOf(e.time), end: minutesOf(e.time) + e.durationMin })));
  const label = dayLabel(date);
  return (
    <div role="group" aria-label={label} className="relative h-full border-l">
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} aria-hidden className="absolute inset-x-0 border-t border-border/60" style={{ top: h * HOUR_PX }} />
      ))}
      {slots
        ? Array.from({ length: 48 }, (_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-label={`Запланировать: ${label}, ${timeOf(i * 30)}`}
              onClick={() => actions.createAt(date, timeOf(i * 30))}
              className="absolute inset-x-0 hover:bg-primary/5"
              style={{ top: i * SLOT_PX, height: SLOT_PX }}
            />
          ))
        : null}
      {events.map((e) => {
        const start = minutesOf(e.time);
        const { col, cols } = layout.get(e.key) ?? { col: 0, cols: 1 };
        const style: React.CSSProperties = {
          top: (start / 30) * SLOT_PX,
          height: Math.max(SLOT_PX, (Math.min(e.durationMin, 24 * 60 - start) / 30) * SLOT_PX) - 2,
          left: `calc(${(col / cols) * 100}% + 2px)`,
          width: `calc(${100 / cols}% - 4px)`,
        };
        if (!dnd) return <EventBlock key={e.key} event={e} onOpen={actions.openEvent} className="absolute z-10" style={style} />;
        return (
          <DraggableEvent
            key={e.key}
            event={e}
            render={({ ref, dragProps, transform, isDragging }) => (
              <EventBlock
                event={e}
                onOpen={actions.openEvent}
                buttonRef={ref}
                dragProps={dragProps}
                className={cn("absolute z-10 touch-none", isDragging && "z-30 shadow-lg ring-2 ring-ring")}
                style={{ ...style, transform }}
              />
            )}
          />
        );
      })}
      {date === today ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-streak" style={{ top: (nowMin / 30) * SLOT_PX }}>
          <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-streak" />
        </div>
      ) : null}
    </div>
  );
}

/** Телефон: дни недели с точками у дней с событиями. */
export function DayStrip({
  days,
  events,
  selected,
  today,
  onSelect,
}: {
  days: string[];
  events: CalendarEvent[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const dayEvents = events.filter((e) => e.date === d);
        return (
          <button
            key={d}
            type="button"
            aria-label={`${WEEKDAYS_SHORT[i]} ${Number(d.slice(8))}`}
            aria-pressed={d === selected}
            onClick={() => onSelect(d)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-sm",
              d === selected ? "bg-primary text-primary-foreground" : d === today ? "text-primary" : "text-foreground",
            )}
          >
            <span className="text-[0.7rem] opacity-80">{WEEKDAYS_SHORT[i]}</span>
            <span className="font-bold">{Number(d.slice(8))}</span>
            <span className="flex h-1.5 gap-0.5">
              {dayEvents.slice(0, 3).map((e) => (
                <span key={e.key} className={cn("size-1.5 rounded-full", d === selected ? "bg-primary-foreground" : eventDot(e.templateId))} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Колонка дня как цель переноса (только внутри WeekDnd). */
function DropColumn({ date, children }: { date: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDayDrop(date);
  return (
    <div ref={setNodeRef} data-day-column className={cn("relative", isOver && "bg-primary/5")}>
      {children}
    </div>
  );
}
