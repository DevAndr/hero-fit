import { queueGoal } from "@/lib/analytics/queue";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { recordCards } from "@/lib/share/record-card";
import { recordCardImage } from "@/lib/share/record-card-image";
import type { FinishMeta } from "@/lib/workouts/finish";
import { getWorkoutSummary } from "@/lib/workouts/queries";

/** Карточка рекорда 1080×1920: n-е упражнение с новым рекордом своей завершённой тренировки (иначе 404). */
export async function GET(_req: Request, ctx: RouteContext<"/workouts/[id]/records/[n]/card">) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id, n } = await ctx.params;
  if (!/^\d{1,3}$/.test(n)) return new Response(null, { status: 404 });
  const [workout, prefs] = await Promise.all([
    getWorkoutSummary(user.id, id),
    db.user.findUnique({ where: { id: user.id }, select: { nickname: true, hideWeights: true } }),
  ]);
  if (!workout?.finishedAt) return new Response(null, { status: 404 });

  const card = recordCards({
    meta: workout.xpEvents[0]?.meta as FinishMeta | undefined,
    xpEarned: workout.xpEarned,
    userXp: user.xp,
    hideWeights: prefs?.hideWeights ?? false,
    finishedAt: workout.finishedAt,
    timeZone: safeTimeZone(user.timeZone),
    nickname: prefs?.nickname ?? null,
  })[Number(n)];
  if (!card) return new Response(null, { status: 404 });
  await queueGoal("share_record");
  return recordCardImage(card);
}
