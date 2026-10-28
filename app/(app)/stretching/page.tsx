import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { StretchCatalog } from "@/components/stretching/stretch-catalog";
import { StretchStart } from "@/components/stretching/stretch-start";
import { GoalCard } from "@/components/goals/goal-card";
import { NewGoal } from "@/components/goals/new-goal-dialog";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { listExercises } from "@/lib/exercises/queries";
import { isEnabled } from "@/lib/flags/server";
import { getGoalFormData, getStretchGoals } from "@/lib/goals/queries";
import { getStretchStats } from "@/lib/stats/queries";
import { getHoldRecords, hasActiveWorkout, listStretchTemplates } from "@/lib/stretching/queries";

export const metadata: Metadata = { title: "Растяжка" };

export default async function StretchingPage() {
  const user = await requireUser();
  if (!(await isEnabled("stretching", user.id))) notFound();
  const tz = safeTimeZone(user.timeZone);
  const [stats, templates, active, exercises, records, goals, form, activeGoals] = await Promise.all([
    getStretchStats(user.id, tz),
    listStretchTemplates(user.id),
    hasActiveWorkout(user.id),
    listExercises(user.id, { group: "STRETCH" }),
    getHoldRecords(user.id),
    getStretchGoals(user.id, tz),
    getGoalFormData(user.id, tz),
    db.goal.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);

  return (
    <>
      <PageHeader title="Растяжка" description="Гибкость, заминка и восстановление" actions={<StretchStart templates={templates} active={active} />} />
      <div className="space-y-8">
        <section aria-label="Неделя" className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Минут за неделю</p>
            <p className="mt-1 text-2xl font-black" data-testid="stretch-week-minutes">{stats.week.minutes}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Сессий за неделю</p>
            <p className="mt-1 text-2xl font-black" data-testid="stretch-week-sessions">{stats.week.sessions}</p>
          </div>
        </section>

        <section aria-label="Цели по растяжке" className="space-y-3">
          <h2 className="text-lg font-bold">Цели по растяжке</h2>
          {goals.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {goals.map((g) => (
                <GoalCard key={g.id} goal={g} today={form.today} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Целей по растяжке пока нет — поставьте цель на удержание позы.</p>
          )}
          <NewGoal form={form} activeCount={activeGoals} suggestions={[]} again={null} initialGroup="stretch" />
        </section>

        <StretchCatalog exercises={exercises} records={records} />
      </div>
    </>
  );
}
