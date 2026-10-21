import "server-only";
import type { Campaign } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type CampaignRow = Campaign & { sent30: number; returned30: number };

const DAY_MS = 86_400_000;

/** Рассылки для админки: новые сверху, архив — в конце; отправки и возвраты за 30 дней. */
export async function listCampaigns(now = new Date()): Promise<CampaignRow[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [campaigns, sent, returned] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    db.campaignSend.groupBy({ by: ["campaignId"], where: { sentAt: { gte: since } }, _count: { _all: true } }),
    db.campaignSend.groupBy({ by: ["campaignId"], where: { sentAt: { gte: since }, returnedAt: { not: null } }, _count: { _all: true } }),
  ]);
  const sentBy = new Map(sent.map((s) => [s.campaignId, s._count._all]));
  const returnedBy = new Map(returned.map((s) => [s.campaignId, s._count._all]));
  const rows = campaigns.map((c) => ({ ...c, sent30: sentBy.get(c.id) ?? 0, returned30: returnedBy.get(c.id) ?? 0 }));
  return [...rows.filter((c) => c.status !== "ARCHIVED"), ...rows.filter((c) => c.status === "ARCHIVED")];
}

export function getCampaign(id: string): Promise<Campaign | null> {
  return db.campaign.findUnique({ where: { id } });
}
