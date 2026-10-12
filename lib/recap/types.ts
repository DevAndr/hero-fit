import type { StrengthTrend, WeekBest } from "@/lib/stats/strength";
import type { MuscleGroup, RecordType } from "@/generated/prisma/enums";
import type { FinishMeta } from "@/lib/workouts/finish";

export const RECAP_VERSION = 1;
/** Тик создаёт итоги и шлёт push не раньше понедельника RECAP_HOUR:00 по местному времени. */
export const RECAP_HOUR = 9;
/** На лету итоги создаются только для недель не старше стольких недель назад. */
export const RECAP_LAZY_WEEKS = 8;
/** Пользователей на создание итогов за один тик. */
export const RECAP_BATCH = 50;

export type RecapTotals = { workouts: number; minutes: number; volume: number; sets: number };
export type RecapLeagueRow = { nickname: string; xp: number; place: number; me: boolean };

/** Снимок итогов недели (WeeklyRecap.data). Блок без данных отсутствует. */
export type RecapData = {
  version: typeof RECAP_VERSION;
  week: string;
  league?: { place: number; of: number; xp: number; rows: RecapLeagueRow[] } | { percentile: number; xp: number };
  totals: RecapTotals & { prev: RecapTotals | null };
  bestSet?: { exerciseId: string; exerciseName: string; weight: number; reps: number; e1rm: number | null; isRecord: boolean };
  streak?: { weekCount: number; target: number; credited: boolean; streak: number; frozen: boolean };
  records?: {
    prs: { exerciseId: string; exerciseName: string; type: RecordType; value: number }[];
    achievements: { code: string; title: string }[];
    level: { from: number; to: number } | null;
  };
  muscles?: { groups: { group: MuscleGroup; sets: number }[]; forgotten: MuscleGroup | null };
  plan?: { done: number; planned: number };
  /** Босс недели (lib/boss): урон за неделю, победа — время. */
  boss?: RecapBoss;
  /** Рейд гильдии недели (lib/raid), если игрок в нём бил. */
  raid?: RecapRaid;
  /** Тренд силы: 4 недели по неделю итогов против 4 перед ними (lib/stats/strength). */
  strength?: StrengthTrend;
};

/** Рейд недели: урон гильдии, мой вклад и место среди бивших (1 — больше всех). */
export type RecapRaid = { name: string; code: string; defeated: boolean; damage: number; hp: number; mine: number; place: number; members: number; mvp: boolean };

export type RecapBoss = { code: string; hp: number; damage: number; defeatedAt: string | null };

/** Всё, что buildRecap нужно о неделе; собирает loadRecapInput. */
export type RecapInput = {
  week: string;
  workouts: { minutes: number; volume: number; sets: number; finishedAt: Date }[];
  /** Лучшее по неделям за 8 недель по неделю итогов (lib/stats/strength-queries). */
  strengthWeeks: WeekBest[];
  prevWorkouts: { minutes: number; volume: number; sets: number }[];
  /** Выполненные рабочие подходы недели. */
  sets: { exerciseId: string; exerciseName: string; isBodyweight: boolean; weight: number; reps: number }[];
  /** null — нет друзей. */
  league: { members: { id: string; nickname: string; xp: number; workouts: number }[]; meId: string } | null;
  percentile: { value: number | null; xp: number };
  /** meta WORKOUT_COMPLETED недели по возрастанию времени. */
  finishMetas: FinishMeta[];
  coveredByFreeze: boolean;
  /** Серия (недель), живая на конец недели: сгоревшая — 0. */
  streakAtWeekEnd: number;
  achievements: { code: string; title: string }[];
  /** Подходы по основной группе: эта неделя и 5 предыдущих. */
  muscleSets: { group: MuscleGroup; week: string; sets: number }[];
  /** null — планов не было. */
  plan: { done: number; planned: number } | null;
  /** null — босса той недели не было (не открывали приложение). */
  boss?: RecapBoss | null;
  /** null — в рейдах недели игрок не бил. */
  raid?: RecapRaid | null;
};
