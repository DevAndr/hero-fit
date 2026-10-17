import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { reportError } from "@/lib/errors/report";
import { fetchProfileUserId } from "@/lib/whoop/client";
import { WHOOP_HISTORY_MS } from "@/lib/whoop/card";
import { encryptToken } from "@/lib/whoop/crypto";
import { CONSENT_COOKIE, oauthCookieOptions, STATE_COOKIE, type WhoopNotice } from "@/lib/whoop/oauth";
import { whoopAvailable } from "@/lib/whoop/queries";
import { syncRange } from "@/lib/whoop/sync";
import { exchangeCode, WhoopUnavailableError, type WhoopTokenSet } from "@/lib/whoop/tokens";

/** Редирект на /devices с итогом; одноразовые cookie OAuth стираются в любом случае. */
function back(notice: WhoopNotice) {
  const res = NextResponse.redirect(new URL(`/devices?whoop=${notice}`, env.APP_URL));
  res.cookies.set(STATE_COOKIE, "", oauthCookieOptions(0));
  res.cookies.set(CONSENT_COOKIE, "", oauthCookieOptions(0));
  return res;
}

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Описание ошибки для мониторинга без данных о здоровье: только имя (message/stack ошибок Prisma содержат значения
 * полей — пульс, ккал), у WhoopUnavailableError — ещё HTTP-статус из сообщения вида "whoop 503".
 */
function safeErrorLabel(e: unknown): string {
  if (!(e instanceof Error)) return "unknown";
  const status = e instanceof WhoopUnavailableError ? /^whoop (\d{3})$/.exec(e.message)?.[1] : undefined;
  return status ? `${e.name} ${status}` : e.name;
}

/**
 * Возврат из авторизации WHOOP: проверка `state`, обмен кода, `user_id` из профиля, запись подключения
 * (токены — зашифрованы). Аккаунт WHOOP уже у другого нашего пользователя → `taken`, токены просто не сохраняются:
 * отзыв (`DELETE /v2/user/access`) снял бы доступ ко всему аккаунту WHOOP и сломал подключение первого пользователя.
 * История за 30 дней грузится после ответа (`after`).
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!(await whoopAvailable(user.id))) return new Response(null, { status: 404 });

  const params = req.nextUrl.searchParams;
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  const state = params.get("state");
  if (!expected || !state || !sameState(state, expected)) return back("error");
  if (params.get("error") === "access_denied") return back("denied");

  const code = params.get("code");
  const consentAt = new Date(req.cookies.get(CONSENT_COOKIE)?.value ?? "");
  if (!code || Number.isNaN(consentAt.getTime())) return back("error");

  let tokens: WhoopTokenSet;
  let whoopUserId: string;
  try {
    tokens = await exchangeCode(code);
    whoopUserId = await fetchProfileUserId(tokens.accessToken);
  } catch {
    // WhoopReauthError (код отклонён) и WhoopUnavailableError — одинаково «не удалось»
    return back("error");
  }

  const owner = await db.whoopConnection.findUnique({ where: { whoopUserId }, select: { userId: true } });
  if (owner && owner.userId !== user.id) return back("taken");

  const key = env.WHOOP_TOKEN_KEY!;
  const data = {
    whoopUserId,
    accessToken: encryptToken(tokens.accessToken, key),
    refreshToken: encryptToken(tokens.refreshToken, key),
    expiresAt: tokens.expiresAt,
    consentAt,
    needsReauth: false,
  };
  // Переподключили другой аккаунт WHOOP — активности прежнего не оставляем
  const prev = await db.whoopConnection.findUnique({ where: { userId: user.id }, select: { whoopUserId: true } });
  try {
    await db.$transaction([
      ...(prev && prev.whoopUserId !== whoopUserId ? [db.whoopWorkout.deleteMany({ where: { userId: user.id } })] : []),
      db.whoopConnection.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
    ]);
  } catch (e) {
    // Тот же аккаунт WHOOP одновременно подключал другой пользователь — уникальность whoopUserId
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return back("taken");
    throw e;
  }

  const userId = user.id;
  after(async () => {
    const now = new Date();
    try {
      await syncRange(userId, new Date(now.getTime() - WHOOP_HISTORY_MS), now);
      await db.whoopConnection.updateMany({ where: { userId }, data: { lastSyncAt: new Date() } });
    } catch (e) {
      await reportError({
        source: "SERVER",
        message: `whoop history: ${safeErrorLabel(e)}`,
        stack: null,
        path: "/api/whoop/callback",
        version: process.env.APP_VERSION ?? null,
        userAgent: null,
        userId,
      });
    }
  });
  return back("connected");
}
