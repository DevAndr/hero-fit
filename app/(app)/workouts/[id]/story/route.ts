import { queueGoal } from "@/lib/analytics/queue";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { storyData } from "@/lib/share/story";
import { storyImage } from "@/lib/share/story-image";
import type { FinishMeta } from "@/lib/workouts/finish";
import { getWorkoutSummary } from "@/lib/workouts/queries";

/** Картинка 1080×1920 «для сторис» по своей завершённой тренировке (чужая или незавершённая — 404). */
export async function GET(_req: Request, ctx: RouteContext<"/workouts/[id]/story">) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  const [workout, prefs] = await Promise.all([
    getWorkoutSummary(user.id, id),
    db.user.findUnique({ where: { id: user.id }, select: { nickname: true, hideWeights: true } }),
  ]);
  if (!workout?.finishedAt) return new Response(null, { status: 404 });

  const data = storyData({
    workoutName: workout.name,
    finishedAt: workout.finishedAt,
    durationSec: workout.durationSec ?? 0,
    totalVolume: workout.totalVolume,
    totalSets: workout.totalSets,
    xpEarned: workout.xpEarned,
    userXp: user.xp,
    meta: workout.xpEvents[0]?.meta as FinishMeta | undefined,
    nickname: prefs?.nickname ?? null,
    hideWeights: prefs?.hideWeights ?? false,
    timeZone: safeTimeZone(user.timeZone),
  });
  await queueGoal("share_story");
  return storyImage(data);
}
