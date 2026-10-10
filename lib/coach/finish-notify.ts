import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { notify } from "@/lib/notifications/service";
import { parsePlanKey } from "@/lib/plans/edit";

/** Тренер активной связи, если тренировка — его: из его назначения в календаре или по его шаблону («От тренера»). */
async function workoutCoachId(
  tx: Prisma.TransactionClient,
  userId: string,
  workout: { planKey: string | null; templateId: string | null },
) {
  const link = await tx.coachLink.findFirst({ where: { clientId: userId, endedAt: null }, select: { coachId: true } });
  if (!link) return null;
  const parsed = workout.planKey ? parsePlanKey(workout.planKey) : null;
  if (parsed) {
    const plan =
      parsed.kind === "series"
        ? await tx.planSeries.findFirst({ where: { id: parsed.seriesId, userId }, select: { coachId: true } })
        : await tx.planEntry.findFirst({ where: { id: parsed.entryId, userId, seriesId: null }, select: { coachId: true } });
    if (plan?.coachId === link.coachId) return link.coachId;
  }
  if (workout.templateId) {
    const template = await tx.workoutTemplate.findFirst({ where: { id: workout.templateId, userId: link.coachId }, select: { id: true } });
    if (template) return link.coachId;
  }
  return null;
}

/** Клиент завершил тренировку от активного тренера — тренеру уведомление (в транзакции завершения). */
export async function notifyCoachOnFinish(
  tx: Prisma.TransactionClient,
  userId: string,
  workout: { id: string; name: string; planKey: string | null; templateId: string | null },
) {
  const coachId = await workoutCoachId(tx, userId, workout);
  if (!coachId) return;
  const me = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true, name: true } });
  await notify(
    tx,
    coachId,
    {
      type: NotificationType.COACH,
      title: "Тренировка выполнена",
      body: `${clientDisplayName(me)}: выполнено «${workout.name}»`,
      url: `/coach/clients/${userId}/workouts/${workout.id}`,
    },
    { push: true },
  );
}
