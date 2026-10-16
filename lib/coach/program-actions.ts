"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/coach/access";
import { PROGRAMS_MAX, programSchema, type ProgramInput } from "@/lib/coach/program";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";

type Result = { ok: true } | { ok: false; error: string };

const UNAVAILABLE = "Программы недоступны";
const NOT_FOUND = "Программа не найдена";

async function programCoach() {
  const coach = await requireCoach();
  return (await isEnabled("coach_programs", coach.id)) ? coach : null;
}

/** Создать (id = null) или изменить программу; дни заменяются целиком. Шаблоны — только свои. */
export async function saveProgramAction(id: string | null, input: ProgramInput): Promise<Result> {
  const coach = await programCoach();
  if (!coach) return { ok: false, error: UNAVAILABLE };
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { days, ...data } = parsed.data;
  const templateIds = [...new Set(days.map((d) => d.templateId))];
  if ((await db.workoutTemplate.count({ where: { id: { in: templateIds }, userId: coach.id } })) !== templateIds.length)
    return { ok: false, error: "Шаблон не найден" };

  const error = await db.$transaction(async (tx) => {
    let programId: string;
    if (id === null) {
      if ((await tx.coachProgram.count({ where: { coachId: coach.id } })) >= PROGRAMS_MAX) return `Не больше ${PROGRAMS_MAX} программ`;
      programId = (await tx.coachProgram.create({ data: { ...data, coachId: coach.id }, select: { id: true } })).id;
    } else {
      const { count } = await tx.coachProgram.updateMany({ where: { id: String(id), coachId: coach.id }, data });
      if (!count) return NOT_FOUND;
      programId = String(id);
      await tx.coachProgramDay.deleteMany({ where: { programId } });
    }
    await tx.coachProgramDay.createMany({ data: days.map((d) => ({ ...d, programId })) });
    return null;
  });
  if (error) return { ok: false, error };
  revalidatePath("/coach/programs");
  return { ok: true };
}

/** Удалить программу из библиотеки; назначенные клиентам остаются (снимок). */
export async function deleteProgramAction(id: string): Promise<Result> {
  const coach = await programCoach();
  if (!coach) return { ok: false, error: UNAVAILABLE };
  const { count } = await db.coachProgram.deleteMany({ where: { id: String(id), coachId: coach.id } });
  if (!count) return { ok: false, error: NOT_FOUND };
  revalidatePath("/coach/programs");
  return { ok: true };
}
