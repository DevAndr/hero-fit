import "server-only";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { ALERT_GROUP_INTERVAL_MS, shouldAlert } from "@/lib/errors/alert";
import { createLimiter } from "@/lib/errors/limit";
import { isNoise } from "@/lib/errors/noise";
import { alertsLastHour, markAlert, notifyAdmins } from "@/lib/errors/notify";
import { recordError } from "@/lib/errors/record";
import { stripQuery, type ErrorInput } from "@/lib/errors/schema";

/** Служебные «ошибки» Next: redirect(), notFound(), forbidden() — не сбои. */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/;

/** Одновременных записей — не больше двух: всплеск ошибок не занимает весь пул соединений, лишнее отбрасывается. */
const MAX_IN_FLIGHT = 2;
let inFlight = 0;
/** Новых групп из браузера — не больше 100 в час: открытый приём нельзя засыпать случайными сообщениями. */
const newClientGroups = createLimiter({ max: 100, windowMs: 3_600_000 });

/** Шум → запись → оповещение админов о новой или вернувшейся группе. Никогда не бросает. */
export async function reportError(input: ErrorInput) {
  if (isNoise(input) || inFlight >= MAX_IN_FLIGHT) return;
  inFlight++;
  try {
    const options = input.source === "CLIENT" ? { canCreate: () => newClientGroups.hit("all") } : {};
    const recorded = await recordError(input, undefined, options);
    if (!recorded) return;
    const now = new Date();
    if (!shouldAlert(recorded, now, alertsLastHour(now.getTime()))) return;
    // Право на оповещение — атомарно: из одновременных одинаковых ошибок сообщение отправит одна
    const claim = await db.errorGroup.updateMany({
      where: { id: recorded.groupId, OR: [{ alertedAt: null }, { alertedAt: { lt: new Date(now.getTime() - ALERT_GROUP_INTERVAL_MS) } }] },
      data: { alertedAt: now },
    });
    if (claim.count !== 1) return;
    markAlert(now.getTime());
    // Telegram не задерживает ответ пользователю
    void notifyAdmins({ id: recorded.groupId, source: input.source, version: input.version }, recorded.isNew ? "new" : "back").catch((e) =>
      console.error("[errors] alert failed", e),
    );
  } catch (e) {
    console.error("[errors] report failed", e);
  } finally {
    inFlight--;
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
