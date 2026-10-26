"use client";

import { useReducedMotion } from "motion/react";
import { useSeen } from "@/components/marketing/motion";

/** Макет «ожил»: блок показался в экране (один раз) или движение уменьшено — тогда сразу финальное состояние. */
export function useLive<T extends Element>() {
  const [ref, seen] = useSeen<T>();
  const reduce = Boolean(useReducedMotion());
  return [ref, seen || reduce, reduce] as const;
}
