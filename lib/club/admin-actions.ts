"use server";

import { revalidatePath } from "next/cache";
import { NotificationType } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { rejectReasonSchema } from "@/lib/club/rules";
import { notify } from "@/lib/notifications/service";

type Result = { ok: true } | { ok: false; error: string };

/** Решение по заявке: одно на заявку (условие по статусу) — два модератора не решат её дважды. */
export async function reviewClubAction(id: string, decision: "approve" | "reject", reason?: string): Promise<Result> {
  await requireAdmin();
  let rejectReason: string | null = null;
  if (decision === "reject") {
    const parsed = rejectReasonSchema.safeParse(reason ?? "");
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Укажите причину" };
    rejectReason = parsed.data;
  }
  const done = await db.$transaction(async (tx) => {
    const { count } = await tx.club.updateMany({
      where: { id: String(id), status: "PENDING" },
      data: { status: decision === "approve" ? "APPROVED" : "REJECTED", rejectReason, reviewedAt: new Date() },
    });
    if (count === 0) return false;
    const club = await tx.club.findUniqueOrThrow({ where: { id: String(id) }, select: { id: true, name: true, adminId: true } });
    await notify(
      tx,
      club.adminId,
      decision === "approve"
        ? { type: NotificationType.SOCIAL, title: `Клуб «${club.name}» одобрен`, body: "Пригласите участников ссылкой или QR", url: `/clubs/${club.id}/manage` }
        : { type: NotificationType.SOCIAL, title: `Заявка на клуб «${club.name}» отклонена`, body: rejectReason!, url: "/clubs" },
      { push: true },
    );
    return true;
  });
  if (!done) return { ok: false, error: "Заявка уже рассмотрена" };
  revalidatePath("/admin/clubs");
  return { ok: true };
}

/** Скрыть одобренный клуб (нет в поиске, вступить нельзя) или вернуть. */
export async function setClubHiddenAction(id: string, hidden: boolean): Promise<Result> {
  await requireAdmin();
  const { count } = await db.club.updateMany({
    where: { id: String(id), status: hidden ? "APPROVED" : "HIDDEN" },
    data: { status: hidden ? "HIDDEN" : "APPROVED" },
  });
  if (count === 0) return { ok: false, error: "Статус клуба уже изменился" };
  revalidatePath("/admin/clubs");
  return { ok: true };
}
