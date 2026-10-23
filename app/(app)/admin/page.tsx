import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/app-shell";
import { CohortTable } from "@/components/admin/cohort-table";
import { FeatureUsage } from "@/components/admin/feature-usage";
import { MetricTiles } from "@/components/admin/metric-tiles";
import { MetricsCharts } from "@/components/admin/metrics-charts";
import { SignupCampaigns, SignupSources } from "@/components/admin/signup-sources";
import { VisitBreakdown } from "@/components/admin/visit-breakdown";
import { parseBreakdown, parseRange } from "@/lib/admin/metrics";
import { getCohorts, getDailySeries, getFeatureUsage, getHourlyActivity, getOverview, getSignupCampaigns, getSignupSources, getVisitBreakdown, getVisitsSince, periodStart } from "@/lib/admin/metrics-queries";
import { requireAdmin } from "@/lib/auth/admin";
import { catalogAllowed } from "@/lib/catalog/access";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Метрики" };

/** Метрики продукта (только ADMIN_LOGINS, остальным — 404); дни и недели — в поясе админа. */
export default async function AdminMetricsPage({ searchParams }: PageProps<"/admin">) {
  const me = await requireAdmin();
  const params = await searchParams;
  const range = parseRange(params.range);
  const visits = parseBreakdown(params.visits);
  const utm = typeof params.utm === "string" ? params.utm : undefined;
  const [overview, series, hourly, breakdown, sources, campaigns, visitsSince, cohorts, usage, catalogOn] = await Promise.all([
    getOverview(me.timeZone),
    getDailySeries(me.timeZone, range),
    getHourlyActivity(me.timeZone, range),
    getVisitBreakdown(me.timeZone, range, visits, utm),
    getSignupSources(me.timeZone, range),
    getSignupCampaigns(me.timeZone, range),
    getVisitsSince(me.timeZone),
    getCohorts(me.timeZone),
    getFeatureUsage(),
    catalogAllowed(me.id),
  ]);
  const periodFrom = periodStart(me.timeZone, range);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Метрики" description={`Рост, активность и удержание. Дни — в поясе ${me.timeZone}.`} />
      {catalogOn ? (
        <Link href="/admin/programs" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Программы каталога
        </Link>
      ) : null}
      <MetricTiles overview={overview} />
      <MetricsCharts series={series} hourly={hourly} range={range} keep={keepQuery(visits, breakdown.source)} />
      <VisitBreakdown data={breakdown} range={range} />
      <SignupSources groups={sources} range={range} visitsSince={visitsSince} periodFrom={periodFrom} />
      <SignupCampaigns groups={campaigns} range={range} visitsSince={visitsSince} periodFrom={periodFrom} />
      <CohortTable rows={cohorts} />
      <FeatureUsage usage={usage} />
    </div>
  );
}

/** Параметры разбивки «Откуда приходят» для ссылок периода (по умолчанию — ничего). */
function keepQuery(visits: string, utm: string | null) {
  if (visits === "referrer") return "";
  return `&visits=${visits}${visits === "campaign" && utm ? `&utm=${encodeURIComponent(utm)}` : ""}`;
}
