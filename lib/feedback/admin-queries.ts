import "server-only";
import { db } from "@/lib/db";
import { FILTER_STATUSES, type FeedbackFilter } from "./rules";

export const ADMIN_PAGE_SIZE = 100;

/** Новые обращения — счётчик в меню админа. */
export function newFeedbackCount(): Promise<number> {
  return db.feedback.count({ where: { status: "NEW" } });
}

/** Обращения под вкладкой, новые сверху. */
export async function getFeedbackAdmin(filter: FeedbackFilter) {
  const statuses = FILTER_STATUSES[filter];
  return db.feedback.findMany({
    where: statuses ? { status: { in: statuses } } : {},
    orderBy: { createdAt: "desc" },
    take: ADMIN_PAGE_SIZE,
    include: { user: { select: { nickname: true, login: true } } },
  });
}

export type FeedbackAdminRow = Awaited<ReturnType<typeof getFeedbackAdmin>>[number];
