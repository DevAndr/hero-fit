"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoalStatus, XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";
import { evaluateAchievements, evaluateAchievementsNow } from "@/lib/achievements/engine";
import { queueGoal } from "@/lib/analytics/queue";
import { dayKey } from "@/lib/daily-login";
import { currentValueFor } from "@/lib/goals/queries";
import { markAchieved, syncLatestWeight, writeWeight } from "@/lib/goals/mutations";
import { canCreate, deadlineSchema, GOAL_CHEST_XP, goalOpenAt, goalSchema, goalTitle, isAchieved, type GoalInput } from "@/lib/goals/rules";
import { grantChestCoins } from "@/lib/shop/earn";
import { COIN_RATES } from "@/lib/shop/coins";
import { levelProgress } from "@/lib/progress/level";
import { initialReminderAt } from "@/lib/goals/tick-rules";

type Result = { ok: true } | { ok: false; error: string; field?: string };

const weightSchema = z.number().min(30, "Вес — от 30 до 300 кг").max(300, "Вес — от 30 до 300 кг");

function refresh() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

/** Отказ внутри транзакции — бросается, чтобы откатить уже записанное (взвешивание из формы). */
class Refused extends Error {
  constructor(readonly result: Result) {
    super("refused");
  }
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
  if (g.type === "STRETCH_HOLD") {
    // Новые типы растяжки ставятся только при флаге; уже поставленные от него не зависят
    if (!(await isEnabled("stretching", user.id))) return { ok: false, error: "Цели растяжки недоступны" };
    const exercise = await db.exercise.findFirst({
      where: { id: g.exerciseId, archivedAt: null, kind: "STRETCH", OR: [{ userId: null }, { userId: user.id }] },
      select: { id: true },
    });
    if (!exercise) return { ok: false, error: "Упражнение не найдено", field: "exerciseId" };
  }
  if (g.type === "STRENGTH") {
    const exercise = await db.exercise.findFirst({
      // Силовая цель — по весу и повторам: кардио и упражнения на время не подходят
      where: { id: g.exerciseId, archivedAt: null, kind: "REPS", OR: [{ userId: null }, { userId: user.id }] },
      select: { isBodyweight: true },
    });
    if (!exercise) return { ok: false, error: "Упражнение не найдено", field: "exerciseId" };
    isBodyweight = exercise.isBodyweight;
  }

  const result = await db.$transaction(async (tx): Promise<Result> => {
    // Строка пользователя — под блокировкой: две вкладки не обойдут лимит активных целей
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    if (g.type === "BODY_WEIGHT" && g.currentWeight !== undefined) {
      const w = weightSchema.safeParse(g.currentWeight);
      if (!w.success) return { ok: false, error: w.error.issues[0].message, field: "currentWeight" };
      await writeWeight(tx, user.id, tz, w.data);
    }
    const current = await currentValueFor(tx, user.id, g, tz);
    if (current === null) return { ok: false, error: "Сначала запиши текущий вес", field: "currentWeight" };
    const active = await tx.goal.findMany({ where: { userId: user.id, status: GoalStatus.ACTIVE }, select: { type: true } });
    const refusal = canCreate(g, { active, current, isBodyweight, hasWeight: true });
    // Отказ — откатом: взвешивание из формы без цели не сохраняется
    if (refusal) throw new Refused({ ok: false, error: refusal, field: refusal === "Уже достигнуто" ? "target" : undefined });
    const counter = g.type === "WORKOUTS" || g.type === "HOURS";
    await tx.goal.create({
      data: {
        userId: user.id,
        type: g.type,
        exerciseId: g.type === "STRENGTH" || g.type === "STRETCH_HOLD" ? g.exerciseId : null,
        metric: g.type === "STRENGTH" ? g.metric : null,
        target: g.target,
        startValue: counter ? 0 : current,
        deadline: g.deadline,
        reminderAt: initialReminderAt(g.deadline, new Date(), tz),
      },
    });
    return { ok: true };
  }).catch((e: unknown) => {
    if (e instanceof Refused) return e.result;
    throw e;
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Правка прошлого взвешивания. Цели этим не закрываются — только взвешивание за сегодня (прогресс считается из журнала). */
export async function editBodyWeightAction(date: string, weight: number): Promise<Result> {
  const user = await requireUser();
  if (typeof date !== "string" || !DAY.test(date)) return { ok: false, error: "Запись не найдена" };
  const parsed = weightSchema.safeParse(Math.round(weight * 10) / 10);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, field: "weight" };
  const found = await db.$transaction(async (tx) => {
    const { count } = await tx.bodyWeightEntry.updateMany({ where: { userId: user.id, date }, data: { weight: parsed.data } });
    if (count) await syncLatestWeight(tx, user.id);
    return count > 0;
  });
  if (!found) return { ok: false, error: "Запись не найдена" };
  refresh();
  revalidatePath("/settings");
  return { ok: true };
}

/** Удаление взвешивания; единственную запись не удаляем — от журнала зависят вес в настройках и цель по весу. */
export async function deleteBodyWeightAction(date: string): Promise<Result> {
  const user = await requireUser();
  if (typeof date !== "string" || !DAY.test(date)) return { ok: false, error: "Запись не найдена" };
  const result = await db.$transaction(async (tx): Promise<Result> => {
    // Строка пользователя — под блокировкой: две вкладки не удалят обе последние записи
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    if ((await tx.bodyWeightEntry.count({ where: { userId: user.id } })) <= 1) return { ok: false, error: "Единственную запись нельзя удалить — её можно исправить" };
    const { count } = await tx.bodyWeightEntry.deleteMany({ where: { userId: user.id, date } });
    if (!count) return { ok: false, error: "Запись не найдена" };
    await syncLatestWeight(tx, user.id);
    return { ok: true };
  });
  if (result.ok) {
    refresh();
    revalidatePath("/settings");
  }
  return result;
}

/** Сундук за выполненную цель: 100 XP, забрать можно один раз; в лигу не идёт. */
export async function openGoalChestAction(goalId: string): Promise<{ ok: true; amount: number; coins: number } | { ok: false; error: string }> {
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
    const coins = await grantChestCoins(tx, user.id, { reason: "GOAL_CHEST", key: `chest:goal:${goalId}`, amount: COIN_RATES.goalChest, label: "Сундук цели" }, xp - GOAL_CHEST_XP, xp);
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount: GOAL_CHEST_XP, coins };
  });
  // Без revalidatePath: цель с открытым сундуком уходит в историю, и диалог с наградой исчез бы вместе с карточкой —
  // страницу обновляет GoalChestButton, когда диалог закрыт
  return result;
}
