import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { programEndDay, shouldRemindProgramEnd } from "@/lib/coach/program";
import { endAssignment } from "@/lib/coach/program-assign";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";

const TICK_BUDGET_MS = 1000;

/**
 * Тик программ тренера: кончившиеся по сроку закрываются (вес последней недели — в задания, если тренер есть
 * и не правил задание после конца), за неделю до конца — напоминание тренеру, один раз; программа из каталога
 * (без тренера) — напоминание самому пользователю.
 * Возвращает число отправленных напоминаний.
 */
export async function processProgramReminders(now = new Date()): Promise<number> {
  const rows = await db.programAssignment.findMany({
    where: { endedAt: null },
    orderBy: { startDate: "asc" },
    select: { id: true, coachId: true, catalogProgramId: true, clientId: true, name: true, startDate: true, weeks: true, remindedAt: true, client: { select: { nickname: true, name: true, timeZone: true } } },
    take: 500,
  });
  const deadline = Date.now() + TICK_BUDGET_MS;
  let sent = 0;
  for (const a of rows) {
    if (Date.now() > deadline) break;
    const today = dayKey(now, safeTimeZone(a.client.timeZone));
    const endDay = programEndDay(a.startDate, a.weeks);
    const on = a.coachId !== null;
    if (endDay < today) {
      await db.$transaction((tx) => endAssignment(tx, a.id, today, { writeTargets: on, lastWeek: a.weeks }));
      continue;
    }
    // Тренер удалён (нет ни тренера, ни программы каталога) — напоминать некому
    const catalog = !on && a.catalogProgramId !== null;
    if ((!on && !catalog) || !shouldRemindProgramEnd(endDay, today, a.remindedAt)) continue;
    const { count } = await db.programAssignment.updateMany({ where: { id: a.id, remindedAt: null }, data: { remindedAt: now } });
    if (!count) continue;
    await notify(
      db,
      catalog ? a.clientId : a.coachId!,
      catalog
        ? { type: NotificationType.PLAN, title: `Программа «${a.name}» заканчивается через неделю`, body: "Пора выбрать, что дальше", url: "/programs" }
        : {
            type: NotificationType.COACH,
            title: `Программа ${clientDisplayName(a.client)} заканчивается через неделю`,
            body: `«${a.name}» — пора решить, что дальше`,
            url: `/coach/clients/${a.clientId}?tab=plan`,
          },
      { push: false },
    );
    sent++;
  }
  return sent;
}
