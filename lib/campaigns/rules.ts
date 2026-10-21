import type {
  CampaignCondition,
  CampaignStatus,
} from "@/generated/prisma/enums";
import { plural } from "@/lib/format";

export const RETURN_WINDOW_MS = 48 * 3_600_000;
export const CAMPAIGN_BATCH = 200;
export const CAMPAIGN_INTERVAL_MS = 10 * 60_000;
export const CAMPAIGN_LAST_HOUR = 22;

const DAY_MS = 24 * 3_600_000;

export type CampaignLite = {
  id: string;
  condition: CampaignCondition;
  days: number | null;
  createdAt: Date;
};

/** Одна кампания на игрока: STREAK_LOST выше всех, затем больший days, при равенстве — более ранняя. */
function better(a: CampaignLite, b: CampaignLite): boolean {
  const sa = a.condition === "STREAK_LOST";
  const sb = b.condition === "STREAK_LOST";
  if (sa !== sb) return sa;
  const da = a.days ?? 0;
  const db = b.days ?? 0;
  if (da !== db) return da > db;
  return a.createdAt.getTime() < b.createdAt.getTime();
}

export function pickCampaigns(
  byUser: Map<string, CampaignLite[]>,
): Map<string, CampaignLite> {
  const result = new Map<string, CampaignLite>();
  for (const [userId, list] of byUser) {
    let best: CampaignLite | undefined;
    for (const c of list) if (!best || better(c, best)) best = c;
    if (best) result.set(userId, best);
  }
  return result;
}

/** Общий лимит на игрока: 0 отправок за 24 ч и < 3 за 7 суток. */
export function withinCap(sends: Date[], now: Date): boolean {
  const t = now.getTime();
  const last24 = sends.filter((d) => t - d.getTime() < DAY_MS).length;
  if (last24 > 0) return false;
  return sends.filter((d) => t - d.getTime() < 7 * DAY_MS).length < 3;
}

export function conditionLabel(
  condition: CampaignCondition,
  days: number | null,
): string {
  if (condition === "STREAK_LOST") return "Серия сгорела";
  const n = days ?? 0;
  const d = `${n} ${plural(n, "день", "дня", "дней")}`;
  if (condition === "INACTIVE") return `Не заходил ${d}`;
  if (condition === "NO_WORKOUT") return `Не тренировался ${d}`;
  return `Зарегистрировался и не тренировался ${d}`;
}

export function canEditCondition(status: CampaignStatus): boolean {
  return status === "DRAFT" || status === "PAUSED";
}
