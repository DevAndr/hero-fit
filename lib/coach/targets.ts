import { z } from "zod";
import { plural } from "@/lib/format";
import { MAX_EXERCISES } from "@/lib/workouts/schema";

/** Задание тренера клиенту по упражнению шаблона; пустое поле — как без задания. */
export type Target = { sets: number | null; reps: number | null; weight: number | null };
export type PlannedSet = { weight: number; reps: number };

/**
 * Подходы упражнения шаблона при запуске. Подходы: задание → шаблон. Повторы: задание → шаблон → история того же подхода
 * (лишний — 0). Вес: задание → история (по номеру подхода, затем последний) → шаблон. Без задания — прежние правила.
 */
export function plannedSets(
  te: { targetSets: number; targetReps: number | null; targetWeight: number | null },
  lastSets: PlannedSet[],
  target?: Target,
): PlannedSet[] {
  return Array.from({ length: target?.sets ?? te.targetSets }, (_, i) => ({
    weight: target?.weight ?? lastSets[i]?.weight ?? lastSets.at(-1)?.weight ?? te.targetWeight ?? 0,
    reps: target?.reps ?? te.targetReps ?? lastSets[i]?.reps ?? 0,
  }));
}

/** Поле диалога: пусто — null, «62,5» — 62.5; мусор, минус или дробь в целом поле — NaN (не молчаливые 0 кг). */
export function parseTargetInput(value: string, { int = false }: { int?: boolean } = {}): number | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+([.,]\d+)?$/.test(v)) return Number.NaN;
  const n = Number(v.replace(",", "."));
  return int && !Number.isInteger(n) ? Number.NaN : n;
}

export const isEmptyTarget = (t: Target & { step?: number | null }) => t.sets === null && t.reps === null && t.weight === null && (t.step ?? null) === null;

const kg = (w: number) => `${w.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;

/**
 * «от тренера: 4 × 8 · 60 кг»; своим весом — отягощение «+10 кг». Пустые поля и вес 0 пропускаются, нечего показать — null.
 * Программа из каталога (source) — «программа «Сила»: 4 × 8 · 60 кг (неделя 3/8)».
 */
export function formatTarget(t: Target & { program?: string; source?: string }, { bodyweight = false }: { bodyweight?: boolean } = {}): string | null {
  if (isEmptyTarget(t)) return null;
  const volume =
    t.sets !== null && t.reps !== null
      ? `${t.sets} × ${t.reps}`
      : t.sets !== null
        ? `${t.sets} ${plural(t.sets, "подход", "подхода", "подходов")}`
        : t.reps !== null
          ? `по ${t.reps} ${plural(t.reps, "повтору", "повтора", "повторов")}`
          : null;
  const parts = [volume, t.weight ? `${bodyweight ? "+" : ""}${kg(t.weight)}` : null].filter(Boolean);
  // Программа тренера — неделя в скобках: «(неделя 3/8)», «(разгрузка · неделя 4/8)»
  const week = t.program ? ` (${t.program[0].toLowerCase()}${t.program.slice(1)})` : "";
  const from = t.source ? `программа «${t.source}»` : "от тренера";
  return parts.length ? `${from}: ${parts.join(" · ")}${week}` : null;
}

export const targetSchema = z.object({
  exerciseId: z.string().min(1),
  sets: z.number().int().min(1, "Минимум 1 подход").max(20, "Максимум 20 подходов").nullable(),
  reps: z.number().int().min(1, "Минимум 1 повтор").max(100, "Максимум 100 повторов").nullable(),
  weight: z.number().min(0).max(1000, "Максимум 1000 кг").nullable(),
  /** Шаг прогрессии, кг; null — без прогрессии. */
  step: z.number().min(0.5, "Шаг — от 0,5 кг").max(20, "Шаг — до 20 кг").nullable().default(null),
});
export const targetsSchema = z.array(targetSchema).max(MAX_EXERCISES);

/** Все упражнения — из шаблона, каждое не больше одного раза. */
export function validateTargetItems(items: { exerciseId: string }[], templateExerciseIds: string[]) {
  const allowed = new Set(templateExerciseIds);
  const seen = new Set<string>();
  for (const { exerciseId } of items) {
    if (!allowed.has(exerciseId) || seen.has(exerciseId)) return false;
    seen.add(exerciseId);
  }
  return true;
}
