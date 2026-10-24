import type { ReactNode } from "react";
import { BodyMap } from "@/components/progress/body-map";
import { ActivityHeatmap } from "@/components/stats/activity-heatmap";
import { WeeklyTrendChart } from "@/components/stats/weekly-trend-chart";
import type { Slice } from "@/lib/dashboard/v2";
import type { DashboardV2Data } from "@/lib/dashboard/v2-queries";
import type { GroupRecovery } from "@/lib/progress/recovery";
import { BalanceDonut } from "./balance-donut";
import { RecentRecords, StrengthCard, WeekNumbers } from "./widgets";

function Tier({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`tier-${title}`} className="space-y-4">
      <h2 id={`tier-${title}`} className="text-lg font-black tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Дашборд v2 (флаг dashboard_v2, спека 2026-10-24-dashboard-v2-design): ярусы «Сегодня» → «Прогресс» → «Игра» →
 * «Сообщество». Блоки «Сегодня», «Игры» и «Сообщества» собирает страница — те же, что у прежнего дашборда.
 */
export function DashboardV2(props: {
  hero: ReactNode;
  today: ReactNode;
  data: DashboardV2Data;
  balance: Slice[];
  recovery: GroupRecovery[];
  game: ReactNode;
  community: ReactNode;
  footer: ReactNode;
}) {
  const { data } = props;
  const strength = data.strength && data.strength.of > 0 ? data.strength : null;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        {props.hero}
        {props.today}
      </div>

      <Tier title="Прогресс">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <WeekNumbers week={data.week} className="md:col-span-2" />
          {strength ? <StrengthCard strength={strength} /> : null}
          <RecentRecords records={data.records} className={strength ? undefined : "md:col-span-2"} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <WeeklyTrendChart weeks={data.trends.weekly} />
          </div>
          <BalanceDonut slices={props.balance} />
        </div>
        <ActivityHeatmap columns={data.trends.activity.columns} />
        <BodyMap recovery={props.recovery} views={["recovery"]} />
      </Tier>

      <Tier title="Игра">{props.game}</Tier>
      <Tier title="Сообщество">{props.community}</Tier>
      {props.footer}
    </div>
  );
}
