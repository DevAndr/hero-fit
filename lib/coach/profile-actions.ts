"use server";

import { revalidatePath } from "next/cache";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { quietly } from "@/lib/achievements/quietly";
import { queueGoal } from "@/lib/analytics/queue";
import { requireCoach } from "@/lib/coach/access";
import { canPublish, coachProfileSchema, type CoachProfileInput } from "@/lib/coach/profile";
import { ensureCoachCode } from "@/lib/coach/queries";
import { db } from "@/lib/db";

type Result = { ok: true } | { ok: false; error: string };

function revalidate(nickname: string | null) {
  revalidatePath("/coach/page");
  if (nickname) revalidatePath(`/trainer/${nickname}`);
  revalidatePath("/sitemap.xml");
}

const nicknameOf = async (userId: string) =>
  (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true } })).nickname;

export async function saveCoachProfileAction(input: CoachProfileInput): Promise<Result> {
  const coach = await requireCoach();
  const parsed = coachProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  await db.coachProfile.upsert({ where: { userId: coach.id }, create: { userId: coach.id, ...parsed.data }, update: parsed.data });
  revalidate(await nicknameOf(coach.id));
  return { ok: true };
}

/** Опубликовать (с проверкой canPublish) или снять с публикации. */
export async function publishCoachProfileAction(on: boolean): Promise<Result> {
  const coach = await requireCoach();
  const [profile, nickname] = await Promise.all([
    db.coachProfile.findUnique({ where: { userId: coach.id }, select: { about: true, publishedAt: true } }),
    nicknameOf(coach.id),
  ]);
  if (on) {
    const reason = canPublish({ about: profile?.about ?? "" }, nickname);
    if (reason) return { ok: false, error: reason };
    if (!profile?.publishedAt) {
      await ensureCoachCode(coach.id);
      await db.coachProfile.update({ where: { userId: coach.id }, data: { publishedAt: new Date() } });
      await queueGoal("coach_page_published");
      await quietly(() => evaluateAchievementsNow(coach.id), null); // «На виду»
    }
  } else if (profile) {
    await db.coachProfile.update({ where: { userId: coach.id }, data: { publishedAt: null } });
  }
  revalidate(nickname);
  return { ok: true };
}
