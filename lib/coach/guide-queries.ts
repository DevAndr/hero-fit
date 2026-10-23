import "server-only";
import { db } from "@/lib/db";
import type { CoachGuideFacts } from "@/lib/coach/guide";

/** Факты для «Первых шагов» (лёгкие count/exists по индексам тренера) и скрыл ли их тренер. */
export async function getCoachGuideFacts(coachId: string, clientId: string | null): Promise<{ facts: CoachGuideFacts; hidden: boolean }> {
  const [user, profile, everClients, templates, series, entry, comment, programs] = await Promise.all([
    db.user.findUnique({ where: { id: coachId }, select: { coachGuideHiddenAt: true } }),
    db.coachProfile.findUnique({ where: { userId: coachId }, select: { publishedAt: true } }),
    db.coachLink.count({ where: { coachId } }),
    db.workoutTemplate.count({ where: { userId: coachId } }),
    db.planSeries.findFirst({ where: { coachId }, select: { id: true } }),
    db.planEntry.findFirst({ where: { coachId }, select: { id: true } }),
    db.coachComment.findFirst({ where: { coachId }, select: { id: true } }),
    db.coachProgram.count({ where: { coachId } }),
  ]);
  const facts = {
    published: Boolean(profile?.publishedAt),
    everClients,
    templates,
    assigned: Boolean(series || entry),
    commented: Boolean(comment),
    programs,
    clientId,
  };
  return { facts, hidden: Boolean(user?.coachGuideHiddenAt) };
}
