"use server";

import { XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { getBossView, getOrCreateBossWeek, markBossDefeated, weekDamage } from "@/lib/boss/queries";
import { queueGoal } from "@/lib/analytics/queue";
import { safeTimeZone } from "@/lib/daily-login";
import { levelProgress } from "@/lib/progress/level";
import { weekKey } from "@/lib/progress/weekly-streak";
import { getOnboardingPrograms } from "@/lib/onboarding/queries";
import { FIRST_STRIKE_DAMAGE, FIRST_STRIKE_XP, parseStrike } from "@/lib/first-strike/rules";
import { completedWorkouts } from "@/lib/first-strike/queries";
import type { StrikeResult } from "@/lib/first-strike/types";

/**
 * «Первый удар»: один подход без инвентаря до первой тренировки — урон боссу недели, XP и ачивка.
 * Повторный запрос (вторая вкладка) наград не получает: условие по firstStrikeAt.
 * revalidatePath не вызывается — экран результата живёт в диалоге, страницу обновляет клиент при закрытии.
 */
export async function firstStrikeAction(input: { exercise: string; value: number }): Promise<StrikeResult> {
  const user = await requireUser();
  if (!(await isEnabled("first_strike", user.id))) return { ok: false, error: "Недоступно" };
  const parsed = parseStrike(input?.exercise, input?.value);
  if (!parsed.ok) return parsed;

  const tz = safeTimeZone(user.timeZone);
  const now = new Date();
  const result = await db.$transaction(
    async (tx) => {
      if ((await completedWorkouts(tx, user.id)) > 0) {
        return { ok: false as const, error: "Первый удар — только до первой тренировки" };
      }
      const { count } = await tx.user.updateMany({ where: { id: user.id, firstStrikeAt: null }, data: { firstStrikeAt: now } });
      if (count === 0) return { ok: false as const, error: "Первый удар уже нанесён" };

      await tx.xpEvent.create({
        data: { userId: user.id, amount: FIRST_STRIKE_XP, reason: XpReason.FIRST_STRIKE, meta: { exercise: parsed.exercise, value: parsed.value } },
      });
      const { xp } = await tx.user.update({ where: { id: user.id }, data: { xp: { increment: FIRST_STRIKE_XP } }, select: { xp: true } });
      await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });

      // Босс текущей недели: урон недели уже с ударом (weekDamage видит firstStrikeAt в этой транзакции)
      const week = weekKey(now, tz);
      const bossWeek = await getOrCreateBossWeek(tx, user.id, week, tz);
      const { damage } = await weekDamage(tx, user.id, week, tz);
      if (damage >= bossWeek.hp) await markBossDefeated(tx, bossWeek.id, now);

      const unlocked = await evaluateAchievements(tx, user.id);
      return {
        ok: true as const,
        xpBefore: xp - FIRST_STRIKE_XP,
        xpAfter: xp + unlocked.xp,
        achievement: unlocked.achievements.find((a) => a.code === "firststrike:1") ?? null,
      };
    },
    { timeout: 15_000 },
  );
  if (!result.ok) return result;

  await queueGoal("first_strike");
  const [boss, draft] = await Promise.all([
    getBossView(user.id, tz, now),
    db.workout.findFirst({ where: { userId: user.id, status: { in: ["PLANNED", "IN_PROGRESS"] } }, select: { id: true } }),
  ]);
  const hasDraft = draft !== null;
  return {
    ...result,
    xp: FIRST_STRIKE_XP,
    damage: FIRST_STRIKE_DAMAGE,
    boss,
    hasDraft,
    programs: hasDraft ? [] : await getOnboardingPrograms(),
  };
}
