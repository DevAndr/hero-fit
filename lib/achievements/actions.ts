"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";

export async function markAchievementsSeenAction(ids: string[]) {
  const user = await requireUser();
  await db.userAchievement.updateMany({
    where: { userId: user.id, id: { in: ids.slice(0, 50) }, seenAt: null },
    data: { seenAt: new Date() },
  });
}
