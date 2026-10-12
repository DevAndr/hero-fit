import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeFriendCode } from "@/lib/social/league";

/**
 * Проверка initData Telegram Mini App (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * secret = HMAC_SHA256("WebAppData", токен бота), hash = HMAC_SHA256(secret, пары key=value без hash по ключу через \n).
 */

export type TelegramUser = { id: number; firstName: string; lastName?: string; username?: string };

export type InitDataResult =
  | { ok: true; user: TelegramUser; startParam: string | null; authDate: Date }
  | { ok: false; reason: "hash" | "expired" | "malformed" };

/** initData обменивается на сессию один раз при запуске — час с запасом; меньше окно для перехваченной подписи. */
const MAX_AGE_MS = 3600_000;
const FUTURE_SKEW_MS = 5 * 60_000;

function checkString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function sign(data: string, botToken: string) {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Подписанный initData — для тестов и e2e (так же, как его собирает Telegram). */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  params.set("hash", sign(checkString(params), botToken));
  return params.toString();
}

export function verifyInitData(initData: string, botToken: string, now: Date): InitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(sign(checkString(params), botToken), "hex");
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return { ok: false, reason: "hash" };

  const authDate = new Date(Number(params.get("auth_date")) * 1000);
  if (Number.isNaN(authDate.getTime())) return { ok: false, reason: "malformed" };
  const age = now.getTime() - authDate.getTime();
  if (age > MAX_AGE_MS || age < -FUTURE_SKEW_MS) return { ok: false, reason: "expired" };

  let raw: { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown };
  try {
    raw = JSON.parse(params.get("user") ?? "");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof raw?.id !== "number" || !Number.isSafeInteger(raw.id) || typeof raw.first_name !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const user: TelegramUser = { id: raw.id, firstName: raw.first_name };
  if (typeof raw.last_name === "string" && raw.last_name) user.lastName = raw.last_name;
  if (typeof raw.username === "string" && raw.username) user.username = raw.username;
  return { ok: true, user, startParam: params.get("start_param") || null, authDate };
}

/** Куда вести после входа: приглашение тренера (`join_`) или гильдии (`guild_`) по коду из startapp, иначе дашборд (без открытых редиректов). */
export function startTarget(startParam: string | null): string {
  const coach = startParam?.startsWith("join_") ? normalizeFriendCode(startParam.slice(5)) : null;
  if (coach) return `/coach/join/${coach}`;
  const guild = startParam?.startsWith("guild_") ? normalizeFriendCode(startParam.slice(6)) : null;
  return guild ? `/guild/join/${guild}` : "/dashboard";
}
