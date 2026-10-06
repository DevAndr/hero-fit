import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Clock, Dumbbell, Flame, Play, Snowflake, Sparkles } from "lucide-react";
import { GoalCard } from "@/components/achievements/goal-card";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import { buttonVariants } from "@/components/ui/button";
import { TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { getDashboard } from "@/lib/dashboard/queries";
import { formatClock } from "@/lib/format";
import { levelProgress } from "@/lib/progress/level";
import { streakStatus } from "@/lib/progress/streak";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Личный кабинет" };

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StreakCard({ status, longest, freezes }: { status: ReturnType<typeof streakStatus>; longest: number; freezes: number }) {
  const alive = status.state === "counted" || status.state === "due" || status.state === "frozen";
  const value = status.state === "none" || status.state === "lost" ? 0 : status.streak;
  const message = {
    none: "Завершите тренировку, чтобы зажечь серию",
    counted: "Сегодня уже засчитано 🔥",
    due: `Не потеряй streak! Осталось ${status.state === "due" ? status.hoursLeft : 0} ч`,
    frozen: "Срок прошёл — следующую тренировку спасёт заморозка",
    lost: "Серия прервалась — начните новую",
  }[status.state];

  return (
    <section
      aria-label="Streak"
      className={cn("rounded-xl border p-4", status.state === "due" ? "border-streak/60 bg-streak/10" : "bg-card")}
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Flame className="size-4 text-streak" />
        Режим «в ударе»
      </p>
      <p className={cn("mt-1 text-5xl font-black", alive ? "text-streak" : "text-muted-foreground")} data-testid="streak-value">
        {value}
      </p>
      <p className="text-sm font-medium" data-testid="streak-message">
        {message}
      </p>
      <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Рекорд: {longest}</span>
        <span className="flex items-center gap-1">
          <Snowflake className="size-3.5" />
          Заморозки: {freezes}
        </span>
      </p>
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const timeZone = safeTimeZone((await cookies()).get(TIMEZONE_COOKIE)?.value);
  const data = await getDashboard(user.id, timeZone);
  const level = levelProgress(user.xp);
  const status = streakStatus(data.streak, new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Главное действие — самое заметное на странице */}
      <section className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Привет, {user.name ?? user.login}!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.activeWorkout
              ? `Тренировка «${data.activeWorkout.name}» ждёт продолжения`
              : status.state === "due"
                ? "Сегодня тренировка продлит серию"
                : "Готов прокачаться сегодня?"}
          </p>
        </div>
        <Link href="/training" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
          <Play />
          {data.activeWorkout ? "Продолжить тренировку" : "Начать тренировку"}
        </Link>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <section aria-label="Уровень" className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-xp" />
            Уровень
          </p>
          <p className="mt-1 text-5xl font-black text-xp">{level.level}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-xp" style={{ width: `${level.percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="xp-to-next">
            {level.current} / {level.required} XP · до уровня {level.level + 1}: {level.required - level.current} XP
          </p>
        </section>

        <StreakCard status={status} longest={data.streak.longestStreak} freezes={data.streak.streakFreezes} />

        <section aria-label="Ближайшая ачивка" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-muted-foreground">Ближайшая ачивка</h2>
            <Link href="/achievements" className="text-xs text-primary hover:underline">
              Все ачивки
            </Link>
          </div>
          {data.nearestGoal ? <GoalCard goal={data.nearestGoal} /> : null}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <VolumeChart data={data.volume} />
        </div>

        <section aria-label="Последняя тренировка" className="flex flex-col rounded-xl border bg-card p-4">
          <h2 className="font-bold">Последняя тренировка</h2>
          {data.lastWorkout ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.lastWorkout.name} · {data.lastWorkout.finishedAt ? dateFormat.format(data.lastWorkout.finishedAt) : ""}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Время</dt>
                  <dd className="font-semibold">{formatClock(data.lastWorkout.durationSec ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Объём</dt>
                  <dd className="font-semibold">{Math.round(data.lastWorkout.totalVolume).toLocaleString("ru-RU")} кг</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Подходы</dt>
                  <dd className="font-semibold">{data.lastWorkout.totalSets}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Опыт</dt>
                  <dd className="font-semibold text-xp">+{data.lastWorkout.xpEarned} XP</dd>
                </div>
              </dl>
              <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                {data.lastWorkout.exercises.map((e) => e.exercise.name).join(" · ")}
              </p>
              <Link
                href={`/workouts/${data.lastWorkout.id}`}
                className="mt-auto flex items-center gap-1 pt-3 text-sm text-primary hover:underline"
              >
                Подробнее
                <ArrowRight className="size-3.5" />
              </Link>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <Dumbbell className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Здесь появится сводка вашей первой тренировки</p>
            </div>
          )}
        </section>
      </div>

      <section aria-label="Статистика" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Тренировок всего" value={data.counts.total.toLocaleString("ru-RU")} />
        <Tile label="За 7 дней" value={String(data.counts.week)} />
        <Tile label="За 30 дней" value={String(data.counts.month)} />
        <Tile
          label="В зале за 7 дней"
          value={`${data.weekHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`}
          hint={data.counts.week ? `≈ ${Math.round((data.weekHours * 60) / data.counts.week)} мин на тренировку` : undefined}
        />
      </section>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        Дни считаются по часовому поясу {timeZone}
      </p>
    </div>
  );
}
