import Link from "next/link";
import { formatRecord, isTimedRecord } from "@/lib/progress/records";
import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Clock, Dumbbell, Flame, HeartPulse, Layers, Medal, PersonStanding, Repeat, RotateCcw, Sparkles, Trophy, Weight } from "lucide-react";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import { PageHeader } from "@/components/app/app-shell";
import { BossDamage } from "@/components/boss/boss-damage";
import { RaidDamage } from "@/components/raid/raid-damage";
import { ClubTasksSummary } from "@/components/club/club-tasks-summary";
import { CoinLines } from "@/components/shop/coin-lines";
import { GoalsReached } from "@/components/goals/goals-reached";
import { StreakFlame } from "@/components/lottie/streak-flame";
import { LevelUpBar } from "@/components/progress/level-up-bar";
import { OfflineCleanup } from "@/components/training/offline-cleanup";
import { SupersetHeader, SupersetLabel, SupersetPart } from "@/components/training/superset-frame";
import { Haptic } from "@/components/telegram/haptic";
import type { RecordType } from "@/generated/prisma/enums";
import { progressionLine, type ProgressionItem } from "@/lib/coach/progression";
import { formatDuration, rirLabel } from "@/lib/format";
import { GoblinSummary } from "@/components/goblin/goblin-summary";
import { levelProgress } from "@/lib/progress/level";
import { groupLabels, groupSize } from "@/lib/workouts/supersets";
import { formatKm, isTimed, timedSetText } from "@/lib/workouts/kinds";
import { workoutTotals } from "@/lib/workouts/schema";
import { workoutStreakCaption } from "@/lib/progress/streak-copy";
import type { FinishMeta } from "@/lib/workouts/finish";
import type { getWorkoutSummary } from "@/lib/workouts/queries";
import { stretchMinutes } from "@/lib/stats/stretch";
import { cn } from "@/lib/utils";

export type WorkoutSummary = NonNullable<Awaited<ReturnType<typeof getWorkoutSummary>>>;

const CELEBRATE_WINDOW_MS = 15 * 60_000;

const RECORD_LABELS: Record<RecordType, string> = {
  ONE_RM: "1RM (расчётный)",
  MAX_WEIGHT: "Макс. вес",
  MAX_REPS: "Макс. повторы",
  MAX_DURATION: "Дольше всего",
  MAX_DISTANCE: "Дальше всего",
  BEST_PACE: "Лучший темп",
};

const kg = (n: number) => `${Math.round(n * 10) / 10} кг`;
const recordValue = (type: RecordType, v: number) => (type === "MAX_REPS" ? `${v} повт.` : isTimedRecord(type) ? formatRecord(type, v) : kg(v));
/** Время завершения — в поясе смотрящего: страница рендерится на сервере, а у него свой пояс (в проде UTC). */
const finishedLabel = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone }).format(date);

function Stat({ icon: Icon, label, value, testId }: { icon: typeof Clock; label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Сводка завершённой тренировки — общая для /workouts/[id] и просмотра тренировки клиента у тренера.
 * readOnly: без салюта, сундука босса и чистки офлайн-черновика (это не своя тренировка).
 */
export function WorkoutSummaryView({
  workout,
  owner,
  timeZone,
  title,
  actions,
  footer,
  readOnly,
  bossTaken,
  exerciseHref,
  renderComment,
  feedback,
  recordCard,
  wearable,
  goalChests = [],
  goblinOpened = true,
  supersets = false,
}: {
  workout: WorkoutSummary;
  /** Владелец тренировки: опыт и серия, если у тренировки нет события завершения. */
  owner: { xp: number; currentStreak: number };
  /** Пояс смотрящего (IANA, safeTimeZone) — для времени завершения. */
  timeZone: string;
  title: string;
  actions?: ReactNode;
  footer?: ReactNode;
  readOnly: boolean;
  bossTaken: boolean;
  exerciseHref: (exerciseId: string) => string;
  /** Комментарии тренера: заметка упражнения (id упражнения тренировки) и общий блок (null) — показ или редактор. */
  renderComment?: (workoutExerciseId: string | null) => ReactNode;
  /** Оценка тренировки: форма у владельца, блок «Оценка клиента» у тренера. */
  feedback?: ReactNode;
  /** Кнопка и окно «Карточка рекорда» под списком рекордов (своя сводка при включённом тумблере). */
  recordCard?: ReactNode;
  /** Данные браслета (WHOOP) — только у владельца; выводятся перед оценкой. */
  wearable?: ReactNode;
  /** Цели этой тренировки с ещё не открытым сундуком. */
  goalChests?: string[];
  /** Сундук Золотого гоблина этой тренировки уже открыт (нет гоблина — не важно). */
  goblinOpened?: boolean;
  /** Показывать суперсеты (флаг workout_formats). */
  supersets?: boolean;
}) {
  const meta = workout.xpEvents[0]?.meta as FinishMeta | undefined;
  const groupItems = workout.exercises.map((we) => ({ group: we.supersetGroup }));
  // Кардио и упражнения на время: минуты и км; растяжка — минуты удержания (подходы — уже только выполненные)
  const cardio = workoutTotals(workout.exercises.map((we) => ({ kind: we.exercise.kind, perSide: we.exercise.perSide, sets: we.sets })));
  // Сессия растяжки: без серии, объёма, повторов и босса
  const stretchOnly = workout.stretchOnly;
  const labels = supersets ? groupLabels(groupItems) : [];
  const achievementsXp = meta?.achievementsXp ?? 0;
  const totalXp = workout.xpEarned + achievementsXp;
  const xpAfter = meta ? meta.xpBefore + totalXp : owner.xp;
  const level = levelProgress(xpAfter);
  const leveledUp = meta ? meta.levelAfter > meta.levelBefore : false;
  // Салют — только сразу после тренировки, а не при просмотре истории
  const freshFinish = workout.finishedAt !== null && new Date().getTime() - workout.finishedAt.getTime() < CELEBRATE_WINDOW_MS;
  const streakNow = meta?.weekCount !== undefined ? meta.streak : owner.currentStreak;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Тренировка на сервере завершена — её черновик на устройстве больше не нужен */}
      {readOnly ? null : <OfflineCleanup workoutId={workout.id} />}
      <PageHeader title={title} description={workout.finishedAt ? finishedLabel(workout.finishedAt, timeZone) : undefined} actions={actions} />

      <div className={cn("grid gap-3", !stretchOnly && "sm:grid-cols-2")}>
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
            <LevelUpBar
              celebrate={!readOnly && leveledUp && freshFinish}
              level={level.level}
              percent={level.percent}
              from={meta ? levelProgress(meta.xpBefore) : undefined}
              size="lg"
              delay={400}
              label={`Опыт уровня ${level.level}`}
              className="mt-1"
            />
          </div>
        </div>

        {stretchOnly ? null : (
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Flame className="size-4 text-streak" />
              Streak
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-3xl font-black text-streak" data-testid="streak">
              {streakNow}
              <StreakFlame active={streakNow > 0} className="size-8" />
            </p>
            <p className="text-xs text-muted-foreground">
              {workoutStreakCaption(meta)}
            </p>
          </div>
        )}
      </div>

      {!readOnly && meta?.coins ? <CoinLines coins={meta.coins} /> : null}

      {meta?.records.length ? (
        <section className="mt-4 rounded-xl border border-xp/40 bg-xp/5 p-4">
          {!readOnly && freshFinish ? <Haptic kind="success" /> : null}
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
          {recordCard}
        </section>
      ) : null}

      {meta?.achievements?.length ? (
        <section className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <Medal className="size-4 text-primary" />
            Новые ачивки
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {meta.achievements.map((a) => (
              <li key={a.code} className="flex items-center gap-3">
                <AchievementIcon code={a.code} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{a.title}</span>{" "}
                  <span className="text-muted-foreground">· {a.description}</span>
                </span>
                <span className="font-semibold text-xp tabular-nums">+{a.xpReward} XP</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {meta?.boss ? (
        <BossDamage boss={meta.boss} rewardOpened={readOnly || bossTaken} celebrate={!readOnly && freshFinish} readOnly={readOnly} />
      ) : null}
      {meta?.goblin ? <GoblinSummary goblin={meta.goblin} opened={goblinOpened} readOnly={readOnly} /> : null}
      {meta?.raid ? <RaidDamage raid={meta.raid} readOnly={readOnly} /> : null}
      {meta?.clubTasks?.length ? <ClubTasksSummary tasks={meta.clubTasks} readOnly={readOnly} /> : null}
      {meta?.goals ? <GoalsReached goals={meta.goals} unopened={goalChests} readOnly={readOnly} /> : null}

      <div className={cn("mt-4 grid grid-cols-2 gap-3", stretchOnly ? "sm:grid-cols-3" : "sm:grid-cols-5")}>
        <Stat icon={Clock} label="Время" value={formatDuration(workout.durationSec ?? 0)} />
        {stretchOnly ? null : (
          <>
            <Stat icon={Weight} label="Объём" value={`${Math.round(workout.totalVolume).toLocaleString("ru-RU")} кг`} />
            <Stat icon={Layers} label="Подходы" value={String(workout.totalSets)} />
            <Stat icon={Repeat} label="Повторы" value={String(workout.totalReps)} />
          </>
        )}
        <Stat icon={Dumbbell} label="Упражнения" value={String(workout.exercises.length)} />
        {cardio.stretchSec > 0 ? (
          <Stat icon={PersonStanding} label="Растяжка" value={`${stretchMinutes(cardio.stretchSec)} мин`} testId="summary-stretch" />
        ) : null}
        {cardio.workSec > 0 ? (
          <Stat
            icon={HeartPulse}
            label="Кардио"
            value={[`${Math.round(cardio.workSec / 60)} мин`, cardio.distanceM ? formatKm(cardio.distanceM) : null].filter(Boolean).join(" · ")}
          />
        ) : null}
      </div>

      {wearable ? <div className="mt-4">{wearable}</div> : null}
      {feedback ? <div className="mt-4">{feedback}</div> : null}

      {meta?.program ? (
        <section aria-label={meta.programName ? "Программа" : "План тренера"} className="mt-4 rounded-xl border p-4">
          <h2 className="font-bold">{meta.programName ? `Программа «${meta.programName}»` : "План тренера"}</h2>
          <p className="mt-2 text-sm">Программа: {meta.program[0].toLowerCase() + meta.program.slice(1)}</p>
        </section>
      ) : null}
      {meta?.progression?.length ? <ProgressionBlock items={meta.progression} title={meta.progressionSource === "own" ? "Прогрессия" : "План тренера"} /> : null}

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-bold">Упражнения</h2>
        {workout.exercises.map((we, index) => (
          <Fragment key={we.id}>
            {supersets && we.supersetGroup !== null && workout.exercises[index - 1]?.supersetGroup !== we.supersetGroup ? (
              <SupersetHeader size={groupSize(groupItems, index)} />
            ) : null}
            <SupersetPart grouped={supersets && we.supersetGroup !== null}>
              <div className="rounded-xl border bg-card p-4">
                <h3 className="font-semibold">
                  <SupersetLabel label={labels[index]} />
                  <Link href={exerciseHref(we.exerciseId)} className="hover:text-primary hover:underline">
                    {we.exercise.name}
                  </Link>
                </h3>
                <ol className="mt-2 flex flex-wrap gap-2 text-sm tabular-nums">
                  {we.sets.map((s) => (
                    <li
                      key={s.id}
                      className={cn("rounded-md px-2 py-0.5", s.isWarmup ? "bg-muted text-muted-foreground" : "bg-primary/10")}
                    >
                      {isTimed(we.exercise.kind)
                    ? timedSetText(we.exercise.kind, s, we.exercise.perSide)
                    : s.weight
                      ? `${s.weight} × ${s.reps}`
                      : `${s.reps} повт.`}
                      {s.rir !== null ? <span className="ml-1 text-xs text-muted-foreground">@RIR {rirLabel(s.rir)}</span> : null}
                    </li>
                  ))}
                </ol>
                {renderComment?.(we.id)}
              </div>
            </SupersetPart>
            </Fragment>
        ))}
      </section>

      {renderComment?.(null)}
      {footer ? <div className="mt-6 flex flex-wrap gap-2">{footer}</div> : null}
    </div>
  );
}

const PROGRESSION_ICON = {
  up: { Icon: ArrowUp, className: "text-primary" },
  same: { Icon: RotateCcw, className: "text-muted-foreground" },
  deload: { Icon: ArrowDown, className: "text-streak" },
} as const;

/** Прогрессия — заданий тренера («План тренера») или своего шаблона: что будет в следующий раз (FinishMeta.progression). */
function ProgressionBlock({ items, title }: { items: ProgressionItem[]; title: string }) {
  return (
    <section aria-label={title} className="mt-4 rounded-xl border p-4">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((item) => {
          const { Icon, className } = PROGRESSION_ICON[item.kind];
          return (
            <li key={item.exercise} className="flex items-start gap-2">
              <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
              {progressionLine(item)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
