"use server";

import { revalidatePath } from "next/cache";
import { requireUser, type CurrentUser } from "@/lib/auth/dal";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";
import { assistantAvailable } from "./access";
import { getMissedPlan, getStallRows } from "./queries";
import { missedPlanAdvice, stalledExercises, type Wellbeing } from "./rules";

const WELLBEING: Wellbeing[] = ["GREAT", "OK", "TIRED"];

async function available(user: CurrentUser) {
  return assistantAvailable(await isEnabled("smart_coach", user.id), user.assistantEnabled);
}

export type AssistantAnswer =
  | {
      ok: true;
      stall?: { exerciseId: string; name: string; weeks: number }[];
      missed?: { key: string; title: string; date: string; text: string; canStart: boolean } | null;
    }
  | { ok: false };

/** Ответы помощника, которым нужны данные с сервера: застой и пропущенный план. */
export async function askAssistantAction(topic: "stall" | "missed"): Promise<AssistantAnswer> {
  const user = await requireUser();
  if (!(await available(user))) return { ok: false };
  if (topic === "stall") {
    const rows = await getStallRows(user.id);
    const today = dayKey(new Date(), safeTimeZone(user.timeZone));
    return { ok: true, stall: stalledExercises(rows, today) };
  }
  if (topic === "missed") {
    const { today, hasActive, missed } = await getMissedPlan(user.id, safeTimeZone(user.timeZone));
    const advice = missedPlanAdvice(missed, today, hasActive);
    return { ok: true, missed: missed && advice ? { key: missed.key, title: missed.title, date: missed.date, ...advice } : null };
  }
  return { ok: false };
}

/** Чек-ин самочувствия — только своя активная тренировка. null — «пропустить» (или боль: она на сервер не уходит). */
export async function saveWellbeingAction(workoutId: string, value: Wellbeing | null): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!(await available(user))) return { ok: false };
  if (value !== null && !WELLBEING.includes(value)) return { ok: false };
  const { count } = await db.workout.updateMany({
    where: { id: workoutId, userId: user.id, status: { in: ACTIVE_STATUSES } },
    data: { wellbeing: value },
  });
  return { ok: count > 0 };
}

export async function setAssistantEnabledAction(on: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { assistantEnabled: on === true } });
  revalidatePath("/", "layout");
  return { ok: true };
}
