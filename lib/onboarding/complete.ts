import "server-only";
import { db } from "@/lib/db";

/** Отметить экскурсию пройденной; true — отметка поставлена этим вызовом (повтор и двойной клик — false). */
export async function markOnboarded(userId: string): Promise<boolean> {
  const { count } = await db.user.updateMany({ where: { id: userId, onboardedAt: null }, data: { onboardedAt: new Date() } });
  return count === 1;
}
