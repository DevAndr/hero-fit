import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { StretchCatalog } from "@/components/stretching/stretch-catalog";
import { StretchStart } from "@/components/stretching/stretch-start";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { listExercises } from "@/lib/exercises/queries";
import { isEnabled } from "@/lib/flags/server";
import { getStretchStats } from "@/lib/stats/queries";
import { getHoldRecords, hasActiveWorkout, listStretchTemplates } from "@/lib/stretching/queries";

export const metadata: Metadata = { title: "Растяжка" };

export default async function StretchingPage() {
  const user = await requireUser();
  if (!(await isEnabled("stretching", user.id))) notFound();
  const [stats, templates, active, exercises, records] = await Promise.all([
    getStretchStats(user.id, safeTimeZone(user.timeZone)),
    listStretchTemplates(user.id),
    hasActiveWorkout(user.id),
    listExercises(user.id, { group: "STRETCH" }),
    getHoldRecords(user.id),
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
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5">
            <p className="text-sm text-muted-foreground">Целей по растяжке пока нет — поставьте цель на регулярность или удержание.</p>
            <Link href="/goals" className={buttonVariants({ variant: "outline" })}>
              <Target />
              Поставить цель
            </Link>
          </div>
        </section>

        <StretchCatalog exercises={exercises} records={records} />
      </div>
    </>
  );
}
