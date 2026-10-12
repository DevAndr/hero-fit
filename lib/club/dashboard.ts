import "server-only";
import { clubsAllowed } from "@/lib/club/access";
import { db } from "@/lib/db";
import { getClubRating } from "@/lib/club/queries";
import { pickCardTask } from "@/lib/club/tasks";
import { getClubTasks, type ClubTaskView } from "@/lib/club/tasks-queries";

export type ClubDashboard =
  | {
      kind: "member";
      club: { id: string; name: string; city: string };
      /** Моё место в рейтинге недели; null — опыта за неделю нет. */
      place: number | null;
      /** С опытом за неделю — те, кто в рейтинге. */
      ranked: number;
      members: number;
      task: ClubTaskView | null;
      chest: boolean;
    }
  | { kind: "pending"; name: string }
  | { kind: "none" };

/** Карточка клуба на дашборде; без флага `clubs` — null. */
export async function getClubDashboard(userId: string, timeZone: string): Promise<ClubDashboard | null> {
  if (!(await clubsAllowed(userId))) return null;
  const member = await db.clubMember.findUnique({
    where: { userId },
    select: { club: { select: { id: true, name: true, city: true } } },
  });
  if (!member) {
    const pending = await db.club.findFirst({
      where: { adminId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { name: true },
    });
    return pending ? { kind: "pending", name: pending.name } : { kind: "none" };
  }
  const { club } = member;
  const [rating, tasks] = await Promise.all([
    getClubRating(club.id, userId, timeZone, "week"),
    getClubTasks(club.id, userId, true, timeZone),
  ]);
  return {
    kind: "member",
    club,
    place: rating.members.find((m) => m.me)?.place ?? null,
    ranked: rating.total - rating.idle,
    members: rating.total,
    task: pickCardTask(tasks.active),
    chest: [...tasks.active, ...tasks.archive].some((t) => t.chest?.state === "open"),
  };
}
