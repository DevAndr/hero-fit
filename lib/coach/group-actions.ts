"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireCoach } from "@/lib/coach/access";
import { pickClients } from "@/lib/coach/assign";
import { COACH_GROUPS_MAX, groupKey, groupSchema } from "@/lib/coach/groups";
import { db } from "@/lib/db";

type Result = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Группа не найдена";
const clientIdsSchema = z.array(z.string().min(1)).max(500);

/** Создать (id = null) или изменить группу: название и состав целиком; чужие и отвязанные клиенты отбрасываются. */
export async function saveGroupAction(id: string | null, input: { name: string; clientIds: string[] }): Promise<Result> {
  const coach = await requireCoach();
  const parsed = groupSchema.safeParse({ name: String(input?.name ?? "") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте название" };
  const ids = clientIdsSchema.safeParse(input?.clientIds ?? []);
  if (!ids.success) return { ok: false, error: "Проверьте клиентов" };
  const { name } = parsed.data;

  const links = await db.coachLink.findMany({ where: { coachId: coach.id, endedAt: null }, select: { clientId: true } });
  const { ids: members } = pickClients(ids.data, links.map((l) => l.clientId));

  try {
    const result = await db.$transaction(async (tx) => {
      // Запросы по очереди: у транзакции одно соединение
      let groupId: string;
      if (id === null) {
        if ((await tx.coachGroup.count({ where: { coachId: coach.id } })) >= COACH_GROUPS_MAX)
          return `Не больше ${COACH_GROUPS_MAX} групп`;
        groupId = (await tx.coachGroup.create({ data: { coachId: coach.id, name, nameKey: groupKey(name) }, select: { id: true } })).id;
      } else {
        const { count } = await tx.coachGroup.updateMany({ where: { id: String(id), coachId: coach.id }, data: { name, nameKey: groupKey(name) } });
        if (!count) return NOT_FOUND;
        groupId = String(id);
        await tx.coachGroupMember.deleteMany({ where: { groupId } });
      }
      if (members.length) await tx.coachGroupMember.createMany({ data: members.map((clientId) => ({ groupId, clientId })) });
      return null;
    });
    if (result) return { ok: false, error: result };
  } catch (e) {
    // Две вкладки создали одинаковое название — уникальный индекс
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Такая группа уже есть" };
    throw e;
  }
  revalidatePath("/coach");
  return { ok: true };
}

/** Удалить группу; клиенты остаются. */
export async function deleteGroupAction(id: string): Promise<Result> {
  const coach = await requireCoach();
  const { count } = await db.coachGroup.deleteMany({ where: { id: String(id), coachId: coach.id } });
  if (!count) return { ok: false, error: NOT_FOUND };
  revalidatePath("/coach");
  return { ok: true };
}
