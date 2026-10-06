import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { ExerciseProgressChart } from "@/components/stats/exercise-progress-chart";
import { HintBadge } from "@/components/stats/hint-badge";
import { OneRmCalculator } from "@/components/stats/one-rm-calculator";
import type { RecordType } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { epley1RM } from "@/lib/progress/records";
import { getExerciseProgress } from "@/lib/stats/queries";

export const metadata: Metadata = { title: "Прогресс упражнения" };

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

const RECORDS: { type: RecordType; label: string; unit: string }[] = [
  { type: "ONE_RM", label: "1RM (расчётный)", unit: "кг" },
  { type: "MAX_WEIGHT", label: "Макс. вес", unit: "кг" },
  { type: "MAX_REPS", label: "Макс. повторы", unit: "повт." },
];

export default async function ExerciseProgressPage({ params }: PageProps<"/stats/exercises/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getExerciseProgress(user.id, id);
  if (!data) notFound();
  const { exercise, sessions, records, hint } = data;

  // Калькулятор предзаполняем лучшим подходом по 1RM.
  const bestSet = sessions
    .flatMap((s) => s.sets)
    .filter((s) => s.weight > 0)
    .sort((a, b) => epley1RM(b.weight, b.reps) - epley1RM(a.weight, a.reps))[0];

  return (
    <div className="space-y-4">
      <Link href="/stats" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Статистика
      </Link>
      <PageHeader
        title={exercise.name}
        description={exercise.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")}
      />

      {hint ? <HintBadge hint={hint} className="w-fit text-sm" /> : null}

      <section aria-label="Личные рекорды" className="grid grid-cols-3 gap-3">
        {RECORDS.map(({ type, label, unit }) => {
          const record = records.find((r) => r.type === type);
          return (
            <div key={type} className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-black">{record ? `${fmt(record.value)} ${unit}` : "—"}</p>
              {record ? <p className="text-xs text-muted-foreground">{date.format(record.achievedAt)}</p> : null}
            </div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExerciseProgressChart sessions={sessions} />
        </div>
        <OneRmCalculator
          initialWeight={bestSet ? String(bestSet.weight) : ""}
          initialReps={bestSet ? String(bestSet.reps) : ""}
        />
      </div>

      <section aria-label="Тренировки с упражнением" className="space-y-2">
        <h2 className="text-lg font-bold">Тренировки ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Это упражнение ещё не выполнялось.</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-xl border bg-card">
            {[...sessions].reverse().map((s) => (
              <li key={s.workoutId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <Link href={`/workouts/${s.workoutId}`} className="font-medium hover:text-primary hover:underline">
                  {date.format(new Date(s.date))}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {s.sets.map((x) => (x.weight ? `${fmt(x.weight)}×${x.reps}` : `${x.reps}`)).join(", ")}
                </span>
                <span className="tabular-nums">
                  {fmt(s.volume)} кг{s.best1RM ? ` · 1RM ≈ ${fmt(s.best1RM)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
