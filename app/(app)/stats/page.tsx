import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { StatsView } from "@/components/stats/stats-view";
import { buttonVariants } from "@/components/ui/button";
import { TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { getCardioStats, getStats, getTrends } from "@/lib/stats/queries";
import { getMonthCompare } from "@/lib/stats/strength-queries";
import { isEnabled } from "@/lib/flags/server";

export const metadata: Metadata = { title: "Статистика" };

export default async function StatsPage() {
  const user = await requireUser();
  const timeZone = safeTimeZone((await cookies()).get(TIMEZONE_COOKIE)?.value);
  const [stats, trends, month, cardio] = await Promise.all([
    getStats(user.id, timeZone),
    getTrends(user.id, timeZone),
    isEnabled("strength_analytics", user.id).then((on) => (on ? getMonthCompare(user.id, timeZone) : null)),
    isEnabled("workout_formats", user.id).then((on) => (on ? getCardioStats(user.id) : null)),
  ]);
  const empty = stats.totals.total === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Статистика"
        description={empty ? undefined : `Дни считаются по часовому поясу ${timeZone}`}
        actions={
          empty ? undefined : (
            <Link href="/recap" className={buttonVariants({ variant: "outline" })}>
              <BarChart3 />
              Итоги недель
            </Link>
          )
        }
      />
      <StatsView
        data={{ stats, trends, month, cardio: cardio && cardio.monthSec > 0 ? cardio : null }}
        exerciseHref={(id) => `/stats/exercises/${id}`}
        workoutHref={(id) => `/workouts/${id}`}
        emptyText="Завершите первую тренировку — здесь появятся цифры и графики."
      />
    </div>
  );
}
