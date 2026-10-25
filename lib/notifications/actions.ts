"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { PLAN_REMINDER_LEADS } from "@/lib/plans/reminders";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { isEnabled } from "@/lib/flags/server";
import { pushEnabled } from "@/lib/notifications/push";
import { allowedPushHost, isNativeKind, subscriptionSchema } from "@/lib/notifications/push-hosts";
import { cancelRestPush, notify, processDuePushes, scheduleRestPush } from "@/lib/notifications/service";

export async function subscribePushAction(input: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { endpoint, keys, kind, appVersion } = parsed.data;
  if (!allowedPushHost(kind, endpoint, env.NTFY_URL)) return { ok: false };
  if (isNativeKind(kind) && !(await isEnabled("native_app", user.id))) return { ok: false };
  const userAgent = (await headers()).get("user-agent")?.slice(0, 512);
  // endpoint уникален для браузера: если на этом устройстве вошёл другой пользователь — переносим подписку.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, ...keys, userAgent, kind, appVersion: appVersion ?? null },
    update: { userId: user.id, ...keys, userAgent, kind, appVersion: appVersion ?? null },
  });
  return { ok: true };
}

export async function unsubscribePushAction(endpoint: string) {
  const user = await requireUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
}

const settingsSchema = z
  .object({
    notifyRest: z.boolean(),
    notifyStreak: z.boolean(),
    notifyAchievements: z.boolean(),
    notifySocial: z.boolean(),
    notifyPlan: z.boolean(),
    notifyRecap: z.boolean(),
    notifyCoachRecap: z.boolean(),
    notifyGoal: z.boolean(),
    notifyComeback: z.boolean(),
    planReminderMin: z.union(PLAN_REMINDER_LEADS.map((m) => z.literal(m))),
  })
  .partial();

export async function updateNotificationSettingsAction(patch: z.input<typeof settingsSchema>) {
  const user = await requireUser();
  const data = settingsSchema.parse(patch);
  await db.user.update({ where: { id: user.id }, data });
  if (data.notifyRest === false) await cancelRestPush(user.id);
  revalidatePath("/settings");
}

export async function sendTestPushAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!pushEnabled()) return { ok: false, error: "Push не настроен на сервере (VAPID-ключи)" };
  const devices = await db.pushSubscription.count({ where: { userId: user.id } });
  if (!devices) return { ok: false, error: "На этом аккаунте нет устройств с включённым push" };
  await notify(
    db,
    user.id,
    { type: NotificationType.SYSTEM, title: "Hero Fit 💪", body: "Уведомления работают!", url: "/settings" },
    { push: true },
  );
  await processDuePushes();
  return { ok: true };
}

// ───────────────────────────── Таймер отдыха ─────────────────────────────

export async function scheduleRestPushAction(endsAtIso: string, nextLabel: string) {
  const user = await requireUser();
  const endsAt = new Date(endsAtIso);
  const now = Date.now();
  // Защита от мусора: отдых в будущем и не дольше 15 минут.
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now || endsAt.getTime() - now > 15 * 60_000) return;
  const prefs = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { notifyRest: true, _count: { select: { pushSubscriptions: true } } },
  });
  if (!prefs.notifyRest || prefs._count.pushSubscriptions === 0) return;
  await scheduleRestPush(user.id, endsAt, nextLabel.slice(0, 80));
}

export async function cancelRestPushAction() {
  const user = await requireUser();
  await cancelRestPush(user.id);
}

// ───────────────────────────── Лента ─────────────────────────────

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
