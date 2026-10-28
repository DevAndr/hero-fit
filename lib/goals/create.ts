import type { Prisma } from "@/generated/prisma/client";
import { GoalStatus } from "@/generated/prisma/enums";
import { currentValueFor } from "@/lib/goals/queries";
import { writeWeight } from "@/lib/goals/mutations";
import { canCreate, type GoalInput } from "@/lib/goals/rules";
import { initialReminderAt } from "@/lib/goals/tick-rules";

export type GoalResult = { ok: true } | { ok: false; error: string; field?: string };

/** Отказ внутри транзакции — бросается, чтобы откатить уже записанное (взвешивание из формы). */
export class GoalRefused extends Error {
  constructor(readonly result: { ok: false; error: string; field?: string }) {
    super("refused");
  }
}

/** Вес из формы цели «Вес тела»: 30…300 кг. */
function weightError(w: number): string | null {
  return w >= 30 && w <= 300 ? null : "Вес — от 30 до 300 кг";
}

/**
 * Создание цели в транзакции: блокировка пользователя (лимит активных целей не обойти двумя вкладками), проверка `canCreate`.
 * `g` — уже разобранный ввод со вычисленным сроком. Отказ — `GoalRefused` (откат), успех — id новой цели.
 */
export async function createGoalInTx(
  tx: Prisma.TransactionClient,
  user: { id: string; timeZone: string },
  g: Omit<GoalInput, "deadline"> & { deadline: string | null },
  isBodyweight: boolean,
  now: Date,
): Promise<string> {
  const tz = user.timeZone;
  const weekly = g.type === "STRETCH_WEEKLY";
  // Строка пользователя — под блокировкой: две вкладки не обойдут лимит активных целей
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
  if (g.type === "BODY_WEIGHT" && g.currentWeight !== undefined) {
    const bad = weightError(g.currentWeight);
    if (bad) throw new GoalRefused({ ok: false, error: bad, field: "currentWeight" });
    await writeWeight(tx, user.id, tz, g.currentWeight);
  }
  const current = await currentValueFor(tx, user.id, g, tz);
  if (current === null) throw new GoalRefused({ ok: false, error: "Сначала запиши текущий вес", field: "currentWeight" });
  const active = await tx.goal.findMany({ where: { userId: user.id, status: GoalStatus.ACTIVE }, select: { type: true, stretchSkill: true, skillTitle: true } });
  const refusal = canCreate(g, { active, current, isBodyweight, hasWeight: true });
  // Отказ — откатом: взвешивание из формы без цели не сохраняется
  if (refusal) throw new GoalRefused({ ok: false, error: refusal, field: refusal === "Уже достигнуто" ? "target" : undefined });
  const skill = g.type === "STRETCH_SKILL";
  const counter = g.type === "WORKOUTS" || g.type === "HOURS" || weekly;
  const goal = await tx.goal.create({
    data: {
      userId: user.id,
      type: g.type,
      exerciseId: g.type === "STRENGTH" || g.type === "STRETCH_HOLD" ? g.exerciseId : null,
      metric: g.type === "STRENGTH" ? g.metric : null,
      target: g.target,
      startValue: skill ? g.startCm! : counter ? 0 : current,
      deadline: g.deadline,
      stretchUnit: weekly ? g.stretchUnit : null,
      // Навык: ключ из списка или своё название
      stretchSkill: skill ? (g.stretchSkill ?? null) : null,
      skillTitle: skill && !g.stretchSkill ? g.skillTitle : null,
      createdAt: now,
      reminderAt: initialReminderAt(g.deadline, now, tz),
    },
    select: { id: true },
  });
  return goal.id;
}
