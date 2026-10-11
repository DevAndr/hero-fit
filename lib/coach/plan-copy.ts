/** Копирование плана клиента другим клиентам тренера: что создать у получателя (чистые функции). */
import { plural } from "@/lib/format";
import { isEmptyTarget } from "@/lib/coach/targets";
import { addDays, weekdayOf } from "@/lib/plans/expand";

export type CopySeries = {
  templateId: string | null;
  title: string;
  weekday: number;
  time: string;
  durationMin: number;
  startDate: string;
  endDate: string | null;
};
/** Разовое назначение (не исключение серии — их запрос не берёт). */
export type CopyEntry = { templateId: string | null; title: string; date: string; time: string; durationMin: number; cancelled: boolean };
export type CopyTarget = { templateId: string; exerciseId: string; sets: number | null; reps: number | null; weight: number | null; step: number | null };
export type CopySource = { series: CopySeries[]; entries: CopyEntry[]; targets: CopyTarget[]; templateExercises: Record<string, string[]> };
export type CopyResult = {
  series: (CopySeries & { templateId: string })[];
  entries: (CopyEntry & { templateId: string })[];
  targets: CopyTarget[];
};

export const targetKey = (t: { templateId: string; exerciseId: string }) => `${t.templateId}:${t.exerciseId}`;

const hasTemplate = <T extends { templateId: string | null }>(x: T): x is T & { templateId: string } => x.templateId !== null;

/**
 * Будущее из плана источника: серии — правило с сегодняшнего дня (исключения не переносятся), разовые — с сегодня и не
 * отменённые, задания — по шаблонам скопированного и упражнениям, что есть в шаблоне. Без весов вес и шаг пустые.
 */
export function copyPlan(source: CopySource, today: string, { withWeights }: { withWeights: boolean }): CopyResult {
  const series = source.series.filter(hasTemplate).flatMap((s) => {
    const startDate = s.startDate > today ? s.startDate : today;
    const first = addDays(startDate, (s.weekday - weekdayOf(startDate) + 7) % 7);
    if (s.endDate !== null && first > s.endDate) return [];
    return [{ ...s, startDate }];
  });
  const entries = source.entries.filter(hasTemplate).filter((e) => !e.cancelled && e.date >= today);

  const templates = new Set([...series, ...entries].map((x) => x.templateId));
  const targets = source.targets
    .filter((t) => templates.has(t.templateId) && (source.templateExercises[t.templateId] ?? []).includes(t.exerciseId))
    .map((t) => (withWeights ? t : { ...t, weight: null, step: null }))
    .filter((t) => !isEmptyTarget(t));

  return { series, entries, targets };
}

/** «2 серии, 1 разовая тренировка, 5 заданий»; нечего копировать — null. */
export function copySummary({ series, entries, targets }: CopyResult): string | null {
  const parts = [
    series.length ? `${series.length} ${plural(series.length, "серия", "серии", "серий")}` : null,
    entries.length
      ? `${entries.length} ${plural(entries.length, "разовая тренировка", "разовые тренировки", "разовых тренировок")}`
      : null,
    targets.length ? `${targets.length} ${plural(targets.length, "задание", "задания", "заданий")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Сколько заданий получателя перезапишет копия (тот же шаблон и упражнение). */
export function overwriteCount(targets: CopyTarget[], recipientKeys: string[]): number {
  const keys = new Set(recipientKeys);
  return targets.filter((t) => keys.has(targetKey(t))).length;
}

/** «План скопирован 2 клиентам» или «… · 1 пропущен». */
export function copyPlanText(copied: number, skipped: number): string {
  const text = `План скопирован ${copied} ${plural(copied, "клиенту", "клиентам", "клиентам")}`;
  return skipped ? `${text} · ${skipped} ${plural(skipped, "пропущен", "пропущено", "пропущено")}` : text;
}
