/**
 * Правила умного помощника (спека 2026-10-12-smart-coach): чистые функции, без БД.
 * Боль — только для этой тренировки и на клиенте (152-ФЗ: данные о здоровье на сервер не уходят).
 */
import type { MuscleGroup } from "@/generated/prisma/enums";
import type { Target } from "@/lib/coach/targets";
import { addDays } from "@/lib/plans/expand";
import { isTimed, timedSetText, type ExerciseKindName } from "@/lib/workouts/kinds";
import type { LastPerformance } from "@/lib/workouts/queries";
import type { ProgressionHint } from "@/lib/progress/progression";

export type PainSpot = "shoulder" | "elbow" | "wrist" | "lowerBack" | "knee" | "neck" | "other";

export const PAIN_SPOTS: { spot: PainSpot; label: string }[] = [
  { spot: "shoulder", label: "Плечо" },
  { spot: "elbow", label: "Локоть" },
  { spot: "wrist", label: "Запястье" },
  { spot: "lowerBack", label: "Поясница" },
  { spot: "knee", label: "Колено" },
  { spot: "neck", label: "Шея" },
  { spot: "other", label: "Другое" },
];

/** Какие группы нагружают место боли. «Другое» — неизвестно, только общий совет. */
export const PAIN_GROUPS: Record<PainSpot, MuscleGroup[]> = {
  shoulder: ["SHOULDERS", "CHEST", "TRICEPS"],
  elbow: ["BICEPS", "TRICEPS", "FOREARMS"],
  wrist: ["FOREARMS", "BICEPS", "CHEST"],
  lowerBack: ["BACK", "LEGS", "GLUTES"],
  knee: ["LEGS", "GLUTES", "CALVES"],
  neck: ["TRAPS", "SHOULDERS"],
  other: [],
};

export function painRelated(groups: MuscleGroup[], pain: PainSpot[]): boolean {
  return pain.some((spot) => PAIN_GROUPS[spot].some((g) => groups.includes(g)));
}

export type Wellbeing = "GREAT" | "OK" | "TIRED";

type Sets = { sets: { weight: number; reps: number }[] };

export type WeightAdvice =
  | { kind: "pain" }
  | { kind: "first"; bodyweight: boolean }
  | {
      kind: "sets";
      weight: number;
      reps: number;
      sets: number;
      source: "coach" | "own" | "hint" | "last";
      why: string;
      note?: string;
    };

/** 1 кг до 20 кг, дальше 2,5 — как «Пора увеличить вес». */
export const nextStep = (weight: number) => (weight < 20 ? weight + 1 : weight + 2.5);

export const kg = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;

/** Рабочий вес прошлого раза и минимальные повторы с ним — «удержанный» результат. */
function lastTop(last: Sets) {
  const weight = Math.max(...last.sets.map((s) => s.weight));
  const reps = Math.min(...last.sets.filter((s) => s.weight === weight).map((s) => s.reps));
  return { weight, reps, sets: last.sets.length };
}

/** Вес не записан (0) — как свой вес: без «0 кг». */
const lastText = (t: { weight: number; reps: number; sets: number }, bodyweight: boolean) =>
  bodyweight || !t.weight ? `в прошлый раз ${t.sets} × ${t.reps}` : `в прошлый раз ${t.sets} × ${t.reps} · ${kg(t.weight)}`;

/** Прошлый результат для кнопки замены: «в прошлый раз 3 × 10 · 60 кг», на время/кардио — первый подход. */
export function lastResultText(
  ex: { isBodyweight: boolean; kind?: ExerciseKindName },
  last: LastPerformance[string] | undefined,
): string {
  if (!last?.sets.length) return "ещё не делали";
  if (isTimed(ex.kind)) return `в прошлый раз ${timedSetText(ex.kind!, last.sets[0])}`;
  const top = lastTop(last);
  // Своим весом с отягощением — «+10 кг» (у помощника lastText его не пишет)
  if (ex.isBodyweight && top.weight > 0) return `в прошлый раз ${top.sets} × ${top.reps} · +${kg(top.weight)}`;
  return lastText(top, ex.isBodyweight);
}

export function weightAdvice(input: {
  bodyweight: boolean;
  groups: MuscleGroup[];
  last: Sets | null;
  hint: ProgressionHint | null;
  coach: Target | null;
  own: Target | null;
  wellbeing: Wellbeing | null;
  pain: PainSpot[];
}): WeightAdvice {
  const { bodyweight, last, hint, wellbeing } = input;
  if (painRelated(input.groups, input.pain)) return { kind: "pain" };
  const prev = last && last.sets.length ? lastTop(last) : null;
  const target = input.coach ?? input.own;

  if (target && (target.weight !== null || target.reps !== null || target.sets !== null)) {
    const source = input.coach ? "coach" : "own";
    const weight = target.weight ?? prev?.weight ?? 0;
    const advice: WeightAdvice = {
      kind: "sets",
      source,
      weight: bodyweight && !target.weight ? 0 : weight,
      reps: target.reps ?? prev?.reps ?? 10,
      sets: target.sets ?? prev?.sets ?? 3,
      why: source === "coach" ? "Так задал твой тренер — помощник с планом тренера не спорит." : "Так стоит в твоём шаблоне с прогрессией.",
    };
    if (wellbeing === "TIRED" && prev && prev.weight > 0 && weight > prev.weight) {
      advice.note = `Если сегодня тяжело — можно остаться на ${kg(prev.weight)}.`;
    }
    return advice;
  }

  if (!prev) return { kind: "first", bodyweight };

  if (hint && wellbeing !== "TIRED") {
    const weight = hint.kind === "weight" ? hint.suggested : prev.weight;
    const reps = hint.kind === "reps" ? hint.suggested : prev.reps;
    const reason = hint.easy ? "во всех рабочих подходах оставался запас 2+ повтора" : "последние тренировки результат держится";
    return {
      kind: "sets",
      source: "hint",
      weight,
      reps,
      sets: prev.sets,
      why: `${capital(lastText(prev, bodyweight))}, ${reason} — пора ${hint.kind === "weight" ? `прибавить: ${kg(weight)}` : `добавить повторы: ${reps}`}.`,
    };
  }

  return {
    kind: "sets",
    source: "last",
    weight: prev.weight,
    reps: prev.reps,
    sets: prev.sets,
    why:
      wellbeing === "TIRED"
        ? `${capital(lastText(prev, bodyweight))}. Сил сегодня меньше — повторить прошлый результат уже хорошо.`
        : `${capital(lastText(prev, bodyweight))}. Повтори его — когда станет легко, помощник предложит прибавить.`,
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function repsOrWeight(input: { bodyweight: boolean; last: Sets | null }): { text: string; why: string } {
  const prev = input.last && input.last.sets.length ? lastTop(input.last) : null;
  if (input.bodyweight) {
    return {
      text: "Со своим весом прибавляй повторы: +1–2 за тренировку, пока техника не страдает.",
      why: "Отягощения нет — растут повторы. Когда легко выходит 15+, можно усложнить вариант упражнения.",
    };
  }
  const text = "Сначала повторы, потом вес: работай в диапазоне 6–12. Получилось 12 во всех подходах — прибавь вес и снова начни снизу.";
  if (!prev || !prev.weight) return { text, why: "Шаг веса — 2,5 кг (до 20 кг — 1 кг)." };
  return {
    text,
    why: `${capital(lastText(prev, false))}. Сделаешь 12 во всех подходах — бери ${kg(nextStep(prev.weight))} и начинай с 6–8. Шаг — 2,5 кг (до 20 кг — 1 кг).`,
  };
}

export function replacementCandidates<
  E extends { id: string; muscleGroups: MuscleGroup[]; userId: string | null; archivedAt?: Date | string | null; kind?: string; stretchZones?: string[] },
>(current: { id: string; muscleGroups: MuscleGroup[]; kind?: string; stretchZones?: string[] }, all: E[], ctx: { inWorkout: string[]; pain: PainSpot[]; lastDate: Record<string, string>; today: string }): E[] {
  const stretch = current.kind === "STRETCH";
  const main = stretch ? current.stretchZones?.[0] : current.muscleGroups[0];
  const since = addDays(ctx.today, -90);
  const fit = all.filter(
    (e) =>
      e.id !== current.id &&
      !ctx.inWorkout.includes(e.id) &&
      !e.archivedAt &&
      (stretch ? e.stretchZones?.[0] : e.muscleGroups[0]) === main && // растяжка — по основной зоне
      (e.kind ?? "REPS") === (current.kind ?? "REPS") && // замена того же вида: присед — не на бег
      !painRelated(e.muscleGroups, ctx.pain),
  );
  const recent = fit
    .filter((e) => (ctx.lastDate[e.id] ?? "") >= since)
    .sort((a, b) => ctx.lastDate[b.id].localeCompare(ctx.lastDate[a.id]));
  const builtIn = fit.filter((e) => e.userId === null && !recent.includes(e));
  return [...recent, ...builtIn].slice(0, 3);
}

export const STALL_MIN_WORKOUTS = 4;
export const STALL_DAYS = 28;

export function stalledExercises(
  rows: { exerciseId: string; name: string; workouts6w: number; lastRecordAt: string | null }[],
  today: string,
): { exerciseId: string; name: string; weeks: number }[] {
  const days = (d: string | null) => (d ? Math.round((Date.parse(today) - Date.parse(d.slice(0, 10))) / 86_400_000) : Infinity);
  return rows
    .filter((r) => r.workouts6w >= STALL_MIN_WORKOUTS && days(r.lastRecordAt) >= STALL_DAYS)
    .sort((a, b) => days(b.lastRecordAt) - days(a.lastRecordAt))
    .slice(0, 3)
    .map((r) => {
      const d = days(r.lastRecordAt);
      return { exerciseId: r.exerciseId, name: r.name, weeks: Number.isFinite(d) ? Math.floor(d / 7) : 6 };
    });
}

export function missedPlanAdvice(
  missed: { key: string; title: string; date: string; coach: boolean } | null,
  today: string,
  hasActive: boolean,
): { text: string; canStart: boolean } | null {
  if (!missed) return null;
  const text = missed.coach
    ? `«${missed.title}» пропущена. Твой тренер увидит пропуск — сделать её можно сегодня.`
    : missed.date === addDays(today, -1)
      ? `«${missed.title}» вчера не получилась. Сделай её сегодня — следующую можно сдвинуть.`
      : `«${missed.title}» пропущена. Одна пропущенная не страшна — продолжай по плану.`;
  return { text, canStart: !hasActive };
}
