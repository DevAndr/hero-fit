import "server-only";
import { NotificationType, StretchCourseStatus, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { notify } from "@/lib/notifications/service";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { addDays } from "@/lib/dates";
import { courseAllowed } from "@/lib/stretching/course-access";
import { courseReminderBody, shouldRemindCourse } from "@/lib/stretching/course";

const BUDGET_MS = 1_000;

/**
 * Напоминания курса: в выбранные дни с 17:00 по местному времени, раз в день (`remindedDay`),
 * если сегодня занятие ещё не пройдено. Флаги проверяются по пользователю (кэш флагов — без запросов в БД).
 */
export async function processCourseReminders(now: Date): Promise<number> {
  const started = Date.now();
  const courses = await db.stretchCourse.findMany({
    where: { status: { in: [StretchCourseStatus.ACTIVE, StretchCourseStatus.MAINTENANCE] }, remindDays: { isEmpty: false } },
    include: { user: { select: { timeZone: true, notifyCourse: true } } },
    orderBy: { startedAt: "asc" },
    take: 500,
  });
  let sent = 0;
  for (const { user, ...course } of courses) {
    if (Date.now() - started > BUDGET_MS) break;
    const tz = safeTimeZone(user.timeZone);
    const probe = shouldRemindCourse({ now, timeZone: tz, remindDays: course.remindDays, remindedDay: course.remindedDay, trainedToday: false });
    if (!probe) continue;
    if (!(await courseAllowed(course.userId))) continue;
    const dayStart = localMidnight(probe.day, tz);
    const trained = await db.workout.findFirst({
      where: {
        courseId: course.id,
        status: WorkoutStatus.COMPLETED,
        finishedAt: { gte: dayStart, lt: localMidnight(addDays(probe.day, 1), tz) },
      },
      select: { id: true },
    });
    const due = shouldRemindCourse({ now, timeZone: tz, remindDays: course.remindDays, remindedDay: course.remindedDay, trainedToday: !!trained });
    if (!due) continue;
    sent += await db.$transaction(async (tx) => {
      // Условие по remindedDay — защита от параллельного тика
      const { count } = await tx.stretchCourse.updateMany({
        where: { id: course.id, OR: [{ remindedDay: null }, { remindedDay: { not: due.day } }] },
        data: { remindedDay: due.day },
      });
      if (count === 0) return 0;
      await notify(
        tx,
        course.userId,
        { type: NotificationType.COURSE_REMINDER, title: "Курс «Сесть на шпагат»", body: courseReminderBody(course), url: "/stretching" },
        { push: user.notifyCourse },
      );
      return 1;
    });
  }
  return sent;
}
