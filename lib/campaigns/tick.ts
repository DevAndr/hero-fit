import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import { campaignCandidates, serverChannels } from "@/lib/campaigns/conditions";
import { CAMPAIGN_BATCH, CAMPAIGN_INTERVAL_MS, pickCampaigns, withinCap, type CampaignLite } from "@/lib/campaigns/rules";
import { db } from "@/lib/db";
import { flagOn } from "@/lib/flags/eval";
import { getFlagStates } from "@/lib/flags/server";
import { notify } from "@/lib/notifications/service";

const WEEK_MS = 7 * 86_400_000;

/** Время последнего обычного прохода (в памяти процесса, как lastErrorsPrune); проходы с тестовыми часами его не трогают. */
let lastCampaignsRun = 0;

/**
 * Рассылки по условиям — шаг тика уведомлений, не чаще раза в CAMPAIGN_INTERVAL_MS (force — тестовые часы ?now=).
 * Возвращает число отправок; доставку в push/Telegram делает processDuePushes после шага.
 */
export async function processCampaigns(now: Date, { force }: { force: boolean }): Promise<number> {
  if (!force) {
    if (now.getTime() - lastCampaignsRun < CAMPAIGN_INTERVAL_MS) return 0;
    lastCampaignsRun = now.getTime();
  }
  const state = (await getFlagStates()).get("campaigns") ?? null;
  if (!state?.enabled) return 0;

  const campaigns = await db.campaign.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (campaigns.length === 0) return 0;
  // Каналы сервера — раз на проход: без VAPID/бота канал игроку не засчитывается
  const server = serverChannels();
  if (!server.push && !server.telegram) return 0;
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  const byUser = new Map<string, CampaignLite[]>();
  const episodes = new Map<string, string>(); // `${campaignId}:${userId}` → эпизод
  for (const c of campaigns) {
    for (const { userId, episode } of await campaignCandidates(c, now, { server })) {
      if (!flagOn("campaigns", state, userId)) continue;
      const list = byUser.get(userId) ?? [];
      list.push({ id: c.id, condition: c.condition, days: c.days, createdAt: c.createdAt });
      byUser.set(userId, list);
      episodes.set(`${c.id}:${userId}`, episode);
    }
  }
  const picked = pickCampaigns(byUser);
  if (picked.size === 0) return 0;

  // Общий лимит — по отправкам за 7 суток (одним запросом на всех)
  const recent = await db.campaignSend.findMany({
    where: { userId: { in: [...picked.keys()] }, sentAt: { gte: new Date(now.getTime() - WEEK_MS) } },
    select: { userId: true, sentAt: true },
  });
  const sendsOf = new Map<string, Date[]>();
  for (const s of recent) sendsOf.set(s.userId, [...(sendsOf.get(s.userId) ?? []), s.sentAt]);
  const due = [...picked].filter(([userId]) => withinCap(sendsOf.get(userId) ?? [], now)).slice(0, CAMPAIGN_BATCH);

  let sent = 0;
  for (const [userId, lite] of due) {
    const c = byId.get(lite.id)!;
    const episode = episodes.get(`${c.id}:${userId}`)!;
    try {
      await db.$transaction(async (tx) => {
        // Уникальный (кампания, игрок, эпизод) — параллельный воркер не отправит второй раз
        const { count } = await tx.campaignSend.createMany({
          data: [{ campaignId: c.id, userId, episode, sentAt: now }],
          skipDuplicates: true,
        });
        if (count === 0) return;
        await notify(
          tx,
          userId,
          { type: NotificationType.COMEBACK, title: c.title, body: c.body, url: c.url },
          { push: true, channels: { push: c.push && server.push, telegram: c.telegram && server.telegram } },
        );
        sent++;
      });
    } catch (e) {
      console.error("[campaigns] отправка не удалась", c.id, userId, e);
    }
  }
  return sent;
}
