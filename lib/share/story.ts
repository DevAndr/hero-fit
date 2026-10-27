/** Данные картинки «для сторис» по завершённой тренировке (чистые функции, без БД). */
import type { RecordType } from "@/generated/prisma/enums";
import { bossName } from "@/lib/boss/bosses";
import { plural } from "@/lib/format";
import { levelProgress } from "@/lib/progress/level";
import { formatRecord, isTimedRecord } from "@/lib/progress/records";
import type { FinishMeta } from "@/lib/workouts/finish";

export type StoryInput = {
  workoutName: string;
  finishedAt: Date;
  durationSec: number;
  totalVolume: number;
  totalSets: number;
  /** XP за саму тренировку и рекорды (`Workout.xpEarned`). */
  xpEarned: number;
  /** Текущий XP пользователя — если у тренировки нет события завершения. */
  userXp: number;
  meta: FinishMeta | undefined;
  nickname: string | null;
  hideWeights: boolean;
  timeZone: string;
};

export type StoryData = {
  title: string;
  date: string;
  nickname: string | null;
  xpGained: number;
  level: number;
  levelPercent: number;
  leveledUp: boolean;
  boss: { code: string; name: string; damage: number; hpLeft: number; hp: number; defeated: boolean } | null;
  records: { exercise: string; value: string }[];
  moreRecords: number;
  streak: number;
  /** Тренировок за неделю; null — неизвестно (старая тренировка). */
  weekCount: number | null;
  stats: string[];
};

const MAX_RECORDS = 3;
const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** Узкий пробел U+202F (разделитель разрядов ru-RU) — обычным неразрывным: его глиф есть в подмножествах шрифта. */
export function kg(v: number) {
  return `${num.format(v).replace(/\u202f/g, "\u00a0")}\u00a0кг`;
}

function recordValue(type: RecordType, value: number, hideWeights: boolean) {
  if (type === "MAX_REPS") return `${value} повт.`;
  if (isTimedRecord(type)) return formatRecord(type, value);
  if (hideWeights) return "новый рекорд";
  return type === "ONE_RM" ? `1ПМ ${kg(value)}` : kg(value);
}

/** Какой рекорд упражнения показать: вес выразительнее 1ПМ и повторов; со скрытыми весами — сначала повторы. */
const PRIORITY: RecordType[] = ["MAX_WEIGHT", "ONE_RM", "MAX_REPS"];
const PRIORITY_HIDDEN: RecordType[] = ["MAX_REPS", "MAX_WEIGHT", "ONE_RM"];

/** Лучший рекорд каждого упражнения (в порядке первого рекорда) — для сторис и карточек рекордов. */
export function bestRecordPerExercise(records: FinishMeta["records"], hideWeights: boolean): FinishMeta["records"] {
  const order = hideWeights ? PRIORITY_HIDDEN : PRIORITY;
  const byExercise = new Map<string, FinishMeta["records"]>();
  for (const r of records) byExercise.set(r.exerciseName, [...(byExercise.get(r.exerciseName) ?? []), r]);
  return [...byExercise.values()].map((list) => [...list].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0]);
}

/** Одна строка на упражнение (в порядке первого рекорда). */
function recordRows(records: FinishMeta["records"], hideWeights: boolean) {
  return bestRecordPerExercise(records, hideWeights).map((best) => ({
    exercise: best.exerciseName,
    value: recordValue(best.type, best.value, hideWeights),
  }));
}

function duration(sec: number) {
  const min = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(min / 60);
  return h ? `${h} ч ${String(min % 60).padStart(2, "0")} мин` : `${min} мин`;
}

export function storyData(input: StoryInput): StoryData {
  const { meta } = input;
  const xpGained = input.xpEarned + (meta?.achievementsXp ?? 0);
  const level = levelProgress(meta ? meta.xpBefore + xpGained : input.userXp);
  const records = recordRows(meta?.records ?? [], input.hideWeights);
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: input.timeZone }).format(input.finishedAt);

  return {
    title: input.workoutName,
    date,
    nickname: input.nickname,
    xpGained,
    level: level.level,
    levelPercent: level.percent,
    leveledUp: meta ? meta.levelAfter > meta.levelBefore : false,
    boss: meta?.boss
      ? {
          code: meta.boss.code,
          name: bossName(meta.boss.code),
          damage: meta.boss.damage,
          hpLeft: meta.boss.hpAfter,
          hp: meta.boss.hp,
          defeated: meta.boss.defeated,
        }
      : null,
    records: records.slice(0, MAX_RECORDS),
    moreRecords: Math.max(0, records.length - MAX_RECORDS),
    streak: meta?.streak ?? 0,
    weekCount: meta?.weekCount ?? null,
    stats: [
      duration(input.durationSec),
      ...(input.hideWeights ? [] : [kg(Math.round(input.totalVolume))]),
      `${input.totalSets} ${plural(input.totalSets, "подход", "подхода", "подходов")}`,
    ],
  };
}
