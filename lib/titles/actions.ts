"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getAvailableTitles } from "@/lib/titles/queries";

/** Выбрать титул (`null` — без титула). Можно только открытый. */
export async function setTitleAction(code: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (code !== null && !(await getAvailableTitles(user.id)).some((t) => t.code === code)) {
    return { ok: false, error: "Титул ещё не открыт" };
  }
  await db.user.update({ where: { id: user.id }, data: { titleCode: code } });
  revalidatePath("/", "layout");
  return { ok: true };
}
