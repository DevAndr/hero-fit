import "server-only";
import { NotificationType, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { SITE_LOGIN_HINT, SITE_LOGIN_HINT_DAYS, siteLoginHintDue } from "@/lib/telegram/site-login-hint";

const DAY_MS = 86_400_000;

/** Карточка на дашборде: аккаунт из Mini App без пароля, подсказку не скрывали, пора (siteLoginHintDue). */
export async function showSiteLoginHint(userId: string, now: Date): Promise<boolean> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, telegramId: true, createdAt: true, siteLoginHintHiddenAt: true },
  });
  if (!u || u.siteLoginHintHiddenAt || u.passwordHash || !u.telegramId) return false;
  const completed = await db.workout.count({ where: { userId, status: WorkoutStatus.COMPLETED } });
  return siteLoginHintDue({ hasPassword: false, telegram: true, createdAt: u.createdAt, completed }, now);
}

/** Шаг тика: одна запись в ленте (без push) тем, кому пора и кто ещё не скрыл карточку. */
export async function processSiteLoginHints(now: Date): Promise<number> {
  const users = await db.user.findMany({
    where: {
      passwordHash: null,
      telegramId: { not: null },
      siteLoginHintAt: null,
      siteLoginHintHiddenAt: null,
      OR: [{ createdAt: { lte: new Date(now.getTime() - SITE_LOGIN_HINT_DAYS * DAY_MS) } }, { workouts: { some: { status: WorkoutStatus.COMPLETED } } }],
    },
    select: { id: true },
    take: 500,
  });
  let sent = 0;
  for (const { id } of users) {
    sent += await db.$transaction(async (tx) => {
      // Условие по siteLoginHintAt — параллельный тик не задвоит запись
      const { count } = await tx.user.updateMany({ where: { id, siteLoginHintAt: null }, data: { siteLoginHintAt: now } });
      if (count === 0) return 0;
      await notify(tx, id, { type: NotificationType.SYSTEM, ...SITE_LOGIN_HINT }, { push: false });
      return 1;
    });
  }
  return sent;
}
