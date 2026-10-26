import "server-only";
import { db } from "@/lib/db";
import { audienceMatches, type AlertAudience, type AlertView } from "./rules";

const AUDIENCES: AlertAudience[] = ["ALL", "USERS", "COACHES"];

/** Насколько вперёд отдаём запланированные: клиент сам покажет их по таймеру. */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Оповещения для кабинета: идущие и начинающиеся в ближайшие сутки, без закрытых этим пользователем навсегда,
 * для его аудитории (`isCoach` — на момент загрузки страницы: включил режим тренера — со следующей загрузки).
 */
export async function getUserAlerts(userId: string, isCoach: boolean, now = new Date()): Promise<AlertView[]> {
  const rows = await db.systemAlert.findMany({
    where: {
      enabled: true,
      audience: { in: AUDIENCES.filter((a) => audienceMatches(a, isCoach)) },
      startsAt: { lte: new Date(now.getTime() + LOOKAHEAD_MS) },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      dismissals: { none: { userId } },
    },
    select: { id: true, kind: true, tone: true, title: true, body: true, ctaLabel: true, ctaHref: true, dismiss: true, startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt?.toISOString() ?? null }));
}
