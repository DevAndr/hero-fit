import type { Prisma } from "@/generated/prisma/client";
import { trainedWindow } from "./rules";

/** Тренировка завершена: отправки рассылок за 72 часа до неё засчитываются как «Потренировались». */
export async function markCampaignsTrained(
  tx: Prisma.TransactionClient,
  userId: string,
  finishedAt: Date,
): Promise<void> {
  await tx.campaignSend.updateMany({
    where: { userId, trainedAt: null, sentAt: trainedWindow(finishedAt) },
    data: { trainedAt: finishedAt },
  });
}
