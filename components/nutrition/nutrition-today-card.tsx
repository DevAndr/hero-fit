import Link from "next/link";
import { Apple, ArrowRight, Flame } from "lucide-react";
import { CalorieRing } from "@/components/nutrition/calorie-ring";
import { plural } from "@/lib/format";
import type { NutritionToday } from "@/lib/nutrition/today-queries";

const n = (v: number) => v.toLocaleString("ru-RU");

export function DiaryStreakLine({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold">
      <Flame className="size-4 text-streak" aria-hidden />
      Серия дневника: {days} {plural(days, "день", "дня", "дней")}
    </p>
  );
}

/** Дашборд (флаг nutrition): мини-кольцо калорий, серия дневника, ссылка на дневник; без записей за неделю — приглашение. */
export function NutritionTodayCard({ data }: { data: NutritionToday }) {
  const link = (
    <Link href="/nutrition" className="flex items-center gap-1 text-sm text-primary hover:underline">
      Открыть дневник
      <ArrowRight className="size-3.5" />
    </Link>
  );
  if (!data.recent && data.eaten === 0) {
    return (
      <section aria-label="Питание сегодня" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Apple className="size-4 text-primary" aria-hidden />
          Записывайте еду — посчитаем калории и серию
        </p>
        {link}
      </section>
    );
  }
  return (
    <section aria-label="Питание сегодня" className="flex items-center gap-4 rounded-xl border bg-card p-4">
      {data.normKcal ? <CalorieRing eaten={data.eaten} norm={data.normKcal} size="sm" /> : null}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h2 className="font-bold">Питание сегодня</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          Съедено {n(data.eaten)}
          {data.normKcal ? ` из ${n(data.normKcal)}` : ""} ккал
        </p>
        <DiaryStreakLine days={data.streak} />
        {link}
      </div>
    </section>
  );
}
