import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { COACH_ACTIVE_CLIENT_WORKOUTS, EMPTY_COACH_STATS, type CoachAchievementStats } from "@/lib/achievements/definitions";

type Client = Prisma.TransactionClient;

/**
 * Счётчики ачивок тренера — из истории. Окно связи — каждая строка CoachLink тренера: [createdAt, endedAt ?? now).
 * Событие клиента засчитывается, если попало в окно; окна одного клиента не пересекаются (одна активная связь),
 * поэтому ушёл и вернулся — два окна, без двойного счёта.
 */
export async function coachStats(client: Client, coachId: string, isCoach: boolean): Promise<CoachAchievementStats> {
  if (!isCoach) {
    // Не тренер и никогда им не был — без лишнего SQL
    const [link, comment] = await Promise.all([
      client.coachLink.findFirst({ where: { coachId }, select: { id: true } }),
      client.coachComment.findFirst({ where: { coachId }, select: { id: true } }),
    ]);
    if (!link && !comment) return EMPTY_COACH_STATS;
  }
  const [row] = await client.$queryRaw<CoachAchievementStats[]>`
    WITH win AS (
      SELECT "clientId", "createdAt" AS s, COALESCE("endedAt", now()) AS e FROM "CoachLink" WHERE "coachId" = ${coachId}
    ),
    done AS (
      SELECT w."userId", w."templateId"
      FROM "Workout" w JOIN win ON w."userId" = win."clientId" AND w."finishedAt" >= win.s AND w."finishedAt" < win.e
      WHERE w.status = 'COMPLETED'
    ),
    xp AS (
      SELECT x.reason, x.meta
      FROM "XpEvent" x JOIN win ON x."userId" = win."clientId" AND x."createdAt" >= win.s AND x."createdAt" < win.e
      WHERE x.reason IN ('PERSONAL_RECORD', 'WORKOUT_COMPLETED')
    )
    SELECT
      (SELECT COUNT(*) FROM (SELECT 1 FROM done GROUP BY "userId" HAVING COUNT(*) >= ${COACH_ACTIVE_CLIENT_WORKOUTS}) c)::int AS clients,
      (SELECT COUNT(*) FROM "CoachComment" WHERE "coachId" = ${coachId})::int AS comments,
      (SELECT COUNT(*) FROM done JOIN "WorkoutTemplate" t ON t.id = done."templateId" AND t."userId" = ${coachId})::int AS workouts,
      (SELECT COALESCE(SUM(jsonb_array_length(meta->'records')), 0) FROM xp
        WHERE reason = 'PERSONAL_RECORD' AND jsonb_typeof(meta->'records') = 'array')::int AS prs,
      (SELECT COUNT(*) FROM xp,
          jsonb_array_elements(CASE WHEN jsonb_typeof(xp.meta->'progression') = 'array' THEN xp.meta->'progression' END) p
        WHERE xp.reason = 'WORKOUT_COMPLETED' AND xp.meta->>'progressionSource' IS DISTINCT FROM 'own' AND p->>'kind' = 'up')::int AS progressions,
      (SELECT COUNT(*) FROM "Goal" g JOIN win ON g."userId" = win."clientId" AND g."achievedAt" >= win.s AND g."achievedAt" < win.e
        WHERE g.status = 'ACHIEVED')::int AS goals,
      EXISTS (SELECT 1 FROM "CoachProfile" WHERE "userId" = ${coachId} AND "publishedAt" IS NOT NULL) AS "pagePublished"
  `;
  return row;
}
