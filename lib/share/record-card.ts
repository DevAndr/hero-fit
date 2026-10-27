/** Данные карточки рекорда — одна на упражнение с новым рекордом (чистые функции, без БД). */
import type { RecordType } from "@/generated/prisma/enums";
import { levelProgress } from "@/lib/progress/level";
import { LOWER_IS_BETTER, formatRecord, isTimedRecord } from "@/lib/progress/records";
import { bestRecordPerExercise, kg } from "@/lib/share/story";
import type { FinishMeta } from "@/lib/workouts/finish";

export type RecordCardInput = {
  meta: FinishMeta | undefined;
  /** XP за саму тренировку и рекорды (`Workout.xpEarned`). */
  xpEarned: number;
  /** Текущий XP пользователя — если у тренировки нет события завершения. */
  userXp: number;
  hideWeights: boolean;
  finishedAt: Date;
  timeZone: string;
  nickname: string | null;
};

export type RecordCard = {
  exercise: string;
  label: string;
  value: string;
  /** «+5 кг к прошлому рекорду»; у темпа (меньше — лучше) — с минусом. */
  change: string;
  /** «Было 100 кг»; со скрытыми весами у весовых — null. */
  previous: string | null;
  level: number;
  date: string;
  nickname: string | null;
};

const LABELS: Record<RecordType, string> = {
  MAX_WEIGHT: "Максимальный вес",
  ONE_RM: "1ПМ (расчётный)",
  MAX_REPS: "Максимум повторов",
  MAX_DURATION: "Дольше всего",
  MAX_DISTANCE: "Дальше всего",
  BEST_PACE: "Лучший темп",
};

const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function amount(type: RecordType, value: number) {
  if (type === "MAX_REPS") return `${Math.round(value)} повт.`;
  if (isTimedRecord(type)) return formatRecord(type, value);
  return kg(value);
}

function isWeight(type: RecordType) {
  return type === "MAX_WEIGHT" || type === "ONE_RM";
}

export function recordCards(input: RecordCardInput): RecordCard[] {
  const { meta } = input;
  if (!meta?.records.length) return [];
  const level = levelProgress(meta.xpBefore + input.xpEarned + (meta.achievementsXp ?? 0)).level;
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: input.timeZone }).format(input.finishedAt);

  return bestRecordPerExercise(meta.records, input.hideWeights).map((r) => {
    const hidden = input.hideWeights && isWeight(r.type);
    const diff = Math.abs(r.value - r.previous);
    const sign = LOWER_IS_BETTER.has(r.type) ? "−" : "+";
    const percent = r.previous > 0 ? Math.round((diff / r.previous) * 100) : 0;
    return {
      exercise: r.exerciseName,
      label: LABELS[r.type],
      value: hidden ? "Новый рекорд" : amount(r.type, r.value),
      change: `${sign}${hidden ? `${num.format(percent)} %` : amount(r.type, diff)} к прошлому рекорду`,
      previous: hidden ? null : `Было ${amount(r.type, r.previous)}`,
      level,
      date,
      nickname: input.nickname,
    };
  });
}
