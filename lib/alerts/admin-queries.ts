import "server-only";
import { db } from "@/lib/db";

/** Все оповещения для админки с числом закрывших навсегда. */
export async function getAlertsAdmin() {
  return db.systemAlert.findMany({ include: { _count: { select: { dismissals: true } } }, orderBy: { startsAt: "desc" } });
}

export type AlertAdminRow = Awaited<ReturnType<typeof getAlertsAdmin>>[number];
