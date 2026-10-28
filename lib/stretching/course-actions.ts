"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { GoalStatus } from "@/generated/prisma/enums";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { queueGoal } from "@/lib/analytics/queue";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { createGoalInTx, GoalRefused } from "@/lib/goals/create";
import { writeMeasurement } from "@/lib/goals/stretch-measure";
import { courseStartSchema } from "@/lib/stretching/course";
import { courseAllowed } from "@/lib/stretching/course-access";
import { createPlannedWorkout } from "@/lib/workouts/create";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";

type Result = { ok: true } | { ok: false; error: string };

const DENIED = { ok: false, error: "Курс недоступен" } as const;
const RUNNING = { ok: false, error: "Курс уже идёт" } as const;
const RUNNING_STATUSES = ["ACTIVE", "MAINTENANCE"] as const;

const daysSchema = courseStartSchema.shape.remindDays;

function refresh() {
  revalidatePath("/stretching");
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

/** Старт курса: цель «Навык» (своя активная или новая по общим правилам целей), стартовый замер, курс. */
export async function startCourseAction(input: { skill: string; remindDays: number[]; cm: number }): Promise<Result> {
  const user = await requireUser();
  if (!(await courseAllowed(user.id))) return DENIED;
  const parsed = courseStartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { skill, remindDays, cm } = parsed.data;
  const now = new Date();

  try {
    const achieved = await db.$transaction(async (tx) => {
      if (await tx.stretchCourse.findFirst({ where: { userId: user.id, status: { in: [...RUNNING_STATUSES] } }, select: { id: true } })) {
        throw new GoalRefused(RUNNING);
      }
      const existing = await tx.goal.findFirst({
        where: { userId: user.id, type: "STRETCH_SKILL", status: GoalStatus.ACTIVE, stretchSkill: skill },
        select: { id: true },
      });
      const goalId =
        existing?.id ?? (await createGoalInTx(tx, user, { type: "STRETCH_SKILL", target: 0, deadline: null, stretchSkill: skill, startCm: cm }, false, now));
      await tx.stretchCourse.create({ data: { userId: user.id, skill, goalId, remindDays: [...remindDays].sort((a, b) => a - b), startedAt: now } });
      return writeMeasurement(tx, user, goalId, cm, now);
    });
    if (achieved) {
      await evaluateAchievementsNow(user.id);
      await queueGoal("goal_achieved");
    }
  } catch (e) {
    if (e instanceof GoalRefused) return e.result;
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return RUNNING;
    throw e;
  }
  await queueGoal("goal_create");
  refresh();
  return { ok: true };
}

/** «Начать» занятие курса: плановая тренировка → /training; активная уже есть — просто туда. */
export async function startCourseSessionAction(): Promise<void> {
  const user = await requireUser();
  if (!(await courseAllowed(user.id))) redirect("/stretching");
  const course = await db.stretchCourse.findFirst({ where: { userId: user.id, status: { in: [...RUNNING_STATUSES] } }, select: { id: true } });
  if (!course) redirect("/stretching");
  const active = await db.workout.findFirst({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
  if (!active) await createPlannedWorkout(user.id, `course:${course.id}`);
  redirect("/training");
}

export async function setCourseDaysAction(days: number[]): Promise<Result> {
  const user = await requireUser();
  if (!(await courseAllowed(user.id))) return DENIED;
  const parsed = daysSchema.safeParse(days);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { count } = await db.stretchCourse.updateMany({
    where: { userId: user.id, status: { in: [...RUNNING_STATUSES] } },
    data: { remindDays: [...parsed.data].sort((a, b) => a - b) },
  });
  if (!count) return { ok: false, error: "Курс не найден" };
  revalidatePath("/stretching");
  return { ok: true };
}

export async function abandonCourseAction(): Promise<Result> {
  const user = await requireUser();
  if (!(await courseAllowed(user.id))) return DENIED;
  const { count } = await db.stretchCourse.updateMany({
    where: { userId: user.id, status: { in: [...RUNNING_STATUSES] } },
    data: { status: "ABANDONED" },
  });
  if (!count) return { ok: false, error: "Курс не найден" };
  revalidatePath("/stretching");
  return { ok: true };
}

/** Выбор после 30-го занятия: поддержка или завершить (again/done — курс закрыт, новый старт — на клиенте). */
export async function finishCourseAction(choice: "maintain" | "again" | "done"): Promise<Result> {
  const user = await requireUser();
  if (!(await courseAllowed(user.id))) return DENIED;
  const parsed = z.enum(["maintain", "again", "done"]).safeParse(choice);
  if (!parsed.success) return { ok: false, error: "Неверный выбор" };
  const { count } = await db.stretchCourse.updateMany({
    where: { userId: user.id, status: "ACTIVE", finishedAt: { not: null } },
    data: { status: parsed.data === "maintain" ? "MAINTENANCE" : "COMPLETED" },
  });
  if (!count) return { ok: false, error: "Курс не найден" };
  revalidatePath("/stretching");
  return { ok: true };
}
