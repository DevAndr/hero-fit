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
import { getStats, getTrends } from "@/lib/stats/queries";
import { getMonthCompare } from "@/lib/stats/strength-queries";

export const metadata: Metadata = { title: "Статистика" };

export default async function StatsPage() {
  const user = await requireUser();
  const timeZone = safeTimeZone((await cookies()).get(TIMEZONE_COOKIE)?.value);
  const [stats, trends, month] = await Promise.all([getStats(user.id, timeZone), getTrends(user.id, timeZone), getMonthCompare(user.id, timeZone)]);
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
        data={{ stats, trends, month }}
        exerciseHref={(id) => `/stats/exercises/${id}`}
        workoutHref={(id) => `/workouts/${id}`}
        emptyText="Завершите первую тренировку — здесь появятся цифры и графики."
      />
    </div>
  );
}
