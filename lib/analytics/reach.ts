import { metrikaId, type Goal } from "@/lib/analytics/goals";

/**
 * Цель Метрики прямо с клиента — для действий без перехода (помощник). Серверный queueGoal ставит cookie,
 * а установка cookie в server action перерисовывает страницу (в редакторе тренировки — лишняя перезагрузка данных).
 */
export function reachGoal(
  goal: Goal,
  deps: { ym: ((...args: unknown[]) => void) | undefined; id: number | null } = {
    ym: typeof window === "undefined" ? undefined : window.ym,
    id: metrikaId(process.env.NODE_ENV, process.env.NEXT_PUBLIC_YM_ID),
  },
) {
  if (deps.ym && deps.id !== null) deps.ym(deps.id, "reachGoal", goal);
}
