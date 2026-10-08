import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";

/** Данные пользователя, которые можно отдавать в UI (без хеша пароля). */
export type CurrentUser = {
  id: string;
  sessionId: string;
  login: string;
  email: string;
  name: string | null;
  xp: number;
  level: number;
  currentStreak: number;
  loginStreak: number;
  lastLoginDay: Date | null;
  chestOpenedDay: Date | null;
  lastStreakWeek: string | null;
  streakFreezes: number;
  weekWorkouts: number;
  weekWorkoutsKey: string | null;
  freezeGrantedAt: Date | null;
  bodyWeight: number | null;
  timeZone: string;
};

/**
 * Проверка сессии по БД, а не только по подписи JWT: отозванная при logout
 * сессия (blacklist) перестаёт работать сразу, не дожидаясь истечения access-токена.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const session = await db.session.findUnique({
    where: { id: payload.sessionId },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          login: true,
          email: true,
          name: true,
          xp: true,
          level: true,
          currentStreak: true,
          loginStreak: true,
          lastLoginDay: true,
          chestOpenedDay: true,
          lastStreakWeek: true,
          streakFreezes: true,
          weekWorkouts: true,
          weekWorkoutsKey: true,
          freezeGrantedAt: true,
          bodyWeight: true,
          timeZone: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.id !== payload.userId) return null;

  return { ...session.user, sessionId: payload.sessionId };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;
  // Есть cookie, но сессия мертва — сначала чистим cookie, иначе proxy вернёт обратно.
  const hasToken = (await cookies()).has(ACCESS_COOKIE);
  redirect(hasToken ? "/api/auth/signout" : "/login");
}
