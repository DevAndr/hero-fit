import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/components/achievements/category";
import { GoalCard } from "@/components/achievements/goal-card";
import { Bestiary } from "@/components/boss/bestiary";
import { requireUser } from "@/lib/auth/dal";
import { getAchievementsOverview } from "@/lib/achievements/queries";
import { getBestiary } from "@/lib/boss/queries";
import { safeTimeZone } from "@/lib/daily-login";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ачивки" };

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

const TABS = [
  { tab: "achievements", label: "Ачивки", href: "/achievements" },
  { tab: "bestiary", label: "Бестиарий", href: "/achievements?tab=bestiary" },
] as const;

export default async function AchievementsPage({ searchParams }: PageProps<"/achievements">) {
  const user = await requireUser();
  const tab = (await searchParams).tab === "bestiary" ? "bestiary" : "achievements";
  const { earned, goals } = await getAchievementsOverview(user.id);

  return (
    <>
      <PageHeader title="Ачивки" description={`Получено: ${earned.length}`} />
      <nav aria-label="Разделы" className="mb-6 flex w-fit rounded-lg bg-muted p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.tab}
            href={t.href}
            aria-current={tab === t.tab ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", tab === t.tab && "bg-background text-foreground shadow-sm")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "bestiary" ? (
        <Bestiary entries={await getBestiary(user.id, safeTimeZone(user.timeZone))} />
      ) : (
        <AchievementsTab earned={earned} goals={goals} />
      )}
    </>
  );
}

function AchievementsTab({ earned, goals }: Awaited<ReturnType<typeof getAchievementsOverview>>) {
  const byCategory = Map.groupBy(earned, (a) => a.category);
  return (
    <>

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
            return (
              <div key={category} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[category]}</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {byCategory.get(category)!.map((a) => (
                    <article key={a.id} aria-label={a.title} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                      <AchievementIcon code={a.code} size={64} />
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
