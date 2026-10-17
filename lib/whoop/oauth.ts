import "server-only";
import { env } from "@/lib/env";

/** Одноразовые cookie OAuth WHOOP: `state` (защита от CSRF) и время согласия на обработку данных о здоровье. */
export const STATE_COOKIE = "hf_whoop_state";
export const CONSENT_COOKIE = "hf_whoop_consent";

export function oauthCookieOptions(maxAge = 600) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/api/whoop", maxAge, secure: env.NODE_ENV === "production" };
}

/** Итог подключения — параметр `?whoop=` на /devices (тост). */
export type WhoopNotice = "connected" | "denied" | "taken" | "error";
