import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { getWhoopCard, whoopAvailable } from "@/lib/whoop/queries";
import { weightOn, whoopKcalOf, workoutKcal, type SetKind } from "@/lib/nutrition/burn";
import { dailyNorm, type ActivityLevel, type Norm, type NutritionGoal } from "@/lib/nutrition/norm";

const DAYS = 7;

export type NutritionView = {
  profile: {
    gender: "MALE" | "FEMALE" | null;
    birthYear: number | null;
    heightCm: number | null;
    weightKg: number | null;
    activity: ActivityLevel | null;
    goal: NutritionGoal | null;
  };
  norm: Norm | null;
  /** продвинутый ввод: Б/Ж/У в дневнике и норме */
  macros: boolean;
  /** режим ввода уже выбран — иначе на /nutrition открывается диалог выбора */
  modeChosen: boolean;
  hasWeight: boolean;
  burn: {
    totalKcal: number;
    days: { date: string; kcal: number }[];
    workouts: { id: string; name: string; finishedAt: Date; kcal: number; source: "met" | "whoop" }[];
  };
};

/** Выполненные рабочие подходы — по виду упражнения (для MET). */
const workoutSelect = {
  id: true,
  name: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  durationSec: true,
  exercises: {
    select: {
      exercise: { select: { kind: true } },
      sets: { where: { isWarmup: false, completedAt: { not: null } }, select: { id: true } },
    },
  },
} as const;

type BurnRow = { exercises: { exercise: { kind: SetKind }; sets: { id: string }[] }[] };
const kindsOf = (w: BurnRow) => w.exercises.flatMap((e) => e.sets.map(() => e.exercise.kind));

const weightLog = (userId: string) => db.bodyWeightEntry.findMany({ where: { userId }, select: { date: true, weight: true } });

/** Страница /nutrition: анкета, норма и расход за 7 местных дней (включая сегодня). WHOOP — в приоритете. */
export async function getNutritionView(userId: string, tz: string, now: Date): Promise<NutritionView> {
  const today = dayKey(now, tz);
  const from = addDays(today, -(DAYS - 1));
  const [user, log, workouts, whoop] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { gender: true, birthYear: true, heightCm: true, activityLevel: true, nutritionGoal: true, nutritionMacros: true, nutritionModeChosenAt: true } }),
    weightLog(userId),
    db.workout.findMany({
      where: { userId, status: WorkoutStatus.COMPLETED, finishedAt: { gte: localMidnight(from, tz), lt: localMidnight(addDays(today, 1), tz) } },
      select: workoutSelect,
      orderBy: { finishedAt: "desc" },
    }),
    whoopAvailable(userId),
  ]);

  const weightKg = weightOn(log, today);
  const profile = { gender: user.gender, birthYear: user.birthYear, heightCm: user.heightCm, weightKg, activity: user.activityLevel, goal: user.nutritionGoal };
  const days = Array.from({ length: DAYS }, (_, i) => ({ date: addDays(from, i), kcal: 0 }));
  const list: NutritionView["burn"]["workouts"] = [];
  // Карточки WHOOP — параллельно: последовательно это до 2 запросов на каждую тренировку недели
  const cards = whoop ? await Promise.all(workouts.map((w) => getWhoopCard(userId, w))) : [];
  for (const [i, w] of workouts.entries()) {
    if (!w.finishedAt) continue;
    const date = dayKey(w.finishedAt, tz);
    const card = cards[i] ?? null;
    const burn = workoutKcal({
      kinds: kindsOf(w),
      durationSec: w.durationSec,
      weightKg: weightOn(log, date),
      whoopKcal: whoopKcalOf(card),
    });
    if (!burn) continue;
    list.push({ id: w.id, name: w.name, finishedAt: w.finishedAt, ...burn });
    const day = days.find((d) => d.date === date);
    if (day) day.kcal += burn.kcal;
  }

  return {
    profile,
    norm: dailyNorm(profile, Number(today.slice(0, 4))),
    macros: user.nutritionMacros,
    modeChosen: user.nutritionModeChosenAt !== null,
    hasWeight: weightKg !== null,
    burn: { totalKcal: list.reduce((s, w) => s + w.kcal, 0), days, workouts: list },
  };
}

/** Плитка в сводке тренировки — только MET: при WHOOP-карточке с данными плитка не показывается. */
export async function getWorkoutBurn(userId: string, workoutId: string, tz: string): Promise<{ kcal: number; source: "met" } | null> {
  const [w, log] = await Promise.all([
    db.workout.findFirst({ where: { id: workoutId, userId, status: WorkoutStatus.COMPLETED }, select: workoutSelect }),
    weightLog(userId),
  ]);
  if (!w?.finishedAt) return null;
  const burn = workoutKcal({ kinds: kindsOf(w), durationSec: w.durationSec, weightKg: weightOn(log, dayKey(w.finishedAt, tz)), whoopKcal: null });
  return burn && { kcal: burn.kcal, source: "met" };
}
