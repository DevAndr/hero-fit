import type { RecordType } from "@/generated/prisma/enums";
import { STREAK_WEEK_STEP, STREAK_WEEK_THRESHOLDS } from "@/lib/progress/weekly-streak";

/** Строка ленты из БД: завершённая тренировка + сводка завершения (meta события WORKOUT_COMPLETED). */
export type FeedRow = {
  id: string;
  userId: string;
  nickname: string | null;
  hideWeights: boolean;
  name: string;
  finishedAt: Date;
  durationSec: number | null;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  exercises: { name: string; top: number | null }[] | null;
  meta: {
    records?: { exerciseName: string; type: RecordType; value: number }[];
    achievements?: { code: string; title: string }[];
    levelBefore?: number;
    levelAfter?: number;
    streak?: number;
    streakExtended?: boolean;
    weekCount?: number;
  } | null;
  kudos: number;
  byMe: boolean;
  kudosNames: string[] | null;
};

/** То, что уходит в браузер. Скрытые веса вырезаются на сервере — клиент их не получает. */
export type FeedEntry = {
  id: string;
  nickname: string;
  me: boolean;
  name: string;
  finishedAt: string;
  durationSec: number;
  /** null — автор скрывает веса. */
  volume: number | null;
  sets: number;
  reps: number;
  exercises: { name: string; top: number | null }[];
  moreExercises: number;
  records: { exerciseName: string; type: RecordType; value: number | null }[];
  achievements: string[];
  levelUp: number | null;
  streakMilestone: number | null;
  kudos: { count: number; byMe: boolean; names: string[] };
};

export const FEED_EXERCISES = 3;
/** Ачивки за ежедневный вход — шум для ленты. */
const QUIET_ACHIEVEMENTS = /^login:/;
const WEIGHT_RECORDS: RecordType[] = ["ONE_RM", "MAX_WEIGHT"];

/** Серия (в неделях) попала на памятный порог (2, 4, 8, 12…) именно этой тренировкой. */
export function streakMilestone(meta: FeedRow["meta"]) {
  // Без weekCount — старая (дневная) серия: её числа — не недели
  if (!meta?.streakExtended || !meta.streak || meta.weekCount === undefined) return null;
  const { streak } = meta;
  const last = STREAK_WEEK_THRESHOLDS.at(-1)!;
  return STREAK_WEEK_THRESHOLDS.includes(streak) || (streak > last && (streak - last) % STREAK_WEEK_STEP === 0) ? streak : null;
}

export function toFeedEntry(row: FeedRow, viewerId: string): FeedEntry {
  const me = row.userId === viewerId;
  const hide = row.hideWeights && !me;
  const exercises = row.exercises ?? [];
  const meta = row.meta ?? {};
  return {
    id: row.id,
    nickname: row.nickname ?? "—",
    me,
    name: row.name,
    finishedAt: row.finishedAt.toISOString(),
    durationSec: row.durationSec ?? 0,
    volume: hide ? null : row.totalVolume,
    sets: row.totalSets,
    reps: row.totalReps,
    exercises: exercises.slice(0, FEED_EXERCISES).map((e) => ({ name: e.name, top: hide || !e.top ? null : e.top })),
    moreExercises: Math.max(0, exercises.length - FEED_EXERCISES),
    records: (meta.records ?? []).map((r) => ({
      exerciseName: r.exerciseName,
      type: r.type,
      value: hide && WEIGHT_RECORDS.includes(r.type) ? null : r.value,
    })),
    achievements: (meta.achievements ?? []).filter((a) => !QUIET_ACHIEVEMENTS.test(a.code)).map((a) => a.title),
    levelUp: meta.levelAfter && meta.levelBefore && meta.levelAfter > meta.levelBefore ? meta.levelAfter : null,
    streakMilestone: streakMilestone(row.meta),
    kudos: { count: row.kudos, byMe: row.byMe, names: row.kudosNames ?? [] },
  };
}

/** «Вы, Маша и ещё 2» — кто поддержал тренировку. */
export function kudosLabel({ count, byMe, names }: FeedEntry["kudos"]) {
  if (count === 0) return "";
  const shown = [...(byMe ? ["Вы"] : []), ...names].slice(0, 2);
  const rest = count - shown.length;
  if (rest <= 0) return shown.join(" и ");
  return `${shown.join(", ")} и ещё ${rest}`;
}

/** Курсор постраничной загрузки: время завершения + id (одинаковое время не теряет записи). */
export function encodeCursor(entry: { finishedAt: string; id: string }) {
  return `${entry.finishedAt}|${entry.id}`;
}

export function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) return null;
  const [at, id] = cursor.split("|");
  const date = new Date(at);
  return id && !Number.isNaN(date.getTime()) ? { at: date, id } : null;
}
