import "server-only";

import { db } from "@/lib/db";
import { dayKey } from "@/lib/daily-login";
import { isCourseSkill, stageOf, type CourseSkill } from "@/lib/stretching/course";

export type CourseView = {
  id: string;
  skill: CourseSkill;
  status: "ACTIVE" | "MAINTENANCE";
  nextSession: number;
  stage: number;
  remindDays: number[];
  goalId: string | null;
  lastCm: number | null;
  startCm: number | null;
  /** 30-е занятие пройдено, выбор ещё не сделан — показать итог. */
  finished: boolean;
  /** Недель с начала курса (целых, минимум 1). */
  weeks: number;
};

/** Идущий курс (ACTIVE/MAINTENANCE); замеры — с местного дня старта. */
export async function getActiveCourse(userId: string): Promise<CourseView | null> {
  const course = await db.stretchCourse.findFirst({
    where: { userId, status: { in: ["ACTIVE", "MAINTENANCE"] } },
    include: { user: { select: { timeZone: true } } },
  });
  if (!course || !isCourseSkill(course.skill)) return null;
  let startCm: number | null = null;
  let lastCm: number | null = null;
  if (course.goalId) {
    const from = dayKey(course.startedAt, course.user.timeZone);
    const where = { goalId: course.goalId, date: { gte: from } };
    const [first, last] = await Promise.all([
      db.stretchMeasurement.findFirst({ where, orderBy: { date: "asc" }, select: { cm: true } }),
      db.stretchMeasurement.findFirst({ where, orderBy: { date: "desc" }, select: { cm: true } }),
    ]);
    startCm = first ? Number(first.cm) : null;
    lastCm = last ? Number(last.cm) : null;
  }
  return {
    id: course.id,
    skill: course.skill,
    status: course.status as "ACTIVE" | "MAINTENANCE",
    nextSession: course.nextSession,
    stage: stageOf(course.nextSession),
    remindDays: course.remindDays,
    goalId: course.goalId,
    lastCm,
    startCm,
    finished: course.finishedAt !== null && course.status === "ACTIVE",
    weeks: Math.max(1, Math.floor((Date.now() - course.startedAt.getTime()) / (7 * 86_400_000))),
  };
}
