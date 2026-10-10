import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { RemoveClientButton } from "@/components/coach/client-header";
import { ClientPlan } from "@/components/coach/client-plan";
import { BodyMap } from "@/components/progress/body-map";
import { HintBadge } from "@/components/stats/hint-badge";
import { StatsView } from "@/components/stats/stats-view";
import { buttonVariants } from "@/components/ui/button";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { requireClientOf } from "@/lib/coach/access";
import { clientDisplayName, clientWeek } from "@/lib/coach/clients";
import { getClientPlan } from "@/lib/coach/plan-queries";
import { getClientTargets } from "@/lib/coach/target-queries";
import { getClientWorkouts } from "@/lib/coach/queries";
import { db } from "@/lib/db";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { formatClock, plural } from "@/lib/format";
import { levelProgress } from "@/lib/progress/level";
import { getMuscleBalance, getMuscleRecovery } from "@/lib/progress/recovery-queries";
import { getProgressionHints, getStats, getTrends } from "@/lib/stats/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Клиент" };

const TABS = [
  { id: "overview", label: "Обзор" },
  { id: "plan", label: "План" },
  { id: "workouts", label: "Тренировки" },
  { id: "stats", label: "Статистика" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const since = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const hours = (sec: number) => `${(sec / 3600).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
const compactKg = (n: number) => `${new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(n)} кг`;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

/** Карточка клиента у тренера — только чтение, доступ проверяет requireClientOf. */
export default async function CoachClientPage({ params, searchParams }: PageProps<"/coach/clients/[id]">) {
  const { id } = await params;
  const { coach, client, linkedAt } = await requireClientOf(id);
  const query = await searchParams;
  const tab: Tab = TABS.find((t) => t.id === query.tab)?.id ?? "overview";
  const tz = safeTimeZone(client.timeZone);
  const name = clientDisplayName(client);
  const base = `/coach/clients/${client.id}`;

  return (
    <div className="space-y-4">
      <Link href="/coach" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Клиенты
      </Link>
      <PageHeader title={name} description={`Клиент с ${since.format(linkedAt)}`} actions={<RemoveClientButton clientId={client.id} name={name} />} />
      <nav aria-label="Разделы клиента" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "overview" ? base : `${base}?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" ? <Overview clientId={client.id} streak={clientWeek(client, new Date(), tz).streak} tz={tz} xp={client.xp} base={base} /> : null}
      {tab === "plan" ? <Plan coachId={coach.id} clientId={client.id} tz={tz} base={base} /> : null}
      {tab === "workouts" ? <Workouts clientId={client.id} coachId={coach.id} tz={tz} base={base} cursor={typeof query.cursor === "string" ? query.cursor : null} /> : null}
      {tab === "stats" ? <Stats clientId={client.id} tz={tz} base={base} /> : null}
    </div>
  );
}

async function Overview({ clientId, streak, tz, xp, base }: { clientId: string; streak: number; tz: string; xp: number; base: string }) {
  const now = new Date();
  const [{ totals: t }, recovery, balance, recent] = await Promise.all([
    getStats(clientId, tz),
    getMuscleRecovery(clientId, now),
    getMuscleBalance(clientId, now),
    db.workoutExercise.findMany({
      where: { workout: { userId: clientId, status: WorkoutStatus.COMPLETED, finishedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } },
      select: { exerciseId: true, exercise: { select: { name: true } } },
      distinct: ["exerciseId"],
    }),
  ]);
  const hints = await getProgressionHints(clientId, recent.map((r) => r.exerciseId));
  const hinted = recent.filter((r) => hints[r.exerciseId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="За 7 дней" value={String(t.week)} />
        <Tile label="За 30 дней" value={String(t.month)} />
        <Tile label="Поднято всего" value={compactKg(t.volume)} />
        <Tile label="В зале за 7 дней" value={hours(t.secWeek)} />
        <Tile label="Серия, недель" value={String(streak)} />
        <Tile label="Уровень" value={String(levelProgress(xp).level)} />
      </div>
      <BodyMap recovery={recovery} balance={balance} />
      {hinted.length ? (
        <section aria-label="Пора увеличить вес" className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="font-bold">Пора увеличить вес</h2>
          <ul className="space-y-2">
            {hinted.map((r) => (
              <li key={r.exerciseId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`${base}/exercises/${r.exerciseId}`} className="font-medium hover:text-primary hover:underline">
                  {r.exercise.name}
                </Link>
                <HintBadge hint={hints[r.exerciseId]} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function Plan({ coachId, clientId, tz, base }: { coachId: string; clientId: string; tz: string; base: string }) {
  const now = new Date();
  const [{ upcoming, past }, templates, targets] = await Promise.all([
    getClientPlan(coachId, clientId, tz, now),
    db.workoutTemplate.findMany({ where: { userId: coachId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getClientTargets(clientId, coachId, tz, now),
  ]);
  const strip = ({ key, title, date, time, durationMin, templateId, recurring, status, workoutId }: (typeof upcoming)[number]) => ({
    key,
    title,
    date,
    time,
    durationMin,
    templateId,
    recurring,
    status,
    workoutId,
  });
  return (
    <ClientPlan
      clientId={clientId}
      today={dayKey(now, tz)}
      base={base}
      templates={templates}
      upcoming={upcoming.map(strip)}
      past={past.map(strip)}
      targets={targets}
      timeZone={tz}
    />
  );
}

async function Workouts({ clientId, coachId, tz, base, cursor }: { clientId: string; coachId: string; tz: string; base: string; cursor: string | null }) {
  // День тренировки — по календарю клиента (сервер живёт по UTC)
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: tz });
  const { workouts, next } = await getClientWorkouts(clientId, coachId, cursor);
  if (!workouts.length) return <p className="text-sm text-muted-foreground">Клиент ещё не завершил ни одной тренировки.</p>;
  return (
    <div className="space-y-3">
      <ul aria-label="Тренировки клиента" className="divide-y divide-border/60 rounded-xl border bg-card">
        {workouts.map((w) => (
          <li key={w.id}>
            <Link href={`${base}/workouts/${w.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40">
              <span>
                <span className="block font-semibold">
                  {w.name}
                  {w._count.comments ? (
                    <span className="ml-1.5" title="Есть комментарий">
                      <span aria-hidden>💬</span>
                      <span className="sr-only">есть комментарий</span>
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">{w.finishedAt ? day.format(w.finishedAt) : ""}</span>
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {`${w._count.exercises} ${plural(w._count.exercises, "упражнение", "упражнения", "упражнений")} · ${w.totalSets} ${plural(w.totalSets, "подход", "подхода", "подходов")} · ${Math.round(w.totalVolume).toLocaleString("ru-RU")} кг · ${formatClock(w.durationSec ?? 0)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {next ? (
        <Link href={`${base}?tab=workouts&cursor=${encodeURIComponent(next)}`} className={buttonVariants({ variant: "outline" })}>
          Показать ещё
        </Link>
      ) : null}
    </div>
  );
}

async function Stats({ clientId, tz, base }: { clientId: string; tz: string; base: string }) {
  const [stats, trends] = await Promise.all([getStats(clientId, tz), getTrends(clientId, tz)]);
  return (
    <StatsView
      data={{ stats, trends }}
      exerciseHref={(id) => `${base}/exercises/${id}`}
      workoutHref={(id) => `${base}/workouts/${id}`}
      emptyText="Клиент ещё не завершил ни одной тренировки."
    />
  );
}
