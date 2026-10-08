import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AchievementToaster } from "@/components/achievements/achievement-toaster";
import { AppShell } from "@/components/app/app-shell";
import { TimezoneSync } from "@/components/app/timezone-sync";
import { DailyChest } from "@/components/progress/daily-chest";
import { recordDailyVisit, TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { getUnseenAchievements } from "@/lib/achievements/queries";
import { requireUser } from "@/lib/auth/dal";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushProvider } from "@/components/notifications/push-provider";
import { env } from "@/lib/env";
import { getNotificationFeed } from "@/lib/notifications/queries";

/** Личный кабинет — вне поиска (и так за входом, но ссылки могут утечь). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const timeZone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const visit = await recordDailyVisit(user, timeZone);
  const chestOpened = user.chestOpenedDay?.toISOString().slice(0, 10) === visit.today;
  const [unseen, feed] = await Promise.all([getUnseenAchievements(user.id), getNotificationFeed(user.id)]);

  return (
    <PushProvider vapidKey={env.VAPID_PUBLIC_KEY ?? null}>
      <AppShell
        user={user}
        chest={
          <DailyChest
            day={visit.today}
            streak={visit.loginStreak}
            available={!chestOpened}
            autoOpen={env.DAILY_CHEST_AUTOOPEN === "on"}
          />
        }
        // key: новые уведомления сбрасывают локальное «прочитано»
        notifications={<NotificationBell key={`${feed.items[0]?.id}:${feed.unread}`} feed={feed} />}
      >
        {children}
        <AchievementToaster achievements={unseen} />
        <TimezoneSync cookieName={TIMEZONE_COOKIE} current={timeZone} />
      </AppShell>
    </PushProvider>
  );
}
