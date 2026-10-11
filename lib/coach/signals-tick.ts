import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { clientSignals, signalsDiff, signalsNotice, type SignalKind } from "@/lib/coach/signals";
import { getSignalInputs } from "@/lib/coach/signals-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { localHour } from "@/lib/progress/weekly-streak";

/** Проверка — раз в день, не раньше 10:00 по времени тренера. */
const CHECK_HOUR = 10;
/** Тик общий с таймером отдыха: за один тик — не дольше, остальных тренеров доберут следующие (каждые 5 с). */
const TICK_BUDGET_MS = 2000;

/**
 * Сигналы клиентов тренерам: новые — записать и уведомить (одно уведомление на клиента), пропавшие — закрыть.
 * Список и карточка считают сигналы сами; таблица нужна, чтобы уведомлять один раз на появление.
 * Возвращает число уведомлений.
 */
export async function processCoachSignals(now = new Date()): Promise<number> {
  // Уже проверенные на самую позднюю «сегодня» из всех поясов (UTC+14) отсекаются в запросе: тик идёт каждые 5 с,
  // и почти всегда проверять некого. Точное «сегодня» тренера — ниже, в его поясе.
  const latestToday = dayKey(now, "Etc/GMT-14");
  const coaches = await db.user.findMany({
    where: {
      isCoach: true,
      OR: [{ coachSignalsDay: null }, { coachSignalsDay: { lt: latestToday } }],
      coachClients: { some: { endedAt: null } },
    },
    select: { id: true, timeZone: true, coachSignalsDay: true },
    // Новые тренеры первыми: порядок не важен для справедливости — за день проверяются все
    orderBy: { createdAt: "desc" },
  });
  const deadline = Date.now() + TICK_BUDGET_MS;
  let sent = 0;
  for (const coach of coaches) {
    if (Date.now() > deadline) break;
    const tz = safeTimeZone(coach.timeZone);
    const today = dayKey(now, tz);
    // День проверки только растёт (YYYY-MM-DD сравнивается строкой): часы назад — не повод проверять заново
    if ((coach.coachSignalsDay && coach.coachSignalsDay >= today) || localHour(now, tz) < CHECK_HOUR) continue;
    try {
      // День забирает один тик: параллельный увидит count = 0
      const { count } = await db.user.updateMany({
        where: { id: coach.id, OR: [{ coachSignalsDay: null }, { coachSignalsDay: { lt: today } }] },
        data: { coachSignalsDay: today },
      });
      if (!count) continue;
      sent += await checkCoach(coach.id, now);
    } catch (e) {
      console.error("[coach-signals] тренер", coach.id, e);
    }
  }
  return sent;
}

async function checkCoach(coachId: string, now: Date): Promise<number> {
  const [inputs, open] = await Promise.all([
    getSignalInputs(coachId, now),
    db.coachSignal.findMany({ where: { coachId, resolvedAt: null }, select: { clientId: true, kind: true } }),
  ]);
  let sent = 0;
  for (const [clientId, { input, tz, name }] of inputs) {
    const current = clientSignals(input, now, tz);
    const diff = signalsDiff(
      open.filter((s) => s.clientId === clientId).map((s) => s.kind as SignalKind),
      current.map((s) => s.kind),
    );
    if (!diff.open.length && !diff.resolve.length) continue;
    try {
      await db.$transaction(async (tx) => {
        if (diff.resolve.length) {
          await tx.coachSignal.updateMany({
            where: { coachId, clientId, resolvedAt: null, kind: { in: diff.resolve } },
            data: { resolvedAt: now },
          });
        }
        if (!diff.open.length) return;
        await tx.coachSignal.createMany({
          data: current.filter((s) => diff.open.includes(s.kind)).map((s) => ({ coachId, clientId, kind: s.kind, since: s.since, notifiedAt: now })),
        });
        await notify(
          tx,
          coachId,
          {
            type: NotificationType.COACH,
            title: signalsNotice(name, diff.open),
            body: "Подробности — в карточке клиента",
            url: `/coach/clients/${clientId}`,
          },
          { push: true },
        );
      });
      if (diff.open.length) sent++;
    } catch (e) {
      // Уже открыт параллельно (уникальный CoachSignal_open) — уведомление ушло там
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  return sent;
}
