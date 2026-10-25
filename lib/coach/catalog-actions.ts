"use server";

import { headers } from "next/headers";
import { isBot } from "@/lib/analytics/bots";
import { queueGoal } from "@/lib/analytics/queue";
import { requireUser } from "@/lib/auth/dal";
import { canCountClick } from "@/lib/coach/catalog";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";

/** Открытие контакта тренера: +1 за день. Кто открывал — не хранится (только число). */
export async function contactClickAction(coachId: unknown): Promise<void> {
  if (typeof coachId !== "string" || coachId.length > 64) return;
  const viewer = await requireUser();
  if (isBot((await headers()).get("user-agent"))) return;
  if (!(await isEnabled("coach_catalog", viewer.id))) return;
  const coach = await db.user.findUnique({ where: { id: coachId }, select: { isCoach: true, coachProfile: true } });
  if (!coach?.coachProfile || !canCountClick(coach.coachProfile, coach.isCoach, viewer.id, coachId)) return;
  await db.$executeRaw`
    INSERT INTO "CoachContactClick" ("coachId", day, count) VALUES (${coachId}, CURRENT_DATE, 1)
    ON CONFLICT ("coachId", day) DO UPDATE SET count = "CoachContactClick".count + 1`;
  await queueGoal("trainer_contact_click");
}
