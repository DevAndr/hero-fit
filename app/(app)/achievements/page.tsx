import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { CATEGORY_META, CATEGORY_ORDER } from "@/components/achievements/category";
import { GoalCard } from "@/components/achievements/goal-card";
import { requireUser } from "@/lib/auth/dal";
import { getAchievementsOverview } from "@/lib/achievements/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ачивки" };

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function AchievementsPage() {
  const user = await requireUser();
  const { earned, goals } = await getAchievementsOverview(user.id);
  const byCategory = Map.groupBy(earned, (a) => a.category);

  return (
    <>
      <PageHeader title="Ачивки" description={`Получено: ${earned.length}`} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Ближайшие цели</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.code} goal={g} />
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-6">
        <h2 className="text-lg font-bold">Полученные</h2>
        {earned.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <Trophy className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Пока пусто. Завершите тренировку или заходите каждый день — ачивки появятся сами.
            </p>
          </div>
        ) : (
          CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => {
            const { label, icon: Icon, color } = CATEGORY_META[category];
            return (
              <div key={category} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {byCategory.get(category)!.map((a) => (
                    <article key={a.id} aria-label={a.title} className="flex gap-3 rounded-xl border bg-card p-4">
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", color)}>
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {dateFormat.format(a.earnedAt)} · <span className="text-xp">+{a.xpReward} XP</span>
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
