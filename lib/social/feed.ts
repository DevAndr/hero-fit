import type { RecordType } from "@/generated/prisma/enums";
import { bossName } from "@/lib/boss/bosses";
import { raidBossName } from "@/lib/raid/rules";
import { STREAK_WEEK_STEP, STREAK_WEEK_THRESHOLDS } from "@/lib/progress/weekly-streak";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { titleLabel } from "@/lib/titles/catalog";
import { isFinishMeta } from "@/lib/recap/meta";
import type { FinishGoals } from "@/lib/goals/rules";
import type { FinishClubTask } from "@/lib/club/tasks-apply";

/** Строка ленты из БД: завершённая тренировка + сводка завершения (meta события WORKOUT_COMPLETED / STRETCH_SESSION). */
export type FeedRow = {
  id: string;
  userId: string;
  nickname: string | null;
  titleCode: string | null;
  avatarCode?: string | null;
  frameCode?: string | null;
  nickColorCode?: string | null;
  hideWeights: boolean;
  name: string;
  finishedAt: Date;
  durationSec: number | null;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  exercises: { name: string; top: number | null }[] | null;
  meta: {
    records?: { exerciseId: string; exerciseName: string; type: RecordType; value: number }[];
    achievements?: { code: string; title: string }[];
    levelBefore?: number;
    levelAfter?: number;
    streak?: number;
    streakExtended?: boolean;
    weekCount?: number;
    boss?: { code: string; defeated: boolean };
    raid?: { raidId: string; code: string; defeated: boolean };
    goals?: FinishGoals;
    clubTasks?: FinishClubTask[];
    stretchOnly?: true;
    stretchSec?: number;
  } | null;
  /** Название гильдии рейда из meta.raid (на момент показа); рейд или гильдия удалены — null. */
  raidGuild?: string | null;
  kudos: number;
  byMe: boolean;
  kudosNames: string[] | null;
  /** Респекты 🏆 по упражнениям с рекордом этой тренировки (только те, где они есть); не загружены — null. */
  respects: { exerciseId: string; count: number; byMe: boolean; names: string[] | null }[] | null;
};

export type RespectInfo = { count: number; byMe: boolean; names: string[] };

/** Рекорды одного упражнения тренировки и респекты на них. */
export type FeedRecordGroup = {
  exerciseId: string;
  exerciseName: string;
  records: { type: RecordType; value: number | null }[];
  respect: RespectInfo;
};

/** То, что уходит в браузер. Скрытые веса вырезаются на сервере — клиент их не получает. */
export type FeedEntry = {
  id: string;
  nickname: string;
  /** Титул автора (уже название). */
  title: string | null;
  cosmetics?: Cosmetics;
  me: boolean;
  name: string;
  finishedAt: string;
  durationSec: number;
  /** Сессия растяжки: минуты удержания (не меньше 1) — карточка «Растяжка · N мин» без объёма и повторов; иначе null. */
  stretchMin: number | null;
  /** null — автор скрывает веса. */
  volume: number | null;
  sets: number;
  reps: number;
  exercises: { name: string; top: number | null }[];
  moreExercises: number;
  respects: FeedRecordGroup[];
  achievements: string[];
  levelUp: number | null;
  streakMilestone: number | null;
  /** Имя босса недели, повергнутого этой тренировкой. */
  bossDefeated: string | null;
  /** Рейд-босс, повергнутый этой тренировкой, и гильдия. */
  raidDefeated: { boss: string; guild: string } | null;
  /** Выполненные этой тренировкой цели (без веса тела; при скрытых весах — без килограммов). */
  goals: string[];
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

export function toFeedEntry(row: FeedRow, viewerId: string, cosmetics?: Cosmetics): FeedEntry {
  const me = row.userId === viewerId;
  const hide = row.hideWeights && !me;
  const exercises = row.exercises ?? [];
  const meta = row.meta ?? {};
  return {
    id: row.id,
    nickname: row.nickname ?? "—",
    title: titleLabel(row.titleCode),
    cosmetics,
    me,
    name: row.name,
    finishedAt: row.finishedAt.toISOString(),
    durationSec: row.durationSec ?? 0,
    stretchMin: meta.stretchOnly ? Math.max(1, Math.floor((meta.stretchSec ?? 0) / 60)) : null,
    volume: hide || meta.stretchOnly ? null : row.totalVolume,
    sets: row.totalSets,
    reps: row.totalReps,
    exercises: exercises.slice(0, FEED_EXERCISES).map((e) => ({ name: e.name, top: hide || !e.top ? null : e.top })),
    moreExercises: Math.max(0, exercises.length - FEED_EXERCISES),
    respects: groupRecords(
      (meta.records ?? []).map((r) => ({
        exerciseId: r.exerciseId,
        exerciseName: r.exerciseName,
        type: r.type,
        value: hide && WEIGHT_RECORDS.includes(r.type) ? null : r.value,
      })),
      row.respects,
    ),
    achievements: (meta.achievements ?? []).filter((a) => !QUIET_ACHIEVEMENTS.test(a.code)).map((a) => a.title),
    levelUp: meta.levelAfter && meta.levelBefore && meta.levelAfter > meta.levelBefore ? meta.levelAfter : null,
    streakMilestone: streakMilestone(row.meta),
    bossDefeated: meta.boss?.defeated ? bossName(meta.boss.code) : null,
    raidDefeated: meta.raid?.defeated && row.raidGuild ? { boss: raidBossName(meta.raid.code), guild: row.raidGuild } : null,
    goals: (meta.goals?.achieved ?? []).filter((g) => g.type !== "BODY_WEIGHT").map((g) => (hide && g.feedTitle) || g.title),
    kudos: { count: row.kudos, byMe: row.byMe, names: row.kudosNames ?? [] },
  };
}

/** Группирует рекорды по упражнению (порядок первого появления) и подкладывает респекты. */
export function groupRecords(
  records: { exerciseId: string; exerciseName: string; type: RecordType; value: number | null }[],
  respects: FeedRow["respects"],
): FeedRecordGroup[] {
  const groups = new Map<string, FeedRecordGroup>();
  for (const r of records) {
    let group = groups.get(r.exerciseId);
    if (!group) {
      const found = respects?.find((x) => x.exerciseId === r.exerciseId);
      group = {
        exerciseId: r.exerciseId,
        exerciseName: r.exerciseName,
        records: [],
        respect: found ? { count: found.count, byMe: found.byMe, names: found.names ?? [] } : { count: 0, byMe: false, names: [] },
      };
      groups.set(r.exerciseId, group);
    }
    group.records.push({ type: r.type, value: r.value });
  }
  return [...groups.values()];
}

/** «Респект: Вы, Маша и ещё 1» — подсказка: кто выразил респект за рекорд. */
export function respectLabel(r: RespectInfo) {
  const names = kudosLabel(r);
  return names ? `Респект: ${names}` : "";
}

/** Текст уведомления владельцу: ники — последние сверху, показываем два. */
export function respectNotice(exerciseName: string, names: string[]) {
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length - 2;
  return { title: `🏆 Респект за рекорд: ${exerciseName}`, body: rest > 0 ? `${shown} и ещё ${rest}` : shown };
}

/** Название упражнения, если в сводке завершения есть рекорд с этим exerciseId (защита от подделанного id). */
export function recordExercise(meta: unknown, exerciseId: string): string | null {
  if (!isFinishMeta(meta)) return null;
  return meta.records.find((r) => r.exerciseId === exerciseId)?.exerciseName ?? null;
}

/** «Вы, Маша и ещё 2» — кто поддержал тренировку. */
export function kudosLabel({ count, byMe, names }: { count: number; byMe: boolean; names: string[] }) {
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

/** «подходов: 15 · повторов: 120»; без повторов (кардио и на время) — только подходы. */
export function countsText(e: { sets: number; reps: number }) {
  return e.reps > 0 ? `подходов: ${e.sets} · повторов: ${e.reps}` : `подходов: ${e.sets}`;
}
