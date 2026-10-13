import { chestAutoOpen } from "@/lib/onboarding/tour";
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
import { TelegramMiniApp } from "@/components/telegram/telegram-mini-app";
import { FlagsProvider } from "@/components/flags/flags-provider";
import { AssistantProvider } from "@/components/assistant/assistant";
import { assistantAvailable } from "@/lib/assistant/access";
import { RELEASES } from "@/lib/changelog/releases";
import { userChangelog } from "@/lib/changelog/view";
import { db } from "@/lib/db";
import { itemByCode } from "@/lib/shop/catalog";
import { cosmeticsLoader } from "@/lib/shop/cosmetics-loader";
import { themeStyle } from "@/lib/shop/theme-style";
import { env } from "@/lib/env";
import { enabledFlags } from "@/lib/flags/server";
import { pendingClubCount } from "@/lib/club/queries";
import { getNotificationFeed } from "@/lib/notifications/queries";

/** Личный кабинет — вне поиска (и так за входом, но ссылки могут утечь). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const timeZone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const visit = await recordDailyVisit(user, timeZone);
  const chestOpened = user.chestOpenedDay?.toISOString().slice(0, 10) === visit.today;
  const [unseen, feed, flags, pendingClubs, look] = await Promise.all([
    getUnseenAchievements(user.id),
    getNotificationFeed(user.id),
    enabledFlags(user.id),
    user.isAdmin ? pendingClubCount() : 0,
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, avatarCode: true, frameCode: true, nickColorCode: true, themeCode: true },
    }),
  ]);
  // Косметика и тема — только при включённом магазине у самого пользователя
  const cosmetics = (await cosmeticsLoader())(look);
  const theme = flags.includes("shop") ? itemByCode(look.themeCode) : null;

  const shell = (
    <AppShell
      user={user}
      pendingClubs={pendingClubs}
      cosmetics={cosmetics}
      whatsNewUnseen={userChangelog(RELEASES, user.changelogSeen, (f) => flags.includes(f)).unseen}
      chest={
        <DailyChest
          day={visit.today}
          streak={visit.loginStreak}
          available={!chestOpened}
          autoOpen={chestAutoOpen(env.DAILY_CHEST_AUTOOPEN === "on", user.onboardedAt)}
        />
      }
      // key: новые уведомления сбрасывают локальное «прочитано»
      notifications={<NotificationBell key={`${feed.items[0]?.id}:${feed.unread}`} feed={feed} />}
    >
      {children}
      <AchievementToaster achievements={unseen} />
      <TimezoneSync cookieName={TIMEZONE_COOKIE} current={timeZone} />
    </AppShell>
  );

  return (
    <FlagsProvider flags={flags}>
      {theme?.kind === "theme" ? <style>{themeStyle(theme)}</style> : null}
      <PushProvider vapidKey={env.VAPID_PUBLIC_KEY ?? null}>
        {/* Умный помощник: флаг smart_coach и выключатель в /settings */}
        <AssistantProvider available={assistantAvailable(flags.includes("smart_coach"), user.assistantEnabled)}>
          {/* Сессия из Telegram Mini App — кабинет подстраивается под Telegram */}
          {user.embedded ? <TelegramMiniApp>{shell}</TelegramMiniApp> : shell}
        </AssistantProvider>
      </PushProvider>
    </FlagsProvider>
  );
}
