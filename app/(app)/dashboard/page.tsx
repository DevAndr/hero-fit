import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Clock, Dumbbell, Flame, Play, Snowflake, Sparkles, Users } from "lucide-react";
import { GoalCard } from "@/components/achievements/goal-card";
import { OnboardingTour } from "@/components/onboarding/tour";
import { BossCard } from "@/components/boss/boss-card";
import { RestoreStreakButton } from "@/components/dashboard/restore-streak-button";
import { TodayPlan } from "@/components/dashboard/today-plan";
import { RecapCard } from "@/components/recap/recap-card";
import { FeedCard } from "@/components/social/activity-feed";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import { buttonVariants } from "@/components/ui/button";
import { TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { requireUser } from "@/lib/auth/dal";
import { activeCoachOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { safeTimeZone } from "@/lib/daily-login";
import { getDashboard } from "@/lib/dashboard/queries";
import { getBossView } from "@/lib/boss/queries";
import { getOnboardingPrograms } from "@/lib/onboarding/queries";
import { getTodayPlan } from "@/lib/plans/queries";
import { programWeekLabels } from "@/lib/coach/program-queries";
import { getOrCreateRecap } from "@/lib/recap/queries";
import { recapWeekFor } from "@/lib/recap/schedule";
import { getFeed } from "@/lib/social/queries";
import { GuildCard } from "@/components/guild/guild-card";
import { ClubCard } from "@/components/club/club-card";
import { GoalsCard } from "@/components/goals/goals-card";
import { getDashboardGoals } from "@/lib/goals/queries";
import { getMyGuild } from "@/lib/guild/queries";
import { getClubDashboard } from "@/lib/club/dashboard";
import { getRaidView } from "@/lib/raid/queries";
import { formatClock, plural } from "@/lib/format";
import { StreakFlame } from "@/components/lottie/streak-flame";
import { WhoopRecoveryCard } from "@/components/dashboard/whoop-recovery-card";
import { getWhoopRecovery } from "@/lib/whoop/queries";
import { BodyMap } from "@/components/progress/body-map";
import { XpBar } from "@/components/progress/xp-bar";
import { levelProgress } from "@/lib/progress/level";
import { getMuscleBalance, getMuscleRecovery } from "@/lib/progress/recovery-queries";
import { isStreakUrgent, streakMessage } from "@/lib/progress/streak-copy";
import { restoreOffer, streakStatus, streakValue, STREAK_WEEK_TARGET, type RestoreOffer } from "@/lib/progress/weekly-streak";
import { cn } from "@/lib/utils";
import { isEnabled } from "@/lib/flags/server";

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

/** Срок выкупа — в поясе пользователя (четверг 00:00 у него, а не у сервера). */
const deadlineText = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("ru-RU", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(date);

function StreakCard({
  status,
  longest,
  freezes,
  offer,
  levelXp,
  timeZone,
}: {
  status: ReturnType<typeof streakStatus>;
  longest: number;
  freezes: number;
  offer: RestoreOffer | null;
  levelXp: number;
  timeZone: string;
}) {
  const value = streakValue(status);
  const alive = value > 0;
  const urgent = isStreakUrgent(status);
  const message = offer ? `Серия сгорела — её можно вернуть до ${deadlineText(offer.expiresAt, timeZone)}` : streakMessage(status);
  // Тренировки недели видны и до первой серии, и после сгоревшей — они ведут к новой
  const count = status.state === "done" ? STREAK_WEEK_TARGET : status.count;

  return (
    <section
      aria-label="Streak"
      data-tour="streak"
      className={cn("rounded-xl border p-4", urgent ? "border-streak/60 bg-streak/10" : "bg-card")}
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Flame className="size-4 text-streak" />
        Режим «в ударе»
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p className={cn("text-5xl font-black", alive ? "text-streak" : "text-muted-foreground")} data-testid="streak-value">
          {value}
        </p>
        {alive ? <StreakFlame active className="size-11" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">{plural(value, "неделя", "недели", "недель")} подряд</p>
      {/* Прогресс недели: точка — тренировка, на третьей неделя засчитывается */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex gap-1.5" role="img" aria-label={`Эта неделя: ${Math.min(count, STREAK_WEEK_TARGET)} из ${STREAK_WEEK_TARGET}`}>
          {Array.from({ length: STREAK_WEEK_TARGET }, (_, i) => (
            <span key={i} className={cn("size-2.5 rounded-full", i < count ? "bg-streak" : "bg-muted")} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums" aria-hidden data-testid="streak-week">
          {Math.min(count, STREAK_WEEK_TARGET)}/{STREAK_WEEK_TARGET} за неделю
        </span>
      </div>
      <p className="mt-2 text-sm font-medium" data-testid="streak-message">
        {message}
      </p>
      {offer ? <RestoreStreakButton streak={offer.streak} cost={offer.cost} missing={Math.max(0, offer.cost - levelXp)} /> : null}
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
  const userTz = safeTimeZone(user.timeZone);
  const [data, feed, plan, recap, [recovery, whoopRecovery], balance, boss, coach, guild, goals, club] = await Promise.all([
    getDashboard(user.id, timeZone),
    getFeed(user.id, null, 8),
    getTodayPlan(user.id, userTz),
    getOrCreateRecap(user.id, recapWeekFor(new Date(), userTz), userTz),
    getMuscleRecovery(user.id).then(async (r) => [r, await getWhoopRecovery(user.id, userTz, r)] as const),
    getMuscleBalance(user.id),
    getBossView(user.id, userTz),
    activeCoachOf(user.id),
    getMyGuild(user.id, userTz),
    getDashboardGoals(user.id, userTz),
    getClubDashboard(user.id, userTz),
  ]);
  const programOf = await programWeekLabels([...plan.today, plan.next, plan.missedYesterday].map((p) => p?.seriesId ?? null));
  const raid = guild ? await getRaidView(guild.id, user.id, userTz) : null;
  // Экскурсия — пока не пройдена (ONBOARDING_TOUR влияет только на регистрацию)
  const programs = user.onboardedAt === null ? await getOnboardingPrograms() : null;
  const friendsRecent = feed.entries.filter((e) => !e.me).slice(0, 3);
  const level = levelProgress(user.xp);
  const now = new Date();
  const streakTz = userTz;
  const status = streakStatus(data.streak, now, streakTz);
  const offer = restoreOffer(data.streak, now, streakTz);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {programs ? <OnboardingTour programs={programs} /> : null}
      {/* Главное действие — самое заметное на странице */}
      <section className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Привет, {user.name ?? user.login}!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.activeWorkout
              ? `Тренировка «${data.activeWorkout.name}» ждёт продолжения`
              : isStreakUrgent(status)
                ? "Тренировка сегодня спасёт серию недели"
                : "Готов прокачаться сегодня?"}
          </p>
        </div>
        <Link href="/training" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
          <Play />
          {data.activeWorkout ? "Продолжить тренировку" : "Начать тренировку"}
        </Link>
      </section>

      <TodayPlan
        today={plan.today.map((p) => ({ ...p, program: programOf(p.seriesId, p.date) }))}
        next={plan.next && { ...plan.next, program: programOf(plan.next.seriesId, plan.next.date) }}
        missedYesterday={plan.missedYesterday && { ...plan.missedYesterday, program: programOf(plan.missedYesterday.seriesId, plan.missedYesterday.date) }}
        activePlanKey={plan.activePlanKey}
        coachName={coach ? clientDisplayName(coach) : null}
      />
      {recap ? <RecapCard recap={recap} strength={await isEnabled("strength_analytics", user.id)} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section aria-label="Уровень" data-tour="xp" className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-xp" />
            Уровень
          </p>
          <p className="mt-1 text-5xl font-black text-xp">{level.level}</p>
          <XpBar level={level.level} percent={level.percent} size="lg" delay={150} label={`Опыт уровня ${level.level}`} className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground" data-testid="xp-to-next">
            {level.current} / {level.required} XP · до уровня {level.level + 1}: {level.required - level.current} XP
          </p>
        </section>

        <StreakCard
          status={status}
          longest={data.streak.longestStreak}
          freezes={data.streak.streakFreezes}
          offer={offer}
          levelXp={level.current}
          timeZone={streakTz}
        />

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

      <BossCard boss={boss} />

      <GoalsCard goals={goals.goals} total={goals.total} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

      {whoopRecovery ? <WhoopRecoveryCard view={whoopRecovery} embedded={user.embedded} /> : null}
      <BodyMap recovery={recovery} balance={balance} />

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

      {club ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <GuildCard guild={guild} raid={raid} />
          <ClubCard data={club} />
        </div>
      ) : (
        <GuildCard guild={guild} raid={raid} />
      )}

      <section aria-label="Друзья недавно" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Друзья недавно</h2>
          <Link href="/friends" className="text-xs text-primary hover:underline">
            Вся лента
          </Link>
        </div>
        {friendsRecent.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {friendsRecent.map((entry) => (
              <FeedCard key={entry.id} entry={entry} compact />
            ))}
          </div>
        ) : (
          <Link
            href="/friends"
            className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50"
          >
            <Users className="size-5 shrink-0 text-primary" />
            {feed.friends
              ? "Друзья пока не тренировались — поддержите их 👊, когда начнут."
              : "Тренируйтесь вместе: пригласите друга — увидите его тренировки и соревнуйтесь в недельной лиге."}
          </Link>
        )}
      </section>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        Дни считаются по часовому поясу {timeZone}
      </p>
    </div>
  );
}
