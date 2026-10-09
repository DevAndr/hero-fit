import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { notify } from "@/lib/notifications/service";
import { parsePlanKey } from "@/lib/plans/edit";

/** Клиент завершил тренировку, назначенную активным тренером, — тренеру уведомление (в транзакции завершения). */
export async function notifyCoachOnFinish(tx: Prisma.TransactionClient, userId: string, workout: { id: string; name: string; planKey: string | null }) {
  const parsed = workout.planKey ? parsePlanKey(workout.planKey) : null;
  if (!parsed) return;
  const plan =
    parsed.kind === "series"
      ? await tx.planSeries.findFirst({ where: { id: parsed.seriesId, userId }, select: { coachId: true } })
      : await tx.planEntry.findFirst({ where: { id: parsed.entryId, userId, seriesId: null }, select: { coachId: true } });
  if (!plan?.coachId) return;
  const link = await tx.coachLink.findFirst({ where: { clientId: userId, coachId: plan.coachId, endedAt: null }, select: { id: true } });
  if (!link) return;
  const me = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true, name: true } });
  await notify(
    tx,
    plan.coachId,
    {
      type: NotificationType.COACH,
      title: "Тренировка выполнена",
      body: `${clientDisplayName(me)}: выполнено «${workout.name}»`,
      url: `/coach/clients/${userId}/workouts/${workout.id}`,
    },
    { push: true },
  );
}
