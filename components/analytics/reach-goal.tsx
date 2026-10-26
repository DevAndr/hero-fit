"use client";

import { useEffect } from "react";
import type { Goal } from "@/lib/analytics/goals";
import { reachGoal } from "@/lib/analytics/reach";

/** Цель Метрики при показе страницы — с клиента: queueGoal пишет cookie, а в рендере Server Component это ошибка. */
export function ReachGoal({ goal }: { goal: Goal }) {
  useEffect(() => {
    reachGoal(goal);
  }, [goal]);
  return null;
}
