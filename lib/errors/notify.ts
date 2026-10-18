import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isAdminLogin } from "@/lib/auth/admin-login";
import { alertText } from "@/lib/errors/alert";
import { callBot } from "@/lib/telegram/api";

const HOUR = 3_600_000;
/** Отправленные оповещения за последний час — в памяти процесса (общий лимит ALERT_HOURLY_MAX). */
const sent: number[] = [];

export function alertsLastHour(now = Date.now()) {
  while (sent.length && now - sent[0] > HOUR) sent.shift();
  return sent.length;
}

export function markAlert(now = Date.now()) {
  sent.push(now);
}

/** Telegram админам (ADMIN_LOGINS) с привязанным ботом — служебное, переключатель уведомлений не учитывается. */
export async function sendAdminTelegram(text: string) {
  const logins = (env.ADMIN_LOGINS ?? "").split(",").map((l) => l.trim()).filter(Boolean);
  if (!logins.length) return;
  const admins = await db.user.findMany({
    where: { telegramChatId: { not: null }, OR: logins.map((login) => ({ login: { equals: login, mode: "insensitive" as const } })) },
    select: { login: true, telegramChatId: true },
  });
  for (const admin of admins) {
    if (!admin.telegramChatId || !isAdminLogin(admin.login, env.ADMIN_LOGINS)) continue;
    const result = await callBot("sendMessage", { chat_id: admin.telegramChatId.toString(), text, link_preview_options: { is_disabled: true } });
    if (!result.ok) console.error("[admin] telegram alert failed", result.status, result.description);
  }
}

/** Новая или вернувшаяся группа ошибок — админам в Telegram. */
export async function notifyAdmins(
  group: { id: string; source: "SERVER" | "CLIENT"; version: string | null },
  kind: "new" | "back",
) {
  await sendAdminTelegram(alertText(group, kind, env.APP_URL));
}
