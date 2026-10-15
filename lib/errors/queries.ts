import "server-only";
import { db } from "@/lib/db";
import { MAX_EVENTS_PER_GROUP } from "@/lib/errors/record";

export type ErrorTab = "open" | "resolved";

/** Группы для /admin/errors: открытые или решённые, свежие сверху, до 100. */
export async function getErrorGroups(tab: ErrorTab, now = Date.now()) {
  const groups = await db.errorGroup.findMany({
    where: { resolvedAt: tab === "open" ? null : { not: null } },
    orderBy: { lastSeen: "desc" },
    take: 100,
    select: { id: true, source: true, message: true, path: true, count: true, users: true, lastSeen: true, version: true },
  });
  // «Последний раз N назад» — секунды с последнего появления
  return groups.map((g) => ({ ...g, agoSec: Math.max(0, Math.floor((now - g.lastSeen.getTime()) / 1000)) }));
}
export type GroupRow = Awaited<ReturnType<typeof getErrorGroups>>[number];

/** Карточка группы: стек и последние события с ником пользователя. */
export function getErrorGroup(id: string) {
  return db.errorGroup.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: { at: "desc" },
        take: MAX_EVENTS_PER_GROUP,
        select: { id: true, at: true, path: true, userAgent: true, version: true, user: { select: { nickname: true, login: true } } },
      },
    },
  });
}
export type GroupDetail = NonNullable<Awaited<ReturnType<typeof getErrorGroup>>>;
