import { randomBytes } from "node:crypto";

/** Чистые функции Telegram-бота: формат сообщений, токен привязки, включение интеграции. */

type TelegramEnv = { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_WEBHOOK_SECRET?: string };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram отклоняет кнопки со ссылкой на localhost и http — на таких адресах кнопки нет. */
export function publicHttps(appUrl: string): boolean {
  try {
    const u = new URL(appUrl);
    return u.protocol === "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

export type TelegramText = {
  text: string;
  parse_mode: "HTML";
  reply_markup?: { inline_keyboard: { text: string; url: string }[][] };
};

export function telegramMessage(p: { title: string; body: string; url?: string | null }, appUrl: string): TelegramText {
  const message: TelegramText = { text: `<b>${escapeHtml(p.title)}</b>\n${escapeHtml(p.body)}`, parse_mode: "HTML" };
  if (publicHttps(appUrl)) {
    message.reply_markup = { inline_keyboard: [[{ text: "Открыть", url: new URL(p.url ?? "/dashboard", appUrl).toString() }]] };
  }
  return message;
}

export function linkTokenStatus(t: { expiresAt: Date; usedAt: Date | null } | null, now: Date): "ok" | "expired" | "used" | "missing" {
  if (!t) return "missing";
  if (t.usedAt) return "used";
  if (t.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/** 24 байта → 32 символа base64url — допустимо в параметре start (A-Z a-z 0-9 _ -, до 64). */
export function newLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export const LINK_TOKEN_TTL_MS = 15 * 60_000;

export function telegramEnabled(e: TelegramEnv): boolean {
  return Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_BOT_USERNAME);
}

export function webhookStatus(e: TelegramEnv, secretHeader: string | null): 404 | 401 | 200 {
  if (!telegramEnabled(e)) return 404;
  return secretHeader && secretHeader === e.TELEGRAM_WEBHOOK_SECRET ? 200 : 401;
}
