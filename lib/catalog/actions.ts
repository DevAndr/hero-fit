"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotificationType } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/dal";
import { requireCoach } from "@/lib/coach/access";
import { assignProgramSchema } from "@/lib/coach/program";
import { createAssignment, endAssignment } from "@/lib/coach/program-assign";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { addDays, weekdayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { getLastPerformance } from "@/lib/workouts/queries";
import { CATALOG_OFF, catalogAllowed } from "./access";
import { copyTemplates } from "./copy";
import { activePrograms, startableProgram } from "./queries";
import { CATALOG_DESCRIPTION_MAX, canPublish, HIDE_REASON_MAX, COACH_PROGRAM_RUNNING, NEEDS_REPLACE, PROGRAM_UNAVAILABLE, PUBLISH_BLOCK_TEXT, startBlock } from "./rules";

type Result = { ok: true } | { ok: false; error: string };

const todayOf = (tz: string) => dayKey(new Date(), safeTimeZone(tz));

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

/**
 * Базы для диалога запуска: силовые упражнения шаблонов программы (id — шаблоны автора); вес — последний рабочий
 * пользователя → вес из шаблона → 0. null — программа недоступна или нет флага.
 */
export async function getCatalogBasesAction(
  programId: string,
): Promise<{ templateId: string; templateName: string; exerciseId: string; name: string; weight: number }[] | null> {
  const user = await requireUser();
  if (!(await catalogAllowed(user.id))) return null;
  const program = await startableProgram(db, String(programId));
  if (!program) return null;
  const templateIds = [...new Set(program.days.map((d) => d.templateId))];
  const rows = await db.templateExercise.findMany({
    where: { templateId: { in: templateIds }, template: { userId: program.coachId }, exercise: { kind: "REPS" } },
    orderBy: [{ templateId: "asc" }, { order: "asc" }],
    select: { templateId: true, exerciseId: true, targetWeight: true, template: { select: { name: true } }, exercise: { select: { name: true } } },
  });
  const last = await getLastPerformance(user.id, [...new Set(rows.map((r) => r.exerciseId))]);
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const key = `${r.templateId}:${r.exerciseId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const lastWeight = Math.max(0, ...(last[r.exerciseId]?.sets.map((s) => s.weight) ?? []));
    return [{ templateId: r.templateId, templateName: r.template.name, exerciseId: r.exerciseId, name: r.exercise.name, weight: lastWeight || (r.targetWeight ?? 0) }];
  });
}

const startSchema = z.object({
  startDate: assignProgramSchema.shape.startDate,
  bases: assignProgramSchema.shape.bases,
  replace: z.boolean(),
});

/**
 * Запустить программу из каталога: шаблоны дней копируются пользователю, назначение — без тренера (fromCatalog, catalogProgramId).
 * Идёт программа от тренера — запрет; своя/каталожная — только с replace (иначе ошибка NEEDS_REPLACE). Две вкладки
 * не оставят двух активных — строка пользователя под FOR UPDATE, проверки — после блокировки.
 */
export async function startCatalogProgramAction(
  programId: string,
  input: { startDate: string; bases: { templateId: string; exerciseId: string; weight: number }[]; replace: boolean },
): Promise<Result> {
  const user = await requireUser();
  if (!(await catalogAllowed(user.id))) return { ok: false, error: CATALOG_OFF };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const today = todayOf(user.timeZone);
  const thisMonday = addDays(today, -weekdayOf(today));
  const { startDate, bases, replace } = parsed.data;
  if (startDate !== thisMonday && startDate !== addDays(thisMonday, 7)) return { ok: false, error: "Старт — с этой или следующей недели" };

  const error = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const program = await startableProgram(tx, String(programId));
    if (!program) return PROGRAM_UNAVAILABLE;
    const [active] = await activePrograms(tx, user.id, today);
    const block = startBlock(active ?? null);
    if (block === "coach") return COACH_PROGRAM_RUNNING;
    if (block === "replace" && !replace) return NEEDS_REPLACE;

    const copies = await copyTemplates(tx, user.id, program.name, program.days.map((d) => d.templateId));
    const days = program.days.flatMap((d) => {
      const copy = copies.get(d.templateId);
      return copy ? [{ weekday: d.weekday, templateId: copy.id, templateName: copy.name, time: d.time, durationMin: d.durationMin }] : [];
    });
    await createAssignment(
      tx,
      {
        userId: user.id,
        coachId: null,
        catalogProgramId: program.id,
        programId: null,
        name: program.name,
        rule: { weeks: program.weeks, stepKind: program.stepKind, stepValue: program.stepValue, deloadEvery: program.deloadEvery, deloadPct: program.deloadPct },
        days,
        startDate,
        // Базы — на копии шаблонов (createAssignment оставит только силовые упражнения копий)
        bases: bases.flatMap((b) => {
          const copy = copies.get(b.templateId);
          return copy ? [{ ...b, templateId: copy.id }] : [];
        }),
        templateOwnerId: user.id,
      },
      today,
    );
    return null;
  });
  if (error) return { ok: false, error };
  revalidatePath("/calendar");
  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

/**
 * Завершить свою программу из каталога досрочно: будущие тренировки убираются, сегодняшняя остаётся.
 * Без проверки флага: выключенный каталог не должен запирать пользователя в идущей программе.
 */
export async function endOwnProgramAction(): Promise<Result> {
  const user = await requireUser();
  const today = todayOf(user.timeZone);
  const active = (await activePrograms(db, user.id, today)).find((a) => a.coachId === null && a.fromCatalog);
  if (!active) return { ok: false, error: "Программа не найдена" };
  await db.$transaction((tx) => endAssignment(tx, active.id, today, { writeTargets: true, keepToday: true }));
  revalidatePath("/calendar");
  revalidatePath("/programs");
  return { ok: true };
}

const hideReasonSchema = z.string().trim().min(1, "Укажите причину").max(HIDE_REASON_MAX, `Причина — не больше ${HIDE_REASON_MAX} символов`);

/** Админ снимает опубликованную программу из каталога с причиной; автору — уведомление. Идущие запуски не трогаем. */
export async function hideProgramAction(programId: string, reason: string): Promise<Result> {
  await requireAdmin();
  const parsed = hideReasonSchema.safeParse(reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Укажите причину" };
  const done = await db.$transaction(async (tx) => {
    const { count } = await tx.coachProgram.updateMany({
      where: { id: String(programId), publishedAt: { not: null }, hiddenAt: null },
      data: { hiddenAt: new Date(), hiddenReason: parsed.data },
    });
    if (count === 0) return false;
    const program = await tx.coachProgram.findUniqueOrThrow({ where: { id: String(programId) }, select: { name: true, coachId: true } });
    await notify(
      tx,
      program.coachId,
      { type: NotificationType.COACH, title: `Программа «${program.name}» снята из каталога: ${parsed.data}`, body: "Откройте программу в редакторе, чтобы исправить её", url: "/coach/programs" },
      { push: true },
    );
    return true;
  });
  if (!done) return { ok: false, error: "Программа не найдена или уже снята" };
  revalidateCatalog(programId);
  return { ok: true };
}

/** Админ возвращает снятую программу в каталог (автору без уведомления). */
export async function unhideProgramAction(programId: string): Promise<Result> {
  await requireAdmin();
  const { count } = await db.coachProgram.updateMany({
    where: { id: String(programId), hiddenAt: { not: null } },
    data: { hiddenAt: null, hiddenReason: null },
  });
  if (count === 0) return { ok: false, error: "Программа не найдена или не снята" };
  revalidateCatalog(programId);
  return { ok: true };
}

function revalidateCatalog(programId: string) {
  revalidatePath("/admin/programs");
  revalidatePath("/coach/programs");
  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
}
