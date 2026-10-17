import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { templateCopyRows } from "./copy-rows";

type Tx = Prisma.TransactionClient;

/**
 * Копии шаблонов дней программы в собственные шаблоны пользователя (название — как у автора, program — название
 * программы для группировки). Упражнения автора остаются ссылками. Возвращает исходный id → копия.
 */
export async function copyTemplates(tx: Tx, userId: string, programName: string, templateIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  const sources = await tx.workoutTemplate.findMany({
    where: { id: { in: [...new Set(templateIds)] } },
    select: {
      id: true,
      name: true,
      description: true,
      exercises: {
        orderBy: { order: "asc" },
        select: { exerciseId: true, order: true, targetSets: true, targetReps: true, restSec: true, supersetGroup: true },
      },
    },
  });
  const out = new Map<string, { id: string; name: string }>();
  // По очереди: у транзакции одно соединение
  for (const t of sources) {
    const copy = await tx.workoutTemplate.create({
      data: { userId, name: t.name, description: t.description, program: programName, exercises: { create: templateCopyRows(t.exercises) } },
      select: { id: true, name: true },
    });
    out.set(t.id, copy);
  }
  return out;
}
