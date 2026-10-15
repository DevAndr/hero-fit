import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isAdminLogin } from "@/lib/auth/admin-login";
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

const SOURCE_LABEL = { SERVER: "сервер", CLIENT: "браузер" } as const;

/** Telegram админам (ADMIN_LOGINS) с привязанным ботом — служебное, переключатель уведомлений не учитывается. */
export async function notifyAdmins(
  group: { id: string; source: "SERVER" | "CLIENT"; message: string; path: string | null; version: string | null },
  kind: "new" | "back",
) {
  const logins = (env.ADMIN_LOGINS ?? "").split(",").map((l) => l.trim()).filter(Boolean);
  if (!logins.length) return;
  const admins = await db.user.findMany({
    where: { telegramChatId: { not: null }, OR: logins.map((login) => ({ login: { equals: login, mode: "insensitive" as const } })) },
    select: { login: true, telegramChatId: true },
  });
  const text = [
    kind === "new" ? "🔴 Новая ошибка" : "🔁 Ошибка вернулась",
    `${SOURCE_LABEL[group.source]}: ${group.message.slice(0, 300)}`,
    group.path ? `Страница: ${group.path}` : null,
    group.version ? `Версия: ${group.version}` : null,
    `${env.APP_URL}/admin/errors/${group.id}`,
  ]
    .filter(Boolean)
    .join("\n");
  for (const admin of admins) {
    if (!admin.telegramChatId || !isAdminLogin(admin.login, env.ADMIN_LOGINS)) continue;
    const result = await callBot("sendMessage", { chat_id: admin.telegramChatId.toString(), text, link_preview_options: { is_disabled: true } });
    if (!result.ok) console.error("[errors] telegram alert failed", result.status, result.description);
  }
}
