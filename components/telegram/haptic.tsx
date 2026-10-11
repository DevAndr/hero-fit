"use client";

import { useEffect } from "react";
import { haptic } from "@/lib/telegram/webapp";

/** Вибрация Telegram один раз при показе (для серверных страниц: рекорды в свежей сводке). */
export function Haptic({ kind }: { kind: "light" | "success" | "warning" }) {
  useEffect(() => haptic(kind), [kind]);
  return null;
}
