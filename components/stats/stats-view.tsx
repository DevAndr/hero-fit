import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { ActivityHeatmap } from "@/components/stats/activity-heatmap";
import { MonthCompareCard } from "@/components/stats/month-compare";
import { MuscleChart } from "@/components/stats/muscle-chart";
import { OneRmCalculator } from "@/components/stats/one-rm-calculator";
import { RepRangeChart } from "@/components/stats/rep-range-chart";
import { RhythmChart } from "@/components/stats/rhythm-chart";
import { StrengthChart } from "@/components/stats/strength-chart";
import { WeeklyTrendChart } from "@/components/stats/weekly-trend-chart";
import { formatClock } from "@/lib/format";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { MonthCompare } from "@/lib/stats/month";
import type { getStats, getTrends } from "@/lib/stats/queries";

export type StatsViewData = {
  stats: Awaited<ReturnType<typeof getStats>>;
  trends: Awaited<ReturnType<typeof getTrends>>;
  month: MonthCompare;
};

const hours = (sec: number) => `${(sec / 3600).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
const kg = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} кг`;
const compactKg = (n: number) =>
  `${new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(n)} кг`;
const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

/**
 * Цифры и графики статистики — общие для /stats и вкладки «Статистика» клиента у тренера.
 * Ссылки на упражнения и тренировки задаёт страница.
 */
export function StatsView({
  data,
  exerciseHref,
  workoutHref,
  emptyText,
}: {
  data: StatsViewData;
  exerciseHref: (exerciseId: string) => string;
  workoutHref: (workoutId: string) => string;
  emptyText: string;
}) {
  const { totals: t, muscles, exercises, workouts } = data.stats;
  const { trends } = data;

  if (t.total === 0) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <ChartColumn className="size-10 text-muted-foreground" />
          <p className="font-semibold">Пока нет данных</p>
          <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
        </div>
        <div className="mt-6 max-w-md">
          <OneRmCalculator />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <MonthCompareCard data={data.month} />
      <section aria-label="Тренировки" className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Тренировки</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Всего" value={String(t.total)} />
          <Tile label="За 30 дней" value={String(t.month)} />
          <Tile label="За 7 дней" value={String(t.week)} />
          <Tile label="Поднято всего" value={compactKg(t.volume)} />
          <Tile
            label="Упражнений за тренировку"
            value={(t.exercises / t.total).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
          />
        </div>
      </section>

      <section aria-label="Время в зале" className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Время в зале</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Сегодня" value={hours(t.secToday)} />
          <Tile label="За 7 дней" value={hours(t.secWeek)} />
          <Tile label="С начала года" value={hours(t.secYear)} />
          <Tile label="Всё время" value={hours(t.secAll)} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <WeeklyTrendChart weeks={trends.weekly} />
        </div>
        <RepRangeChart rows={trends.repRanges} />
      </div>

      <ActivityHeatmap columns={trends.activity.columns} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <StrengthChart series={trends.strength.series} points={trends.strength.points} />
        </div>
        <RhythmChart weekdays={trends.rhythm.weekdays} hours={trends.rhythm.hours} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <MuscleChart rows={muscles} />
        </div>
        <OneRmCalculator />
      </div>

      <section aria-label="Упражнения" className="space-y-3">
        <h2 className="text-lg font-bold">Прогресс по упражнениям</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {exercises.map((e) => (
            <Link
              key={e.id}
              href={exerciseHref(e.id)}
              className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <p className="font-semibold">{e.name}</p>
              <p className="text-xs text-muted-foreground">
                {MUSCLE_GROUP_LABELS[e.muscleGroups[0]]} · тренировок: {e.sessions} · последняя {date.format(e.last)}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-3 text-sm tabular-nums">
                {e.records.MAX_WEIGHT ? <span>Макс. {kg(e.records.MAX_WEIGHT)}</span> : null}
                {e.records.ONE_RM ? <span>1RM ≈ {kg(e.records.ONE_RM)}</span> : null}
                {e.records.MAX_REPS ? <span>{e.records.MAX_REPS} повт.</span> : null}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="История тренировок" className="space-y-3">
        <h2 className="text-lg font-bold">История тренировок</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3 font-normal">Тренировка</th>
                <th className="p-3 font-normal">Группы мышц</th>
                <th className="p-3 text-right font-normal">Упражнений</th>
                <th className="p-3 text-right font-normal">Подходов</th>
                <th className="p-3 text-right font-normal">Повторов</th>
                <th className="p-3 text-right font-normal">Объём</th>
                <th className="p-3 text-right font-normal">Время</th>
                <th className="p-3 text-right font-normal" title="Тяжесть тренировки 1–10">
                  RPE
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {workouts.map((w) => {
                const groups = [...new Set(w.exercises.map((e) => e.exercise.muscleGroups[0]))];
                return (
                  <tr key={w.id} className="border-b border-border/50 last:border-0">
                    <td className="p-3">
                      <Link href={workoutHref(w.id)} className="font-medium hover:text-primary hover:underline">
                        {w.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{w.finishedAt ? date.format(w.finishedAt) : ""}</p>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(", ")}
                    </td>
                    <td className="p-3 text-right">{w.exercises.length}</td>
                    <td className="p-3 text-right">{w.totalSets}</td>
                    <td className="p-3 text-right">{w.totalReps}</td>
                    <td className="p-3 text-right">{kg(w.totalVolume)}</td>
                    <td className="p-3 text-right">{formatClock(w.durationSec ?? 0)}</td>
                    <td className="p-3 text-right">{w.rpe ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
