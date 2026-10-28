"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { genderSchema } from "@/lib/profile/gender";

export async function setGenderAction(input: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = genderSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  await db.user.update({ where: { id: user.id }, data: { gender: parsed.data } });
  return { ok: true };
}
