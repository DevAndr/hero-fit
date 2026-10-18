import "server-only";
import { db } from "@/lib/db";

/** «Мои обращения» — последние 50, новые сверху; заметку админа автор не видит. */
export async function getMyFeedback(userId: string) {
  return db.feedback.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, body: true, status: true, createdAt: true },
  });
}

export type MyFeedback = Awaited<ReturnType<typeof getMyFeedback>>[number];
