import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Dumbbell, Flame, Layers, Medal, Repeat, Sparkles, Trophy, Weight } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { formatClock, plural, rirLabel } from "@/lib/format";
import { SaveTemplateButton } from "@/components/workouts/save-template-button";
import { UpdateTemplateButton } from "@/components/workouts/update-template-button";
import { buttonVariants } from "@/components/ui/button";
import type { RecordType } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { levelProgress } from "@/lib/progress/level";
import type { FinishMeta } from "@/lib/workouts/finish";
import { OfflineCleanup } from "@/components/training/offline-cleanup";
import { differsFromTemplate } from "@/lib/templates/from-workout";
import { getWorkoutSummary } from "@/lib/workouts/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Сводка тренировки" };

/** Подпись под серией: прогресс недели (3 тренировки → +1 к серии). */
function streakCaption(meta: FinishMeta | undefined) {
  if (!meta) return "";
  if (meta.streakReset) return "Серия прервалась — начинаем заново!";
  if (meta.usedFreezes) return `Серию спасла заморозка (${meta.usedFreezes})`;
  if (meta.streakExtended) return `Неделя засчитана — серия ${meta.streak} ${plural(meta.streak, "неделя", "недели", "недель")}!`;
  const count = meta.weekCount ?? 0;
  if (count < 3) {
    const left = 3 - count;
    return `Неделя: ${count}/3 — ещё ${left} ${plural(left, "тренировка", "тренировки", "тренировок")} до +1 к серии`;
  }
  return "Неделя уже засчитана — серия продолжается.";
}

const RECORD_LABELS: Record<RecordType, string> = {
  ONE_RM: "1RM (расчётный)",
  MAX_WEIGHT: "Макс. вес",
  MAX_REPS: "Макс. повторы",
};

const kg = (n: number) => `${Math.round(n * 10) / 10} кг`;
const recordValue = (type: RecordType, v: number) => (type === "MAX_REPS" ? `${v} повт.` : kg(v));
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function WorkoutSummaryPage({ params }: PageProps<"/workouts/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const workout = await getWorkoutSummary(user.id, id);
  if (!workout) notFound();

  const meta = workout.xpEvents[0]?.meta as FinishMeta | undefined;
  const achievementsXp = meta?.achievementsXp ?? 0;
  const totalXp = workout.xpEarned + achievementsXp;
  const xpAfter = meta ? meta.xpBefore + totalXp : user.xp;
  const level = levelProgress(xpAfter);
  const leveledUp = meta ? meta.levelAfter > meta.levelBefore : false;
  const ownTemplate = workout.template?.userId === user.id ? workout.template : null;
  const canUpdateTemplate = ownTemplate ? differsFromTemplate(workout.exercises, ownTemplate.exercises) : false;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Тренировка на сервере завершена — её черновик на устройстве больше не нужен */}
      <OfflineCleanup workoutId={workout.id} />
      <PageHeader
        title={`${workout.name} — готово!`}
        description={workout.finishedAt ? dateFormat.format(workout.finishedAt) : undefined}
        actions={
          <>
            {canUpdateTemplate && ownTemplate ? (
              <UpdateTemplateButton workoutId={workout.id} templateName={ownTemplate.name} />
            ) : null}
            <SaveTemplateButton workoutId={workout.id} defaultName={workout.name} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat icon={Clock} label="Время" value={formatClock(workout.durationSec ?? 0)} />
        <Stat icon={Weight} label="Объём" value={`${Math.round(workout.totalVolume).toLocaleString("ru-RU")} кг`} />
        <Stat icon={Layers} label="Подходы" value={String(workout.totalSets)} />
        <Stat icon={Repeat} label="Повторы" value={String(workout.totalReps)} />
        <Stat icon={Dumbbell} label="Упражнения" value={String(workout.exercises.length)} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={cn("rounded-xl border p-4", leveledUp ? "border-xp/50 bg-xp/10" : "bg-card")}>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-xp" />
            Опыт
          </p>
          <p className="mt-1 text-3xl font-black text-xp" data-testid="xp-earned">
            +{totalXp} XP
          </p>
          {meta && (meta.recordsXp || achievementsXp) ? (
            <p className="text-xs text-muted-foreground">
              {[
                `${meta.workoutXp} за тренировку`,
                meta.recordsXp ? `${meta.recordsXp} за рекорды` : null,
                achievementsXp ? `${achievementsXp} за ачивки` : null,
              ]
                .filter(Boolean)
                .join(" + ")}
            </p>
          ) : null}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {leveledUp ? `Новый уровень ${level.level}! 🎉` : `Уровень ${level.level}`}
              </span>
              <span className="tabular-nums">
                {level.current} / {level.required} XP
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-xp" style={{ width: `${level.percent}%` }} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flame className="size-4 text-streak" />
            Streak
          </p>
          <p className="mt-1 text-3xl font-black text-streak" data-testid="streak">
            {meta?.streak ?? user.currentStreak} 🔥
          </p>
          <p className="text-xs text-muted-foreground">
            {streakCaption(meta)}
          </p>
        </div>
      </div>

      {meta?.achievements?.length ? (
        <section className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <Medal className="size-4 text-primary" />
            Новые ачивки
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {meta.achievements.map((a) => (
              <li key={a.code} className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-semibold">{a.title}</span>{" "}
                  <span className="text-muted-foreground">· {a.description}</span>
                </span>
                <span className="font-semibold text-xp tabular-nums">+{a.xpReward} XP</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {meta?.records.length ? (
        <section className="mt-4 rounded-xl border border-xp/40 bg-xp/5 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <Trophy className="size-4 text-xp" />
            Новые рекорды
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {meta.records.map((r) => (
              <li key={`${r.exerciseId}-${r.type}`} className="flex flex-wrap justify-between gap-2">
                <span>
                  {r.exerciseName} · <span className="text-muted-foreground">{RECORD_LABELS[r.type]}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {recordValue(r.type, r.previous)} → <span className="text-xp">{recordValue(r.type, r.value)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-bold">Упражнения</h2>
        {workout.exercises.map((we) => (
          <div key={we.id} className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">
              <Link href={`/stats/exercises/${we.exerciseId}`} className="hover:text-primary hover:underline">
                {we.exercise.name}
              </Link>
            </h3>
            <ol className="mt-2 flex flex-wrap gap-2 text-sm tabular-nums">
              {we.sets.map((s) => (
                <li
                  key={s.id}
                  className={cn("rounded-md px-2 py-0.5", s.isWarmup ? "bg-muted text-muted-foreground" : "bg-primary/10")}
                >
                  {s.weight ? `${s.weight} × ${s.reps}` : `${s.reps} повт.`}
                  {s.rir !== null ? <span className="ml-1 text-xs text-muted-foreground">@RIR {rirLabel(s.rir)}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/dashboard" className={buttonVariants()}>
          В кабинет
        </Link>
      </div>
    </div>
  );
}
