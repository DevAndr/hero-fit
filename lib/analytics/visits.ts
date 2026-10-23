import "server-only";
import { db } from "@/lib/db";
import type { Landing, Referrer, Utm } from "@/lib/analytics/source";

/** Счётчики заходов на лендинг для админки (спека docs/superpowers/specs/2026-10-23-landing-visits-design.md). */

/** Сверх стольких разных пар source × campaign за сутки UTC новые пары сворачиваются в UTM_OTHER — защита от мусора в URL. */
export const UTM_PAIRS_PER_DAY = 200;
export const UTM_OTHER = "(прочие)";

export function hourFloor(d: Date): Date {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h;
}

function dayFloor(d: Date): Date {
  const day = new Date(d);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

/** Первая точка входа гостя (в момент установки hf_src). Ошибка не выходит наружу — страница не должна падать. */
export async function recordFirstVisit(landing: Landing, referrer: Referrer, now = new Date()): Promise<void> {
  try {
    await db.$executeRaw`
      INSERT INTO "LandingVisit" (hour, landing, referrer, count) VALUES (${hourFloor(now)}, ${landing}, ${referrer}, 1)
      ON CONFLICT (hour, landing, referrer) DO UPDATE SET count = "LandingVisit".count + 1
    `;
  } catch (e) {
    console.error("landing visit", e);
  }
}

/** Переход гостя по ссылке с меткой (каждый, как hf_utm). */
export async function recordUtmVisit(utm: Utm, now = new Date()): Promise<void> {
  const campaign = utm.campaign ?? "";
  const dayStart = dayFloor(now);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  try {
    await db.$executeRaw`
      INSERT INTO "LandingUtmVisit" (hour, source, campaign, count)
      SELECT ${hourFloor(now)}, CASE WHEN k.keep THEN ${utm.source} ELSE ${UTM_OTHER} END, CASE WHEN k.keep THEN ${campaign} ELSE '' END, 1
      FROM (
        SELECT EXISTS (
            SELECT 1 FROM "LandingUtmVisit"
            WHERE hour >= ${dayStart} AND hour < ${dayEnd} AND source = ${utm.source} AND campaign = ${campaign}
          )
          OR (
            SELECT COUNT(DISTINCT (source, campaign)) FROM "LandingUtmVisit" WHERE hour >= ${dayStart} AND hour < ${dayEnd}
          ) < ${UTM_PAIRS_PER_DAY} AS keep
      ) k
      ON CONFLICT (hour, source, campaign) DO UPDATE SET count = "LandingUtmVisit".count + 1
    `;
  } catch (e) {
    console.error("landing utm visit", e);
  }
}
