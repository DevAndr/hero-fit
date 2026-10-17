"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/coach/access";
import { db } from "@/lib/db";
import { CATALOG_OFF, catalogAllowed } from "./access";
import { CATALOG_DESCRIPTION_MAX, canPublish, PUBLISH_BLOCK_TEXT } from "./rules";

type Result = { ok: true } | { ok: false; error: string };

const publishSchema = z.object({ publish: z.boolean(), description: z.string() });

/** Опубликовать программу в каталоге / снять; описание сохраняется и при снятии. Только автор. */
export async function publishProgramAction(programId: string, input: { publish: boolean; description: string }): Promise<Result> {
  const coach = await requireCoach();
  if (!(await catalogAllowed(coach.id))) return { ok: false, error: CATALOG_OFF };
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте поля" };
  const description = parsed.data.description.trim();
  if (description.length > CATALOG_DESCRIPTION_MAX) return { ok: false, error: `Описание — не больше ${CATALOG_DESCRIPTION_MAX} символов` };

  const [program, author] = await Promise.all([
    db.coachProgram.findFirst({
      where: { id: String(programId), coachId: coach.id },
      select: { publishedAt: true, hiddenAt: true, _count: { select: { days: true } } },
    }),
    db.user.findUnique({ where: { id: coach.id }, select: { isCoach: true, nickname: true } }),
  ]);
  if (!program || !author) return { ok: false, error: "Программа не найдена" };
  if (parsed.data.publish) {
    const block = canPublish({ days: program._count.days, description, hiddenAt: program.hiddenAt }, author);
    if (block) return { ok: false, error: PUBLISH_BLOCK_TEXT[block] };
  }
  await db.coachProgram.update({
    where: { id: String(programId) },
    data: { catalogDescription: description || null, publishedAt: parsed.data.publish ? (program.publishedAt ?? new Date()) : null },
  });
  revalidatePath("/coach/programs");
  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}
