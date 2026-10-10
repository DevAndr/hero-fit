import { NextResponse } from "next/server";
import { z } from "zod";
import { queueGoal } from "@/lib/analytics/queue";
import { writeAuthCookies } from "@/lib/auth/cookies";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/auth/schemas";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { telegramEnabled } from "@/lib/telegram/format";
import { startTarget, verifyInitData } from "@/lib/telegram/init-data";
import { findByTelegram, linkTelegramTo, registerFromTelegram } from "@/lib/telegram/mini-app";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("auto"), initData: z.string().max(4096) }),
  z.object({ action: z.literal("register"), initData: z.string().max(4096), consent: z.literal(true) }),
  z.object({ action: z.literal("link"), initData: z.string().max(4096), identifier: loginSchema.shape.identifier, password: loginSchema.shape.password }),
]);

/**
 * Вход в Telegram Mini App по подписанному initData. Авторизация — подписью, не cookies (CSRF не применим);
 * сессия — embedded: cookies для фрейма web.telegram.org.
 */
export async function POST(req: Request) {
  if (!telegramEnabled(env) || !env.TELEGRAM_BOT_TOKEN) return new Response(null, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = body.safeParse(raw);
  if (!parsed.success) {
    const consentMissing = (raw as { action?: unknown } | null)?.action === "register";
    return NextResponse.json({ error: consentMissing ? "consent" : "request" }, { status: 400 });
  }
  const input = parsed.data;

  const verified = verifyInitData(input.initData, env.TELEGRAM_BOT_TOKEN, new Date());
  if (!verified.ok) return NextResponse.json({ error: "initData" }, { status: 401 });
  const { user, startParam } = verified;

  let userId: string;
  if (input.action === "link") {
    const account = await db.user.findFirst({
      where: { OR: [{ login: input.identifier }, { email: input.identifier }] },
      select: { id: true, passwordHash: true },
    });
    if (!account?.passwordHash) {
      await burnPasswordCheck(input.password);
      return NextResponse.json({ error: "credentials" }, { status: 401 });
    }
    if (!(await verifyPassword(account.passwordHash, input.password))) {
      return NextResponse.json({ error: "credentials" }, { status: 401 });
    }
    await linkTelegramTo(account.id, user);
    userId = account.id;
  } else {
    const existing = await findByTelegram(user.id);
    if (existing) userId = existing.id;
    else if (input.action === "auto") return NextResponse.json({ status: "new", firstName: user.firstName });
    else {
      userId = await registerFromTelegram(user);
      await queueGoal("signup");
    }
  }

  const tokens = await createSession(
    userId,
    { userAgent: req.headers.get("user-agent"), ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") },
    { embedded: true },
  );
  await queueGoal("telegram_open");
  const res = NextResponse.json({ status: "ok", to: startTarget(startParam) });
  writeAuthCookies(res.cookies, tokens, { embedded: true });
  return res;
}
