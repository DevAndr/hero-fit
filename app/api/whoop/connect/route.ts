import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { oauthUrl, redirectUri, WHOOP_SCOPES } from "@/lib/whoop/config";
import { CONSENT_COOKIE, oauthCookieOptions, STATE_COOKIE } from "@/lib/whoop/oauth";
import { whoopAvailable } from "@/lib/whoop/queries";

/**
 * Начало подключения WHOOP — по ссылке «Продолжить» из диалога согласия (`?consent=1`).
 * `state` и время согласия — в httpOnly cookie на 10 минут (только для /api/whoop), затем — на авторизацию WHOOP.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!(await whoopAvailable(user.id))) return new Response(null, { status: 404 });
  if (req.nextUrl.searchParams.get("consent") !== "1") return new Response(null, { status: 400 });

  const state = randomBytes(16).toString("hex");
  const url = new URL(oauthUrl("auth"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.WHOOP_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", WHOOP_SCOPES);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, oauthCookieOptions());
  res.cookies.set(CONSENT_COOKIE, new Date().toISOString(), oauthCookieOptions());
  return res;
}
