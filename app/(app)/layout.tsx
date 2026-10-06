import { cookies } from "next/headers";
import { AchievementToaster } from "@/components/achievements/achievement-toaster";
import { AppShell } from "@/components/app/app-shell";
import { TimezoneSync } from "@/components/app/timezone-sync";
import { recordDailyVisit, TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { getUnseenAchievements } from "@/lib/achievements/queries";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const timeZone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  await recordDailyVisit(user, timeZone);
  const unseen = await getUnseenAchievements(user.id);

  return (
    <AppShell user={user}>
      {children}
      <AchievementToaster achievements={unseen} />
      <TimezoneSync cookieName={TIMEZONE_COOKIE} current={timeZone} />
    </AppShell>
  );
}
