import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { CohortTable } from "@/components/admin/cohort-table";
import { FeatureUsage } from "@/components/admin/feature-usage";
import { MetricTiles } from "@/components/admin/metric-tiles";
import { MetricsCharts } from "@/components/admin/metrics-charts";
import { parseRange } from "@/lib/admin/metrics";
import { getCohorts, getDailySeries, getFeatureUsage, getOverview } from "@/lib/admin/metrics-queries";
import { requireAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "Метрики" };

/** Метрики продукта (только ADMIN_LOGINS, остальным — 404); дни и недели — в поясе админа. */
export default async function AdminMetricsPage({ searchParams }: PageProps<"/admin">) {
  const me = await requireAdmin();
  const range = parseRange((await searchParams).range);
  const [overview, series, cohorts, usage] = await Promise.all([
    getOverview(me.timeZone),
    getDailySeries(me.timeZone, range),
    getCohorts(me.timeZone),
    getFeatureUsage(),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Метрики" description={`Рост, активность и удержание. Дни — в поясе ${me.timeZone}.`} />
      <MetricTiles overview={overview} />
      <MetricsCharts series={series} range={range} />
      <CohortTable rows={cohorts} />
      <FeatureUsage usage={usage} />
    </div>
  );
}
