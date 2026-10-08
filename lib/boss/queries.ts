import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/daily-login";
import { addWeeks, weekKey } from "@/lib/progress/weekly-streak";
import { bossForWeek, bossName } from "@/lib/boss/bosses";
import { bossHp, CRIT_DAMAGE, FAILURE_BONUS, rewardXp, SET_DAMAGE } from "@/lib/boss/damage";
import { bestiary } from "@/lib/boss/bestiary";

type Client = Prisma.TransactionClient | typeof db;

/** Сколько прошлых недель смотрим, подбирая HP (берутся 4 ближние с тренировками). */
const HP_HISTORY_WEEKS = 8;
const DAY_MS = 24 * 3_600_000;

/**
 * Урон по неделям [fromWeek … toWeek] (понедельники в поясе tz): выполненные рабочие подходы завершённых
 * тренировок недели их `finishedAt` + криты — различные упражнения с побитым рекордом (`XpEvent.meta.records`).
 */
async function damageByWeek(client: Client, userId: string, tz: string, fromWeek: string, toWeek: string, excludeWorkoutId?: string) {
  const rows = await client.$queryRaw<{ week: string; sets: number; crits: number }[]>`
    WITH ws AS (
      SELECT w.id,
             to_char(date_trunc('week', (w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week
      FROM "Workout" w
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" IS NOT NULL
        AND w.id <> ${excludeWorkoutId ?? ""}
        AND (w."finishedAt" AT TIME ZONE 'UTC') >= (${fromWeek}::date)::timestamp AT TIME ZONE ${tz}
        AND (w."finishedAt" AT TIME ZONE 'UTC') < ((${toWeek}::date) + 7)::timestamp AT TIME ZONE ${tz}
    )
    SELECT ws.week,
           COALESCE(SUM((
             SELECT SUM(${SET_DAMAGE} + CASE WHEN s.rir <= 1 THEN ${FAILURE_BONUS} ELSE 0 END)
             FROM "WorkoutExercise" we JOIN "WorkoutSet" s ON s."workoutExerciseId" = we.id
             WHERE we."workoutId" = ws.id AND NOT s."isWarmup" AND s."completedAt" IS NOT NULL
           )), 0)::int AS sets,
           COALESCE(SUM((
             SELECT COUNT(DISTINCT r->>'exerciseId')
             FROM "XpEvent" x, jsonb_array_elements(COALESCE(x.meta->'records', '[]'::jsonb)) r
             WHERE x."workoutId" = ws.id AND x.reason = 'WORKOUT_COMPLETED'
           )), 0)::int AS crits
    FROM ws
    GROUP BY ws.week
  `;
  return new Map(rows.map((r) => [r.week, { damage: r.sets + r.crits * CRIT_DAMAGE, crits: r.crits }]));
}

/** Урон недели `week`; `excludeWorkoutId` — без этой тренировки (её урон досчитывают отдельно). */
export async function weekDamage(client: Client, userId: string, week: string, tz: string, excludeWorkoutId?: string) {
  const byWeek = await damageByWeek(client, userId, tz, week, week, excludeWorkoutId);
  return byWeek.get(week) ?? { damage: 0, crits: 0 };
}

/** Босс недели: создаётся при первом обращении, HP — по урону прошлых недель и больше не меняется. */
export async function getOrCreateBossWeek(client: Client, userId: string, week: string, tz: string) {
  const existing = await client.bossWeek.findUnique({ where: { userId_week: { userId, week } } });
  if (existing) return existing;
  const byWeek = await damageByWeek(client, userId, tz, addWeeks(week, -HP_HISTORY_WEEKS), addWeeks(week, -1));
  const history = Array.from({ length: HP_HISTORY_WEEKS }, (_, i) => byWeek.get(addWeeks(week, -(i + 1)))?.damage ?? 0);
  // upsert — два параллельных запроса не создадут двух боссов
  return client.bossWeek.upsert({
    where: { userId_week: { userId, week } },
    create: { userId, week, bossCode: bossForWeek(week), hp: bossHp(history) },
    update: {},
  });
}

export type BossView = {
  week: string;
  code: string;
  name: string;
  hp: number;
  damage: number;
  crits: number;
  defeatedAt: string | null;
  rewardXp: number;
  rewardOpened: boolean;
  /** Дней до конца недели, включая сегодня (вс — 1). */
  daysLeft: number;
};

/** Босс текущей недели для экранов. `excludeWorkoutId` — активная тренировка (её урон считает редактор). */
export async function getBossView(userId: string, tz: string, now = new Date(), excludeWorkoutId?: string): Promise<BossView> {
  const week = weekKey(now, tz);
  const boss = await getOrCreateBossWeek(db, userId, week, tz);
  const { damage, crits } = await weekDamage(db, userId, week, tz, excludeWorkoutId);
  const daysLeft = Math.round((Date.parse(`${addWeeks(week, 1)}T00:00:00Z`) - Date.parse(`${dayKey(now, tz)}T00:00:00Z`)) / DAY_MS);
  return {
    week,
    code: boss.bossCode,
    name: bossName(boss.bossCode),
    hp: boss.hp,
    damage,
    crits,
    defeatedAt: boss.defeatedAt?.toISOString() ?? null,
    rewardXp: rewardXp(boss.hp),
    rewardOpened: boss.rewardOpenedAt !== null,
    daysLeft,
  };
}

/** Число побед над боссами (для ачивок). */
export function bossWins(client: Client, userId: string) {
  return client.bossWeek.count({ where: { userId, defeatedAt: { not: null } } });
}

/** Сундук босса недели уже забран (или босса той недели нет). */
export async function bossRewardTaken(userId: string, week: string) {
  const boss = await db.bossWeek.findUnique({ where: { userId_week: { userId, week } }, select: { rewardOpenedAt: true } });
  return !boss || boss.rewardOpenedAt !== null;
}

/** Босс недели повержен, а сундук ещё не забран (итоги недели — место, где его можно открыть позже). */
export async function bossChestAvailable(userId: string, week: string) {
  const boss = await db.bossWeek.findUnique({ where: { userId_week: { userId, week } }, select: { defeatedAt: true, rewardOpenedAt: true } });
  return !!boss?.defeatedAt && !boss.rewardOpenedAt;
}

/** Бестиарий: все недели с боссом — победы и лучший урон по каждому боссу. */
export async function getBestiary(userId: string, tz: string, now = new Date()) {
  const week = weekKey(now, tz);
  const weeks = await db.bossWeek.findMany({ where: { userId }, select: { week: true, bossCode: true, defeatedAt: true }, orderBy: { week: "asc" } });
  const damage = weeks.length ? await damageByWeek(db, userId, tz, weeks[0].week, week) : new Map<string, { damage: number }>();
  return bestiary(
    weeks.map((w) => ({ week: w.week, code: w.bossCode, defeatedAt: w.defeatedAt, damage: damage.get(w.week)?.damage ?? 0 })),
    week,
  );
}
