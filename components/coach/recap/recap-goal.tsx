"use client";

import { useEffect } from "react";
import { reachGoal } from "@/lib/analytics/reach";

/** Цель Метрики: тренер впервые открыл итоги недели. */
export function RecapGoal() {
  useEffect(() => {
    reachGoal("coach_recap_open");
  }, []);
  return null;
}
