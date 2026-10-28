import { z } from "zod";
import { cmSchema } from "@/lib/goals/cm-schema";
import { dayKey } from "@/lib/daily-login";
import { weekdayOf } from "@/lib/dates";
import { localHour } from "@/lib/progress/weekly-streak";

// Курс «Сесть на шпагат»: 30 занятий, 5 этапов по 6. План — в коде, в БД только прогресс.

export const COURSE_SKILLS = ["SPLIT_LEFT", "SPLIT_RIGHT", "SPLIT_SIDE"] as const;
export type CourseSkill = (typeof COURSE_SKILLS)[number];

export function isCourseSkill(k: string): k is CourseSkill {
  return (COURSE_SKILLS as readonly string[]).includes(k);
}

/** Старт курса: навык, дни напоминаний (0 = пн … 6 = вс, без повторов), стартовый замер. */
export const courseStartSchema = z.object({
  skill: z.enum(COURSE_SKILLS),
  remindDays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .refine((d) => new Set(d).size === d.length, "Дни не должны повторяться"),
  // Старт без растяжки некуда вести: от 0,5 см (замер на занятии допускает 0 — цель достигнута)
  cm: cmSchema.refine((v) => v >= 0.5, "Замер — от 0,5 до 200 см"),
});

export const COURSE_SESSIONS = 30;
export const STAGE_SIZE = 6;
export const COURSE_REST_SEC = 15;

const MEASURE_SESSIONS = [1, 7, 13, 19, 25, 30];

export type CourseExercise = { name: string; sets: number; holdSec: number };

/** Этап 1…5; поддержка (n > 30) идёт по плану этапа 5. */
export function stageOf(n: number): 1 | 2 | 3 | 4 | 5 {
  const stage = Math.floor((Math.max(n, 1) - 1) / STAGE_SIZE) + 1;
  return Math.min(stage, 5) as 1 | 2 | 3 | 4 | 5;
}

export function isMeasureSession(n: number): boolean {
  return MEASURE_SESSIONS.includes(n);
}

const HOLD_BY_STAGE = { 1: 30, 2: 45, 3: 45, 4: 60, 5: 60 } as const;
const SETS_BY_STAGE = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 3 } as const;
const SUPPORT_SPLIT_HOLD = 90;

export function sessionPlan(skill: CourseSkill, n: number): CourseExercise[] {
  const stage = stageOf(n);
  const names: string[] =
    skill === "SPLIT_SIDE"
      ? ["Бабочка", "Лягушка", "Широкая складка сидя", "Растяжка задней поверхности бедра лёжа"]
      : [
          "Выпад на сгибатели бедра",
          "Голубь",
          "Растяжка задней поверхности бедра лёжа",
          stage >= 3 ? "Растяжка квадрицепса стоя" : "Растяжка квадрицепса лёжа на боку",
          "Складка сидя",
        ];
  if (stage >= 2) {
    if (skill === "SPLIT_SIDE") names.push("Боковой выпад", "Ящерица");
    else names.push("Ящерица", "Полушпагат");
  }
  const split = skill === "SPLIT_SIDE" ? "Поперечный шпагат с опорой" : "Продольный шпагат с опорой";
  if (stage >= 4) names.push(split);

  return names.map((name) => ({
    name,
    sets: SETS_BY_STAGE[stage],
    holdSec: name === split && stage === 5 ? SUPPORT_SPLIT_HOLD : HOLD_BY_STAGE[stage],
  }));
}

export function sessionTitle(n: number): string {
  return n > COURSE_SESSIONS ? "Шпагат · поддержка" : `Шпагат · занятие ${n}`;
}

/** Максимальное удержание на занятии n (для сводки «следующее — …»). */
export function nextHoldSec(skill: CourseSkill, n: number): number {
  return Math.max(...sessionPlan(skill, n).map((e) => e.holdSec));
}

/** Строка курса в сводке тренировки — по самой тренировке (номер занятия), не по текущему состоянию курса. */
export function courseSummary(skill: CourseSkill, session: number) {
  return {
    session,
    total: COURSE_SESSIONS,
    nextStage: stageOf(session + 1),
    nextHoldSec: nextHoldSec(skill, session + 1),
    maintenance: session > COURSE_SESSIONS,
    finished: session === COURSE_SESSIONS,
  };
}

/**
 * Что делает завершённое занятие с курсом; null — курс не двигается.
 * Условие `courseSessionNo === nextSession` делает повторное завершение и старую тренировку безопасными.
 */
export function courseAdvance(
  course: { status: string; nextSession: number; finishedAt: Date | null },
  workout: { courseSessionNo: number | null; hasDoneSet: boolean },
  now: Date,
): { nextSession: number; finishedAt?: Date } | null {
  if (course.status !== "ACTIVE" && course.status !== "MAINTENANCE") return null;
  if (!workout.hasDoneSet || workout.courseSessionNo !== course.nextSession) return null;
  const next = { nextSession: course.nextSession + 1 };
  return course.status === "ACTIVE" && course.nextSession === COURSE_SESSIONS ? { ...next, finishedAt: now } : next;
}

export const COURSE_REMIND_HOUR = 17;

/** 30-е занятие пройдено, выбор («Закрепить» / «Пройти заново» / «Закончить») ещё не сделан. */
export function courseAwaitsChoice(c: { status: string; finishedAt: Date | null }): boolean {
  return c.status === "ACTIVE" && c.finishedAt !== null;
}

/**
 * Напоминание о занятии: выбранный местный день недели, с 17:00, раз в день, если сегодня ещё не занимался.
 * Курс, ждущий выбора после 30-го занятия, не напоминает (иначе — «занятие 31 из 30»).
 */
export function shouldRemindCourse(input: {
  now: Date;
  timeZone: string;
  remindDays: number[];
  remindedDay: string | null;
  trainedToday: boolean;
  awaitingChoice: boolean;
}): { day: string } | null {
  if (input.awaitingChoice) return null;
  const day = dayKey(input.now, input.timeZone);
  if (!input.remindDays.includes(weekdayOf(day))) return null;
  if (localHour(input.now, input.timeZone) < COURSE_REMIND_HOUR) return null;
  if (input.remindedDay === day || input.trainedToday) return null;
  return { day };
}

export function courseReminderBody(c: { nextSession: number; status: string }): string {
  if (c.status === "MAINTENANCE") return "Сегодня занятие поддержки шпагата";
  return `Сегодня занятие курса: этап ${stageOf(c.nextSession)}, занятие ${c.nextSession} из ${COURSE_SESSIONS}`;
}
