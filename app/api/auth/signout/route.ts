import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { sessionEmbedded } from "@/lib/auth/session";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/tokens";

/**
 * Сюда DAL отправляет, когда JWT ещё валиден по подписи, но сессия отозвана
 * (logout на другом устройстве, сброс пароля, кража refresh). Server Component
 * не может удалить cookie, а без этого proxy и DAL гоняли бы /login ⇄ /dashboard.
 * Сессия Mini App — cookies удаляются с атрибутами фрейма (Partitioned).
 */
export async function GET(req: NextRequest) {
  const access = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
  const refresh = access ? null : await verifyRefreshToken(req.cookies.get(REFRESH_COOKIE)?.value);
  const response = NextResponse.redirect(new URL("/login", req.nextUrl));
  clearAuthCookies(response.cookies, { embedded: await sessionEmbedded(access?.sessionId ?? refresh?.sessionId) });
  return response;
}
