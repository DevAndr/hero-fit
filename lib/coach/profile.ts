import { z } from "zod";
import { COACH_CODE_PREFIX, COACH_LADDERS, type CoachLadderKey } from "@/lib/achievements/definitions";
import { plural } from "@/lib/format";

/** Публичная страница тренера: специализации, формат, цифры и правила показа (чистые). */

export const SPECIALTIES: Record<string, string> = {
  strength: "Сила",
  mass: "Набор массы",
  fat_loss: "Похудение",
  beginners: "Для начинающих",
  rehab: "Восстановление после травм",
  functional: "Функциональный тренинг",
};
export const FORMATS = ["ONLINE", "OFFLINE", "BOTH"] as const;
export const FORMAT_LABELS: Record<(typeof FORMATS)[number], string> = { ONLINE: "онлайн", OFFLINE: "в зале", BOTH: "онлайн и в зале" };
export const STAT_CODES = ["clients", "workouts", "records", "plan", "since"] as const;
export type StatCode = (typeof STAT_CODES)[number];

export const MIN_CLIENTS_FOR_STATS = 3;
export const MIN_PLAN_ENTRIES = 5;
export const MIN_ABOUT_TO_PUBLISH = 50;
export const MAX_SPECIALTIES = 4;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => v || null);

export const coachProfileSchema = z.object({
  displayName: optionalText(50, "Имя — максимум 50 символов"),
  city: optionalText(50, "Город — максимум 50 символов"),
  format: z.enum(FORMATS),
  specialties: z
    .array(z.string().refine((c) => c in SPECIALTIES, "Неизвестная специализация"))
    .max(MAX_SPECIALTIES, `Не больше ${MAX_SPECIALTIES} специализаций`)
    .refine((a) => new Set(a).size === a.length, "Специализации повторяются"),
  about: z.string().trim().max(1000, "О себе — максимум 1000 символов"),
  hiddenStats: z.array(z.enum(STAT_CODES)).refine((a) => new Set(a).size === a.length),
  showAwards: z.boolean().default(true),
});
export type CoachProfileInput = z.input<typeof coachProfileSchema>;

/** Причина, по которой публиковать рано, или null. */
export function canPublish(p: { about: string }, nickname: string | null): string | null {
  if (!nickname) return "Сначала задайте ник";
  if (p.about.trim().length < MIN_ABOUT_TO_PUBLISH) return `Расскажите о себе — минимум ${MIN_ABOUT_TO_PUBLISH} символов`;
  return null;
}

export type CoachStats = {
  clients: number;
  workouts: number;
  records: number;
  /** Доля выполненных назначений за 4 недели (0…1); null — назначений не было. */
  plan: number | null;
  planTotal: number;
  /** Первая связь с клиентом. */
  since: Date | null;
};

/** Что считать для публичной страницы: тяжёлое (активность, план по каждому клиенту) — только если покажем. */
export function statsToCompute(clients: number, hidden: readonly string[]): { activity: boolean; plan: boolean } {
  const enough = clients >= MIN_CLIENTS_FOR_STATS;
  return {
    activity: enough && !(hidden.includes("workouts") && hidden.includes("records")),
    plan: enough && !hidden.includes("plan"),
  };
}

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/**
 * Цифры для страницы в порядке STAT_CODES. Цифры по клиентам — только при 3+ активных клиентах
 * (иначе описывают одного-двух людей), «% плана» — ещё и при 5+ прошедших назначениях.
 */
export function visibleStats(s: CoachStats, hidden: readonly string[]): { code: StatCode; value: string; label: string }[] {
  const enough = s.clients >= MIN_CLIENTS_FOR_STATS;
  const out: { code: StatCode; value: string; label: string }[] = [];
  const add = (code: StatCode, show: boolean, value: string, label: string) => {
    if (show && !hidden.includes(code)) out.push({ code, value, label });
  };
  add("clients", s.clients > 0, String(s.clients), plural(s.clients, "клиент", "клиента", "клиентов"));
  add("workouts", enough, String(s.workouts), `${plural(s.workouts, "тренировка", "тренировки", "тренировок")} клиентов за 30 дней`);
  add("records", enough, String(s.records), `${plural(s.records, "рекорд", "рекорда", "рекордов")} клиентов за 30 дней`);
  add("plan", enough && s.plan !== null && s.planTotal >= MIN_PLAN_ENTRIES, `${Math.round((s.plan ?? 0) * 100)} %`, "плана выполнено");
  if (s.since) add("since", true, `с ${MONTHS_GEN[s.since.getUTCMonth()]} ${s.since.getUTCFullYear()}`, "в Hero Fit");
  return out;
}

export const MAX_PUBLIC_AWARDS = 6;

/**
 * Ачивки тренера для публичной страницы: только тренерские лестницы (без «На виду» — страница и так опубликована),
 * сначала старшие ступени своей лестницы, при равенстве — порядок лестниц; до MAX_PUBLIC_AWARDS.
 */
export function publicAwards(codes: string[]): string[] {
  const keys = Object.keys(COACH_LADDERS) as CoachLadderKey[];
  const ranked = [...new Set(codes)].flatMap((code) => {
    const [prefix, n] = code.split(":");
    const ladder = keys.findIndex((k) => COACH_CODE_PREFIX[k] === prefix);
    if (ladder < 0) return [];
    const step = (COACH_LADDERS[keys[ladder]] as number[]).indexOf(Number(n));
    return step < 0 ? [] : [{ code, ladder, step }];
  });
  return ranked
    .sort((a, b) => b.step - a.step || a.ladder - b.ladder)
    .slice(0, MAX_PUBLIC_AWARDS)
    .map((a) => a.code);
}
