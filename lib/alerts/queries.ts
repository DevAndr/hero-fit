import "server-only";
import { db } from "@/lib/db";
import type { AlertView } from "./rules";

/** Насколько вперёд отдаём запланированные: клиент сам покажет их по таймеру. */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/** Оповещения для кабинета: идущие и начинающиеся в ближайшие сутки, без закрытых этим пользователем навсегда. */
export async function getUserAlerts(userId: string, now = new Date()): Promise<AlertView[]> {
  const rows = await db.systemAlert.findMany({
    where: {
      enabled: true,
      startsAt: { lte: new Date(now.getTime() + LOOKAHEAD_MS) },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      dismissals: { none: { userId } },
    },
    select: { id: true, kind: true, tone: true, title: true, body: true, ctaLabel: true, ctaHref: true, dismiss: true, startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt?.toISOString() ?? null }));
}
