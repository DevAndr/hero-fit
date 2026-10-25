import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { dayPreview, groupByDay, type CoachCalendarItem, type CoachCalendarStatus } from "@/lib/coach/calendar";
import { addDays } from "@/lib/plans/expand";
import { monthGrid } from "@/lib/plans/match";
import { dayLabel, mondayOf, shiftDate, viewTitle, WEEKDAYS_SHORT, type CalendarViewKind } from "@/lib/plans/view";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Partial<Record<CoachCalendarStatus, string>> = { done: "выполнено", skipped: "пропущено", missed: "не выполнено" };

/** Строка назначения: время, клиент, тренировка, статус; ведёт в план клиента. */
function Row({ item, coachTz }: { item: CoachCalendarItem; coachTz: string }) {
  const status = STATUS_TEXT[item.status];
  return (
    <Link
      href={`/coach/clients/${item.clientId}?tab=plan`}
      className={cn(
        "block rounded-md px-1.5 py-1 text-xs leading-snug break-words hover:bg-muted",
        item.status === "skipped" && "text-muted-foreground line-through",
        item.status === "missed" && "text-destructive",
      )}
    >
      <span className="font-semibold tabular-nums">{item.time}</span>{" "}
      {item.clientTz !== coachTz ? (
        <span className="text-muted-foreground" title={item.clientTz}>
          (по его времени){" "}
        </span>
      ) : null}
      <span className="font-medium">{item.clientName}</span> · {item.title}
      {status ? (
        <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground no-underline">
          {item.status === "done" ? <Check className="size-3 text-primary" aria-hidden /> : null}
          {status}
        </span>
      ) : null}
    </Link>
  );
}

function Day({ date, items, today, coachTz, compact, muted }: { date: string; items: CoachCalendarItem[]; today: string; coachTz: string; compact: boolean; muted?: boolean }) {
  const { shown, more } = compact ? dayPreview(items) : { shown: items, more: 0 };
  return (
    <section aria-label={dayLabel(date)} className={cn("min-w-0 space-y-1 rounded-lg border bg-card p-1.5", muted && "opacity-60", date === today && "border-primary")}>
      <p className={cn("px-1.5 text-xs font-semibold text-muted-foreground", date === today && "text-primary")}>
        {compact ? Number(date.slice(8)) : dayLabel(date)}
      </p>
      {shown.map((i) => (
        <Row key={i.key} item={i} coachTz={coachTz} />
      ))}
      {more ? (
        // Без JS: <details> раскрывает остальные строки дня на месте
        <details className="group">
          <summary className="cursor-pointer list-none px-1.5 text-xs font-medium text-primary group-open:hidden">ещё {more}</summary>
          {items.slice(shown.length).map((i) => (
            <Row key={i.key} item={i} coachTz={coachTz} />
          ))}
        </details>
      ) : null}
    </section>
  );
}

/** Календарь тренера: неделя (на телефоне — списком дней) или месяц; навигация ссылками с сохранением группы. */
export function CoachCalendar({
  view,
  date,
  today,
  coachTz,
  items,
  hrefFor,
}: {
  view: CalendarViewKind;
  date: string;
  today: string;
  coachTz: string;
  items: CoachCalendarItem[];
  hrefFor: (view: CalendarViewKind, date: string) => string;
}) {
  const byDay = groupByDay(items);
  const days =
    view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i)) : monthGrid(date.slice(0, 7));
  const month = date.slice(0, 7);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={hrefFor(view, today)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Сегодня
        </Link>
        <div className="flex">
          <Link href={hrefFor(view, shiftDate(view, date, -1))} aria-label={view === "week" ? "Предыдущая неделя" : "Предыдущий месяц"} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <ChevronLeft />
          </Link>
          <Link href={hrefFor(view, shiftDate(view, date, 1))} aria-label={view === "week" ? "Следующая неделя" : "Следующий месяц"} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <ChevronRight />
          </Link>
        </div>
        <h2 className="text-lg font-bold">{viewTitle(view, date)}</h2>
        <nav aria-label="Вид календаря" className="ml-auto flex rounded-lg bg-muted p-0.5">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={hrefFor(v, date)}
              aria-current={view === v ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", view === v && "bg-background text-foreground shadow-sm")}
            >
              {v === "week" ? "Неделя" : "Месяц"}
            </Link>
          ))}
        </nav>
      </div>

      {view === "week" ? (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d) => (
            <Day key={d} date={d} items={byDay.get(d) ?? []} today={today} coachTz={coachTz} compact={false} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS_SHORT.map((w) => (
            <p key={w} className="text-center text-xs font-medium text-muted-foreground">
              {w}
            </p>
          ))}
          {days.map((d) => (
            <Day key={d} date={d} items={byDay.get(d) ?? []} today={today} coachTz={coachTz} compact muted={d.slice(0, 7) !== month} />
          ))}
        </div>
      )}
    </div>
  );
}
