import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/app-shell";
import { CohortTable } from "@/components/admin/cohort-table";
import { FeatureUsage } from "@/components/admin/feature-usage";
import { MetricTiles } from "@/components/admin/metric-tiles";
import { MetricsCharts } from "@/components/admin/metrics-charts";
import { SignupCampaigns, SignupSources } from "@/components/admin/signup-sources";
import { parseRange } from "@/lib/admin/metrics";
import { getCohorts, getDailySeries, getFeatureUsage, getHourlyActivity, getOverview, getSignupCampaigns, getSignupSources } from "@/lib/admin/metrics-queries";
import { requireAdmin } from "@/lib/auth/admin";
import { catalogAllowed } from "@/lib/catalog/access";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Метрики" };

/** Метрики продукта (только ADMIN_LOGINS, остальным — 404); дни и недели — в поясе админа. */
export default async function AdminMetricsPage({ searchParams }: PageProps<"/admin">) {
  const me = await requireAdmin();
  const range = parseRange((await searchParams).range);
  const [overview, series, hourly, sources, campaigns, cohorts, usage, catalogOn] = await Promise.all([
    getOverview(me.timeZone),
    getDailySeries(me.timeZone, range),
    getHourlyActivity(me.timeZone, range),
    getSignupSources(me.timeZone, range),
    getSignupCampaigns(me.timeZone, range),
    getCohorts(me.timeZone),
    getFeatureUsage(),
    catalogAllowed(me.id),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Метрики" description={`Рост, активность и удержание. Дни — в поясе ${me.timeZone}.`} />
      {catalogOn ? (
        <Link href="/admin/programs" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Программы каталога
        </Link>
      ) : null}
      <MetricTiles overview={overview} />
      <MetricsCharts series={series} hourly={hourly} range={range} />
      <SignupSources groups={sources} range={range} />
      <SignupCampaigns groups={campaigns} range={range} />
      <CohortTable rows={cohorts} />
      <FeatureUsage usage={usage} />
    </div>
  );
}
