import "server-only";
import webpush from "web-push";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendAdminTelegram } from "@/lib/errors/notify";
import { NTFY_FAIL_THRESHOLD, ntfyHealth, ntfyOutcome } from "@/lib/notifications/ntfy-health";
import { ntfyHost } from "@/lib/notifications/push-hosts";

export type PushPayload = { type: NotificationType; title: string; body: string; url?: string | null };

let configured = false;
export function pushEnabled() {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

const TAGS: Record<NotificationType, string> = {
  REST: "hero-fit-rest",
  STREAK: "hero-fit-streak",
  ACHIEVEMENT: "hero-fit-achievement",
  SYSTEM: "hero-fit-system",
  SOCIAL: "hero-fit-social",
  PLAN: "hero-fit-plan",
  RECAP: "hero-fit-recap",
  BOSS: "hero-fit-boss",
  RAID: "hero-fit-raid",
  COACH: "hero-fit-coach",
  GOAL: "hero-fit-goal",
  FEEDBACK: "hero-fit-feedback",
  COMEBACK: "hero-fit-comeback",
};

/** Шлёт push на все устройства пользователя; подписки, которых больше нет (404/410), удаляет. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!pushEnabled()) return { sent: 0 };
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify({ ...payload, url: payload.url ?? "/dashboard", tag: TAGS[payload.type] });
  const ntfy = ntfyHost(env.NTFY_URL);
  // Здоровье нашего ntfy: серия сбоев — алерт админам (не чаще раза в час).
  const track = (endpoint: string, result: "ok" | number | undefined) => {
    const ok = ntfyOutcome(endpoint, ntfy, result);
    if (ok !== null && ntfyHealth.record(ok, Date.now())) {
      void sendAdminTelegram(`⚠️ ntfy не принимает push: ${NTFY_FAIL_THRESHOLD} отправок подряд с ошибкой. Проверь контейнер ntfy и Caddy.`);
    }
  };

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          {
            TTL: payload.type === "REST" ? 120 : 3600,
            urgency: payload.type === "REST" ? "high" : "normal",
            timeout: 10_000, // зависший push-сервис не должен блокировать очередь
          },
        );
        sent++;
        track(s.endpoint, "ok");
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        track(s.endpoint, status);
        if (status === 404 || status === 410) await db.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.error("[push] send failed", status, (e as Error).message);
      }
    }),
  );
  return { sent };
}
