import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { CoachRecapViewBlock } from "@/components/coach/recap/coach-recap-view";
import { RecapGoal } from "@/components/coach/recap/recap-goal";
import { buttonVariants } from "@/components/ui/button";
import { requireCoach } from "@/lib/coach/access";
import { adjacentCoachRecaps, getCoachRecap, getOrCreateCoachRecap, markCoachRecapSeen } from "@/lib/coach/recap-queries";
import { safeTimeZone } from "@/lib/daily-login";
import { isRecapWeek } from "@/lib/recap/schedule";
import { weekRangeLabel } from "@/lib/recap/view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Неделя клиентов" };

export default async function CoachRecapPage({ params }: PageProps<"/coach/recap/[week]">) {
  const { week } = await params;
  const coach = await requireCoach();
  // Пояс тренера — как у тика, создающего итоги (неделя считается одинаково)
  const timeZone = safeTimeZone(coach.timeZone);

  const check = isRecapWeek(week, new Date(), timeZone);
  if (check === "invalid") notFound();
  if (check === "not-ended") redirect("/coach/recap");
  const { recap, pending } =
    check === "ok" ? await getOrCreateCoachRecap(coach.id, week, timeZone) : { recap: await getCoachRecap(coach.id, week), pending: false };
  // Без снимка страница есть, только пока итоги собираются (у клиентов западнее неделя не кончилась);
  // старая неделя или неделя без клиентов — нет страницы
  if (!recap && !pending) notFound();

  const [nav, first] = await Promise.all([
    adjacentCoachRecaps(coach.id, week),
    recap ? markCoachRecapSeen(coach.id, week) : Promise.resolve(false),
  ]);

  const arrow = cn(buttonVariants({ variant: "outline", size: "icon" }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Неделя клиентов"
        description={weekRangeLabel(week)}
        actions={
          <div className="flex items-center gap-2">
            {nav.prev ? (
              <Link href={`/coach/recap/${nav.prev}`} className={arrow} aria-label="Предыдущая неделя">
                <ChevronLeft />
              </Link>
            ) : null}
            {nav.next ? (
              <Link href={`/coach/recap/${nav.next}`} className={arrow} aria-label="Следующая неделя">
                <ChevronRight />
              </Link>
            ) : null}
            <Link href="/coach/recap" className={buttonVariants({ variant: "outline" })}>
              Все итоги
            </Link>
          </div>
        }
      />
      {recap ? (
        <CoachRecapViewBlock recap={recap} />
      ) : (
        <p className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          Итоги ещё собираются — неделя закончилась не у всех клиентов. Загляните позже.
        </p>
      )}
      {first ? <RecapGoal /> : null}
    </div>
  );
}
