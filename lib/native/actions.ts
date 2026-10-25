"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dayKey, safeTimeZone } from "@/lib/daily-login";

/** Заход из Android-приложения — раз в местный день, с версией приложения (метрики админки). */
export async function recordAppVisitAction(version: unknown): Promise<void> {
  const user = await requireUser();
  const v = z.string().max(32).safeParse(version);
  const day = dayKey(new Date(), safeTimeZone(user.timeZone));
  await db.appVisit.createMany({
    data: [{ userId: user.id, day: new Date(`${day}T00:00:00Z`), version: v.success ? v.data : null }],
    skipDuplicates: true,
  });
}
