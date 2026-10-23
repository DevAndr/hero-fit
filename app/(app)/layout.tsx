import { chestAutoOpen } from "@/lib/onboarding/tour";
import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { AchievementToaster } from "@/components/achievements/achievement-toaster";
import { AppShell } from "@/components/app/app-shell";
import { TimezoneSync } from "@/components/app/timezone-sync";
import { NavigationProgress } from "@/components/app/navigation-progress";
import { DailyChest } from "@/components/progress/daily-chest";
import { recordDailyVisit, TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { getUnseenAchievements } from "@/lib/achievements/queries";
import { requireUser } from "@/lib/auth/dal";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushProvider } from "@/components/notifications/push-provider";
import { TelegramMiniApp } from "@/components/telegram/telegram-mini-app";
import { FlagsProvider } from "@/components/flags/flags-provider";
import { AssistantProvider } from "@/components/assistant/assistant";
import { RELEASES } from "@/lib/changelog/releases";
import { userChangelog } from "@/lib/changelog/view";
import { db } from "@/lib/db";
import { quietly } from "@/lib/achievements/quietly";
import { ensureRetroCoins } from "@/lib/shop/retro-db";
import { itemByCode } from "@/lib/shop/catalog";
import { cosmeticsLoader } from "@/lib/shop/cosmetics-loader";
import { themeStyle } from "@/lib/shop/theme-style";
import { env } from "@/lib/env";
import { enabledFlags } from "@/lib/flags/server";
import { pendingClubCount } from "@/lib/club/queries";
import { getNotificationFeed } from "@/lib/notifications/queries";
import { getUserAlerts } from "@/lib/alerts/queries";
import { newFeedbackCount } from "@/lib/feedback/admin-queries";
import { SystemAlerts } from "@/components/alerts/system-alerts";

/** Личный кабинет — вне поиска (и так за входом, но ссылки могут утечь). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const timeZone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const visit = await recordDailyVisit(user, timeZone);
  const chestOpened = user.chestOpenedDay?.toISOString().slice(0, 10) === visit.today;
  const [unseen, feed, flags, pendingClubs, alerts, newFeedback] = await Promise.all([
    getUnseenAchievements(user.id),
    getNotificationFeed(user.id),
    enabledFlags(user.id),
    user.isAdmin ? pendingClubCount() : 0,
    // Оповещения не должны ронять кабинет
    quietly(() => getUserAlerts(user.id), []),
    user.isAdmin ? newFeedbackCount() : 0,
  ]);
  // Косметика и баланс — из того же запроса, что и сессия (requireUser)
  const look = { id: user.id, avatarCode: user.avatarCode, frameCode: user.frameCode, nickColorCode: user.nickColorCode, themeCode: user.themeCode, coins: user.coins };
  // Стартовые монеты — до чтения баланса в меню (после первого раза это один запрос)
  if (flags.includes("shop") && (await quietly(() => ensureRetroCoins(user.id), 0)) > 0) {
    look.coins = (await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { coins: true } })).coins;
  }
  // Косметика и тема — только при включённом магазине у самого пользователя
  const cosmetics = (await cosmeticsLoader())(look);
  const theme = flags.includes("shop") ? itemByCode(look.themeCode) : null;

  const shell = (
    <AppShell
      user={user}
      pendingClubs={pendingClubs}
      newFeedback={newFeedback}
      cosmetics={cosmetics}
      coins={flags.includes("shop") ? look.coins : undefined}
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
      alerts={<SystemAlerts alerts={alerts} tourPath={user.onboardedAt === null ? "/dashboard" : null} />}
      notifications={<NotificationBell key={`${feed.items[0]?.id}:${feed.unread}`} feed={feed} />}
    >
      {children}
      <AchievementToaster achievements={unseen} />
      <TimezoneSync cookieName={TIMEZONE_COOKIE} current={timeZone} />
      {/* Полоска сверху на время перехода: страницы рендерятся на сервере, клик откликается сразу */}
      <Suspense>
        <NavigationProgress />
      </Suspense>
    </AppShell>
  );

  return (
    <FlagsProvider flags={flags}>
      {theme?.kind === "theme" ? <style>{themeStyle(theme)}</style> : null}
      <PushProvider vapidKey={env.VAPID_PUBLIC_KEY ?? null}>
        {/* Умный помощник: выключатель в /settings */}
        <AssistantProvider available={user.assistantEnabled} whoop={flags.includes("whoop")}>
          {/* Сессия из Telegram Mini App — кабинет подстраивается под Telegram */}
          {user.embedded ? <TelegramMiniApp>{shell}</TelegramMiniApp> : shell}
        </AssistantProvider>
      </PushProvider>
    </FlagsProvider>
  );
}
