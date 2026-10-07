import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { dayKey, nextLoginStreak, safeTimeZone } from "@/lib/daily-login";

export const TIMEZONE_COOKIE = "hf_tz";

/**
 * Засчитывает ежедневный вход (календарный день в поясе пользователя) и выдаёт ачивки за серию.
 * Вызывается из layout приватной части: на каждую загрузку — одно сравнение дат, запись — раз в день.
 */
export async function recordDailyVisit(user: CurrentUser, timeZone: string | undefined) {
  const tz = safeTimeZone(timeZone);
  // Пояс нужен ачивкам за время суток и недели (считаются и вне запроса — при завершении тренировки).
  if (timeZone && tz !== user.timeZone) {
    await db.user.update({ where: { id: user.id }, data: { timeZone: tz } });
  }
  const today = dayKey(new Date(), tz);
  const lastDay = user.lastLoginDay?.toISOString().slice(0, 10) ?? null;
  const streak = nextLoginStreak(lastDay, today, user.loginStreak);
  if (streak === null) return;

  await db.$transaction(async (tx) => {
    // Условие по старому значению: два параллельных запроса не увеличат серию дважды.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, lastLoginDay: user.lastLoginDay },
      data: { lastLoginDay: new Date(`${today}T00:00:00Z`), loginStreak: streak },
    });
    if (count === 1) await evaluateAchievements(tx, user.id);
  });
}
