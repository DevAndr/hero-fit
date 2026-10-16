"use server";

import { revalidatePath } from "next/cache";
import { requireClientOf } from "@/lib/coach/access";
import { noteTextSchema } from "@/lib/coach/notes";
import { db } from "@/lib/db";

type Result = { ok: true; updatedAt: string | null } | { ok: false; error: string };

/** Личная заметка тренера о клиенте: пустой текст — удалить. Только активный тренер (requireClientOf). */
export async function saveCoachNoteAction(clientId: string, text: string): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const parsed = noteTextSchema.safeParse(String(text));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте текст" };
  const key = { coachId_clientId: { coachId: coach.id, clientId } };
  if (!parsed.data) {
    await db.coachNote.deleteMany({ where: { coachId: coach.id, clientId } });
    revalidatePath(`/coach/clients/${clientId}`);
    return { ok: true, updatedAt: null };
  }
  const note = await db.coachNote.upsert({
    where: key,
    create: { coachId: coach.id, clientId, text: parsed.data },
    update: { text: parsed.data },
    select: { updatedAt: true },
  });
  revalidatePath(`/coach/clients/${clientId}`);
  return { ok: true, updatedAt: note.updatedAt.toISOString() };
}
