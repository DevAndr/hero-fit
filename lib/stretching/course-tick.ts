import "server-only";
import { NotificationType, StretchCourseStatus, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { notify } from "@/lib/notifications/service";
import { courseAllowed } from "@/lib/stretching/course-access";
import { courseAwaitsChoice, courseReminderBody, shouldRemindCourse } from "@/lib/stretching/course";

const BUDGET_MS = 1_000;
const DAY_MS = 86_400_000;

/**
 * Напоминания курса: в выбранные дни с 17:00 по местному времени, раз в день (`remindedDay`),
 * если сегодня занятие ещё не пройдено. Флаги проверяются по пользователю (кэш флагов — без запросов в БД).
 * Выборка — давно не напоминавшие первыми (`remindedDay` nulls first): напомненные сегодня уходят в конец
 * и не занимают места, курсы за пределами 500 доходят до очереди на следующих тиках.
 * «Занимался сегодня» — одним запросом на всех кандидатов, а не по запросу на курс.
 */
export async function processCourseReminders(now: Date): Promise<number> {
  const started = Date.now();
  const courses = await db.stretchCourse.findMany({
    where: {
      status: { in: [StretchCourseStatus.ACTIVE, StretchCourseStatus.MAINTENANCE] },
      remindDays: { isEmpty: false },
      // ждущие выбора после 30-го занятия (ACTIVE + finishedAt) не напоминают
      NOT: { status: StretchCourseStatus.ACTIVE, finishedAt: { not: null } },
    },
    include: { user: { select: { timeZone: true, notifyCourse: true } } },
    orderBy: [{ remindedDay: { sort: "asc", nulls: "first" } }, { startedAt: "asc" }],
    take: 500,
  });
  const base = (c: (typeof courses)[number], trainedToday: boolean) =>
    shouldRemindCourse({
      now,
      timeZone: safeTimeZone(c.user.timeZone),
      remindDays: c.remindDays,
      remindedDay: c.remindedDay,
      trainedToday,
      awaitingChoice: courseAwaitsChoice(c),
    });
  const candidates = courses.filter((c) => base(c, false));
  if (candidates.length === 0) return 0;

  // Завершённые занятия с позавчера — местный «сегодня» любого пояса внутри; день сверяется ниже
  const done = await db.workout.findMany({
    where: {
      courseId: { in: candidates.map((c) => c.id) },
      status: WorkoutStatus.COMPLETED,
      finishedAt: { gte: new Date(now.getTime() - 2 * DAY_MS) },
    },
    select: { courseId: true, finishedAt: true },
  });

  let sent = 0;
  for (const { user, ...course } of candidates) {
    if (Date.now() - started > BUDGET_MS) break;
    const tz = safeTimeZone(user.timeZone);
    const today = dayKey(now, tz);
    const trained = done.some((w) => w.courseId === course.id && w.finishedAt && dayKey(w.finishedAt, tz) === today);
    const due = base({ user, ...course }, trained);
    if (!due) continue;
    if (!(await courseAllowed(course.userId))) continue;
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
