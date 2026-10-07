import { cookies } from "next/headers";
import { AchievementToaster } from "@/components/achievements/achievement-toaster";
import { AppShell } from "@/components/app/app-shell";
import { TimezoneSync } from "@/components/app/timezone-sync";
import { recordDailyVisit, TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { getUnseenAchievements } from "@/lib/achievements/queries";
import { requireUser } from "@/lib/auth/dal";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushProvider } from "@/components/notifications/push-provider";
import { env } from "@/lib/env";
import { getNotificationFeed } from "@/lib/notifications/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const timeZone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  await recordDailyVisit(user, timeZone);
  const [unseen, feed] = await Promise.all([getUnseenAchievements(user.id), getNotificationFeed(user.id)]);

  return (
    <PushProvider vapidKey={env.VAPID_PUBLIC_KEY ?? null}>
      <AppShell
        user={user}
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
