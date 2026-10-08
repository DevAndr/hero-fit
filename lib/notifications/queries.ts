import "server-only";
import { db } from "@/lib/db";

export async function getNotificationFeed(userId: string) {
  const [unread, items] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, type: true, title: true, body: true, url: true, readAt: true, createdAt: true },
    }),
  ]);
  return { unread, items: items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), read: Boolean(n.readAt) })) };
}

export type NotificationFeed = Awaited<ReturnType<typeof getNotificationFeed>>;

export async function getNotificationSettings(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      notifyRest: true,
      notifyStreak: true,
      notifyAchievements: true,
      notifySocial: true,
      notifyPlan: true,
      notifyRecap: true,
      planReminderMin: true,
      nickname: true,
      shareActivity: true,
      hideWeights: true,
      _count: { select: { pushSubscriptions: true } },
    },
  });
}
