"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { queueGoal } from "@/lib/analytics/queue";
import { requireUser } from "@/lib/auth/dal";
import { requireClientOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { ensureCoachCode, getCoachByCode } from "@/lib/coach/queries";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";

type Result = { ok: true } | { ok: false; error: string };

const nameSelect = { nickname: true, name: true } as const;

type Tx = Prisma.TransactionClient;

/** Связь закрыта — назначения, задания, членство в группах и заметка этого тренера уходят у клиента (тренировки остаются). */
async function dropAssignments(tx: Tx, coachId: string, clientId: string) {
  await tx.planSeries.deleteMany({ where: { userId: clientId, coachId } });
  await tx.planEntry.deleteMany({ where: { userId: clientId, coachId, seriesId: null } });
  await tx.coachTarget.deleteMany({ where: { clientId, template: { userId: coachId } } });
  await tx.coachGroupMember.deleteMany({ where: { clientId, group: { coachId } } });
  await tx.coachNote.deleteMany({ where: { coachId, clientId } });
  // Строки клиента в итогах недели тренера; общие цифры снимка остаются (без персональных данных)
  await tx.coachRecapClient.deleteMany({ where: { clientId, recap: { coachId } } });
  // Программа пары закрывается (серии уже удалены выше, веса в задания не пишутся — задания тоже удалены)
  await tx.programAssignment.updateMany({ where: { coachId, clientId, endedAt: null }, data: { endedAt: new Date() } });
  // Сигналы пары закрываются: при повторной связи появятся заново и уведомят снова
  await tx.coachSignal.updateMany({ where: { coachId, clientId, resolvedAt: null }, data: { resolvedAt: new Date() } });
}

/** Включить/выключить режим тренера. Выключение не разрывает связи — только скрывает раздел. */
export async function setCoachModeAction(on: boolean): Promise<Result> {
  const user = await requireUser();
  if (on) {
    const { nickname } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } });
    if (!nickname) return { ok: false, error: "Сначала задайте ник" };
    await ensureCoachCode(user.id);
  }
  await db.user.update({ where: { id: user.id }, data: { isCoach: on } });
  if (on && !user.isCoach) await queueGoal("coach_enabled");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Клиент разрешил доступ по ссылке тренера. Одна транзакция: прежняя связь закрывается («switch»),
 * новая создаётся; частичный уникальный индекс не даст двум вкладкам оставить две активные связи.
 */
export async function acceptCoachAction(code: string): Promise<never> {
  const user = await requireUser();
  const coach = await getCoachByCode(code);
  if (!coach || coach.id === user.id) redirect(`/coach/join/${encodeURIComponent(code)}`);

  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: nameSelect });
  const clientName = clientDisplayName(me);
  let created = false;
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.coachLink.findFirst({ where: { clientId: user.id, endedAt: null }, select: { id: true, coachId: true } });
      if (current?.coachId === coach.id) return; // уже связаны — повтор без ошибки
      if (current) {
        await tx.coachLink.update({ where: { id: current.id }, data: { endedAt: new Date(), endedBy: "switch" } });
        await dropAssignments(tx, current.coachId, user.id);
        await notify(
          tx,
          current.coachId,
          { type: NotificationType.COACH, title: "Клиент ушёл", body: `${clientName} перешёл к другому тренеру`, url: "/coach" },
          { push: true },
        );
      }
      await tx.coachLink.create({ data: { coachId: coach.id, clientId: user.id } });
      created = true;
      await notify(
        tx,
        coach.id,
        { type: NotificationType.COACH, title: "Новый клиент", body: `${clientName} разрешил доступ к тренировкам`, url: "/coach" },
        { push: true },
      );
    });
  } catch (e) {
    // Параллельный «Разрешить» из другой вкладки уже создал связь
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  if (created) await queueGoal("coach_client_joined");
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Клиент отключает тренера (карточка «Мой тренер» в настройках). */
export async function endCoachLinkAction(): Promise<void> {
  const user = await requireUser();
  const link = await db.coachLink.findFirst({ where: { clientId: user.id, endedAt: null }, select: { id: true, coachId: true } });
  if (!link) return;
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: nameSelect });
  await db.$transaction(async (tx) => {
    const { count } = await tx.coachLink.updateMany({ where: { id: link.id, endedAt: null }, data: { endedAt: new Date(), endedBy: "client" } });
    if (!count) return;
    await dropAssignments(tx, link.coachId, user.id);
    await notify(
      tx,
      link.coachId,
      { type: NotificationType.COACH, title: "Клиент отключил доступ", body: `${clientDisplayName(me)} отключил доступ к тренировкам`, url: "/coach" },
      { push: true },
    );
  });
  revalidatePath("/", "layout");
}

/** Тренер завершает работу с клиентом. */
export async function removeClientAction(clientId: string): Promise<never> {
  const { coach } = await requireClientOf(clientId);
  const me = await db.user.findUniqueOrThrow({ where: { id: coach.id }, select: nameSelect });
  await db.$transaction(async (tx) => {
    const { count } = await tx.coachLink.updateMany({
      where: { coachId: coach.id, clientId, endedAt: null },
      data: { endedAt: new Date(), endedBy: "coach" },
    });
    if (!count) return;
    await dropAssignments(tx, coach.id, clientId);
    await notify(
      tx,
      clientId,
      { type: NotificationType.COACH, title: "Тренер завершил работу", body: `Тренер ${clientDisplayName(me)} завершил работу с вами`, url: "/settings" },
      { push: true },
    );
  });
  revalidatePath("/", "layout");
  redirect("/coach");
}
