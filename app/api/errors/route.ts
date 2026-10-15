import { cookies, headers } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { createLimiter } from "@/lib/errors/limit";
import { reportError } from "@/lib/errors/report";
import { clientReportSchema, MAX_BODY_BYTES, stripQuery } from "@/lib/errors/schema";

/** 30 отчётов в минуту на пользователя, без входа — 5 на IP; в памяти процесса. */
const limiter = createLimiter({ max: 30, windowMs: 60_000 });
const anonLimiter = createLimiter({ max: 5, windowMs: 60_000 });

/** Тот же источник: хост Origin (или Referer) совпадает с хостом запроса (за Caddy — исходный Host). */
const sameHost = (url: string | null, host: string | null) => {
  if (!url || !host) return false;
  try {
    return new URL(url).host === host;
  } catch {
    return false;
  }
};

/** Ошибки браузера (ErrorReporter, границы ошибок) — в журнал /admin/errors. */
export async function POST(req: Request) {
  const h = await headers();
  if (!sameHost(h.get("origin") ?? h.get("referer"), h.get("x-forwarded-host") ?? h.get("host"))) return new Response(null, { status: 403 });
  if (Number(h.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const access = await verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  if (!(access ? limiter.hit(access.userId) : anonLimiter.hit(`ip:${ip}`))) return new Response(null, { status: 429 });

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = clientReportSchema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  const r = parsed.data;
  await reportError({
    source: "CLIENT",
    message: r.message,
    stack: r.stack ?? null,
    path: r.path ? stripQuery(r.path) : null,
    version: r.version ?? null,
    userAgent: h.get("user-agent"),
    userId: access?.userId ?? null,
  });
  return new Response(null, { status: 204 });
}
