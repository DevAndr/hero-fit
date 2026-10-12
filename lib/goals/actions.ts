"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoalStatus, XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievements, evaluateAchievementsNow } from "@/lib/achievements/engine";
import { queueGoal } from "@/lib/analytics/queue";
import { dayKey } from "@/lib/daily-login";
import { currentValueFor } from "@/lib/goals/queries";
import { markAchieved, writeWeight } from "@/lib/goals/mutations";
import { canCreate, deadlineSchema, GOAL_CHEST_XP, goalOpenAt, goalSchema, goalTitle, isAchieved, type GoalInput } from "@/lib/goals/rules";
import { levelProgress } from "@/lib/progress/level";
import { initialReminderAt } from "@/lib/goals/tick-rules";

type Result = { ok: true } | { ok: false; error: string; field?: string };

const weightSchema = z.number().min(30, "Вес — от 30 до 300 кг").max(300, "Вес — от 30 до 300 кг");

function refresh() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function createGoalAction(input: GoalInput): Promise<Result> {
  const user = await requireUser();
  const tz = user.timeZone;
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "target") };
  }
  const deadline = deadlineSchema(dayKey(new Date(), tz)).safeParse(parsed.data.deadline);
  if (!deadline.success) return { ok: false, error: deadline.error.issues[0].message, field: "deadline" };
  const g = { ...parsed.data, deadline: deadline.data };

  let isBodyweight = false;
  if (g.type === "STRENGTH") {
    const exercise = await db.exercise.findFirst({
      where: { id: g.exerciseId, archivedAt: null, OR: [{ userId: null }, { userId: user.id }] },
      select: { isBodyweight: true },
    });
    if (!exercise) return { ok: false, error: "Упражнение не найдено", field: "exerciseId" };
    isBodyweight = exercise.isBodyweight;
  }

  const result = await db.$transaction(async (tx): Promise<Result> => {
    if (g.type === "BODY_WEIGHT" && g.currentWeight !== undefined) {
      const w = weightSchema.safeParse(g.currentWeight);
      if (!w.success) return { ok: false, error: w.error.issues[0].message, field: "currentWeight" };
      await writeWeight(tx, user.id, tz, w.data);
    }
    const current = await currentValueFor(tx, user.id, g, tz);
    if (current === null) return { ok: false, error: "Сначала запиши текущий вес", field: "currentWeight" };
    const active = await tx.goal.findMany({ where: { userId: user.id, status: GoalStatus.ACTIVE }, select: { type: true } });
    const refusal = canCreate(g, { active, current, isBodyweight, hasWeight: true });
    if (refusal) return { ok: false, error: refusal, field: refusal === "Уже достигнуто" ? "target" : undefined };
    const counter = g.type === "WORKOUTS" || g.type === "HOURS";
    await tx.goal.create({
      data: {
        userId: user.id,
        type: g.type,
        exerciseId: g.type === "STRENGTH" ? g.exerciseId : null,
        metric: g.type === "STRENGTH" ? g.metric : null,
        target: g.target,
        startValue: counter ? 0 : current,
        deadline: g.deadline,
        reminderAt: initialReminderAt(g.deadline, new Date(), tz),
      },
    });
    return { ok: true };
  });
  if (result.ok) {
    await queueGoal("goal_create");
    refresh();
  }
  return result;
}

export async function updateGoalDeadlineAction(goalId: string, deadline: string | null): Promise<Result> {
  const user = await requireUser();
  const parsed = deadlineSchema(dayKey(new Date(), user.timeZone)).safeParse(deadline);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, field: "deadline" };
  // Срок уже вышел (идёт фора на офлайн-тренировки) — переносить поздно, иначе провал легко обойти
  const goal = await db.goal.findFirst({ where: { id: goalId, userId: user.id, status: GoalStatus.ACTIVE }, select: { deadline: true } });
  if (!goal) return { ok: false, error: "Цель не найдена" };
  if (!goalOpenAt(goal, new Date(), user.timeZone)) return { ok: false, error: "Срок уже вышел", field: "deadline" };
  // Новый срок — новое напоминание за 7 дней
  const { count } = await db.goal.updateMany({
    where: { id: goalId, userId: user.id, status: GoalStatus.ACTIVE },
    data: { deadline: parsed.data, reminderAt: initialReminderAt(parsed.data, new Date(), user.timeZone) },
  });
  if (count === 0) return { ok: false, error: "Цель не найдена" };
  refresh();
  return { ok: true };
}

export async function deleteGoalAction(goalId: string): Promise<Result> {
  const user = await requireUser();
  const { count } = await db.goal.deleteMany({ where: { id: goalId, userId: user.id, status: GoalStatus.ACTIVE } });
  if (count === 0) return { ok: false, error: "Цель не найдена" };
  refresh();
  return { ok: true };
}

/** Взвешивание за сегодня; закрывает активную цель по весу, если она достигнута. */
export async function logBodyWeightAction(weight: number): Promise<{ ok: true; achieved: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = weightSchema.safeParse(Math.round(weight * 10) / 10);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const achieved = await db.$transaction(async (tx) => {
    const current = await writeWeight(tx, user.id, user.timeZone, parsed.data);
    const goal = await tx.goal.findFirst({ where: { userId: user.id, type: "BODY_WEIGHT", status: GoalStatus.ACTIVE } });
    // Фора после срока — только для офлайн-тренировок; взвешивание всегда «сегодня»
    if (!goal || !isAchieved(goal, current) || !goalOpenAt(goal, new Date(), user.timeZone)) return null;
    const title = goalTitle(goal);
    return (await markAchieved(tx, user.id, { id: goal.id, title }, new Date(), true)) ? title : null;
  });
  await evaluateAchievementsNow(user.id);
  if (achieved) await queueGoal("goal_achieved");
  refresh();
  revalidatePath("/settings");
  return { ok: true, achieved };
}

/** Сундук за выполненную цель: 100 XP, забрать можно один раз; в лигу не идёт. */
export async function openGoalChestAction(goalId: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const result = await db.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: goalId, userId: user.id }, select: { status: true } });
    if (goal?.status !== GoalStatus.ACHIEVED) return { ok: false as const, error: "Цель ещё не достигнута" };
    // Условие по chestOpenedAt — второй клик или вторая вкладка не заберут сундук дважды
    const { count } = await tx.goal.updateMany({
      where: { id: goalId, userId: user.id, status: GoalStatus.ACHIEVED, chestOpenedAt: null },
      data: { chestOpenedAt: new Date() },
    });
    if (count === 0) return { ok: false as const, error: "Сундук уже открыт" };
    await tx.xpEvent.create({ data: { userId: user.id, amount: GOAL_CHEST_XP, reason: XpReason.GOAL_REWARD, meta: { goalId } } });
    const { xp } = await tx.user.update({ where: { id: user.id }, data: { xp: { increment: GOAL_CHEST_XP } }, select: { xp: true } });
    await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount: GOAL_CHEST_XP };
  });
  // Без revalidatePath: цель с открытым сундуком уходит в историю, и диалог с наградой исчез бы вместе с карточкой —
  // страницу обновляет GoalChestButton, когда диалог закрыт
  return result;
}
