import { NextResponse, type NextRequest } from "next/server";
import { clearAuthCookies } from "@/lib/auth/cookies";

/**
 * Сюда DAL отправляет, когда JWT ещё валиден по подписи, но сессия отозвана
 * (logout на другом устройстве, сброс пароля, кража refresh). Server Component
 * не может удалить cookie, а без этого proxy и DAL гоняли бы /login ⇄ /dashboard.
 */
export function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", req.nextUrl));
  clearAuthCookies(response.cookies);
  return response;
}
