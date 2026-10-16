import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { programEndDay, shouldRemindProgramEnd } from "@/lib/coach/program";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { notify } from "@/lib/notifications/service";

const TICK_BUDGET_MS = 1000;

/** «Программа клиента заканчивается через неделю» — тренеру, один раз (условно по remindedAt). Возвращает число отправленных. */
export async function processProgramReminders(now = new Date()): Promise<number> {
  const rows = await db.programAssignment.findMany({
    where: { endedAt: null, remindedAt: null, coachId: { not: null } },
    select: { id: true, coachId: true, clientId: true, name: true, startDate: true, weeks: true, client: { select: { nickname: true, name: true, timeZone: true } } },
    take: 500,
  });
  const deadline = Date.now() + TICK_BUDGET_MS;
  let sent = 0;
  for (const a of rows) {
    if (Date.now() > deadline) break;
    if (!shouldRemindProgramEnd(programEndDay(a.startDate, a.weeks), dayKey(now, safeTimeZone(a.client.timeZone)), null)) continue;
    if (!(await isEnabled("coach_programs", a.coachId!))) continue;
    const { count } = await db.programAssignment.updateMany({ where: { id: a.id, remindedAt: null }, data: { remindedAt: now } });
    if (!count) continue;
    await notify(db, a.coachId!, {
      type: NotificationType.COACH,
      title: `Программа ${clientDisplayName(a.client)} заканчивается через неделю`,
      body: `«${a.name}» — пора решить, что дальше`,
      url: `/coach/clients/${a.clientId}?tab=plan`,
    }, { push: false });
    sent++;
  }
  return sent;
}
