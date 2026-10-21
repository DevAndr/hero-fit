import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { dayKey, localHour, nextLoginStreak, safeTimeZone } from "@/lib/daily-login";
import { RETURN_WINDOW_MS } from "@/lib/campaigns/rules";
import { isEnabled } from "@/lib/flags/server";

export const TIMEZONE_COOKIE = "hf_tz";

/**
 * Засчитывает ежедневный вход (календарный день в поясе пользователя) и выдаёт ачивки за серию.
 * Вызывается из layout приватной части: на каждую загрузку — одно сравнение дат, запись — раз в день.
 * Возвращает сегодняшний день и серию входов с его учётом (для ежедневного сундука).
 */
export async function recordDailyVisit(
  user: CurrentUser,
  timeZone: string | undefined,
): Promise<{ today: string; loginStreak: number }> {
  const tz = safeTimeZone(timeZone);
  // Пояс нужен ачивкам за время суток и недели (считаются и вне запроса — при завершении тренировки).
  if (timeZone && tz !== user.timeZone) {
    await db.user.update({ where: { id: user.id }, data: { timeZone: tz } });
  }
  await recordVisitHour(user, tz);
  const today = dayKey(new Date(), tz);
  const lastDay = user.lastLoginDay?.toISOString().slice(0, 10) ?? null;
  const streak = nextLoginStreak(lastDay, today, user.loginStreak);
  if (streak === null) return { today, loginStreak: user.loginStreak };

  await db.$transaction(async (tx) => {
    // Условие по старому значению: два параллельных запроса не увеличат серию дважды.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, lastLoginDay: user.lastLoginDay },
      data: { lastLoginDay: new Date(`${today}T00:00:00Z`), loginStreak: streak },
    });
    if (count === 1) {
      // Журнал заходов — для метрик активности в админке
      await tx.userVisit.createMany({ data: [{ userId: user.id, day: new Date(`${today}T00:00:00Z`) }], skipDuplicates: true });
      await evaluateAchievements(tx, user.id);
      // Рассылки «вернись в зал»: засчитанный заход в течение 48 ч после отправки — игрок вернулся
      if (await isEnabled("campaigns", user.id)) {
        const now = new Date();
        await tx.campaignSend.updateMany({
          where: { userId: user.id, returnedAt: null, sentAt: { gte: new Date(now.getTime() - RETURN_WINDOW_MS) } },
          data: { returnedAt: now },
        });
      }
    }
  });
  return { today, loginStreak: streak };
}

/**
 * Журнал часов захода для графика «по времени суток» в админке. Сравнение с User.lastVisitHour — в памяти,
 * запись — не чаще раза в час; условие по старому значению: из параллельных загрузок пишет одна.
 */
async function recordVisitHour(user: CurrentUser, tz: string) {
  const now = localHour(new Date(), tz);
  if (user.lastVisitHour === now.key) return;
  await db.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: user.id, lastVisitHour: user.lastVisitHour },
      data: { lastVisitHour: now.key },
    });
    if (count === 1) {
      await tx.userVisitHour.createMany({
        data: [{ userId: user.id, day: new Date(`${now.day}T00:00:00Z`), hour: now.hour }],
        skipDuplicates: true,
      });
    }
  });
}
