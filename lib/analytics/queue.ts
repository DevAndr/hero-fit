import "server-only";
import { cookies } from "next/headers";
import { addGoal, GOAL_COOKIE, metrikaId, type Goal } from "@/lib/analytics/goals";

/** Номер счётчика Метрики: вшивается при сборке (NEXT_PUBLIC_YM_ID), без него аналитики нет. */
export const YM_ID = metrikaId(process.env.NODE_ENV, process.env.NEXT_PUBLIC_YM_ID);

/** Цель для Метрики из server action — отправит счётчик на следующей странице. Без счётчика — ничего. */
export async function queueGoal(goal: Goal) {
  if (!YM_ID) return;
  const store = await cookies();
  store.set(GOAL_COOKIE, addGoal(store.get(GOAL_COOKIE)?.value, goal), {
    httpOnly: false, // читает и чистит счётчик на клиенте
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}
