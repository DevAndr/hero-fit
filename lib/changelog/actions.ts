import "server-only";
import { db } from "@/lib/db";

/** Открыл «Что нового» — последний релиз просмотрен (условно: повтор и вторая вкладка ничего не пишут). */
export async function markChangelogSeen(userId: string, id: string): Promise<void> {
  await db.user.updateMany({
    where: { id: userId, OR: [{ changelogSeen: null }, { changelogSeen: { not: id } }] },
    data: { changelogSeen: id },
  });
}
