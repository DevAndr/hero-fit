import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { RecapView } from "@/components/recap/recap-view";
import { bossChestAvailable } from "@/lib/boss/queries";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { adjacentRecaps, getOrCreateRecap, getRecap, markRecapSeen } from "@/lib/recap/queries";
import { isRecapWeek } from "@/lib/recap/schedule";
import { weekRangeLabel } from "@/lib/recap/view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Итоги недели" };

export default async function RecapPage({ params }: PageProps<"/recap/[week]">) {
  const { week } = await params;
  const user = await requireUser();
  // Пояс пользователя — как у тика, создающего итоги (неделя считается одинаково)
  const timeZone = safeTimeZone(user.timeZone);

  const check = isRecapWeek(week, new Date(), timeZone);
  if (check === "invalid") notFound();
  if (check === "not-ended") redirect("/recap");
  const recap = check === "ok" ? await getOrCreateRecap(user.id, week, timeZone) : await getRecap(user.id, week);
  if (!recap) notFound();
  const [nav] = await Promise.all([adjacentRecaps(user.id, week), markRecapSeen(user.id, week)]);

  const arrow = cn(buttonVariants({ variant: "outline", size: "icon" }));
  return (
    <>
      <PageHeader
        title="Итоги недели"
        description={weekRangeLabel(week)}
        actions={
          <div className="flex items-center gap-2">
            {nav.prev ? (
              <Link href={`/recap/${nav.prev}`} className={arrow} aria-label="Предыдущая неделя">
                <ChevronLeft />
              </Link>
            ) : null}
            {nav.next ? (
              <Link href={`/recap/${nav.next}`} className={arrow} aria-label="Следующая неделя">
                <ChevronRight />
              </Link>
            ) : null}
            <Link href="/recap" className={buttonVariants({ variant: "outline" })}>
              Все итоги
            </Link>
          </div>
        }
      />
      <RecapView data={recap.data} bossChest={await bossChestAvailable(user.id, week)} />
    </>
  );
}
