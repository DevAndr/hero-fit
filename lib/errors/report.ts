import "server-only";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { shouldAlert } from "@/lib/errors/alert";
import { isNoise } from "@/lib/errors/noise";
import { alertsLastHour, markAlert, notifyAdmins } from "@/lib/errors/notify";
import { recordError } from "@/lib/errors/record";
import { stripQuery, type ErrorInput } from "@/lib/errors/schema";

/** Служебные «ошибки» Next: redirect(), notFound(), forbidden() — не сбои. */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/;

/** Шум → запись → оповещение админов о новой или вернувшейся группе. Никогда не бросает. */
export async function reportError(input: ErrorInput) {
  try {
    if (isNoise(input)) return;
    const recorded = await recordError(input);
    if (!recorded) return;
    const now = new Date();
    if (!shouldAlert(recorded, now, alertsLastHour(now.getTime()))) return;
    markAlert(now.getTime());
    await db.errorGroup.update({ where: { id: recorded.groupId }, data: { alertedAt: now } });
    // Telegram не задерживает ответ пользователю
    void notifyAdmins({ id: recorded.groupId, ...input }, recorded.isNew ? "new" : "back").catch((e) =>
      console.error("[errors] alert failed", e),
    );
  } catch (e) {
    console.error("[errors] report failed", e);
  }
}

const header = (headers: Record<string, string | string[] | undefined>, name: string) => {
  const v = headers[name];
  return Array.isArray(v) ? v.join("; ") : (v ?? null);
};

function cookieValue(cookie: string | null, name: string) {
  for (const part of (cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Из `onRequestError` (instrumentation.ts): ошибка сервера с путём без query и пользователем по cookie доступа. */
export async function reportServerError(err: unknown, request: { path: string; headers: Record<string, string | string[] | undefined> }) {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : "";
  if (CONTROL_FLOW.test(digest)) return;
  const access = await verifyAccessToken(cookieValue(header(request.headers, "cookie"), ACCESS_COOKIE));
  await reportError({
    source: "SERVER",
    message: err instanceof Error ? `${err.name === "Error" ? "" : `${err.name}: `}${err.message}` : String(err),
    stack: err instanceof Error ? (err.stack ?? null) : null,
    path: stripQuery(request.path),
    version: process.env.APP_VERSION ?? null,
    userAgent: header(request.headers, "user-agent"),
    userId: access?.userId ?? null,
  });
}
