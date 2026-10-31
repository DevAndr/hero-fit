import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { addDays } from "@/lib/dates";
import { MAX_DIARY_DAYS } from "@/lib/nutrition/diary";
import { cn } from "@/lib/utils";

const dayTitle = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

/** «‹ Вчера · Сегодня · ›» — день дневника в `?date=`; вперёд дальше сегодня и назад дальше года нельзя. */
export function DayNav({ date, today }: { date: string; today: string }) {
  const title = date === today ? "Сегодня" : date === addDays(today, -1) ? "Вчера" : dayTitle.format(new Date(`${date}T12:00:00Z`));
  const prev = date > addDays(today, -MAX_DIARY_DAYS) ? addDays(date, -1) : null;
  const next = date < today ? addDays(date, 1) : null;
  const href = (d: string) => (d === today ? "/nutrition" : `/nutrition?date=${d}`);
  const arrow = cn(buttonVariants({ variant: "ghost", size: "icon" }));
  return (
    <nav aria-label="День дневника" className="flex items-center justify-between gap-3 rounded-xl border bg-card p-2">
      {prev ? (
        <Link href={href(prev)} aria-label="Предыдущий день" className={arrow}>
          <ChevronLeft />
        </Link>
      ) : (
        <span aria-label="Предыдущий день" aria-disabled="true" role="link" className={cn(arrow, "opacity-40")}>
          <ChevronLeft />
        </span>
      )}
      <h2 className="font-bold">{title}</h2>
      {next ? (
        <Link href={href(next)} aria-label="Следующий день" className={arrow}>
          <ChevronRight />
        </Link>
      ) : (
        <span aria-label="Следующий день" aria-disabled="true" role="link" className={cn(arrow, "opacity-40")}>
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}
