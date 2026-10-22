import "server-only";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/daily-login";
import { clientDisplayName } from "@/lib/coach/clients";
import { togetherLabel } from "@/lib/coach/my-coach-label";
import { programWeekIndex } from "@/lib/coach/program";
import { COSMETIC_SELECT, type Cosmetics } from "@/lib/shop/cosmetics";
import { cosmeticsLoader } from "@/lib/shop/cosmetics-loader";

export type MyCoachCard = {
  name: string;
  cosmetics: Cosmetics;
  /** Публичная страница тренера — только опубликованная. */
  pageHref: string | null;
  together: string;
  /** Идущая программа этого тренера: неделя от 1 до weeks. */
  program: { name: string; week: number; weeks: number } | null;
  /** Непрочитанные комментарии тренеров; ссылка — на тренировку с самым свежим. */
  unread: { count: number; href: string } | null;
};

/** Карточка «Мой тренер» на дашборде клиента; coach — активная связь (activeCoachOf), без неё — null. */
export async function getMyCoachCard(
  clientId: string,
  coach: { id: string; nickname: string | null; name: string | null; linkedAt: Date } | null,
  tz: string,
  now = new Date(),
): Promise<MyCoachCard | null> {
  if (!coach) return null;
  const today = dayKey(now, tz);
  const [profile, assignment, unreadCount, latestUnread, cosmetics] = await Promise.all([
    db.user.findUnique({ where: { id: coach.id }, select: { ...COSMETIC_SELECT, coachProfile: { select: { publishedAt: true } } } }),
    db.programAssignment.findFirst({
      where: { clientId, coachId: coach.id, endedAt: null },
      orderBy: { createdAt: "desc" },
      select: { name: true, startDate: true, weeks: true },
    }),
    db.coachComment.count({ where: { clientId, readAt: null } }),
    db.coachComment.findFirst({ where: { clientId, readAt: null }, orderBy: { updatedAt: "desc" }, select: { workoutId: true } }),
    cosmeticsLoader(),
  ]);
  const week = assignment ? programWeekIndex(assignment.startDate, today) : null;
  return {
    name: clientDisplayName(coach),
    cosmetics: cosmetics({ id: coach.id, avatarCode: profile?.avatarCode ?? null, frameCode: profile?.frameCode ?? null, nickColorCode: profile?.nickColorCode ?? null }),
    pageHref: profile?.coachProfile?.publishedAt && coach.nickname ? `/trainer/${encodeURIComponent(coach.nickname)}` : null,
    together: togetherLabel(dayKey(coach.linkedAt, tz), today),
    program: assignment && week !== null && week <= assignment.weeks ? { name: assignment.name, week, weeks: assignment.weeks } : null,
    unread: unreadCount && latestUnread ? { count: unreadCount, href: `/workouts/${latestUnread.workoutId}` } : null,
  };
}
