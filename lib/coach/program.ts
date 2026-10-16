/**
 * Программы тренера на несколько недель (спека 2026-10-16-coach-mesocycles): правило веса по неделям — чистые функции.
 * Вес недели считается на лету из снимка правила и базы; разгрузочные недели не двигают рост.
 */
import { z } from "zod";
import { addDays, weekdayOf } from "@/lib/dates";
import { planDateSchema, planInputSchema } from "@/lib/plans/schema";
import type { Target } from "@/lib/coach/targets";

export type ProgramRule = { weeks: number; stepKind: "PERCENT" | "KG"; stepValue: number; deloadEvery: number | null; deloadPct: number };
export type ProgramBaseWeight = { weight: number; fromWeek: number };

const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);

/** Номер недели программы (1…) для дня клиента; до старта — null. После конца — больше weeks (проверяет вызывающий). */
export function programWeekIndex(startDate: string, day: string): number | null {
  const days = Math.round((noon(day) - noon(startDate)) / 86_400_000);
  return days < 0 ? null : Math.floor(days / 7) + 1;
}

/** Последний день программы — воскресенье последней недели. */
export const programEndDay = (startDate: string, weeks: number) => addDays(startDate, weeks * 7 - 1);

export const isDeloadWeek = (week: number, deloadEvery: number | null) => deloadEvery !== null && week % deloadEvery === 0;

/** Обычные недели в [fromWeek, week) — столько шагов роста уже сделано. */
function loadedWeeksBefore(week: number, fromWeek: number, deloadEvery: number | null) {
  let k = 0;
  for (let w = fromWeek; w < week; w++) if (!isDeloadWeek(w, deloadEvery)) k++;
  return k;
}

/** До 2,5 кг; гантели (база < 20 кг) — до 0,5 кг. */
const roundTo = (w: number, base: number) => {
  const q = base < 20 ? 0.5 : 2.5;
  return Math.round(w / q) * q;
};

function grown(rule: ProgramRule, base: number, k: number) {
  const raw = rule.stepKind === "PERCENT" ? base * (1 + rule.stepValue / 100) ** k : base + k * rule.stepValue;
  return Math.max(base, roundTo(raw, base));
}

/** Вес недели и изменение подходов (−1 в разгрузку). База 0 (своим весом) — только подходы. */
export function programWeek(rule: ProgramRule, base: ProgramBaseWeight, week: number): { weight: number; setsDelta: 0 | -1; deload: boolean } {
  const deload = isDeloadWeek(week, rule.deloadEvery);
  const k = loadedWeeksBefore(week, base.fromWeek, rule.deloadEvery);
  if (base.weight <= 0) return { weight: 0, setsDelta: deload ? -1 : 0, deload };
  if (!deload) return { weight: grown(rule, base.weight, k), setsDelta: 0, deload };
  // Разгрузка — от прошлой обычной недели
  const previous = grown(rule, base.weight, Math.max(0, k - 1));
  return { weight: roundTo(previous * (1 - rule.deloadPct / 100), base.weight), setsDelta: -1, deload };
}

/** Веса всех недель (с fromWeek) — предпросмотр и «финальная неделя». */
export function programPreview(rule: ProgramRule, base: ProgramBaseWeight) {
  return Array.from({ length: rule.weeks - base.fromWeek + 1 }, (_, i) => {
    const week = base.fromWeek + i;
    const { weight, deload } = programWeek(rule, base, week);
    return { week, weight, deload };
  });
}

/** Вес последней обычной недели не позже lastWeek (её вес переходит в задание после программы); раньше старта — база. */
export function lastLoadedWeight(rule: ProgramRule, base: ProgramBaseWeight, lastWeek: number): number {
  for (let week = Math.min(lastWeek, rule.weeks); week >= base.fromWeek; week--) {
    if (!isDeloadWeek(week, rule.deloadEvery)) return programWeek(rule, base, week).weight;
  }
  return base.weight;
}

/** Первый день каждой серии: такой день недели не раньше старта и не раньше сегодня (без задним числом). */
export function seriesStarts(startDate: string, weekdays: number[], today: string): { weekday: number; startDate: string }[] {
  const from = startDate > today ? startDate : today;
  return weekdays.map((weekday) => ({ weekday, startDate: addDays(from, (weekday - weekdayOf(from) + 7) % 7) }));
}

export const programLabel = (week: number, weeks: number, deload: boolean) => (deload ? `Разгрузка · неделя ${week}/${weeks}` : `Неделя ${week}/${weeks}`);

/**
 * Задания с программой недели: по упражнениям с базой — вес недели (база 0 — вес задания или по истории) и подходы
 * (задание → шаблон) + setsDelta, не меньше 1; метка недели — в `program`. Упражнения без базы — как были.
 */
export function applyProgramToTargets(
  targets: Map<string, Target>,
  templateSets: Map<string, number>,
  bases: { exerciseId: string; weight: number; fromWeek: number }[],
  rule: ProgramRule,
  week: number,
): Map<string, Target & { program?: string }> {
  const out = new Map<string, Target & { program?: string }>(targets);
  for (const base of bases) {
    const sets = targets.get(base.exerciseId)?.sets ?? templateSets.get(base.exerciseId);
    if (sets === undefined) continue; // упражнение убрали из шаблона
    const target = targets.get(base.exerciseId);
    const w = programWeek(rule, base, week);
    out.set(base.exerciseId, {
      sets: Math.max(1, sets + w.setsDelta),
      reps: target?.reps ?? null,
      weight: base.weight > 0 ? w.weight : (target?.weight ?? null),
      program: programLabel(week, rule.weeks, w.deload),
    });
  }
  return out;
}

/** Напомнить тренеру «заканчивается через неделю»: последние 7 дней программы, ещё не напоминали. */
export const shouldRemindProgramEnd = (endDay: string, today: string, remindedAt: Date | null) =>
  remindedAt === null && today <= endDay && today >= addDays(endDay, -7);

export const PROGRAMS_MAX = 30;

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  templateId: z.string().min(1, "Выберите шаблон"),
  time: planInputSchema.shape.time,
  durationMin: planInputSchema.shape.durationMin,
});

export const programSchema = z
  .object({
    name: z.string().trim().min(1, "Введите название").max(60, "Не длиннее 60 символов"),
    weeks: z.number().int().min(2, "От 2 недель").max(16, "До 16 недель"),
    stepKind: z.enum(["PERCENT", "KG"]),
    stepValue: z.number().min(0.5, "Шаг — от 0,5"),
    deloadEvery: z.number().int().min(3, "Разгрузка — не чаще каждой 3-й недели").max(8, "Разгрузка — не реже каждой 8-й недели").nullable(),
    deloadPct: z.number().min(5, "Разгрузка — от 5 %").max(30, "Разгрузка — до 30 %"),
    days: z
      .array(daySchema)
      .min(1, "Добавьте хотя бы один день")
      .max(7)
      .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, "Дни повторяются"),
  })
  .refine((p) => p.stepValue <= (p.stepKind === "PERCENT" ? 10 : 20), { message: "Шаг — до 10 % или до 20 кг", path: ["stepValue"] });
export type ProgramInput = z.input<typeof programSchema>;

export const assignProgramSchema = z.object({
  programId: z.string().min(1, "Выберите программу"),
  startDate: planDateSchema.refine((d) => weekdayOf(d) === 0, "Старт — с понедельника"),
  bases: z.array(z.object({ templateId: z.string().min(1), exerciseId: z.string().min(1), weight: z.number().min(0).max(1000, "Максимум 1000 кг") })).max(200),
});
export type AssignProgramInput = z.input<typeof assignProgramSchema>;
